import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Undo2, Search, Plus, Pencil, Trash2 } from 'lucide-react';
import { CardHeader, Spinner, EmptyState, Toast } from '../../components/ui.jsx';
import { useToast } from '../../hooks/useToast.js';
import { stockReturnApi } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';

const money = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateLabel = (iso) => new Date(iso).toLocaleDateString('en-GB');

// Pharmacy > Return > List: every return to a vendor, searchable by return
// no, Stock In no, vendor or item name. Only an Admin sees Delete (the server
// checks too); deleting puts the returned quantity back into stock.
export default function StockReturnList() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast, show } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (location.state?.flash) {
      show(location.state.flash, 'success');
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, navigate, show]);

  const load = useCallback(async (q = '') => {
    setLoading(true);
    try { setRows(await stockReturnApi.list(q)); } catch { show('Failed to load returns', 'error'); } finally { setLoading(false); }
  }, [show]);
  useEffect(() => {
    const t = setTimeout(() => load(search), search ? 350 : 0);
    return () => clearTimeout(t);
  }, [search, load]);

  const remove = async (r) => {
    if (!confirm(`Delete return ${r.ReturnNo} (${r.VendorName}, ₹${money(r.TotalAmount)})?\n\nThe returned quantity goes back into stock.`)) return;
    try {
      await stockReturnApi.remove(r.StockReturnId);
      show(`Return ${r.ReturnNo} deleted`, 'success');
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
          icon={Undo2}
          title="Return List"
          subtitle={`${rows.length} return(s) · Total ₹${money(grand)}`}
          actions={
            <>
              <div className="relative w-full sm:w-72">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                <input className="input pl-9" placeholder="Return no, Stock In no, vendor, item..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <button className="btn-primary" onClick={() => navigate('/pharmacy/return')}><Plus size={16} /> New return</button>
            </>
          }
        />
        {loading ? <Spinner /> : rows.length === 0 ? <EmptyState message="No returns found." /> : (
          <div className="ph-wrap">
            <table className="ph-table min-w-[950px]">
              <colgroup><col className="w-[9%]" /><col className="w-[8%]" /><col className="w-[16%]" /><col className="w-[10%]" /><col className="w-[27%]" /><col className="w-[6%]" /><col className="w-[7%]" /><col className="w-[8%]" /><col className="w-[9%]" /></colgroup>
              <thead>
                <tr>
                  <th className="ph-mid">Return No</th>
                  <th className="ph-mid">Date</th>
                  <th>Vendor</th>
                  <th className="ph-mid">Stock In No</th>
                  <th>Item Name</th>
                  <th className="ph-num">Items</th>
                  <th className="ph-num">Total Qty</th>
                  <th className="ph-num">Amount</th>
                  <th className="ph-mid">{isAdmin ? 'Edit / Delete' : 'Edit'}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.StockReturnId}>
                    <td className="font-medium text-brand-700 ph-mid">{r.ReturnNo}</td>
                    <td className="text-ink-500 ph-mid">{dateLabel(r.ReturnDate)}</td>
                    <td className="text-ink-700 truncate">{r.VendorName}</td>
                    <td className="text-ink-600 ph-mid">{r.StockInNo}</td>
                    <td className="truncate text-ink-500" title={r.ItemNames}>{r.ItemNames}</td>
                    <td className="ph-num">{r.Items}</td>
                    <td className="ph-num">{Number(r.TotalQty)}</td>
                    <td className="ph-num font-semibold text-ink-800">{money(r.TotalAmount)}</td>
                    <td>
                      <div className="flex justify-center gap-0.5">
                        <button type="button" className="ph-icon" title="Edit return" onClick={() => navigate('/pharmacy/return', { state: { editReturnId: r.StockReturnId } })}><Pencil size={14} /></button>
                        {isAdmin && (
                          <button type="button" className="ph-icon-del" title="Delete return (Admin only)" onClick={() => remove(r)}><Trash2 size={14} /></button>
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
