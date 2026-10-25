import { createTransactionRouter } from './_transactionFactory.js';

export default createTransactionRouter({
  headerTable: 'PurchaseReturn',
  itemTable: 'PurchaseReturnItem',
  headerIdCol: 'PurchaseReturnId',
  codePrefix: 'PRET',
  party: { type: 'supplier' },
  extraHeaderFields: [
    { name: 'purchaseInvoiceId', column: 'PurchaseInvoiceId', kind: 'int' },
  ],
  extraLineFields: [
    { name: 'batch', column: 'Batch', kind: 'text' },
    { name: 'expiryDate', column: 'ExpiryDate', kind: 'date' },
  ],
});
