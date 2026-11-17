import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { SlidersHorizontal, Search, Plus, Pencil, Trash2 } from 'lucide-react';
import { CardHeader, Spinner, EmptyState, Toast } from '../../components/ui.jsx';
import { useToast } from '../../hooks/useToast.js';
import { stockAdjustmentApi } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';

const money = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateLabel = (iso) => new Date(iso).toLocaleDateString('en-GB');

// Pharmacy > Stock In > Adjustment List: every stock adjustment, searchable
// by adjustment no, remarks or item name. Only an Admin sees Delete (the
// server checks too); it's a soft delete that undoes the stock change.
export default function StockAdjustmentList() {
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
    try { setRows(await stockAdjustmentApi.list(q)); } catch { show('Failed to load adjustments', 'error'); } finally { setLoading(false); }
  }, [show]);
  useEffect(() => {
    const t = setTimeout(() => load(search), search ? 350 : 0);
    return () => clearTimeout(t);
  }, [search, load]);

  const remove = async (r) => {
    if (!confirm(`Delete adjustment ${r.AdjNo}?\n\nIts stock change is undone.`)) return;
    try {
      await stockAdjustmentApi.remove(r.AdjustmentId);
      show(`Adjustment ${r.AdjNo} deleted`, 'success');
      load(search);
    } catch (err) {
      show(err.response?.data?.error || 'Delete failed', 'error');
    }
  };

  return (
    <div>
      <div className="card">
        <CardHeader
          icon={SlidersHorizontal}
          title="Adjustment List"
          subtitle={`${rows.length} adjustment(s)`}
          actions={
            <>
              <div className="relative w-full sm:w-72">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                <input className="input pl-9" placeholder="Adjustment no, remarks, item..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <button className="btn-primary" onClick={() => navigate('/pharmacy/stock-adjustment')}><Plus size={16} /> New adjustment</button>
            </>
          }
        />
        {loading ? <Spinner /> : rows.length === 0 ? <EmptyState message="No adjustments found." /> : (
          <div className="ph-wrap">
            <table className="ph-table min-w-[950px]">
              <colgroup><col className="w-[9%]" /><col className="w-[8%]" /><col className="w-[24%]" /><col className="w-[17%]" /><col className="w-[7%]" /><col className="w-[8%]" /><col className="w-[7%]" /><col className="w-[8%]" /><col className="w-[12%]" /></colgroup>
              <thead>
                <tr>
                  <th className="ph-mid">Adj No</th>
                  <th className="ph-mid">Date</th>
                  <th>Item Name</th>
                  <th>Remarks</th>
                  <th className="ph-num">In Qty</th>
                  <th className="ph-num">In Value</th>
                  <th className="ph-num">Out Qty</th>
                  <th className="ph-num">Out Value</th>
                  <th className="ph-mid">{isAdmin ? 'Edit / Delete' : 'Edit'}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.AdjustmentId}>
                    <td className="font-medium text-brand-700 ph-mid">{r.AdjNo}</td>
                    <td className="text-ink-500 ph-mid">{dateLabel(r.AdjDate)}</td>
                    <td className="truncate text-ink-600" title={r.ItemNames}>{r.ItemNames}</td>
                    <td className="truncate text-ink-500" title={r.Remarks || ''}>{r.Remarks || '-'}</td>
                    <td className="ph-num text-emerald-700">{Number(r.InQty) || '-'}</td>
                    <td className="ph-num text-emerald-700">{Number(r.InTotal) ? money(r.InTotal) : '-'}</td>
                    <td className="ph-num text-red-600">{Number(r.OutQty) || '-'}</td>
                    <td className="ph-num text-red-600">{Number(r.OutTotal) ? money(r.OutTotal) : '-'}</td>
                    <td>
                      <div className="flex justify-center gap-0.5">
                        <button type="button" className="ph-icon" title="Edit adjustment" onClick={() => navigate('/pharmacy/stock-adjustment', { state: { editAdjustmentId: r.AdjustmentId } })}><Pencil size={14} /></button>
                        {isAdmin && (
                          <button type="button" className="ph-icon-del" title="Delete adjustment (Admin only)" onClick={() => remove(r)}><Trash2 size={14} /></button>
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
