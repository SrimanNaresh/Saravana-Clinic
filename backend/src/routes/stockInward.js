import { Router } from 'express';
import { getPool, sql } from '../db/pool.js';
import { num, text, blank, importRowBody, addedNote } from './_purchaseRows.js';

const router = Router();

// Purchase Code is the linked Purchase Invoice's code, e.g. PINV000012.
const CODE_EXPR = `'PINV' + RIGHT('000000' + CAST(si.PurchaseInvoiceId AS VARCHAR(10)), 6)`;

const SELECT = `
  SELECT si.StockInwardId, si.PurchaseInvoiceId,
         CASE WHEN si.PurchaseInvoiceId IS NULL THEN NULL ELSE ${CODE_EXPR} END AS PurchaseCode,
         si.BillDate, si.ItemId, i.Name AS ItemName, si.HSNCode,
         si.ManufacturerId, m.Name AS ManufacturerName, si.VendorId, v.VendorName,
         si.Quantity, si.UnitId, u.Name AS UnitName, si.Batch, si.ExpiryDate,
         si.OldPrice, si.CurrentPrice, si.GSTPercent, si.DiscountPercent, si.NetPrice, si.CreatedAt
  FROM StockInward si
  JOIN PharmacyItem i ON i.ItemId = si.ItemId
  JOIN Vendor v ON v.VendorId = si.VendorId
  LEFT JOIN UnitMaster u ON u.UnitId = si.UnitId
  LEFT JOIN ManufacturerMaster m ON m.ManufacturerId = si.ManufacturerId
`;

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = (n) => String(n).padStart(2, '0');
const fullYear = (y) => (y < 100 ? 2000 + y : y);
const monthOf = (s) => {
  const n = Number(s);
  return Number.isInteger(n) ? n : MONTHS.indexOf(String(s).slice(0, 3).toLowerCase()) + 1;
};
const validDate = (y, m, d) => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

// Bill Date as 'YYYY-MM-DD': takes YYYY-MM-DD, or day first — 14/05/2026,
// 14-05-26, 14-May-2026. Null when blank; throws when unreadable.
function parseBillDate(v) {
  const s = text(v);
  if (!s) return null;
  let y; let m; let d;
  let match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  if (match) [, y, m, d] = match.map(Number);
  else if ((match = /^(\d{1,2})[-/. ]([a-z]+|\d{1,2})[-/. ,]+(\d{2,4})$/i.exec(s))) {
    d = Number(match[1]); m = monthOf(match[2]); y = fullYear(Number(match[3]));
  }
  if (!y || !validDate(y, m, d)) throw new Error(`Bill Date "${s}" not recognised — use DD/MM/YYYY`);
  return `${y}-${pad(m)}-${pad(d)}`;
}

