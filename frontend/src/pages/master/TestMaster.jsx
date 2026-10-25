import { useEffect, useState, useCallback } from 'react';
import { Save, Search, Pencil, Ban, RotateCcw, TestTube } from 'lucide-react';
import { PageHeader, Toast, Spinner, EmptyState, Modal, CardHeader } from '../../components/ui.jsx';
import { useToast } from '../../hooks/useToast.js';
import { labTestApi } from '../../api/client.js';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN') : '-');

export default function TestMaster() {
  const { toast, show } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [nextId, setNextId] = useState(null);
  const [form, setForm] = useState({ testName: '', isActive: true });
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);

  const loadNextId = useCallback(() => {
    labTestApi.nextId().then((d) => setNextId(d.nextId)).catch(() => setNextId(null));
  }, []);

  const load = useCallback(async (q = '') => {
    setLoading(true);
    try {
      setRows(await labTestApi.list(q));
    } catch {
      show('Failed to load lab tests', 'error');
    } finally {
      setLoading(false);
    }
  }, [show]);

  useEffect(() => { load(); loadNextId(); }, [load, loadNextId]);
  useEffect(() => {
    const t = setTimeout(() => load(search), 350);
    return () => clearTimeout(t);
  }, [search, load]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.testName.trim()) return show('Test Name is required', 'error');
    setSaving(true);
    try {
      await labTestApi.create(form);
      show('Lab test saved', 'success');
      setForm({ testName: '', isActive: true });
      loadNextId();
      load(search);
    } catch (err) {
      show(err.response?.data?.error || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async () => {
    if (!editing.TestName?.trim()) return show('Test Name is required', 'error');
    try {
      await labTestApi.update(editing.TestId, { testName: editing.TestName, isActive: editing.IsActive });
      show('Updated', 'success');
      setEditing(null);
      load(search);
    } catch (err) {
      show(err.response?.data?.error || 'Update failed', 'error');
    }
  };

  // Soft delete: marks Inactive instead of removing the row.
  const deactivate = async (row) => {
    if (!confirm(`Mark "${row.TestName}" as Inactive?`)) return;
    try {
      await labTestApi.remove(row.TestId);
      show('Marked Inactive', 'success');
      load(search);
    } catch (err) {
      show(err.response?.data?.error || 'Update failed', 'error');
    }
  };

  const reactivate = async (row) => {
    try {
      await labTestApi.update(row.TestId, { testName: row.TestName, isActive: true });
      show('Marked Active', 'success');
      load(search);
    } catch (err) {
      show(err.response?.data?.error || 'Update failed', 'error');
    }
  };

  return (
    <div>
      <PageHeader title="Test Master" />

      <form onSubmit={submit} className="card mb-5">
        <CardHeader icon={TestTube} title="Add Lab Test" subtitle="Register a new lab test" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
          <div>
            <label className="label">Test ID</label>
            <input
              className="input bg-ink-50 font-semibold text-ink-500"
              value={nextId != null ? `T-${nextId}` : 'Auto'}
              readOnly
              tabIndex={-1}
              title="Auto-generated on save"
            />
          </div>
          <div>
            <label className="label">Test Name *</label>
            <input
              className="input"
              value={form.testName}
              onChange={(e) => setForm((f) => ({ ...f, testName: e.target.value }))}
              placeholder="e.g. Complete Blood Count"
            />
          </div>
          <div>
            <label className="flex cursor-pointer items-center gap-2 pt-6 text-sm font-medium text-ink-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-300"
                checked={form.isActive}
                onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
              />
              Active
            </label>
          </div>
          <div>
            <button type="submit" className="btn-primary w-full" disabled={saving}>
              <Save size={16} /> {saving ? 'Saving...' : 'Save Test'}
            </button>
          </div>
        </div>
      </form>

      <div className="card">
        <CardHeader
          icon={Search}
          title="Test List"
          subtitle="Search, edit, or deactivate a lab test"
          actions={
            <div className="relative w-full sm:w-72">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <input
                className="input pl-9"
                placeholder="Search by test name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          }
        />

        {loading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState message="No lab tests found." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="table-head">
                  <th className="rounded-l-lg px-3 py-3">Test ID</th>
                  <th className="px-3 py-3">Test Name</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Created</th>
                  <th className="rounded-r-lg px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.TestId} className="table-row">
                    <td className="px-3 py-3 text-slate-400">T-{r.TestId}</td>
                    <td className="px-3 py-3 font-medium text-slate-700">{r.TestName}</td>
                    <td className="px-3 py-3">
                      <span className={`badge ${r.IsActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {r.IsActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-slate-500">{fmtDate(r.CreatedAt)}</td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-1">
                        <button className="btn-ghost px-2 py-1" title="Edit" onClick={() => setEditing({ ...r })}>
                          <Pencil size={15} />
                        </button>
                        {r.IsActive ? (
                          <button className="btn-ghost px-2 py-1 text-red-500 hover:bg-red-50" title="Mark Inactive" onClick={() => deactivate(r)}>
                            <Ban size={15} />
                          </button>
                        ) : (
                          <button className="btn-ghost px-2 py-1 text-emerald-600 hover:bg-emerald-50" title="Mark Active" onClick={() => reactivate(r)}>
                            <RotateCcw size={15} />
                          </button>
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

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit Lab Test">
        {editing && (
          <div className="space-y-4">
            <div>
              <label className="label">Test Name *</label>
              <input className="input" value={editing.TestName || ''} onChange={(e) => setEditing({ ...editing, TestName: e.target.value })} />
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-ink-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-300"
                checked={!!editing.IsActive}
                onChange={(e) => setEditing({ ...editing, IsActive: e.target.checked })}
              />
              Active
            </label>
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
