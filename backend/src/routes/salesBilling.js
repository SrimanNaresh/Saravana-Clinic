import { createTransactionRouter } from './_transactionFactory.js';

export default createTransactionRouter({
  headerTable: 'SalesBilling',
  itemTable: 'SalesBillingItem',
  headerIdCol: 'SalesBillingId',
  codePrefix: 'SALE',
  party: { type: 'customer' },
  extraLineFields: [
    { name: 'batch', column: 'Batch', kind: 'text' },
    { name: 'expiryDate', column: 'ExpiryDate', kind: 'date' },
  ],
});
