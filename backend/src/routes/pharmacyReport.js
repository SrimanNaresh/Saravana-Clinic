import { Router } from 'express';
import { getPool, sql } from '../db/pool.js';
import { docNoSql } from '../utils/docNumber.js';
import { code6, EVENTS } from '../utils/stockEvents.js';
import allInOneRoutes from './allInOneReport.js';
import { batchStock } from '../utils/batchStock.js';

// Pharmacy > Report: Stock Report (item-wise, with each item's history) and
// Vendor Payments. Both read the documents themselves, so they always agree
// with the documents as they are now, later edits included.
const router = Router();

// ?search (name / code / generic), ?category, ?show = history (default) |
// instock | outofstock | all. Current = Opening + Stock In - Return - Sold + Adjustment.
router.get('/stock', async (req, res) => {
  try {
    const { search = '', category = '', show = 'history' } = req.query;
    const pool = await getPool();
    const result = await pool
      .request()
      .input('itemId', sql.Int, null)
      .input('search', sql.NVarChar, `%${search}%`)
      .input('category', sql.NVarChar, category)
      .query(`
        WITH Ev AS (${EVENTS}),
        Totals AS (
          SELECT ItemId,
                 SUM(CASE WHEN Kind = 'opening' THEN Qty ELSE 0 END) AS Opening,
                 SUM(CASE WHEN Kind = 'purchase' THEN Qty ELSE 0 END) AS StockIn,
                 -SUM(CASE WHEN Kind = 'return' THEN Qty ELSE 0 END) AS Returned,
                 -SUM(CASE WHEN Kind IN ('issue', 'sales-return') THEN Qty ELSE 0 END) AS Sold,
                 SUM(CASE WHEN Kind = 'adjustment' THEN Qty ELSE 0 END) AS Adjustment,
                 SUM(Qty) AS CurrentStock,
                 COUNT(*) AS Events
          FROM Ev GROUP BY ItemId
        )
        SELECT i.ItemId, 'ITM' + RIGHT('000000' + CAST(i.ItemId AS VARCHAR(10)), 6) AS ItemCode, i.Name AS ItemName,
               i.Category, i.Pack, g.Name AS GenericName,
               ISNULL(t.Opening, 0) AS Opening, ISNULL(t.StockIn, 0) AS StockIn, ISNULL(t.Returned, 0) AS Returned,
               ISNULL(t.Sold, 0) AS Sold, ISNULL(t.Adjustment, 0) AS Adjustment, ISNULL(t.CurrentStock, 0) AS CurrentStock,
               ISNULL(i.SellPrice, i.MRP) AS SellPrice,
               ISNULL(t.CurrentStock, 0) * ISNULL(ISNULL(i.SellPrice, i.MRP), 0) AS StockValue,
               ISNULL(t.Events, 0) AS Events
        FROM PharmacyItem i
        LEFT JOIN Totals t ON t.ItemId = i.ItemId
        LEFT JOIN GenericNameMaster g ON g.GenericNameId = i.GenericNameId
        WHERE i.IsActive = 1
          AND (@search = '%%' OR i.Name LIKE @search OR g.Name LIKE @search OR i.GenericName LIKE @search
               OR 'ITM' + RIGHT('000000' + CAST(i.ItemId AS VARCHAR(10)), 6) LIKE @search)
          AND (@category = '' OR i.Category = @category)
        ORDER BY i.Name
      `);
    const keep = {
      history: (r) => r.Events > 0,
      instock: (r) => r.CurrentStock > 0,
      outofstock: (r) => r.Events > 0 && r.CurrentStock <= 0,
      all: () => true,
    }[show] || ((r) => r.Events > 0);
    res.json(result.recordset.filter(keep));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// At or below this many packs an item is low on stock, unless the item has
// its own Re-order Level.
export const LOW_STOCK_DEFAULT = 5;
const ITEM_CODE_SQL = `'ITM' + RIGHT('000000' + CAST(i.ItemId AS VARCHAR(10)), 6)`;

// Expiry Report: every batch with stock left that has expired or expires in
// the next 90 days (the screen's tabs narrow it to 30 / 60 days), earliest
// first. Stock and expiry come from batchStock, the same numbers Sales uses.
router.get('/expiry', async (req, res) => {
  try {
    const { category = '' } = req.query;
    const pool = await getPool();
    const items = (await pool.request().input('category', sql.NVarChar, category).query(`
      SELECT i.ItemId, ${ITEM_CODE_SQL} AS ItemCode, i.Name, i.Category, i.MRP
      FROM PharmacyItem i WHERE i.IsActive = 1 AND (@category = '' OR i.Category = @category)`)).recordset;
    const byId = new Map(items.map((i) => [i.ItemId, i]));
    const limit = new Date();
    limit.setHours(0, 0, 0, 0);
    limit.setDate(limit.getDate() + 90);
    const batches = (await batchStock(pool.request(), items.map((i) => i.ItemId)))
      .filter((b) => b.AvailableQty > 0 && b.ExpiryDate && new Date(b.ExpiryDate) <= limit);
    // Who supplied each batch last (its latest active Stock In).
    const vendors = new Map((await pool.request().query(`
      SELECT l.ItemId, l.BatchNo, v.VendorName,
             ROW_NUMBER() OVER (PARTITION BY l.ItemId, l.BatchNo ORDER BY h.StockInId DESC) AS rn
      FROM StockInItem l JOIN StockIn h ON h.StockInId = l.StockInId AND h.IsActive = 1
      JOIN Vendor v ON v.VendorId = h.VendorId`)).recordset.filter((r) => r.rn === 1).map((r) => [`${r.ItemId}|${r.BatchNo}`, r.VendorName]));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    res.json(batches.map((b) => {
      const item = byId.get(b.ItemId);
      const mrp = b.MRP ?? (item.MRP == null ? null : Number(item.MRP));
      const days = Math.round((new Date(b.ExpiryDate) - today) / 86400000);
      return {
        ItemId: b.ItemId, ItemCode: item.ItemCode, Name: item.Name, Category: item.Category, Batch: b.Batch,
        ExpiryDate: b.ExpiryDate, DaysLeft: days, Stock: Math.round(b.AvailableQty * 100) / 100, MRP: mrp,
        StockValue: mrp == null ? 0 : Math.round(b.AvailableQty * mrp * 100) / 100,
        VendorName: vendors.get(`${b.ItemId}|${b.Batch}`) || null,
      };
    }).sort((a, b) => new Date(a.ExpiryDate) - new Date(b.ExpiryDate)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Low Stock: active items at or below their Re-order Level (default 5 packs).
// ?category; ?all=1 also lists items that never had any stock.
router.get('/low-stock', async (req, res) => {
  try {
    const { category = '', all = '' } = req.query;
    const pool = await getPool();
    const r = await pool.request().input('itemId', sql.Int, null).input('category', sql.NVarChar, category)
      .input('def', sql.Decimal(10, 2), LOW_STOCK_DEFAULT).input('all', sql.Bit, all === '1' ? 1 : 0).query(`
        WITH Ev AS (${EVENTS}),
        St AS (SELECT ItemId, SUM(Qty) AS Stock, COUNT(*) AS Events FROM Ev GROUP BY ItemId)
        SELECT i.ItemId, ${ITEM_CODE_SQL} AS ItemCode, i.Name, i.Category, i.Pack,
               ISNULL(st.Stock, 0) AS Stock, i.ReorderLevel, ISNULL(i.ReorderLevel, @def) AS Level,
               ISNULL(i.ReorderLevel, @def) - ISNULL(st.Stock, 0) AS ShortBy,
               lastIn.VendorName, lastPo.PRate AS LastPRate
        FROM PharmacyItem i
        LEFT JOIN St st ON st.ItemId = i.ItemId
        OUTER APPLY (SELECT TOP 1 v.VendorName FROM StockInItem l
                     JOIN StockIn h ON h.StockInId = l.StockInId AND h.IsActive = 1
                     JOIN Vendor v ON v.VendorId = h.VendorId
                     WHERE l.ItemId = i.ItemId ORDER BY h.StockInId DESC) lastIn
        OUTER APPLY (SELECT TOP 1 pol.PRate FROM PurchaseOrderItem pol
                     JOIN PurchaseOrder po ON po.PurchaseOrderId = pol.PurchaseOrderId AND po.IsActive = 1
                     WHERE pol.ItemId = i.ItemId AND pol.PRate IS NOT NULL ORDER BY pol.LineId DESC) lastPo
        WHERE i.IsActive = 1 AND i.Status = 'Active'
          AND (@category = '' OR i.Category = @category)
          AND ISNULL(st.Stock, 0) <= ISNULL(i.ReorderLevel, @def)
          AND (@all = 1 OR ISNULL(st.Events, 0) > 0)
        ORDER BY ISNULL(st.Stock, 0), i.Name`);
    res.json(r.recordset.map((x) => ({ ...x, Stock: Number(x.Stock), Level: Number(x.Level), ShortBy: Number(x.ShortBy) })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// One item's stock history, oldest first, with the stock after each change.
router.get('/stock/:itemId/history', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .input('itemId', sql.Int, req.params.itemId)
      .query(`
        WITH Ev AS (${EVENTS})
        SELECT Kind, Qty, At, DocDate, Details, VendorName, ByUser, RefType, RefId,
               SUM(Qty) OVER (ORDER BY At, RefType, RefId ROWS UNBOUNDED PRECEDING) AS BalanceAfter
        FROM Ev
        ORDER BY At, RefType, RefId
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Stock Ins and Returns per vendor, optionally between ?from and ?to
// (YYYY-MM-DD, either may be left out).
// Stock In: Amount = Qty x Cur.Rate, GST from its order line's CGST + SGST %.
// Return: Amount = Qty x Cur.Rate, GST % of the Stock In line it came from.
// Free units aren't paid for: a Stock In charges only its paid Quantity, and
// a return is credited at the Stock In line's rate spread over its paid +
// free units (the returned units may have been free ones).
// The older Stock Inward entries and Purchase Returns are included too: an
// inward's Amount is Qty x price less Discount %; an old return's Amount
// already includes GST, which is split out by its GST %.
const DOCS = `
  SELECT h.VendorId, 'stock-in' AS Type, h.StockInId AS DocId, ${docNoSql('SI', 'h.StockInId')} AS DocNo,
         h.InDate AS DocDate, ${docNoSql('PO', 'h.PurchaseOrderId')} AS Against,
         i.Name AS ItemName, l.Quantity AS Qty,
         ROUND(l.Quantity * l.Rate, 2) AS Amount,
         pol.CGSTPercent + pol.SGSTPercent AS GSTPercent
  FROM StockInItem l
  JOIN StockIn h ON h.StockInId = l.StockInId AND h.IsActive = 1
  JOIN PurchaseOrderItem pol ON pol.LineId = l.PoLineId
  JOIN PharmacyItem i ON i.ItemId = l.ItemId
  UNION ALL
  SELECT h.VendorId, 'return', h.StockReturnId, ${docNoSql('RT', 'h.StockReturnId')},
         h.ReturnDate, ${docNoSql('SI', 'h.StockInId')},
         i.Name, l.Quantity, ROUND(l.Quantity * l.Rate * sl.Quantity / (sl.Quantity + sl.FreeQty), 2),
         pol.CGSTPercent + pol.SGSTPercent
  FROM StockReturnItem l
  JOIN StockReturn h ON h.StockReturnId = l.StockReturnId AND h.IsActive = 1
  JOIN StockInItem sl ON sl.LineId = l.StockInLineId
  JOIN PurchaseOrderItem pol ON pol.LineId = sl.PoLineId
  JOIN PharmacyItem i ON i.ItemId = l.ItemId
  UNION ALL
  SELECT si.VendorId, 'stock-inward' AS Type, si.StockInwardId AS DocId, ${code6('INW', 'si.StockInwardId')} AS DocNo,
         ISNULL(si.BillDate, CAST(si.CreatedAt AS DATE)) AS DocDate,
         CASE WHEN si.PurchaseInvoiceId IS NULL THEN NULL ELSE ${code6('PINV', 'si.PurchaseInvoiceId')} END AS Against,
         i.Name AS ItemName, si.Quantity AS Qty,
         ROUND(si.Quantity * ISNULL(si.CurrentPrice, 0) * (1 - ISNULL(si.DiscountPercent, 0) / 100), 2) AS Amount,
         ISNULL(si.GSTPercent, 0) AS GSTPercent
  FROM StockInward si JOIN PharmacyItem i ON i.ItemId = si.ItemId
  WHERE si.IsActive = 1
  UNION ALL
  SELECT h.VendorId, 'purchase-return', h.PurchaseReturnId, ${code6('PRET', 'h.PurchaseReturnId')},
         h.TransDate,
         CASE WHEN h.PurchaseInvoiceId IS NULL THEN NULL ELSE ${code6('PINV', 'h.PurchaseInvoiceId')} END,
         i.Name, l.Quantity,
         ROUND(l.Amount / (1 + ISNULL(l.GSTPercent, 0) / 100), 2),
         ISNULL(l.GSTPercent, 0)
  FROM PurchaseReturnItem l
  JOIN PurchaseReturn h ON h.PurchaseReturnId = l.PurchaseReturnId AND h.IsActive = 1
  JOIN PharmacyItem i ON i.ItemId = l.ItemId
  WHERE h.VendorId IS NOT NULL
`;

const dateOrNull = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : null);

function docsRequest(pool, req) {
  return pool.request()
    .input('from', sql.Date, dateOrNull(req.query.from))
    .input('to', sql.Date, dateOrNull(req.query.to));
}

router.get('/vendor-payments', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await docsRequest(pool, req).query(`
      WITH D AS (
        SELECT *, ROUND(Amount * GSTPercent / 100, 2) AS GST FROM (${DOCS}) x
        WHERE (@from IS NULL OR DocDate >= @from) AND (@to IS NULL OR DocDate <= @to)
      )
      SELECT v.VendorId, v.VendorName, v.ContactNo AS MobileNo,
             COUNT(DISTINCT CASE WHEN D.Type IN ('stock-in', 'stock-inward') THEN D.Type + CAST(D.DocId AS VARCHAR(10)) END) AS StockInCount,
             SUM(CASE WHEN D.Type IN ('stock-in', 'stock-inward') THEN D.Amount ELSE 0 END) AS StockInAmount,
             SUM(CASE WHEN D.Type IN ('stock-in', 'stock-inward') THEN D.GST ELSE 0 END) AS StockInGST,
             SUM(CASE WHEN D.Type IN ('stock-in', 'stock-inward') THEN D.Amount + D.GST ELSE 0 END) AS StockInTotal,
             COUNT(DISTINCT CASE WHEN D.Type IN ('return', 'purchase-return') THEN D.Type + CAST(D.DocId AS VARCHAR(10)) END) AS ReturnCount,
             SUM(CASE WHEN D.Type IN ('return', 'purchase-return') THEN D.Amount + D.GST ELSE 0 END) AS ReturnTotal
      FROM D JOIN Vendor v ON v.VendorId = D.VendorId
      GROUP BY v.VendorId, v.VendorName, v.ContactNo
      ORDER BY v.VendorName
    `);
    res.json(result.recordset.map((r) => ({ ...r, NetPayable: Number(r.StockInTotal) - Number(r.ReturnTotal) })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// One vendor's Stock Ins and Returns, one row per document, newest first.
router.get('/vendor-payments/:vendorId', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await docsRequest(pool, req)
      .input('vendorId', sql.Int, req.params.vendorId)
      .query(`
        WITH D AS (
          SELECT *, ROUND(Amount * GSTPercent / 100, 2) AS GST FROM (${DOCS}) x
          WHERE VendorId = @vendorId
            AND (@from IS NULL OR DocDate >= @from) AND (@to IS NULL OR DocDate <= @to)
        )
        SELECT Type, DocId, DocNo, DocDate, MAX(Against) AS Against,
               STRING_AGG(ItemName, ', ') AS ItemNames, COUNT(*) AS Items, SUM(Qty) AS Qty,
               SUM(Amount) AS Amount, SUM(GST) AS GST, SUM(Amount + GST) AS Total
        FROM D
        GROUP BY Type, DocId, DocNo, DocDate
        ORDER BY DocDate DESC, DocId DESC
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// All in One: any screen, with the columns picked.
router.use('/all-in-one', allInOneRoutes);

export default router;