// Exp Date (month/year) as the last day of that month, 'YYYY-MM-DD'. Takes
// YYYY-MM, MM/YYYY, MM/YY, May-2027, May 27, or a full date (its month counts).
function parseExpiry(v) {
  const s = text(v);
  if (!s) return null;
  let y; let m;
  let match = /^(\d{4})[-/.](\d{1,2})(?:[-/.]\d{1,2})?$/.exec(s);
  if (match) { y = Number(match[1]); m = Number(match[2]); }
  else if ((match = /^(?:\d{1,2}[-/. ])?([a-z]+|\d{1,2})[-/. ,]+(\d{2,4})$/i.exec(s))) {
    m = monthOf(match[1]); y = fullYear(Number(match[2]));
  }
  if (!y || !(m >= 1 && m <= 12)) throw new Error(`Exp Date "${s}" not recognised — use MM/YYYY`);
  return `${y}-${pad(m)}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
}

// The Purchase Invoice a Purchase Code (PINV000012) names; null when blank.
async function invoiceForCode(pool, code) {
  const c = text(code);
  if (!c) return null;
  const match = /^PINV0*(\d+)$/i.exec(c);
  const invoice = match && (await pool.request().input('id', sql.Int, Number(match[1]))
    .query('SELECT PurchaseInvoiceId, TransDate FROM PurchaseInvoice WHERE PurchaseInvoiceId = @id AND IsActive = 1')).recordset[0];
  if (!invoice) throw new Error(`Purchase Code "${c}" not found — create that Purchase Invoice first`);
  return invoice;
}

// Returns an error message for a bad body, or null when it's valid.
function validate({ itemId, vendorId, quantity }) {
  if (!itemId) return 'Item is required';
  if (!vendorId) return 'Vendor is required';
  if (quantity === '' || quantity == null || !(Number(quantity) > 0)) return 'Qty must be a number greater than 0';
  return null;
}

// The form sends billDate as YYYY-MM-DD and expiryMonth as YYYY-MM.
function bindFields(request, body) {
  return request
    .input('purchaseInvoiceId', sql.Int, body.purchaseInvoiceId || null)
    .input('billDate', sql.Date, parseBillDate(body.billDate))
    .input('itemId', sql.Int, body.itemId)
    .input('hsnCode', sql.NVarChar(20), text(body.hsnCode) || null)
    .input('manufacturerId', sql.Int, body.manufacturerId || null)
    .input('vendorId', sql.Int, body.vendorId)
    .input('quantity', sql.Decimal(10, 2), Number(body.quantity))
    .input('unitId', sql.Int, body.unitId || null)
    .input('batch', sql.NVarChar(50), text(body.batch) || null)
    .input('expiryDate', sql.Date, parseExpiry(body.expiryMonth))
    .input('oldPrice', sql.Decimal(10, 2), num(body.oldPrice))
    .input('currentPrice', sql.Decimal(10, 2), num(body.currentPrice))
    .input('gstPercent', sql.Decimal(5, 2), num(body.gstPercent))
    .input('discountPercent', sql.Decimal(5, 2), num(body.discountPercent))
    .input('netPrice', sql.Decimal(12, 2), num(body.netPrice));
}

const INSERT = `
  INSERT INTO StockInward (PurchaseInvoiceId, BillDate, ItemId, HSNCode, ManufacturerId, VendorId, Quantity, UnitId,
                           Batch, ExpiryDate, OldPrice, CurrentPrice, GSTPercent, DiscountPercent, NetPrice)
  OUTPUT INSERTED.*
  VALUES (@purchaseInvoiceId, @billDate, @itemId, @hsnCode, @manufacturerId, @vendorId, @quantity, @unitId,
          @batch, @expiryDate, @oldPrice, @currentPrice, @gstPercent, @discountPercent, @netPrice)
`;

// Bad dates and the like come back as 400s with their message.
const badRequest = (err) => /not recognised|not found/.test(err.message);

router.get('/', async (req, res) => {
  try {
    const { search = '' } = req.query;
    const pool = await getPool();
    const result = await pool
      .request()
      .input('search', sql.NVarChar, `%${search}%`)
      .query(`
        ${SELECT}
        WHERE si.IsActive = 1
          AND (@search = '%%' OR i.Name LIKE @search OR v.VendorName LIKE @search OR m.Name LIKE @search
               OR si.HSNCode LIKE @search OR si.Batch LIKE @search OR ${CODE_EXPR} LIKE @search)
        ORDER BY si.StockInwardId DESC
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
    const result = await bindFields(pool.request(), req.body).query(INSERT);
    res.status(201).json(result.recordset[0]);
  } catch (err) {
    res.status(badRequest(err) ? 400 : 500).json({ error: err.message });
  }
});

// Excel import: rows keyed PurchaseCode, BillDate, Batch, ExpDate plus Purchase
// Master's import columns (see importRowBody). Every row is a new entry. A
// blank Bill Date takes the Purchase Invoice's date.
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
    const r = rows[i];
    try {
      // Checked before importRowBody, so a bad row adds no new item or vendor.
      const invoice = await invoiceForCode(pool, r.PurchaseCode);
      const billDate = blank(r.BillDate) ? invoice?.TransDate ?? null : parseBillDate(r.BillDate);
      const expiryMonth = r.ExpDate;
      parseExpiry(expiryMonth);
      const body = await importRowBody(pool, r, { priceTable: 'StockInward', priceIdCol: 'StockInwardId' }, added);
      Object.assign(body, {
        purchaseInvoiceId: invoice?.PurchaseInvoiceId ?? null,
        billDate: billDate instanceof Date ? billDate.toISOString().slice(0, 10) : billDate,
        batch: r.Batch,
        expiryMonth,
      });
      const error = validate(body);
      if (error) throw new Error(error);
      await bindFields(pool.request(), body).query(INSERT);
      inserted++;
    } catch (err) {
      errors.push({ row: i + 1, error: err.message });
    }
  }
  res.json({ inserted, updated: 0, failed: errors.length, errors, note: addedNote(added) });
});

router.put('/:id', async (req, res) => {
  try {
    const error = validate(req.body);
    if (error) return res.status(400).json({ error });
    const pool = await getPool();
    const result = await bindFields(pool.request(), req.body)
      .input('id', sql.Int, req.params.id)
      .query(`
        UPDATE StockInward
        SET PurchaseInvoiceId = @purchaseInvoiceId, BillDate = @billDate, ItemId = @itemId, HSNCode = @hsnCode,
            ManufacturerId = @manufacturerId, VendorId = @vendorId, Quantity = @quantity, UnitId = @unitId,
            Batch = @batch, ExpiryDate = @expiryDate, OldPrice = @oldPrice, CurrentPrice = @currentPrice,
            GSTPercent = @gstPercent, DiscountPercent = @discountPercent, NetPrice = @netPrice
        OUTPUT INSERTED.*
        WHERE StockInwardId = @id AND IsActive = 1
      `);
    if (!result.recordset.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(badRequest(err) ? 400 : 500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const pool = await getPool();
    await pool
      .request()
      .input('id', sql.Int, req.params.id)
      .query('UPDATE StockInward SET IsActive = 0 WHERE StockInwardId = @id');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
