import { createTransactionRouter } from './_transactionFactory.js';

export default createTransactionRouter({
  headerTable: 'SalesReturn',
  itemTable: 'SalesReturnItem',
  headerIdCol: 'SalesReturnId',
  codePrefix: 'SRET',
  party: { type: 'customer' },
});
