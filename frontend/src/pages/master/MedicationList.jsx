import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Pencil, Trash2, Save, Pill, Plus } from 'lucide-react';
import { Spinner, EmptyState, Modal, Toast, CardHeader } from '../../components/ui.jsx';
import { useToast } from '../../hooks/useToast.js';
import { medicationApi } from '../../api/client.js';

const categories = ['Tablet', 'Capsule', 'Syrup', 'Injection', 'Ointment', 'Drops', 'Other'];

export default function MedicationList() {
  const navigate = useNavigate();
  const { toast, show } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);

  const load = useCallback(async (q = '') => {
    setLoading(true);
    try {
      setRows(await medicationApi.list(q));
    } catch {
      show('Failed to load medications', 'error');
    } finally {
      setLoading(false);
    }
  }, [show]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const t = setTimeout(() => load(search), 350);
    return () => clearTimeout(t);
  }, [search, load]);

  const saveEdit = async () => {
    try {
      await medicationApi.update(editing.MedicationId, {
        medicineName: editing.MedicineName,
        genericName: editing.GenericName,
        category: editing.Category,
      });
      show('Updated', 'success');
      setEditing(null);
      load(search);
    } catch {
      show('Update failed', 'error');
    }
  };

  const remove = async (row) => {
    if (!confirm(`Delete "${row.MedicineName}"?`)) return;
    try {
      await medicationApi.remove(row.MedicationId);
      show('Deleted', 'success');
      load(search);
    } catch {
      show('Delete failed', 'error');
    }
  };

  return (
    <div>
      <div className="card">
        <CardHeader
          icon={Pill}
          title="Medication List"
          subtitle="Search, edit and delete medications"
          actions={
            <>
              <div className="relative w-full sm:w-72">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                <input
                  className="input pl-9"
                  placeholder="Search by name, generic or category..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <button className="btn-primary" onClick={() => navigate('/master/medication')}>
                <Plus size={16} /> Add
              </button>
            </>
          }
        />

        {loading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState message="No medications found." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="table-head">
                  <th className="rounded-l-lg px-3 py-3">#</th>
                  <th className="px-3 py-3">Medicine Name</th>
                  <th className="px-3 py-3">Generic Name</th>
                  <th className="px-3 py-3">Category</th>
                  <th className="rounded-r-lg px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.MedicationId} className="table-row">
                    <td className="px-3 py-3 text-slate-400">{i + 1}</td>
                    <td className="px-3 py-3 font-medium text-slate-700">{r.MedicineName}</td>
                    <td className="px-3 py-3 text-slate-500">{r.GenericName || '-'}</td>
                    <td className="px-3 py-3">
                      {r.Category ? <span className="badge bg-slate-100 text-slate-600">{r.Category}</span> : '-'}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-1">
                        <button className="btn-ghost px-2 py-1" onClick={() => setEditing({ ...r })}>
                          <Pencil size={15} />
                        </button>
                        <button className="btn-ghost px-2 py-1 text-red-500 hover:bg-red-50" onClick={() => remove(r)}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit Medication">
        {editing && (
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="label">Medicine Name *</label>
              <input className="input" value={editing.MedicineName || ''} onChange={(e) => setEditing({ ...editing, MedicineName: e.target.value })} />
            </div>
            <div>
              <label className="label">Generic Name</label>
              <input className="input" value={editing.GenericName || ''} onChange={(e) => setEditing({ ...editing, GenericName: e.target.value })} />
            </div>
            <div>
              <label className="label">Category</label>
              <select className="input" value={editing.Category || ''} onChange={(e) => setEditing({ ...editing, Category: e.target.value })}>
                <option value="">Select category</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn-primary" onClick={saveEdit}><Save size={16} /> Save Changes</button>
            </div>
          </div>
        )}
      </Modal>

      <Toast toast={toast} />
    </div>
  );
}
