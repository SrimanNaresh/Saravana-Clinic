import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Receipt, Pencil, Plus, Printer, Search } from 'lucide-react';
import { CardHeader, Spinner, EmptyState, Toast } from '../../components/ui.jsx';
import { useToast } from '../../hooks/useToast.js';
import SalesBillReceipt from './SalesBillReceipt.jsx';
import { salesBillingApi, clinicApi } from '../../api/client.js';

const money = (n) => (Number(n) || 0).toFixed(2);
const dateLabel = (iso) => new Date(iso).toLocaleDateString('en-GB');

// Pharmacy > Sales > List: every sale, searchable by customer, mobile, sale
// number or item name. The subtitle carries the total of the sales shown.
export default function SalesBillingList() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast, show } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [clinic, setClinic] = useState(null);
  const [printBill, setPrintBill] = useState(null);

  useEffect(() => { clinicApi.get().then(setClinic).catch(() => setClinic(null)); }, []);

  // Message the Sales screen hands back after an edit.
  useEffect(() => {
    if (location.state?.flash) {
      show(location.state.flash, 'success');
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, navigate, show]);

  const load = useCallback(async (q = '') => {
    setLoading(true);
    try {
      setRows(await salesBillingApi.list(q));
    } catch {
      show('Failed to load sales', 'error');
    } finally {
      setLoading(false);
    }
  }, [show]);

  useEffect(() => {
    const t = setTimeout(() => load(search), search ? 350 : 0);
    return () => clearTimeout(t);
  }, [search, load]);

  // Prints once the receipt for this sale is in the page.
  useEffect(() => {
    if (!printBill) return undefined;
    const t = setTimeout(() => window.print(), 50);
    return () => clearTimeout(t);
  }, [printBill]);

  const print = async (row) => {
    try {
      const sale = await salesBillingApi.get(row.SalesBillingId);
      setPrintBill({
        code: sale.Code, transDate: sale.TransDate, customerName: sale.CustomerName,
        lines: sale.lines.map((l) => ({ itemName: l.ItemName, batch: l.Batch, qty: Number(l.Quantity), rate: Number(l.Rate), amount: Number(l.Amount) })),
        total: Number(sale.TotalAmount),
      });
    } catch {
      show('Failed to load sale for printing', 'error');
    }
  };

  const grandTotal = rows.reduce((s, r) => s + Number(r.TotalAmount || 0), 0);

  return (
    <div>
      <div className="card no-print">
        <CardHeader
          icon={Receipt}
          title="Sales List"
          subtitle={`${rows.length} sale(s) · Total ₹${money(grandTotal)}`}
          actions={
            <>
              <div className="relative w-full sm:w-72">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                <input className="input pl-9" placeholder="Customer, mobile, sale no, item..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <button className="btn-primary" onClick={() => navigate('/pharmacy/sales-billing')}>
                <Plus size={16} /> New sale
              </button>
            </>
          }
        />

        {loading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState message="No sales found." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="table-head">
                  <th className="rounded-l-lg px-3 py-2">Sale No</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">Mobile</th>
                  <th className="px-3 py-2">Item Name</th>
                  <th className="px-3 py-2 text-right">Total Qty</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="rounded-r-lg px-3 py-2 text-right">Edit</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.SalesBillingId} className="table-row">
                    <td className="px-3 py-1.5 font-medium text-slate-700">{r.Code}</td>
                    <td className="px-3 py-1.5 text-slate-500">{dateLabel(r.TransDate)}</td>
                    <td className="px-3 py-1.5 text-slate-600">{r.CustomerName || '-'}</td>
                    <td className="px-3 py-1.5 text-slate-500">{r.MobileNo || '-'}</td>
                    <td className="max-w-xs truncate px-3 py-1.5 text-slate-500" title={r.ItemNames || ''}>{r.ItemNames || '-'}</td>
                    <td className="px-3 py-1.5 text-right text-slate-600">{Number(r.TotalQty)}</td>
                    <td className="px-3 py-1.5 text-right font-medium text-slate-700">{money(r.TotalAmount)}</td>
                    <td className="px-3 py-1.5">
                      <div className="flex justify-end gap-1">
                        <button type="button" className="btn-ghost px-2 py-1" title="Print bill" onClick={() => print(r)}><Printer size={15} /></button>
                        <button type="button" className="btn-ghost px-2 py-1" title="Edit sale" onClick={() => navigate('/pharmacy/sales-billing', { state: { editSale: r } })}><Pencil size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <SalesBillReceipt clinic={clinic} bill={printBill} />
      <Toast toast={toast} />
    </div>
  );
}
