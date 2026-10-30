import { Router } from 'express';
import { getPool, sql } from '../db/pool.js';
import { docNoSql } from '../utils/docNumber.js';

// Pharmacy > Report: Stock Report (item-wise, with each item's history) and
// Vendor Payments. Both read the documents themselves, so they always agree
// with the documents as they are now, later edits included.
const router = Router();

const code6 = (prefix, idExpr) => `'${prefix}' + RIGHT('000000' + CAST(${idExpr} AS VARCHAR(10)), 6)`;

// One row per stock change: Kind is opening / purchase / return / issue /
// adjustment, Qty is signed. At orders the history; @itemId (NULL = all).
const EVENTS = `
  SELECT m.ItemId, m.Reason AS Kind, m.QtyChange AS Qty, m.CreatedAt AS At, CAST(m.CreatedAt AS DATE) AS DocDate,
         ISNULL(m.Note, CASE m.Reason WHEN 'opening' THEN 'Opening stock' ELSE 'Adjustment' END) AS Details,
         v.VendorName, m.CreatedBy AS ByUser, 'movement' AS RefType, m.MovementId AS RefId
  FROM StockMovement m LEFT JOIN Vendor v ON v.VendorId = m.VendorId
  WHERE (@itemId IS NULL OR m.ItemId = @itemId)
  UNION ALL
  SELECT l.ItemId, 'purchase', l.Quantity, h.CreatedAt, h.TransDate,
         'Purchase Invoice ' + ${code6('PINV', 'h.PurchaseInvoiceId')} + ISNULL(' · batch ' + l.Batch, ''),
         s.Name, NULL, 'purchase-invoice', h.PurchaseInvoiceId
  FROM PurchaseInvoiceItem l
  JOIN PurchaseInvoice h ON h.PurchaseInvoiceId = l.PurchaseInvoiceId AND h.IsActive = 1
  LEFT JOIN Supplier s ON s.SupplierId = h.SupplierId
  WHERE (@itemId IS NULL OR l.ItemId = @itemId)
  UNION ALL
  SELECT si.ItemId, 'purchase', si.Quantity, si.CreatedAt, ISNULL(si.BillDate, CAST(si.CreatedAt AS DATE)),
         'Stock In ' + ${docNoSql('SI', 'si.StockInwardId')} + ISNULL(' · batch ' + si.Batch, ''),
         v.VendorName, NULL, 'stock-in', si.StockInwardId
  FROM StockInward si JOIN Vendor v ON v.VendorId = si.VendorId
  WHERE si.IsActive = 1 AND (@itemId IS NULL OR si.ItemId = @itemId)
  UNION ALL
  SELECT l.ItemId, 'return', -l.Quantity, h.CreatedAt, h.TransDate,
         'Return ' + ${code6('PRET', 'h.PurchaseReturnId')} + ' to vendor' + ISNULL(' · batch ' + l.Batch, ''),
         ISNULL(v.VendorName, s.Name), NULL, 'return', h.PurchaseReturnId
  FROM PurchaseReturnItem l
  JOIN PurchaseReturn h ON h.PurchaseReturnId = l.PurchaseReturnId AND h.IsActive = 1
  LEFT JOIN Vendor v ON v.VendorId = h.VendorId
  LEFT JOIN Supplier s ON s.SupplierId = h.SupplierId
  WHERE (@itemId IS NULL OR l.ItemId = @itemId)
  UNION ALL
  SELECT l.ItemId, 'issue', -l.Quantity, h.CreatedAt, h.TransDate,
         'Sale ' + ${docNoSql('S', 'h.SalesBillingId')} + ISNULL(' · ' + h.CustomerName, '') + ISNULL(' · batch ' + l.Batch, ''),
         NULL, h.CreatedBy, 'sale', h.SalesBillingId
  FROM SalesBillingItem l
  JOIN SalesBilling h ON h.SalesBillingId = l.SalesBillingId AND h.IsActive = 1
  WHERE (@itemId IS NULL OR l.ItemId = @itemId)
  UNION ALL
  SELECT l.ItemId, 'issue', l.Quantity, h.CreatedAt, h.TransDate,
         'Sales Return ' + ${code6('SRET', 'h.SalesReturnId')} + ISNULL(' · ' + h.CustomerName, ''),
         NULL, NULL, 'sales-return', h.SalesReturnId
  FROM SalesReturnItem l
  JOIN SalesReturn h ON h.SalesReturnId = l.SalesReturnId AND h.IsActive = 1
  WHERE (@itemId IS NULL OR l.ItemId = @itemId)
`;

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
                 -SUM(CASE WHEN Kind = 'issue' THEN Qty ELSE 0 END) AS Sold,
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

// Stock Ins (Stock Inward entries) and Returns per vendor, optionally between
// ?from and ?to (YYYY-MM-DD, either may be left out).
// Stock In: Amount = Qty x Cur.Rate less Discount %, GST = GST % of that.
// Return: its Amount already includes GST, which is split out by its GST %.
const DOCS = `
  SELECT si.VendorId, 'stock-in' AS Type, si.StockInwardId AS DocId, ${docNoSql('SI', 'si.StockInwardId')} AS DocNo,
         ISNULL(si.BillDate, CAST(si.CreatedAt AS DATE)) AS DocDate,
         CASE WHEN si.PurchaseInvoiceId IS NULL THEN NULL ELSE ${code6('PINV', 'si.PurchaseInvoiceId')} END AS Against,
         i.Name AS ItemName, si.Quantity AS Qty,
         ROUND(si.Quantity * ISNULL(si.CurrentPrice, 0) * (1 - ISNULL(si.DiscountPercent, 0) / 100), 2) AS Amount,
         ISNULL(si.GSTPercent, 0) AS GSTPercent
  FROM StockInward si JOIN PharmacyItem i ON i.ItemId = si.ItemId
  WHERE si.IsActive = 1
  UNION ALL
  SELECT h.VendorId, 'return', h.PurchaseReturnId, ${code6('PRET', 'h.PurchaseReturnId')},
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
             COUNT(DISTINCT CASE WHEN D.Type = 'stock-in' THEN D.DocId END) AS StockInCount,
             SUM(CASE WHEN D.Type = 'stock-in' THEN D.Amount ELSE 0 END) AS StockInAmount,
             SUM(CASE WHEN D.Type = 'stock-in' THEN D.GST ELSE 0 END) AS StockInGST,
             SUM(CASE WHEN D.Type = 'stock-in' THEN D.Amount + D.GST ELSE 0 END) AS StockInTotal,
             COUNT(DISTINCT CASE WHEN D.Type = 'return' THEN D.DocId END) AS ReturnCount,
             SUM(CASE WHEN D.Type = 'return' THEN D.Amount + D.GST ELSE 0 END) AS ReturnTotal
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

export default router;
