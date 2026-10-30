import { Router } from 'express';
import { getPool, sql } from '../db/pool.js';
import { docNo, docNoSql } from '../utils/docNumber.js';
import { purchaseLine, round2 } from '../utils/purchaseCalc.js';

// Pharmacy > Purchase / Order: orders placed with a vendor. An order doesn't
// change stock. Every amount is worked out here with the same formulas the
// screen uses (utils/purchaseCalc.js); the screen's sums are never trusted.
const router = Router();

const ORDER_NO = docNoSql('PO', 'h.PurchaseOrderId');
const MAX_GST = 28;

router.get('/', async (req, res) => {
  try {
    const { search = '' } = req.query;
    const pool = await getPool();
    const result = await pool.request()
      .input('search', sql.NVarChar, `%${search}%`)
      .query(`
        SELECT h.PurchaseOrderId, ${ORDER_NO} AS OrderNo, h.OrderDate, h.VendorId, v.VendorName,
               (SELECT COUNT(*) FROM PurchaseOrderItem l WHERE l.PurchaseOrderId = h.PurchaseOrderId) AS Items,
               h.TotalAmount
        FROM PurchaseOrder h JOIN Vendor v ON v.VendorId = h.VendorId
        WHERE h.IsActive = 1
          AND (@search = '%%' OR v.VendorName LIKE @search OR ${ORDER_NO} LIKE @search
               OR EXISTS (SELECT 1 FROM PurchaseOrderItem l WHERE l.PurchaseOrderId = h.PurchaseOrderId AND l.ItemName LIKE @search))
        ORDER BY h.PurchaseOrderId DESC
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const head = await pool.request().input('id', sql.Int, req.params.id).query(`
      SELECT h.PurchaseOrderId, ${ORDER_NO} AS OrderNo, h.OrderDate, h.VendorId, v.VendorName, h.VendorDetails, h.TotalAmount
      FROM PurchaseOrder h JOIN Vendor v ON v.VendorId = h.VendorId
      WHERE h.PurchaseOrderId = @id AND h.IsActive = 1`);
    if (!head.recordset.length) return res.status(404).json({ error: 'Order not found' });
    const lines = await pool.request().input('id', sql.Int, req.params.id)
      .query('SELECT * FROM PurchaseOrderItem WHERE PurchaseOrderId = @id ORDER BY LineId');
    res.json({ ...head.recordset[0], lines: lines.recordset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const text = (v) => (v == null ? '' : String(v).trim());
const numOr = (v, d) => (text(v) === '' ? d : Number(v));

// Checks an order body. Returns { error } or the header and lines to save.
// Item details (name, generic, manufacturer, HSN, category, pack) are copied
// from the item on file; a line already on the order keeps the copy it has.
async function checkOrder(pool, body, orderId) {
  const orderDate = text(body.orderDate).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(orderDate) || Number.isNaN(Date.parse(orderDate))) return { error: 'Date is required' };
  const vendorId = Number(body.vendorId);
  if (!Number.isInteger(vendorId) || vendorId <= 0) return { error: 'Vendor Name is required' };
  const vendor = await pool.request().input('id', sql.Int, vendorId)
    .query('SELECT VendorId FROM Vendor WHERE VendorId = @id AND IsActive = 1');
  if (!vendor.recordset.length) return { error: 'Vendor not found' };
  const vendorDetails = text(body.vendorDetails).slice(0, 1000) || null;

  const raw = (Array.isArray(body.lines) ? body.lines : []).filter((l) => l && (l.itemId || text(l.quantity)));
  if (!raw.length) return { error: 'Add at least one item' };

  const ids = [...new Set(raw.map((l) => Number(l.itemId)).filter((n) => Number.isInteger(n) && n > 0))];
  const items = new Map();
  if (ids.length) {
    const r = await pool.request().input('ids', sql.NVarChar(sql.MAX), ids.join(',')).query(`
      SELECT i.ItemId, i.Name, g.Name AS GenericName, m.Name AS Manufacturer, i.HSNCode, i.Category, i.Pack
      FROM PharmacyItem i
      LEFT JOIN GenericNameMaster g ON g.GenericNameId = i.GenericNameId
      LEFT JOIN ManufacturerMaster m ON m.ManufacturerId = i.ManufacturerId
      WHERE i.IsActive = 1 AND i.ItemId IN (SELECT CAST(value AS INT) FROM STRING_SPLIT(@ids, ','))`);
    for (const it of r.recordset) items.set(it.ItemId, it);
  }
  const saved = new Map();
  if (orderId) {
    const r = await pool.request().input('id', sql.Int, orderId)
      .query('SELECT * FROM PurchaseOrderItem WHERE PurchaseOrderId = @id');
    for (const l of r.recordset) saved.set(l.LineId, l);
  }

  const lines = [];
  for (const [i, l] of raw.entries()) {
    const row = `Row ${i + 1}`;
    const keep = saved.get(Number(l.lineId));
    const item = items.get(Number(l.itemId));
    if (!item) return { error: `${row}: pick an item` };
    const name = item.Name;
    const qty = Number(l.quantity);
    if (!(qty > 0)) return { error: `${row} (${name}): Quantity must be more than 0` };
    const mrp = Number(l.mrp);
    if (!(mrp > 0)) return { error: `${row} (${name}): MRP must be more than 0` };
    const disc = numOr(l.discPercent, 0);
    if (!(disc >= 0 && disc <= 100)) return { error: `${row} (${name}): Disc % must be between 0 and 100` };
    const cgst = numOr(l.cgstPercent, 0);
    const sgst = numOr(l.sgstPercent, 0);
    if (!(cgst >= 0 && cgst <= MAX_GST) || !(sgst >= 0 && sgst <= MAX_GST)) return { error: `${row} (${name}): CGST % and SGST % must be between 0 and ${MAX_GST}` };
    if (cgst + sgst > MAX_GST) return { error: `${row} (${name}): CGST % + SGST % can't be more than ${MAX_GST}` };
    const calc = purchaseLine({ mrp, discPercent: disc, quantity: qty, cgstPercent: cgst, sgstPercent: sgst });
    const copy = keep && keep.ItemId === item.ItemId
      ? { name: keep.ItemName, generic: keep.GenericName, manufacturer: keep.Manufacturer, hsn: keep.HSNCode, category: keep.Category, pack: keep.Pack }
      : { name: item.Name, generic: item.GenericName, manufacturer: item.Manufacturer, hsn: item.HSNCode, category: item.Category, pack: item.Pack };
    lines.push({ itemId: item.ItemId, ...copy, mrp, disc, qty, cgst, sgst, ...calc });
  }
  const total = round2(lines.reduce((s, l) => s + l.total, 0));
  return { orderDate, vendorId, vendorDetails, lines, total };
}

async function insertLines(tx, orderId, lines) {
  for (const l of lines) {
    await new sql.Request(tx)
      .input('orderId', sql.Int, orderId)
      .input('itemId', sql.Int, l.itemId)
      .input('name', sql.NVarChar(200), l.name)
      .input('generic', sql.NVarChar(200), l.generic)
      .input('manufacturer', sql.NVarChar(200), l.manufacturer)
      .input('hsn', sql.NVarChar(30), l.hsn)
      .input('category', sql.NVarChar(100), l.category)
      .input('pack', sql.NVarChar(50), l.pack)
      .input('mrp', sql.Decimal(10, 2), l.mrp)
      .input('disc', sql.Decimal(5, 2), l.disc)
      .input('rate', sql.Decimal(10, 2), l.rate)
      .input('qty', sql.Decimal(10, 2), l.qty)
      .input('amount', sql.Decimal(12, 2), l.amount)
      .input('cgst', sql.Decimal(5, 2), l.cgst)
      .input('sgst', sql.Decimal(5, 2), l.sgst)
      .input('gst', sql.Decimal(5, 2), l.gstPercent)
      .input('gstAmount', sql.Decimal(12, 2), l.gstAmount)
      .input('total', sql.Decimal(12, 2), l.total)
      .query(`
        INSERT INTO PurchaseOrderItem (PurchaseOrderId, ItemId, ItemName, GenericName, Manufacturer, HSNCode, Category, Pack,
                                       MRP, DiscPercent, Rate, Quantity, Amount, CGSTPercent, SGSTPercent, GSTPercent, GSTAmount, Total)
        VALUES (@orderId, @itemId, @name, @generic, @manufacturer, @hsn, @category, @pack,
                @mrp, @disc, @rate, @qty, @amount, @cgst, @sgst, @gst, @gstAmount, @total)`);
  }
}

async function saveOrder(req, res, orderId) {
  const pool = await getPool();
  const o = await checkOrder(pool, req.body || {}, orderId);
  if (o.error) return res.status(400).json({ error: o.error });
  const tx = new sql.Transaction(pool);
  try {
    await tx.begin();
    const head = new sql.Request(tx)
      .input('date', sql.Date, o.orderDate)
      .input('vendorId', sql.Int, o.vendorId)
      .input('details', sql.NVarChar(1000), o.vendorDetails)
      .input('total', sql.Decimal(12, 2), o.total);
    let id = orderId;
    if (orderId) {
      const upd = await head.input('id', sql.Int, orderId).query(`
        UPDATE PurchaseOrder SET OrderDate = @date, VendorId = @vendorId, VendorDetails = @details, TotalAmount = @total
        WHERE PurchaseOrderId = @id AND IsActive = 1`);
      if (!upd.rowsAffected[0]) {
        await tx.rollback();
        return res.status(404).json({ error: 'Order not found' });
      }
      await new sql.Request(tx).input('id', sql.Int, orderId).query('DELETE FROM PurchaseOrderItem WHERE PurchaseOrderId = @id');
    } else {
      const ins = await head.input('by', sql.NVarChar(100), req.user?.username || null).query(`
        INSERT INTO PurchaseOrder (OrderDate, VendorId, VendorDetails, TotalAmount, CreatedBy)
        OUTPUT INSERTED.PurchaseOrderId VALUES (@date, @vendorId, @details, @total, @by)`);
      id = ins.recordset[0].PurchaseOrderId;
    }
    await insertLines(tx, id, o.lines);
    await tx.commit();
    res.status(orderId ? 200 : 201).json({ PurchaseOrderId: id, OrderNo: docNo('PO', id), TotalAmount: o.total });
  } catch (err) {
    await tx.rollback().catch(() => {});
    res.status(500).json({ error: err.message });
  }
}

router.post('/', (req, res) => saveOrder(req, res, null));

router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Bad order id' });
  return saveOrder(req, res, id);
});

router.delete('/:id', async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request().input('id', sql.Int, req.params.id)
      .query('UPDATE PurchaseOrder SET IsActive = 0 WHERE PurchaseOrderId = @id');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
