import { Router } from 'express';
import { getPool, sql } from '../db/pool.js';

const router = Router();

// Item-wise stock = Purchased - Purchase Returned - Sold + Sales Returned.
// This list is a net quantity per item, not a batch-by-batch ledger — see
// GET /:itemId/batches below for the batch-level (and now sales-aware)
// breakdown. "Nearest Expiry" is the soonest upcoming expiry among that
// item's purchased batches, for a quick at-a-glance warning.
router.get('/', async (req, res) => {
  try {
    const { search = '' } = req.query;
    const pool = await getPool();
    const result = await pool
      .request()
      .input('search', sql.NVarChar, `%${search}%`)
      .query(`
        WITH Purchased AS (
          SELECT pii.ItemId, SUM(pii.Quantity) AS Qty
          FROM PurchaseInvoiceItem pii
          JOIN PurchaseInvoice pi ON pi.PurchaseInvoiceId = pii.PurchaseInvoiceId AND pi.IsActive = 1
          GROUP BY pii.ItemId
        ),
        PurchaseReturned AS (
          SELECT pri.ItemId, SUM(pri.Quantity) AS Qty
          FROM PurchaseReturnItem pri
          JOIN PurchaseReturn pr ON pr.PurchaseReturnId = pri.PurchaseReturnId AND pr.IsActive = 1
          GROUP BY pri.ItemId
        ),
        Sold AS (
          SELECT sbi.ItemId, SUM(sbi.Quantity) AS Qty
          FROM SalesBillingItem sbi
          JOIN SalesBilling sb ON sb.SalesBillingId = sbi.SalesBillingId AND sb.IsActive = 1
          GROUP BY sbi.ItemId
        ),
        SalesReturned AS (
          SELECT sri.ItemId, SUM(sri.Quantity) AS Qty
          FROM SalesReturnItem sri
          JOIN SalesReturn sr ON sr.SalesReturnId = sri.SalesReturnId AND sr.IsActive = 1
          GROUP BY sri.ItemId
        ),
        NearestExpiry AS (
          SELECT pii.ItemId, MIN(pii.ExpiryDate) AS NearestExpiry
          FROM PurchaseInvoiceItem pii
          JOIN PurchaseInvoice pi ON pi.PurchaseInvoiceId = pii.PurchaseInvoiceId AND pi.IsActive = 1
          WHERE pii.ExpiryDate IS NOT NULL AND pii.ExpiryDate >= CAST(GETDATE() AS DATE)
          GROUP BY pii.ItemId
        )
        SELECT
          i.ItemId, i.Name AS ItemName, it.Name AS ItemTypeName,
          ISNULL(p.Qty, 0) AS PurchasedQty,
          ISNULL(pr.Qty, 0) AS PurchaseReturnQty,
          ISNULL(s.Qty, 0) AS SoldQty,
          ISNULL(sr.Qty, 0) AS SalesReturnQty,
          (ISNULL(p.Qty, 0) - ISNULL(pr.Qty, 0) - ISNULL(s.Qty, 0) + ISNULL(sr.Qty, 0)) AS NetStock,
          ne.NearestExpiry
        FROM PharmacyItem i
        LEFT JOIN ItemTypeMaster it ON it.ItemTypeId = i.ItemTypeId
        LEFT JOIN Purchased p ON p.ItemId = i.ItemId
        LEFT JOIN PurchaseReturned pr ON pr.ItemId = i.ItemId
        LEFT JOIN Sold s ON s.ItemId = i.ItemId
        LEFT JOIN SalesReturned sr ON sr.ItemId = i.ItemId
        LEFT JOIN NearestExpiry ne ON ne.ItemId = i.ItemId
        WHERE i.IsActive = 1 AND (@search = '%%' OR i.Name LIKE @search)
        ORDER BY i.Name
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Batch-level detail for one item: every batch purchased, its expiry, how
// much of that same batch has been purchase-returned or sold (Sales Billing
// records which batch it fulfilled from), and what's left available to sell.
router.get('/:itemId/batches', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .input('itemId', sql.Int, req.params.itemId)
      .query(`
        SELECT
          pii.Batch, pii.ExpiryDate,
          SUM(pii.Quantity) AS PurchasedQty,
          ISNULL((
            SELECT SUM(pri.Quantity)
            FROM PurchaseReturnItem pri
            JOIN PurchaseReturn pr ON pr.PurchaseReturnId = pri.PurchaseReturnId AND pr.IsActive = 1
            WHERE pri.ItemId = pii.ItemId AND ISNULL(pri.Batch, '') = ISNULL(pii.Batch, '')
          ), 0) AS ReturnedQty,
          ISNULL((
            SELECT SUM(sbi.Quantity)
            FROM SalesBillingItem sbi
            JOIN SalesBilling sb ON sb.SalesBillingId = sbi.SalesBillingId AND sb.IsActive = 1
            WHERE sbi.ItemId = pii.ItemId AND ISNULL(sbi.Batch, '') = ISNULL(pii.Batch, '')
          ), 0) AS SoldQty
        FROM PurchaseInvoiceItem pii
        JOIN PurchaseInvoice pi ON pi.PurchaseInvoiceId = pii.PurchaseInvoiceId AND pi.IsActive = 1
        WHERE pii.ItemId = @itemId
        GROUP BY pii.Batch, pii.ExpiryDate, pii.ItemId
        ORDER BY pii.ExpiryDate ASC
      `);
    const rows = result.recordset.map((r) => ({ ...r, AvailableQty: r.PurchasedQty - r.ReturnedQty - r.SoldQty }));
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
