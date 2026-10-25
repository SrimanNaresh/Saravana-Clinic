import { useEffect, useState, useCallback } from 'react';
import { Truck, Search, Plus, Pencil, Trash2 } from 'lucide-react';
import { CardHeader, Spinner, EmptyState, Modal, Toast } from '../../components/ui.jsx';
import { useToast } from '../../hooks/useToast.js';
import { supplierApi } from '../../api/client.js';
import { isValidText, isValidNumeric } from '../../utils/validators.js';

const emptyForm = { name: '', contactNo: '', address: '', gstNo: '' };

export default function Supplier() {
  const { toast, show } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async (q = '') => {
    setLoading(true);
    try {
      setRows(await supplierApi.list(q));
    } catch {
      show('Failed to load suppliers', 'error');
    } finally {
      setLoading(false);
    }
  }, [show]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setTimeout(() => load(search), 350);
    return () => clearTimeout(t);
  }, [search, load]);

  const update = (key) => (e) => setForm((c) => ({ ...c, [key]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return show('Supplier name is required', 'error');
    if (!isValidText(form.name)) return show('Supplier Name must contain letters only', 'error');
    if (!isValidNumeric(form.contactNo)) return show('Contact No must contain numbers only', 'error');
    setSaving(true);
    try {
      await supplierApi.create(form);
      show('Supplier saved', 'success');
      setForm(emptyForm);
      load(search);
    } catch (err) {
      show(err.response?.data?.error || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async () => {
    if (!editing.Name?.trim()) return show('Supplier name is required', 'error');
    if (!isValidText(editing.Name)) return show('Supplier Name must contain letters only', 'error');
    if (!isValidNumeric(editing.ContactNo)) return show('Contact No must contain numbers only', 'error');
    try {
      await supplierApi.update(editing.SupplierId, {
        name: editing.Name,
        contactNo: editing.ContactNo,
        address: editing.Address,
        gstNo: editing.GSTNo,
      });
      show('Supplier updated', 'success');
      setEditing(null);
      load(search);
    } catch (err) {
      show(err.response?.data?.error || 'Update failed', 'error');
    }
  };

  const remove = async (row) => {
    if (!confirm(`Delete supplier "${row.Name}"?`)) return;
    try {
      await supplierApi.remove(row.SupplierId);
      show('Supplier deleted', 'success');
      load(search);
    } catch (err) {
      show(err.response?.data?.error || 'Delete failed', 'error');
    }
  };

  return (
    <div>
      <div className="card">
        <form onSubmit={save}>
          <CardHeader
            icon={Truck}
            title="Add Supplier"
            subtitle="Register a new supplier"
            actions={
              <div className="relative w-full sm:w-72">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                <input className="input pl-9" placeholder="Search suppliers..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            }
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
            <div>
              <label className="label">Supplier Name *</label>
              <input className="input" value={form.name} onChange={update('name')} placeholder="e.g. Sun Pharma Distributors" />
            </div>
            <div>
              <label className="label">Contact No</label>
              <input type="tel" inputMode="numeric" className="input" value={form.contactNo} onChange={update('contactNo')} placeholder="e.g. 98765 43210" />
            </div>
            <div>
              <label className="label">Address</label>
              <input className="input" value={form.address} onChange={update('address')} placeholder="Supplier address" />
            </div>
            <div>
              <label className="label">GST No</label>
              <input className="input" value={form.gstNo} onChange={update('gstNo')} placeholder="e.g. 22AAAAA0000A1Z5" />
            </div>
            <div>
              <button type="submit" className="btn-primary w-full" disabled={saving}>
                <Plus size={16} /> {saving ? 'Saving...' : 'Add Supplier'}
              </button>
            </div>
          </div>
        </form>

        <div className="mt-5 border-t border-ink-100 pt-4">
          {loading ? (
            <Spinner />
          ) : rows.length === 0 ? (
            <EmptyState message="No suppliers found." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="table-head">
                    <th className="rounded-l-lg px-3 py-3">Supplier Name</th>
                    <th className="px-3 py-3">Contact No</th>
                    <th className="px-3 py-3">Address</th>
                    <th className="px-3 py-3">GST No</th>
                    <th className="rounded-r-lg px-3 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.SupplierId} className="table-row">
                      <td className="px-3 py-3 font-medium text-slate-700">{r.Name}</td>
                      <td className="px-3 py-3 text-slate-500">{r.ContactNo || '-'}</td>
                      <td className="px-3 py-3 text-slate-500">{r.Address || '-'}</td>
                      <td className="px-3 py-3 text-slate-500">{r.GSTNo || '-'}</td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end gap-1">
                          <button type="button" className="btn-ghost px-2 py-1" title="Edit supplier" onClick={() => setEditing({ ...r })}><Pencil size={15} /></button>
                          <button type="button" className="btn-ghost px-2 py-1 text-red-500 hover:bg-red-50" title="Delete supplier" onClick={() => remove(r)}><Trash2 size={15} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit Supplier">
        {editing && (
          <div className="space-y-4">
            <div>
              <label className="label">Supplier Name *</label>
              <input className="input" value={editing.Name || ''} onChange={(e) => setEditing({ ...editing, Name: e.target.value })} />
            </div>
            <div>
              <label className="label">Contact No</label>
              <input type="tel" inputMode="numeric" className="input" value={editing.ContactNo || ''} onChange={(e) => setEditing({ ...editing, ContactNo: e.target.value })} />
            </div>
            <div>
              <label className="label">Address</label>
              <input className="input" value={editing.Address || ''} onChange={(e) => setEditing({ ...editing, Address: e.target.value })} />
            </div>
            <div>
              <label className="label">GST No</label>
              <input className="input" value={editing.GSTNo || ''} onChange={(e) => setEditing({ ...editing, GSTNo: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn-primary" onClick={saveEdit}>Save Changes</button>
            </div>
          </div>
        )}
      </Modal>

      <Toast toast={toast} />
    </div>
  );
}
