import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Store, Search, Plus, Pencil, Trash2 } from 'lucide-react';
import { CardHeader, Spinner, EmptyState, Toast } from '../../components/ui.jsx';
import { useToast } from '../../hooks/useToast.js';
import { vendorApi } from '../../api/client.js';

export default function VendorList() {
  const navigate = useNavigate();
  const { toast, show } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = useCallback(async (q = '') => {
    setLoading(true);
    try {
      setRows(await vendorApi.list(q));
    } catch {
      show('Failed to load vendors', 'error');
    } finally {
      setLoading(false);
    }
  }, [show]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setTimeout(() => load(search), 350);
    return () => clearTimeout(t);
  }, [search, load]);

  const editRow = (row) => navigate('/pharmacy/vendor-master', { state: { editVendor: row } });

  const remove = async (row) => {
    if (!confirm(`Delete vendor "${row.VendorName}"?`)) return;
    try {
      await vendorApi.remove(row.VendorId);
      show('Vendor deleted successfully', 'success');
      load(search);
    } catch (err) {
      show(err.response?.data?.error || 'Delete failed', 'error');
    }
  };

  return (
    <div>
      <div className="card">
        <CardHeader
          icon={Store}
          title="Vendor List"
          subtitle="Search, edit and delete vendors"
          actions={
            <>
              <div className="relative w-full sm:w-72">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                <input className="input pl-9" placeholder="Search vendors..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <button className="btn-primary" onClick={() => navigate('/pharmacy/vendor-master')}>
                <Plus size={16} /> Add
              </button>
            </>
          }
        />

        {loading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState message="No vendors found." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="table-head">
                  <th className="rounded-l-lg px-3 py-3">Vendor Name</th>
                  <th className="px-3 py-3">Company Name</th>
                  <th className="px-3 py-3">Contact Person</th>
                  <th className="px-3 py-3">Contact Number</th>
                  <th className="px-3 py-3">Alternate Number</th>
                  <th className="px-3 py-3">GST No</th>
                  <th className="px-3 py-3">DL.No</th>
                  <th className="px-3 py-3">Email</th>
                  <th className="px-3 py-3">Address</th>
                  <th className="rounded-r-lg px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.VendorId} className="table-row">
                    <td className="px-3 py-3 font-medium text-slate-700">{r.VendorName}</td>
                    <td className="px-3 py-3 text-slate-500">{r.CompanyName || '-'}</td>
                    <td className="px-3 py-3 text-slate-500">{r.ContactPerson || '-'}</td>
                    <td className="px-3 py-3 text-slate-500">{r.ContactNo || '-'}</td>
                    <td className="px-3 py-3 text-slate-500">{r.AlternateNo || '-'}</td>
                    <td className="px-3 py-3 text-slate-500">{r.GSTNo || '-'}</td>
                    <td className="px-3 py-3 text-slate-500">{r.DLNo || '-'}</td>
                    <td className="px-3 py-3 text-slate-500">{r.Email || '-'}</td>
                    <td className="px-3 py-3 text-slate-500">{r.Address || '-'}</td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-1">
                        <button type="button" className="btn-ghost px-2 py-1" title="Edit vendor" onClick={() => editRow(r)}><Pencil size={15} /></button>
                        <button type="button" className="btn-ghost px-2 py-1 text-red-500 hover:bg-red-50" title="Delete vendor" onClick={() => remove(r)}><Trash2 size={15} /></button>
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
