import { Router } from 'express';
import { getPool, sql } from '../db/pool.js';
import { num, blank, importRowBody, addedNote } from './_purchaseRows.js';

const router = Router();

const SELECT = `
  SELECT pm.PurchaseMasterId, pm.ItemId, i.Name AS ItemName, pm.HSNCode,
         pm.ManufacturerId, m.Name AS ManufacturerName, pm.VendorId, v.VendorName,
         pm.Quantity, pm.UnitId, u.Name AS UnitName, pm.OldPrice, pm.CurrentPrice,
         pm.GSTPercent, pm.DiscountPercent, pm.NetPrice, pm.CreatedAt
  FROM PurchaseMaster pm
  JOIN PharmacyItem i ON i.ItemId = pm.ItemId
  JOIN Vendor v ON v.VendorId = pm.VendorId
  LEFT JOIN UnitMaster u ON u.UnitId = pm.UnitId
  LEFT JOIN ManufacturerMaster m ON m.ManufacturerId = pm.ManufacturerId
`;

// An entry's HSN is always its item's HSN in Item Master, looked up on every
// save rather than taken from the body (PharmacyItem's column is wider, hence LEFT).
const ITEM_HSN = 'LEFT((SELECT HSNCode FROM PharmacyItem WHERE ItemId = @itemId), 20)';

// Returns an error message for a bad body, or null when it's valid.
function validate({ itemId, vendorId, quantity }) {
  if (!itemId) return 'Item is required';
  if (!vendorId) return 'Vendor is required';
  if (quantity === '' || quantity == null || !(Number(quantity) > 0)) return 'Qty must be a number greater than 0';
  return null;
}

function bindFields(request, body) {
  return request
    .input('itemId', sql.Int, body.itemId)
    .input('manufacturerId', sql.Int, body.manufacturerId || null)
    .input('vendorId', sql.Int, body.vendorId)
    .input('quantity', sql.Decimal(10, 2), Number(body.quantity))
    .input('unitId', sql.Int, body.unitId || null)
    .input('oldPrice', sql.Decimal(10, 2), num(body.oldPrice))
    .input('currentPrice', sql.Decimal(10, 2), num(body.currentPrice))
    .input('gstPercent', sql.Decimal(5, 2), num(body.gstPercent))
    .input('discountPercent', sql.Decimal(5, 2), num(body.discountPercent))
    .input('netPrice', sql.Decimal(12, 2), num(body.netPrice));
}

