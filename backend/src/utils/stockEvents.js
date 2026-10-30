import { docNoSql } from './docNumber.js';

export const code6 = (prefix, idExpr) => `'${prefix}' + RIGHT('000000' + CAST(${idExpr} AS VARCHAR(10)), 6)`;

// One row per stock change: Kind is opening / purchase / return / issue /
// adjustment, Qty is signed. At orders the history; @itemId (NULL = all).
export const EVENTS = `
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
         'Stock Inward ' + ${code6('INW', 'si.StockInwardId')} + ISNULL(' · batch ' + si.Batch, ''),
         v.VendorName, NULL, 'stock-in', si.StockInwardId
  FROM StockInward si JOIN Vendor v ON v.VendorId = si.VendorId
  WHERE si.IsActive = 1 AND (@itemId IS NULL OR si.ItemId = @itemId)
  UNION ALL
  SELECT l.ItemId, 'purchase', l.Quantity, h.CreatedAt, h.InDate,
         'Stock In ' + ${docNoSql('SI', 'h.StockInId')} + ' · batch ' + l.BatchNo,
         v.VendorName, h.CreatedBy, 'stock-in', h.StockInId
  FROM StockInItem l JOIN StockIn h ON h.StockInId = l.StockInId AND h.IsActive = 1
  JOIN Vendor v ON v.VendorId = h.VendorId
  WHERE (@itemId IS NULL OR l.ItemId = @itemId)
  UNION ALL
  SELECT l.ItemId, 'return', -l.Quantity, h.CreatedAt, h.ReturnDate,
         'Return ' + ${docNoSql('RT', 'h.StockReturnId')} + ' to vendor · batch ' + l.BatchNo,
         v.VendorName, h.CreatedBy, 'stock-return', h.StockReturnId
  FROM StockReturnItem l JOIN StockReturn h ON h.StockReturnId = l.StockReturnId AND h.IsActive = 1
  JOIN Vendor v ON v.VendorId = h.VendorId
  WHERE (@itemId IS NULL OR l.ItemId = @itemId)
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

// Current stock per item (ItemId, CurrentStock) for the items @itemId names,
// or all items when it's NULL. Same sum the Stock Report shows.
export const CURRENT_STOCK = `
  SELECT ItemId, SUM(Qty) AS CurrentStock FROM (${EVENTS}) ev GROUP BY ItemId
`;
