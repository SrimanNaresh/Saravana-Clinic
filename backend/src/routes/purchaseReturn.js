import { createTransactionRouter } from './_transactionFactory.js';

// The Return screen saves one item per return: a Vendor (Supplier only comes
// from the linked invoice, so it's optional), and the line's HSN /
// manufacturer / unit / pricing. Rate is the Current Price, Amount the Net Price.
export default createTransactionRouter({
  headerTable: 'PurchaseReturn',
  itemTable: 'PurchaseReturnItem',
  headerIdCol: 'PurchaseReturnId',
  codePrefix: 'PRET',
  party: { type: 'supplier' },
  partyOptional: true,
  extraHeaderFields: [
    { name: 'purchaseInvoiceId', column: 'PurchaseInvoiceId', kind: 'int' },
    { name: 'billDate', column: 'BillDate', kind: 'date' },
    { name: 'vendorId', column: 'VendorId', kind: 'int' },
  ],
  extraLineFields: [
    { name: 'batch', column: 'Batch', kind: 'text' },
    { name: 'expiryDate', column: 'ExpiryDate', kind: 'date' },
    { name: 'hsnCode', column: 'HSNCode', kind: 'text' },
    { name: 'manufacturerId', column: 'ManufacturerId', kind: 'int' },
    { name: 'unitId', column: 'UnitId', kind: 'int' },
    { name: 'oldPrice', column: 'OldPrice', kind: 'decimal' },
    { name: 'currentPrice', column: 'CurrentPrice', kind: 'decimal' },
    { name: 'gstPercent', column: 'GSTPercent', kind: 'decimal' },
    { name: 'discountPercent', column: 'DiscountPercent', kind: 'decimal' },
    { name: 'netPrice', column: 'NetPrice', kind: 'decimal' },
  ],
});
