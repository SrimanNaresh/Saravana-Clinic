import { createTransactionRouter } from './_transactionFactory.js';

export default createTransactionRouter({
  headerTable: 'PurchaseInvoice',
  itemTable: 'PurchaseInvoiceItem',
  headerIdCol: 'PurchaseInvoiceId',
  codePrefix: 'PINV',
  party: { type: 'supplier' },
  extraLineFields: [
    { name: 'rack', column: 'Rack', kind: 'text' },
    { name: 'manufacturer', column: 'ManufacturerName', kind: 'text' },
    { name: 'pack', column: 'Pack', kind: 'text' },
    { name: 'batch', column: 'Batch', kind: 'text' },
    { name: 'expiryDate', column: 'ExpiryDate', kind: 'date' },
    { name: 'oldMrp', column: 'OldMRP', kind: 'decimal' },
    { name: 'free', column: 'FreeQty', kind: 'decimal' },
    { name: 'mrp', column: 'MRP', kind: 'decimal' },
    { name: 'discountPercent', column: 'DiscountPercent', kind: 'decimal' },
    { name: 'gstPercent', column: 'GSTPercent', kind: 'decimal' },
    { name: 'taxableValue', column: 'TaxableValue', kind: 'decimal' },
    { name: 'hsnCode', column: 'HSNCode', kind: 'text' },
  ],
});
