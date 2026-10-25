import { Router } from 'express';
import { getPool, sql } from '../db/pool.js';

// Shared header + line-items CRUD for the four pharmacy transaction types
// (Purchase Invoice/Return, Sales Billing/Return) — identical shape aside
// from which tables they use and whether the "party" is a Supplier FK
// (purchases) or a free-text customer name (sales, walk-in).
//
//   party: { type: 'supplier' } | { type: 'customer' }
//   extraLineFields: optional [{ name, column, kind: 'text'|'decimal'|'date' }]
//                     — per-line columns beyond the base Item/Quantity/Rate/
//                     Amount, read from body.items[i][name] and written to
//                     itemTable.column. Purchase Invoice's richer grid
//                     (Rack, Batch, MRP, GST, ...) uses this; the other three
//                     transaction types pass none and behave as before.
//   extraHeaderFields: optional [{ name, column, kind: 'text'|'decimal'|'date'|'int' }]
//                     — extra columns on the header itself, read from body[name]
//                     and written to headerTable.column, also returned by GET /.
//                     Purchase Return's PurchaseInvoiceId (which invoice it was
//                     raised against) uses this; the other types pass none.
//
// GET    /              list headers, newest first, optional ?search=
// GET    /:id/items      line items for one header, joined to item name
// POST   /               create header + items in one transaction
// DELETE /:id            soft-delete the header (items cascade-delete for real,
//                         since they're meaningless without it — the header
//                         itself is the record that matters to keep/undo)
export function createTransactionRouter({ headerTable, itemTable, headerIdCol, codePrefix, party, extraLineFields = [], extraHeaderFields = [] }) {
  const router = Router();
  const codeExpr = (alias) => `'${codePrefix}' + RIGHT('000000' + CAST(${alias}.${headerIdCol} AS VARCHAR(10)), 6)`;
  const isSupplier = party.type === 'supplier';
  const partySelect = isSupplier ? 'h.SupplierId, s.Name AS SupplierName' : 'h.CustomerName';
  const partyJoin = isSupplier ? 'LEFT JOIN Supplier s ON s.SupplierId = h.SupplierId' : '';
  const partySearch = isSupplier ? 'OR s.Name LIKE @search' : 'OR h.CustomerName LIKE @search';

  router.get('/', async (req, res) => {
    try {
      const { search = '' } = req.query;
      const pool = await getPool();
      const extraHeaderSelect = extraHeaderFields.map((f) => `h.${f.column}`).join(', ');
      const result = await pool
        .request()
        .input('search', sql.NVarChar, `%${search}%`)
        .query(`
          SELECT h.${headerIdCol}, ${codeExpr('h')} AS Code, h.TransDate, ${partySelect}, h.TotalAmount, h.CreatedAt${extraHeaderSelect ? ', ' + extraHeaderSelect : ''}
          FROM ${headerTable} h
          ${partyJoin}
          WHERE h.IsActive = 1 AND (@search = '%%' ${partySearch})
          ORDER BY h.${headerIdCol} DESC
        `);
      res.json(result.recordset);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/:id/items', async (req, res) => {
    try {
      const pool = await getPool();
      const result = await pool
        .request()
        .input('id', sql.Int, req.params.id)
        .query(`
          SELECT li.*, i.Name AS ItemName
          FROM ${itemTable} li
          JOIN PharmacyItem i ON i.ItemId = li.ItemId
          WHERE li.${headerIdCol} = @id
          ORDER BY li.LineId
        `);
      res.json(result.recordset);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // A line's amount is qty*rate for the three simple transaction types
  // (which don't send one), but Purchase Invoice computes its own
  // (qty*rate, less discount, plus GST) and sends it explicitly — use
  // that when present instead of silently recomputing the simple version.
  const lineAmount = (it) => (it.amount !== undefined && it.amount !== null && it.amount !== ''
    ? Number(it.amount)
    : Number(it.quantity) * Number(it.rate || 0));

  const insertLine = async (tx, headerId, it) => {
    const qty = Number(it.quantity);
    const rate = Number(it.rate) || 0;
    const lineReq = new sql.Request(tx)
      .input('headerId', sql.Int, headerId)
      .input('itemId', sql.Int, it.itemId)
      .input('qty', sql.Decimal(10, 2), qty)
      .input('rate', sql.Decimal(10, 2), rate)
      .input('amount', sql.Decimal(12, 2), lineAmount(it));

    const extraCols = [];
    const extraVals = [];
    for (const f of extraLineFields) {
      const raw = it[f.name];
      if (f.kind === 'decimal') lineReq.input(f.name, sql.Decimal(12, 2), raw === '' || raw == null ? null : Number(raw));
      else if (f.kind === 'date') lineReq.input(f.name, sql.Date, raw ? new Date(raw) : null);
      else lineReq.input(f.name, sql.NVarChar, raw?.toString().trim() || null);
      extraCols.push(f.column);
      extraVals.push(`@${f.name}`);
    }

    await lineReq.query(`
      INSERT INTO ${itemTable} (${headerIdCol}, ItemId, Quantity, Rate, Amount${extraCols.length ? ', ' + extraCols.join(', ') : ''})
      VALUES (@headerId, @itemId, @qty, @rate, @amount${extraVals.length ? ', ' + extraVals.join(', ') : ''})
    `);
  };

  // Binds body[name] for each extraHeaderField onto a request, returning the
  // column/placeholder lists POST's INSERT and PUT's UPDATE both need.
  const bindExtraHeaderFields = (headerReq, body) => {
    const cols = [];
    const placeholders = [];
    for (const f of extraHeaderFields) {
      const raw = body[f.name];
      if (f.kind === 'decimal') headerReq.input(f.name, sql.Decimal(12, 2), raw === '' || raw == null ? null : Number(raw));
      else if (f.kind === 'int') headerReq.input(f.name, sql.Int, raw === '' || raw == null ? null : Number(raw));
      else if (f.kind === 'date') headerReq.input(f.name, sql.Date, raw ? new Date(raw) : null);
      else headerReq.input(f.name, sql.NVarChar, raw?.toString().trim() || null);
      cols.push(f.column);
      placeholders.push(`@${f.name}`);
    }
    return { cols, placeholders };
  };

  router.post('/', async (req, res) => {
    const { transDate, supplierId, customerName, items } = req.body;
    const lines = (Array.isArray(items) ? items : []).filter((it) => it.itemId && Number(it.quantity) > 0);
    if (lines.length === 0) return res.status(400).json({ error: 'At least one line item with an item and quantity is required' });
    if (isSupplier && !supplierId) return res.status(400).json({ error: 'Supplier is required' });

    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    try {
      await tx.begin();
      const total = lines.reduce((sum, it) => sum + lineAmount(it), 0);

      const headerReq = new sql.Request(tx)
        .input('transDate', sql.Date, transDate ? new Date(transDate) : new Date())
        .input('total', sql.Decimal(12, 2), total);
      if (isSupplier) headerReq.input('party', sql.Int, supplierId);
      else headerReq.input('party', sql.NVarChar, customerName?.trim() || null);
      const { cols: extraCols, placeholders: extraVals } = bindExtraHeaderFields(headerReq, req.body);

      const partyCol = isSupplier ? 'SupplierId' : 'CustomerName';
      const inserted = await headerReq.query(`
        INSERT INTO ${headerTable} (TransDate, ${partyCol}, TotalAmount${extraCols.length ? ', ' + extraCols.join(', ') : ''})
        OUTPUT INSERTED.${headerIdCol}
        VALUES (@transDate, @party, @total${extraVals.length ? ', ' + extraVals.join(', ') : ''})
      `);
      const headerId = inserted.recordset[0][headerIdCol];

      for (const it of lines) await insertLine(tx, headerId, it);

      await tx.commit();
      res.status(201).json({ [headerIdCol]: headerId });
    } catch (err) {
      await tx.rollback().catch(() => {});
      res.status(500).json({ error: err.message });
    }
  });

  // Edit: replace the header fields and wholesale-replace its line items
  // (delete + re-insert) rather than diffing — these line counts are small
  // (a handful of batches per invoice) so it's simpler and just as correct.
  router.put('/:id', async (req, res) => {
    const { transDate, supplierId, customerName, items } = req.body;
    const lines = (Array.isArray(items) ? items : []).filter((it) => it.itemId && Number(it.quantity) > 0);
    if (lines.length === 0) return res.status(400).json({ error: 'At least one line item with an item and quantity is required' });
    if (isSupplier && !supplierId) return res.status(400).json({ error: 'Supplier is required' });

    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    try {
      await tx.begin();
      const total = lines.reduce((sum, it) => sum + lineAmount(it), 0);

      const headerReq = new sql.Request(tx)
        .input('id', sql.Int, req.params.id)
        .input('transDate', sql.Date, transDate ? new Date(transDate) : new Date())
        .input('total', sql.Decimal(12, 2), total);
      if (isSupplier) headerReq.input('party', sql.Int, supplierId);
      else headerReq.input('party', sql.NVarChar, customerName?.trim() || null);
      const { cols: extraCols } = bindExtraHeaderFields(headerReq, req.body);

      const partyCol = isSupplier ? 'SupplierId' : 'CustomerName';
      const extraSet = extraCols.map((c, i) => `${c} = @${extraHeaderFields[i].name}`).join(', ');
      const updated = await headerReq.query(`
        UPDATE ${headerTable} SET TransDate = @transDate, ${partyCol} = @party, TotalAmount = @total${extraSet ? ', ' + extraSet : ''}
        WHERE ${headerIdCol} = @id AND IsActive = 1
      `);
      if (updated.rowsAffected[0] === 0) return res.status(404).json({ error: 'Record not found' });

      await new sql.Request(tx).input('id', sql.Int, req.params.id).query(`DELETE FROM ${itemTable} WHERE ${headerIdCol} = @id`);
      for (const it of lines) await insertLine(tx, req.params.id, it);

      await tx.commit();
      res.json({ [headerIdCol]: Number(req.params.id) });
    } catch (err) {
      await tx.rollback().catch(() => {});
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/:id', async (req, res) => {
    try {
      const pool = await getPool();
      await pool
        .request()
        .input('id', sql.Int, req.params.id)
        .query(`UPDATE ${headerTable} SET IsActive = 0 WHERE ${headerIdCol} = @id`);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
