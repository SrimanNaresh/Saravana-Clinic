import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ShoppingCart, Search, Plus, Pencil } from 'lucide-react';
import { CardHeader, Spinner, EmptyState, Toast } from '../../components/ui.jsx';
import { useToast } from '../../hooks/useToast.js';
import { purchaseOrderApi } from '../../api/client.js';

const money = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateLabel = (iso) => new Date(iso).toLocaleDateString('en-GB');

// Pharmacy > Purchase / Order > List: every order, searchable by order no,
// vendor or item name.
export default function PurchaseOrderList() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast, show } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Message the order screen hands back after an edit.
  useEffect(() => {
    if (location.state?.flash) {
      show(location.state.flash, 'success');
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, navigate, show]);

  const load = useCallback(async (q = '') => {
    setLoading(true);
    try {
      setRows(await purchaseOrderApi.list(q));
    } catch {
      show('Failed to load orders', 'error');
    } finally {
      setLoading(false);
    }
  }, [show]);

  useEffect(() => {
    const t = setTimeout(() => load(search), search ? 350 : 0);
    return () => clearTimeout(t);
  }, [search, load]);

  return (
    <div>
      <div className="card">
        <CardHeader
          icon={ShoppingCart}
          title="Purchase / Order List"
          subtitle={`${rows.length} order(s)`}
          actions={
            <>
              <div className="relative w-full sm:w-72">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                <input className="input pl-9" placeholder="Order no, vendor or item..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <button className="btn-primary" onClick={() => navigate('/pharmacy/purchase-order')}><Plus size={16} /> New order</button>
            </>
          }
        />

        {loading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState message="No orders found." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="table-head">
                  <th className="rounded-l-lg px-3 py-2">Order No</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Vendor</th>
                  <th className="px-3 py-2 text-right">Items</th>
                  <th className="px-3 py-2 text-right">Sum of Total</th>
                  <th className="rounded-r-lg px-3 py-2 text-right">Edit</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.PurchaseOrderId} className="table-row">
                    <td className="px-3 py-1.5 font-medium text-brand-700">{r.OrderNo}</td>
                    <td className="px-3 py-1.5 text-slate-500">{dateLabel(r.OrderDate)}</td>
                    <td className="px-3 py-1.5 text-slate-700">{r.VendorName}</td>
                    <td className="px-3 py-1.5 text-right text-slate-600">{r.Items}</td>
                    <td className="px-3 py-1.5 text-right font-semibold text-slate-800">{money(r.TotalAmount)}</td>
                    <td className="px-3 py-1.5 text-right">
                      <button type="button" className="btn-ghost px-2 py-1" title="Edit order" onClick={() => navigate('/pharmacy/purchase-order', { state: { editOrderId: r.PurchaseOrderId } })}><Pencil size={15} /></button>
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
