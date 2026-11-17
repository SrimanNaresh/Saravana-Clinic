import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Package, Search, Plus, Pencil, ChevronLeft, ChevronRight } from 'lucide-react';
import { CardHeader, Spinner, EmptyState, Toast } from '../../components/ui.jsx';
import { useToast } from '../../hooks/useToast.js';
import { itemMasterApi } from '../../api/client.js';

const PAGE = 50;
const money = (n) => (n == null ? '-' : Number(n).toFixed(2));

// Pharmacy > Item > List: every item with its current stock (red when there's
// none left). Search by name, code or generic; filter by category.
export default function ItemListPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast, show } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(0);

  useEffect(() => {
    itemMasterApi.list().then(setRows).catch(() => show('Failed to load items', 'error')).finally(() => setLoading(false));
  }, [show]);

  // Message Item Master hands back after an edit.
  useEffect(() => {
    if (location.state?.flash) {
      show(location.state.flash, 'success');
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, navigate, show]);

  const categories = useMemo(() => [...new Set(rows.map((r) => r.Category).filter(Boolean))].sort(), [rows]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => (!category || r.Category === category)
      && (!q || [r.Name, r.ItemCode, r.GenericName].some((v) => v && v.toLowerCase().includes(q))));
  }, [rows, search, category]);
  useEffect(() => { setPage(0); }, [search, category]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const shown = filtered.slice(page * PAGE, page * PAGE + PAGE);

  return (
    <div>
      <div className="card">
        <CardHeader
          icon={Package}
          title="Item List"
          subtitle={`${filtered.length} item(s)`}
          actions={
            <>
              <div className="relative w-full sm:w-64">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                <input className="input pl-9" placeholder="Name, code or generic..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <select className="input w-auto" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">All categories</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <button className="btn-primary" onClick={() => navigate('/pharmacy/item')}><Plus size={16} /> New item</button>
            </>
          }
        />

        {loading ? (
          <Spinner />
        ) : filtered.length === 0 ? (
          <EmptyState message="No items found." />
        ) : (
          <>
            <div className="ph-wrap">
              <table className="ph-table min-w-[760px]">
                <colgroup><col className="w-[11%]" /><col className="w-[35%]" /><col className="w-[15%]" /><col className="w-[8%]" /><col className="w-[10%]" /><col className="w-[8%]" /><col className="w-[8%]" /><col className="w-[5%]" /></colgroup>
                <thead>
                  <tr>
                    <th className="ph-mid">Item Code</th>
                    <th>Item Name</th>
                    <th>Category</th>
                    <th className="ph-mid">Unit</th>
                    <th className="ph-num">Price</th>
                    <th className="ph-num">Stock</th>
                    <th className="ph-mid">Status</th>
                    <th className="ph-mid">Edit</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => {
                    const low = Number(r.Stock) <= (r.ReorderLevel != null ? Number(r.ReorderLevel) : 5);
                    return (
                      <tr key={r.ItemId}>
                        <td className="ph-mid text-ink-500">{r.ItemCode}</td>
                        <td className="truncate font-medium text-ink-800" title={r.Name}>{r.Name}</td>
                        <td className="truncate text-ink-500">{r.Category || '-'}</td>
                        <td className="ph-mid text-ink-500">{r.UnitName || '-'}</td>
                        <td className="ph-num">{money(r.SellPrice ?? r.MRP)}</td>
                        <td className={`ph-num font-semibold ${low ? 'text-red-600' : 'text-ink-800'}`}>{Number(r.Stock)}</td>
                        <td className="ph-mid"><span className={r.Status === 'Inactive' ? 'text-ink-400' : 'text-emerald-600'}>{r.Status}</span></td>
                        <td className="ph-mid">
                          <button type="button" className="ph-icon" title="Edit item" onClick={() => navigate('/pharmacy/item', { state: { editItemId: r.ItemId } })}><Pencil size={14} /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {pages > 1 && (
              <div className="mt-2 flex items-center justify-end gap-2 text-sm text-ink-500">
                <button type="button" className="btn-ghost px-2 py-1" disabled={page === 0} onClick={() => setPage((p) => p - 1)}><ChevronLeft size={15} /></button>
                Page {page + 1} of {pages}
                <button type="button" className="btn-ghost px-2 py-1" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}><ChevronRight size={15} /></button>
              </div>
            )}
          </>
        )}
      </div>
      <Toast toast={toast} />
    </div>
  );
}
