import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { RotateCcw, Search, Plus, Pencil, Trash2 } from 'lucide-react';
import { CardHeader, Spinner, EmptyState, Toast } from '../../components/ui.jsx';
import { useToast } from '../../hooks/useToast.js';
import { salesReturnApi } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';

const money = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateLabel = (iso) => new Date(iso).toLocaleDateString('en-GB');

// Pharmacy > Return > Sales Return List: every return from a customer,
// searchable by return no, sale no, customer, mobile or item name. Only an
// Admin sees Delete (the server checks too); it's a soft delete that takes
// the returned stock back out.
export default function SalesReturnList() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast, show } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(() => location.state?.search || '');

  useEffect(() => {
    if (location.state?.flash) {
      show(location.state.flash, 'success');
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, navigate, show]);

  const load = useCallback(async (q = '') => {
    setLoading(true);
    try { setRows(await salesReturnApi.list(q)); } catch { show('Failed to load Sales Returns', 'error'); } finally { setLoading(false); }
  }, [show]);
  useEffect(() => {
    const t = setTimeout(() => load(search), search ? 350 : 0);
    return () => clearTimeout(t);
  }, [search, load]);

  const remove = async (r) => {
    if (!confirm(`Delete Sales Return ${r.ReturnNo} (${r.CustomerName || 'no customer'}, ₹${money(r.TotalAmount)})?\n\nThe returned quantity comes off stock again.`)) return;
    try {
      await salesReturnApi.remove(r.SalesReturnId);
      show(`Sales Return ${r.ReturnNo} deleted`, 'success');
      load(search);
    } catch (err) {
      show(err.response?.data?.error || 'Delete failed', 'error');
    }
  };

  const grand = rows.reduce((t, r) => t + Number(r.TotalAmount || 0), 0);

  return (
    <div>
      <div className="card">
        <CardHeader
          icon={RotateCcw}
          title="Sales Return List"
          subtitle={`${rows.length} return(s) · Total refund ₹${money(grand)}`}
          actions={
            <>
              <div className="relative w-full sm:w-72">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                <input className="input pl-9" placeholder="Return no, sale no, customer, item..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <button className="btn-primary" onClick={() => navigate('/pharmacy/sales-return')}><Plus size={16} /> New sales return</button>
            </>
          }
        />
        {loading ? <Spinner /> : rows.length === 0 ? <EmptyState message="No Sales Returns found." /> : (
          <div className="ph-wrap">
            <table className="ph-table min-w-[950px]">
              <colgroup><col className="w-[9%]" /><col className="w-[8%]" /><col className="w-[14%]" /><col className="w-[10%]" /><col className="w-[9%]" /><col className="w-[26%]" /><col className="w-[7%]" /><col className="w-[8%]" /><col className="w-[9%]" /></colgroup>
              <thead>
                <tr>
                  <th className="ph-mid">Return No</th>
                  <th className="ph-mid">Date</th>
                  <th>Customer</th>
                  <th className="ph-mid">Mobile</th>
                  <th className="ph-mid">Sale No</th>
                  <th>Item Name</th>
                  <th className="ph-num">Total Qty</th>
                  <th className="ph-num">Refund</th>
                  <th className="ph-mid">{isAdmin ? 'Edit / Delete' : 'Edit'}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.SalesReturnId}>
                    <td className="font-medium text-brand-700 ph-mid">{r.ReturnNo}</td>
                    <td className="text-ink-500 ph-mid">{dateLabel(r.ReturnDate)}</td>
                    <td className="text-ink-700 truncate">{r.CustomerName || '-'}</td>
                    <td className="text-ink-500 ph-mid">{r.MobileNo || '-'}</td>
                    <td className="text-ink-600 ph-mid" title={`Sold ${dateLabel(r.SaleDate)}`}>{r.SaleNo}</td>
                    <td className="truncate text-ink-500" title={r.ItemNames}>{r.ItemNames}</td>
                    <td className="ph-num">{Number(r.TotalQty)}</td>
                    <td className="ph-num font-semibold text-ink-800">{money(r.TotalAmount)}</td>
                    <td>
                      <div className="flex justify-center gap-0.5">
                        <button type="button" className="ph-icon" title="Edit Sales Return" onClick={() => navigate('/pharmacy/sales-return', { state: { editSalesReturnId: r.SalesReturnId } })}><Pencil size={14} /></button>
                        {isAdmin && (
                          <button type="button" className="ph-icon-del" title="Delete Sales Return (Admin only)" onClick={() => remove(r)}><Trash2 size={14} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Toast toast={toast} />
    </div>
  );
}
