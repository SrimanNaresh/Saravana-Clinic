import { sql } from '../db/pool.js';

// Every received batch of the given items with what's left of it:
// received (Stock In, plus the older Purchase Invoice lines and Stock Inward)
// - returned to the vendor (Return, plus older Purchase Returns) - sold.
// SelAmount is the batch's selling price from its latest Stock In line. A batch is the item + its batch number ('' when it had none), the
// same key returns and sales record. `excludeSaleId` leaves one sale out of
// "sold", so editing a sale can reuse the stock it already took.
// Earliest expiry first; batches without an expiry go last.
export async function batchStock(request, itemIds, { excludeSaleId = null } = {}) {
  const ids = [...new Set(itemIds.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (!ids.length) return [];
  const result = await request
    .input('bsIds', sql.NVarChar(sql.MAX), ids.join(','))
    .input('bsExclude', sql.Int, excludeSaleId)
    .query(`
      WITH Ids AS (SELECT CAST(value AS INT) AS ItemId FROM STRING_SPLIT(@bsIds, ',')),
      Received AS (
        SELECT pii.ItemId, ISNULL(pii.Batch, '') AS Batch, pii.ExpiryDate, pii.Quantity
        FROM PurchaseInvoiceItem pii
        JOIN PurchaseInvoice pi ON pi.PurchaseInvoiceId = pii.PurchaseInvoiceId AND pi.IsActive = 1
        WHERE pii.ItemId IN (SELECT ItemId FROM Ids)
        UNION ALL
        SELECT si.ItemId, ISNULL(si.Batch, ''), si.ExpiryDate, si.Quantity
        FROM StockInward si
        WHERE si.IsActive = 1 AND si.ItemId IN (SELECT ItemId FROM Ids)
        UNION ALL
        SELECT l.ItemId, l.BatchNo, l.ExpDate, l.Quantity + l.FreeQty
        FROM StockInItem l JOIN StockIn h ON h.StockInId = l.StockInId AND h.IsActive = 1
        WHERE l.ItemId IN (SELECT ItemId FROM Ids)
      ),
      Rcv AS (
        SELECT ItemId, Batch, MIN(ExpiryDate) AS ExpiryDate, SUM(Quantity) AS Qty
        FROM Received GROUP BY ItemId, Batch
      ),
      Returned AS (
        SELECT pri.ItemId, ISNULL(pri.Batch, '') AS Batch, pri.Quantity
        FROM PurchaseReturnItem pri
        JOIN PurchaseReturn pr ON pr.PurchaseReturnId = pri.PurchaseReturnId AND pr.IsActive = 1
        WHERE pri.ItemId IN (SELECT ItemId FROM Ids)
        UNION ALL
        SELECT ri.ItemId, ri.BatchNo, ri.Quantity
        FROM StockReturnItem ri JOIN StockReturn rh ON rh.StockReturnId = ri.StockReturnId AND rh.IsActive = 1
        WHERE ri.ItemId IN (SELECT ItemId FROM Ids)
      ),
      Ret AS (SELECT ItemId, Batch, SUM(Quantity) AS Qty FROM Returned GROUP BY ItemId, Batch),
      Sold AS (
        SELECT sbi.ItemId, ISNULL(sbi.Batch, '') AS Batch, SUM(sbi.Quantity) AS Qty
        FROM SalesBillingItem sbi
        JOIN SalesBilling sb ON sb.SalesBillingId = sbi.SalesBillingId AND sb.IsActive = 1
        WHERE sbi.ItemId IN (SELECT ItemId FROM Ids)
          AND (@bsExclude IS NULL OR sb.SalesBillingId <> @bsExclude)
        GROUP BY sbi.ItemId, ISNULL(sbi.Batch, '')
      )
      SELECT r.ItemId, r.Batch, r.ExpiryDate, r.Qty AS ReceivedQty,
             ISNULL(ret.Qty, 0) AS ReturnedQty, ISNULL(s.Qty, 0) AS SoldQty,
             r.Qty - ISNULL(ret.Qty, 0) - ISNULL(s.Qty, 0) AS AvailableQty, sel.SelAmount
      FROM Rcv r
      LEFT JOIN Ret ret ON ret.ItemId = r.ItemId AND ret.Batch = r.Batch
      LEFT JOIN Sold s ON s.ItemId = r.ItemId AND s.Batch = r.Batch
      OUTER APPLY (
        SELECT TOP 1 l.SelAmount FROM StockInItem l JOIN StockIn h ON h.StockInId = l.StockInId AND h.IsActive = 1
        WHERE l.ItemId = r.ItemId AND l.BatchNo = r.Batch ORDER BY h.StockInId DESC
      ) sel
      ORDER BY r.ItemId, CASE WHEN r.ExpiryDate IS NULL THEN 1 ELSE 0 END, r.ExpiryDate, r.Batch
    `);
  return result.recordset.map((r) => ({
    ...r,
    ReceivedQty: Number(r.ReceivedQty),
    ReturnedQty: Number(r.ReturnedQty),
    SoldQty: Number(r.SoldQty),
    AvailableQty: Number(r.AvailableQty),
    SelAmount: r.SelAmount == null ? null : Number(r.SelAmount),
  }));
}
