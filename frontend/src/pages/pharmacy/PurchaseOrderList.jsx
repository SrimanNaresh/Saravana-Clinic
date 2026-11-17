import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ShoppingCart, Search, Plus, Pencil, Trash2 } from 'lucide-react';
import { CardHeader, Spinner, EmptyState, Toast } from '../../components/ui.jsx';
import { useToast } from '../../hooks/useToast.js';
import { purchaseOrderApi } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';

const money = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateLabel = (iso) => new Date(iso).toLocaleDateString('en-GB');

// Pharmacy > Purchase / Order > List: every order, searchable by order no,
// vendor or item name. Only an Admin sees Delete (the server checks too).
export default function PurchaseOrderList() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast, show } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';
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

  const remove = async (r) => {
    if (!confirm(`Delete order ${r.OrderNo} (${r.VendorName}, ₹${money(r.TotalAmount)})?`)) return;
    try {
      await purchaseOrderApi.remove(r.PurchaseOrderId);
      show(`Order ${r.OrderNo} deleted`, 'success');
      load(search);
    } catch (err) {
      show(err.response?.data?.error || 'Delete failed', 'error');
    }
  };

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
          <div className="ph-wrap">
            <table className="ph-table min-w-[700px]">
              <colgroup><col className="w-[13%]" /><col className="w-[11%]" /><col className="w-[40%]" /><col className="w-[9%]" /><col className="w-[15%]" /><col className="w-[12%]" /></colgroup>
              <thead>
                <tr>
                  <th className="ph-mid">Order No</th>
                  <th className="ph-mid">Date</th>
                  <th>Vendor</th>
                  <th className="ph-num">Items</th>
                  <th className="ph-num">Sum of Total</th>
                  <th className="ph-mid">{isAdmin ? 'Edit / Delete' : 'Edit'}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.PurchaseOrderId}>
                    <td className="font-medium text-brand-700 ph-mid">{r.OrderNo}</td>
                    <td className="text-ink-500 ph-mid">{dateLabel(r.OrderDate)}</td>
                    <td className="text-ink-700 truncate">{r.VendorName}</td>
                    <td className="ph-num text-ink-600">{r.Items}</td>
                    <td className="ph-num font-semibold text-ink-800">{money(r.TotalAmount)}</td>
                    <td>
                      <div className="flex justify-center gap-0.5">
                        <button type="button" className="ph-icon" title="Edit order" onClick={() => navigate('/pharmacy/purchase-order', { state: { editOrderId: r.PurchaseOrderId } })}><Pencil size={14} /></button>
                        {isAdmin && (
                          <button type="button" className="ph-icon-del" title="Delete order (Admin only)" onClick={() => remove(r)}><Trash2 size={14} /></button>
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