router.get('/', async (req, res) => {
  try {
    const { search = '' } = req.query;
    const pool = await getPool();
    const result = await pool
      .request()
      .input('search', sql.NVarChar, `%${search}%`)
      .query(`
        ${SELECT}
        WHERE pm.IsActive = 1
          AND (@search = '%%' OR i.Name LIKE @search OR v.VendorName LIKE @search OR u.Name LIKE @search
               OR m.Name LIKE @search OR pm.HSNCode LIKE @search)
        ORDER BY pm.PurchaseMasterId DESC
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const error = validate(req.body);
    if (error) return res.status(400).json({ error });
    const pool = await getPool();
    const result = await bindFields(pool.request(), req.body).query(`
      INSERT INTO PurchaseMaster (ItemId, HSNCode, ManufacturerId, VendorId, Quantity, UnitId,
                                  OldPrice, CurrentPrice, GSTPercent, DiscountPercent, NetPrice)
      OUTPUT INSERTED.*
      VALUES (@itemId, ${ITEM_HSN}, @manufacturerId, @vendorId, @quantity, @unitId,
              @oldPrice, @currentPrice, @gstPercent, @discountPercent, @netPrice)
    `);
    res.status(201).json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// The form's several-items save ({ vendorId, lines }): one entry per line, all
// for the same vendor, saved together or not at all.
router.post('/multi', async (req, res) => {
  const { vendorId, lines } = req.body || {};
  if (!Array.isArray(lines) || lines.length === 0) return res.status(400).json({ error: 'Select an item' });
  const bodies = lines.map((line) => ({ ...line, vendorId }));
  for (const body of bodies) {
    const error = validate(body);
    if (error) return res.status(400).json({ error });
  }
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  try {
    await tx.begin();
    for (const body of bodies) {
      await bindFields(new sql.Request(tx), body).query(`
        INSERT INTO PurchaseMaster (ItemId, HSNCode, ManufacturerId, VendorId, Quantity, UnitId,
                                    OldPrice, CurrentPrice, GSTPercent, DiscountPercent, NetPrice)
        VALUES (@itemId, ${ITEM_HSN}, @manufacturerId, @vendorId, @quantity, @unitId,
                @oldPrice, @currentPrice, @gstPercent, @discountPercent, @netPrice)
      `);
    }
    await tx.commit();
    res.status(201).json({ inserted: bodies.length });
  } catch (err) {
    await tx.rollback().catch(() => {});
    res.status(500).json({ error: err.message });
  }
});

// Excel import: every row is a new purchase entry (see importRowBody).
router.post('/bulk', async (req, res) => {
  const { rows } = req.body;
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'rows array is required' });
  }
  const pool = await getPool();
  let inserted = 0;
  const added = { items: [], vendors: [] };
  const errors = [];

  for (let i = 0; i < rows.length; i++) {
    try {
      const body = await importRowBody(pool, rows[i], { priceTable: 'PurchaseMaster', priceIdCol: 'PurchaseMasterId' }, added);
      const error = validate(body);
      if (error) throw new Error(error);
      await bindFields(pool.request(), body).query(`
        INSERT INTO PurchaseMaster (ItemId, HSNCode, ManufacturerId, VendorId, Quantity, UnitId,
                                    OldPrice, CurrentPrice, GSTPercent, DiscountPercent, NetPrice)
        VALUES (@itemId, ${ITEM_HSN}, @manufacturerId, @vendorId, @quantity, @unitId,
                @oldPrice, @currentPrice, @gstPercent, @discountPercent, @netPrice)
      `);
      inserted++;
    } catch (err) {
      errors.push({ row: i + 1, error: err.message });
    }
  }
  res.json({ inserted, updated: 0, failed: errors.length, errors, note: addedNote(added) });
});

// Fields the form's dropdowns list by value (no master table), with the SQL
// type each one is stored as. HSN isn't one: it comes from Item Master.
const VALUE_FIELDS = {
  Quantity: sql.Decimal(10, 2),
  OldPrice: sql.Decimal(10, 2),
  CurrentPrice: sql.Decimal(10, 2),
  GSTPercent: sql.Decimal(5, 2),
  DiscountPercent: sql.Decimal(5, 2),
  NetPrice: sql.Decimal(12, 2),
};

// Renames one of those values on every purchase entry using it ({ field, from,
// to }), or clears it when `to` is blank — the dropdowns' Edit / Delete.
router.post('/replace-value', async (req, res) => {
  try {
    const { field, from, to } = req.body || {};
    const type = VALUE_FIELDS[field];
    if (!type) return res.status(400).json({ error: 'Unknown field' });
    if (blank(from)) return res.status(400).json({ error: 'Value to change is required' });
    if (field === 'Quantity' && blank(to)) return res.status(400).json({ error: 'Qty is required on every entry, so it can only be renamed' });
    if (Number.isNaN(Number(from)) || (!blank(to) && Number.isNaN(Number(to)))) {
      return res.status(400).json({ error: 'Value must be a number' });
    }
    const value = (v) => (blank(v) ? null : Number(v));
    const pool = await getPool();
    const upd = await pool.request()
      .input('from', type, value(from))
      .input('to', type, value(to))
      .query(`
        UPDATE PurchaseMaster SET ${field} = @to
        WHERE IsActive = 1 AND ${field} = @from;
        SELECT @@ROWCOUNT AS affected;
      `);
    res.json({ affected: upd.recordset[0].affected });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const error = validate(req.body);
    if (error) return res.status(400).json({ error });
    const pool = await getPool();
    const result = await bindFields(pool.request(), req.body)
      .input('id', sql.Int, req.params.id)
      .query(`
        UPDATE PurchaseMaster
        SET ItemId = @itemId, HSNCode = ${ITEM_HSN}, ManufacturerId = @manufacturerId, VendorId = @vendorId,
            Quantity = @quantity, UnitId = @unitId, OldPrice = @oldPrice, CurrentPrice = @currentPrice,
            GSTPercent = @gstPercent, DiscountPercent = @discountPercent, NetPrice = @netPrice
        OUTPUT INSERTED.*
        WHERE PurchaseMasterId = @id AND IsActive = 1
      `);
    if (!result.recordset.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const pool = await getPool();
    await pool
      .request()
      .input('id', sql.Int, req.params.id)
      .query('UPDATE PurchaseMaster SET IsActive = 0 WHERE PurchaseMasterId = @id');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
