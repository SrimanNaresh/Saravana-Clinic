import { useEffect, useState, useCallback } from 'react';
import { Search, Pencil, Save, Activity } from 'lucide-react';
import { Spinner, EmptyState, Modal, Toast, CardHeader } from '../../components/ui.jsx';
import { useToast } from '../../hooks/useToast.js';
import { vitalApi } from '../../api/client.js';

const fmt = (d) => (d ? new Date(d).toLocaleString() : '-');
const today = () => new Date().toISOString().slice(0, 10);

export default function VitalSignList() {
  const { toast, show } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);

  // Only show today's vital records.
  const load = useCallback(async (q = '') => {
    setLoading(true);
    try {
      setRows(await vitalApi.list({ search: q, date: today() }));
    } catch {
      show('Failed to load vital signs', 'error');
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
      await vitalApi.update(editing.VitalId, {
        height: editing.Height,
        weight: editing.Weight,
        bloodPressure: editing.BloodPressure,
        pulseRate: editing.PulseRate,
        temperature: editing.Temperature,
        comments: editing.Comments,
      });
      show('Updated', 'success');
      setEditing(null);
      load(search);
    } catch {
      show('Update failed', 'error');
    }
  };

  return (
    <div>
      <div className="card">
        <CardHeader
          icon={Activity}
          title="Vital Sign List"
          subtitle="Today's recorded vital signs"
          actions={
            <div className="relative w-full sm:w-72">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <input className="input pl-9" placeholder="Search by patient name or mobile..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          }
        />

        {loading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState message="No vital signs found." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="table-head">
                  <th className="rounded-l-lg px-3 py-3">Patient</th>
                  <th className="px-3 py-3">Ht</th>
                  <th className="px-3 py-3">Wt</th>
                  <th className="px-3 py-3">BP</th>
                  <th className="px-3 py-3">Pulse</th>
                  <th className="px-3 py-3">Temp</th>
                  <th className="px-3 py-3">Recorded</th>
                  <th className="rounded-r-lg px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.VitalId} className="table-row">
                    <td className="px-3 py-3">
                      <p className="font-medium text-slate-700">{r.PatientName}</p>
                      <p className="text-xs text-slate-400">{r.MobileNo || '-'}</p>
                    </td>
                    <td className="px-3 py-3 text-slate-500">{r.Height ?? '-'}</td>
                    <td className="px-3 py-3 text-slate-500">{r.Weight ?? '-'}</td>
                    <td className="px-3 py-3 text-slate-500">{r.BloodPressure || '-'}</td>
                    <td className="px-3 py-3 text-slate-500">{r.PulseRate ?? '-'}</td>
                    <td className="px-3 py-3 text-slate-500">{r.Temperature ?? '-'}</td>
                    <td className="px-3 py-3 text-xs text-slate-400">{fmt(r.RecordedAt)}</td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end">
                        <button className="btn-ghost px-2 py-1" onClick={() => setEditing({ ...r })}><Pencil size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit Vital Sign" size="lg">
        {editing && (
          <div className="space-y-4">
            <p className="text-sm font-medium text-slate-600">{editing.PatientName}</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div><label className="label">Height (cm)</label><input type="number" step="0.1" className="input" value={editing.Height ?? ''} onChange={(e) => setEditing({ ...editing, Height: e.target.value })} /></div>
              <div><label className="label">Weight (kg)</label><input type="number" step="0.1" className="input" value={editing.Weight ?? ''} onChange={(e) => setEditing({ ...editing, Weight: e.target.value })} /></div>
              <div><label className="label">Blood Pressure</label><input className="input" value={editing.BloodPressure ?? ''} onChange={(e) => setEditing({ ...editing, BloodPressure: e.target.value })} /></div>
              <div><label className="label">Pulse Rate (bpm)</label><input type="number" className="input" value={editing.PulseRate ?? ''} onChange={(e) => setEditing({ ...editing, PulseRate: e.target.value })} /></div>
              <div><label className="label">Temperature (°C)</label><input type="number" step="0.1" className="input" value={editing.Temperature ?? ''} onChange={(e) => setEditing({ ...editing, Temperature: e.target.value })} /></div>
            </div>
            <div><label className="label">Comments</label><textarea className="input" rows={3} value={editing.Comments ?? ''} onChange={(e) => setEditing({ ...editing, Comments: e.target.value })} /></div>
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
