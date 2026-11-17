import { Router } from 'express';
import { getPool, sql } from '../db/pool.js';
import { docNoSql } from '../utils/docNumber.js';

// Stock In > Three in One: a supplier bill kept as a Draft (docs/07 of Ayush,
// docs/saravana_pharmacy_db.md §4.7). A draft is only the screen's data as
// JSON; it never changes items, orders, stock or prices. Save All on the
// screen does the real saves, then deletes the draft.
const router = Router();

const text = (v) => (v == null ? '' : String(v).trim());
const MAX_JSON = 2 * 1024 * 1024; // 2 MB of screen data is far more than any bill

// Every draft, newest first, with a warning when its Vendor + Bill No match
// another draft or a saved Stock In.
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT d.DraftId, d.VendorId, v.VendorName, d.BillNo, d.BillDate, d.LineCount, d.NetAmount, d.CreatedBy, d.CreatedAt, d.UpdatedAt,
             (SELECT TOP 1 ${docNoSql('SI', 'si.StockInId')} FROM StockIn si
              WHERE si.IsActive = 1 AND si.VendorId = d.VendorId AND d.BillNo IS NOT NULL AND UPPER(si.BillNo) = UPPER(d.BillNo)) AS SavedAs,
             (SELECT COUNT(*) FROM IpsDraft o
              WHERE o.DraftId <> d.DraftId AND o.VendorId = d.VendorId AND d.BillNo IS NOT NULL AND UPPER(o.BillNo) = UPPER(d.BillNo)) AS SameDrafts
      FROM IpsDraft d LEFT JOIN Vendor v ON v.VendorId = d.VendorId
      ORDER BY d.UpdatedAt DESC`);
    res.json(r.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const r = await pool.request().input('id', sql.Int, Number(req.params.id)).query('SELECT * FROM IpsDraft WHERE DraftId = @id');
    if (!r.recordset.length) return res.status(404).json({ error: 'Draft not found' });
    const d = r.recordset[0];
    res.json({ ...d, Data: JSON.parse(d.Data) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Needs a Vendor or a Bill No; rows may be incomplete (that's what a draft is for).
function checkDraft(body) {
  const vendorId = Number(body.vendorId) || null;
  const billNo = text(body.billNo).toUpperCase();
  if (!vendorId && !billNo) return { error: 'Pick a Vendor or enter the Bill No to save a draft' };
  if (billNo.length > 50) return { error: 'Bill No must be at most 50 characters' };
  const billDate = /^\d{4}-\d{2}-\d{2}$/.test(text(body.billDate)) ? text(body.billDate) : null;
  if (!body.data || typeof body.data !== 'object') return { error: 'Nothing to save' };
  const json = JSON.stringify(body.data);
  if (json.length > MAX_JSON) return { error: 'The draft is too large' };
  const lineCount = Math.max(0, Math.min(100000, Math.trunc(Number(body.lineCount) || 0)));
  const netAmount = Math.round((Number(body.netAmount) || 0) * 100) / 100;
  return { vendorId, billNo: billNo || null, billDate, json, lineCount, netAmount };
}

const bind = (request, d) => request
  .input('vendorId', sql.Int, d.vendorId).input('billNo', sql.NVarChar(50), d.billNo).input('billDate', sql.Date, d.billDate)
  .input('data', sql.NVarChar(sql.MAX), d.json).input('lines', sql.Int, d.lineCount).input('net', sql.Decimal(12, 2), d.netAmount);

router.post('/', async (req, res) => {
  const d = checkDraft(req.body || {});
  if (d.error) return res.status(400).json({ error: d.error });
  try {
    const pool = await getPool();
    const r = await bind(pool.request(), d).input('by', sql.NVarChar(100), req.user?.username || null).query(`
      INSERT INTO IpsDraft (VendorId, BillNo, BillDate, Data, LineCount, NetAmount, CreatedBy)
      OUTPUT INSERTED.DraftId, INSERTED.UpdatedAt VALUES (@vendorId, @billNo, @billDate, @data, @lines, @net, @by)`);
    res.status(201).json(r.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  const d = checkDraft(req.body || {});
  if (d.error) return res.status(400).json({ error: d.error });
  try {
    const pool = await getPool();
    const r = await bind(pool.request(), d).input('id', sql.Int, Number(req.params.id)).query(`
      UPDATE IpsDraft SET VendorId = @vendorId, BillNo = @billNo, BillDate = @billDate, Data = @data, LineCount = @lines,
             NetAmount = @net, UpdatedAt = GETDATE()
      OUTPUT INSERTED.DraftId, INSERTED.UpdatedAt WHERE DraftId = @id`);
    if (!r.recordset.length) return res.status(404).json({ error: 'Draft not found (it may have been saved or deleted)' });
    res.json(r.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// A draft is only screen data, so delete removes it for good.
router.delete('/:id', async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request().input('id', sql.Int, Number(req.params.id)).query('DELETE FROM IpsDraft WHERE DraftId = @id');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
