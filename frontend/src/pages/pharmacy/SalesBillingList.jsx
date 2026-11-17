import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Receipt, Pencil, Plus, Printer, Search, Trash2 } from 'lucide-react';
import { CardHeader, Spinner, EmptyState, Toast } from '../../components/ui.jsx';
import { useToast } from '../../hooks/useToast.js';
import SalesBillReceipt, { billFromSale, usePrintFormat, PrintFormatPick } from './SalesBillReceipt.jsx';
import SalesGstInvoice from './SalesGstInvoice.jsx';
import { salesBillingApi, clinicApi } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';

const money = (n) => (Number(n) || 0).toFixed(2);
const dateLabel = (iso) => new Date(iso).toLocaleDateString('en-GB');

// Pharmacy > Sales > List: every sale, searchable by customer, mobile, sale
// number or item name. The subtitle carries the total of the sales shown.
// Only an Admin sees Delete (the server checks too); deleting puts the sold
// quantity back into stock.
export default function SalesBillingList() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast, show } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(() => location.state?.search || '');
  const [clinic, setClinic] = useState(null);
  const [printBill, setPrintBill] = useState(null);
  const [printFormat, setPrintFormat] = usePrintFormat();

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
      setPrintBill(billFromSale(await salesBillingApi.get(row.SalesBillingId)));
    } catch {
      show('Failed to load sale for printing', 'error');
    }
  };

  const remove = async (r) => {
    if (!confirm(`Delete sale ${r.Code} (${r.CustomerName || 'no customer'}, ₹${money(r.TotalAmount)})?\n\nThe sold quantity goes back into stock.`)) return;
    try {
      await salesBillingApi.remove(r.SalesBillingId);
      show(`Sale ${r.Code} deleted`, 'success');
      load(search);
    } catch (err) {
      show(err.response?.data?.error || 'Delete failed', 'error');
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
              <PrintFormatPick value={printFormat} onChange={setPrintFormat} />
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
          <div className="ph-wrap">
            <table className="ph-table min-w-[900px]">
              <colgroup>
                <col className="w-[9%]" /><col className="w-[8%]" /><col className="w-[15%]" /><col className="w-[10%]" />
                <col className="w-[32%]" /><col className="w-[7%]" /><col className="w-[9%]" /><col className="w-[10%]" />
              </colgroup>
              <thead>
                <tr>
                  <th className="ph-mid">Sale No</th>
                  <th className="ph-mid">Date</th>
                  <th>Customer</th>
                  <th className="ph-mid">Mobile</th>
                  <th>Item Name</th>
                  <th className="ph-num">Total Qty</th>
                  <th className="ph-num">Amount</th>
                  <th className="ph-mid">{isAdmin ? 'Edit / Delete' : 'Edit'}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.SalesBillingId}>
                    <td className="ph-mid font-medium text-brand-700">{r.Code}</td>
                    <td className="ph-mid">{dateLabel(r.TransDate)}</td>
                    <td className="truncate" title={r.CustomerName || ''}>{r.CustomerName || '-'}</td>
                    <td className="ph-mid">{r.MobileNo || '-'}</td>
                    <td className="truncate text-ink-500" title={r.ItemNames || ''}>{r.ItemNames || '-'}</td>
                    <td className="ph-num">{Number(r.TotalQty)}</td>
                    <td className="ph-num font-medium text-ink-800" title={Number(r.DueAmount) > 0 ? `${r.PayMode}: due ₹${money(r.DueAmount)}` : r.PayMode || ''}>
                      {money(r.TotalAmount)}
                      {Number(r.DueAmount) > 0 && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-800">Due {money(r.DueAmount)}</span>}
                    </td>
                    <td>
                      <div className="flex justify-center gap-0.5">
                        <button type="button" className="ph-icon" title="Print bill" onClick={() => print(r)}><Printer size={14} /></button>
                        <button type="button" className="ph-icon" title="Edit sale" onClick={() => navigate('/pharmacy/sales-billing', { state: { editSale: r } })}><Pencil size={14} /></button>
                        {isAdmin && (
                          <button type="button" className="ph-icon-del" title="Delete sale (Admin only)" onClick={() => remove(r)}><Trash2 size={14} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5} className="text-right">Total</td>
                  <td className="ph-num">{Math.round(rows.reduce((s, r) => s + Number(r.TotalQty || 0), 0) * 100) / 100}</td>
                  <td className="ph-num">{money(grandTotal)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {printFormat === 'invoice' ? <SalesGstInvoice clinic={clinic} sale={printBill?.sale} /> : <SalesBillReceipt clinic={clinic} bill={printBill} />}
      <Toast toast={toast} />
    </div>
  );
}
