import { Undo2 } from 'lucide-react';
import TransactionPage from './TransactionPage.jsx';
import { salesReturnApi } from '../../api/client.js';

export default function SalesReturn() {
  return (
    <TransactionPage
      title="Sales Return"
      subtitle="Record stock returned by a customer"
      icon={Undo2}
      api={salesReturnApi}
      idField="SalesReturnId"
      partyType="customer"
      rateField="SellPrice"
    />
  );
}
