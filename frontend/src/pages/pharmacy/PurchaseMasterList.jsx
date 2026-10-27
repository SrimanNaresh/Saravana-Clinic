import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Search, Plus, Pencil, Trash2 } from 'lucide-react';
import { CardHeader, Spinner, EmptyState, Toast } from '../../components/ui.jsx';
import { useToast } from '../../hooks/useToast.js';
import { purchaseMasterApi } from '../../api/client.js';

export default function PurchaseMasterList() {
  const navigate = useNavigate();
  const { toast, show } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = useCallback(async (q = '') => {
    setLoading(true);
    try {
      setRows(await purchaseMasterApi.list(q));
    } catch {
      show('Failed to load purchases', 'error');
    } finally {
      setLoading(false);
    }
  }, [show]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setTimeout(() => load(search), 350);
    return () => clearTimeout(t);
  }, [search, load]);

  const editRow = (row) => navigate('/pharmacy/purchase-master', { state: { editPurchase: row } });

  const remove = async (row) => {
    if (!confirm(`Delete purchase of "${row.ItemName}" from "${row.VendorName}"?`)) return;
    try {
      await purchaseMasterApi.remove(row.PurchaseMasterId);
      show('Purchase deleted successfully', 'success');
      load(search);
    } catch (err) {
      show(err.response?.data?.error || 'Delete failed', 'error');
    }
  };

  return (
    <div>
      <div className="card">
        <CardHeader
          icon={ClipboardList}
          title="Purchase Master List"
          subtitle="Search, edit and delete purchase entries"
          actions={
            <>
              <div className="relative w-full sm:w-72">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                <input className="input pl-9" placeholder="Search item, vendor, manufacturer..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <button className="btn-primary" onClick={() => navigate('/pharmacy/purchase-master')}>
                <Plus size={16} /> Add
              </button>
            </>
          }
        />

        {loading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState message="No purchase entries found." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-left text-[11px]">
              <thead>
                <tr className="table-head !text-[11px]">
                  <th className="rounded-l-lg px-3 py-3">Item Name</th>
                  <th className="px-3 py-3">HSN</th>
                  <th className="px-3 py-3">Manufacturer</th>
                  <th className="px-3 py-3">Vendor</th>
                  <th className="px-3 py-3">Qty</th>
                  <th className="px-3 py-3">Unit</th>
                  <th className="px-3 py-3">Old Price</th>
                  <th className="px-3 py-3">Current Price</th>
                  <th className="px-3 py-3">GST %</th>
                  <th className="px-3 py-3">Discount %</th>
                  <th className="px-3 py-3">Net Price</th>
                  <th className="rounded-r-lg px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.PurchaseMasterId} className="table-row">
                    <td className="px-3 py-3 font-medium text-slate-700">{r.ItemName}</td>
                    <td className="px-3 py-3 text-slate-500">{r.HSNCode || '-'}</td>
                    <td className="px-3 py-3 text-slate-500">{r.ManufacturerName || '-'}</td>
                    <td className="px-3 py-3 text-slate-500">{r.VendorName}</td>
                    <td className="px-3 py-3 text-slate-500">{r.Quantity}</td>
                    <td className="px-3 py-3 text-slate-500">{r.UnitName || '-'}</td>
                    <td className="px-3 py-3 text-slate-500">{r.OldPrice ?? '-'}</td>
                    <td className="px-3 py-3 text-slate-500">{r.CurrentPrice ?? '-'}</td>
                    <td className="px-3 py-3 text-slate-500">{r.GSTPercent ?? '-'}</td>
                    <td className="px-3 py-3 text-slate-500">{r.DiscountPercent ?? '-'}</td>
                    <td className="px-3 py-3 font-medium text-slate-700">{r.NetPrice ?? '-'}</td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-1">
                        <button type="button" className="btn-ghost px-2 py-1" title="Edit purchase" onClick={() => editRow(r)}><Pencil size={15} /></button>
                        <button type="button" className="btn-ghost px-2 py-1 text-red-500 hover:bg-red-50" title="Delete purchase" onClick={() => remove(r)}><Trash2 size={15} /></button>
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
