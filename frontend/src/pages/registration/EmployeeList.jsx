import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Pencil, Trash2, Save, Plus, UserPlus } from 'lucide-react';
import { Spinner, EmptyState, Modal, Toast, CardHeader } from '../../components/ui.jsx';
import TimePicker from '../../components/TimePicker.jsx';
import { weekDays } from './Employee.jsx';
import { useToast } from '../../hooks/useToast.js';
import { employeeApi } from '../../api/client.js';

const empTypes = ['Reception', 'Nurse', 'Doctor', 'Cleaning'];
const typeColors = {
  Reception: 'bg-brand-100 text-brand-700',
  Nurse: 'bg-emerald-100 text-emerald-700',
  Doctor: 'bg-purple-100 text-purple-700',
  Cleaning: 'bg-amber-100 text-amber-700',
};

export default function EmployeeList() {
  const navigate = useNavigate();
  const { toast, show } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);

  const load = useCallback(async (q = '') => {
    setLoading(true);
    try {
      setRows(await employeeApi.list(q));
    } catch {
      show('Failed to load employees', 'error');
    } finally {
      setLoading(false);
    }
  }, [show]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setTimeout(() => load(search), 350);
    return () => clearTimeout(t);
  }, [search, load]);

  const openEdit = (r) => {
    setEditing({
      ...r,
      DoctorFee: r.DoctorFee != null ? String(r.DoctorFee) : '',
      shifts: r.shifts?.length
        ? r.shifts.map((s) => ({ dayOfWeek: s.dayOfWeek || '', fromTime: s.fromTime || '', toTime: s.toTime || '' }))
        : [{ dayOfWeek: '', fromTime: '', toTime: '' }],
    });
  };

  const updateShift = (i, k, v) =>
    setEditing((e) => ({ ...e, shifts: e.shifts.map((row, idx) => (idx === i ? { ...row, [k]: v } : row)) }));
  const addShift = () => setEditing((e) => ({ ...e, shifts: [...e.shifts, { dayOfWeek: '', fromTime: '', toTime: '' }] }));
  const removeShift = (i) => setEditing((e) => ({ ...e, shifts: e.shifts.filter((_, idx) => idx !== i) }));

  const saveEdit = async () => {
    try {
      await employeeApi.update(editing.EmployeeId, {
        name: editing.Name,
        mobileNo: editing.MobileNo,
        address: editing.Address,
        empType: editing.EmpType,
        doctorFee: Number(editing.DoctorFee) || 0,
        shifts: editing.shifts.filter((s) => s.dayOfWeek || s.fromTime || s.toTime),
      });
      show('Updated', 'success');
      setEditing(null);
      load(search);
    } catch {
      show('Update failed', 'error');
    }
  };

  const remove = async (row) => {
    if (!confirm(`Delete "${row.Name}"?`)) return;
    try {
      await employeeApi.remove(row.EmployeeId);
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
          icon={UserPlus}
          title="Employee List"
          subtitle="Search, edit and delete employees"
          actions={
            <>
              <div className="relative w-full sm:w-72">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                <input className="input pl-9" placeholder="Search by name, mobile or type..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <button className="btn-primary" onClick={() => navigate('/registration/employee')}>
                <Plus size={16} /> Add
              </button>
            </>
          }
        />

        {loading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState message="No employees found." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="table-head">
                  <th className="rounded-l-lg px-3 py-3">#</th>
                  <th className="px-3 py-3">Name</th>
                  <th className="px-3 py-3">Mobile</th>
                  <th className="px-3 py-3">Type</th>
                  <th className="px-3 py-3">Doctor Fee</th>
                  <th className="px-3 py-3">Shifts</th>
                  <th className="rounded-r-lg px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.EmployeeId} className="table-row">
                    <td className="px-3 py-3 text-slate-400">{i + 1}</td>
                    <td className="px-3 py-3 font-medium text-slate-700">{r.Name}</td>
                    <td className="px-3 py-3 text-slate-500">{r.MobileNo || '-'}</td>
                    <td className="px-3 py-3">
                      {r.EmpType ? <span className={`badge ${typeColors[r.EmpType] || 'bg-slate-100 text-slate-600'}`}>{r.EmpType}</span> : '-'}
                    </td>
                    <td className="px-3 py-3 text-slate-500">
                      {r.EmpType === 'Doctor' ? `₹${Number(r.DoctorFee || 0).toFixed(2)}` : '-'}
                    </td>
                    <td className="px-3 py-3 text-slate-500">
                      {r.shifts?.length ? (
                        <div className="flex flex-wrap gap-1">
                          {r.shifts.map((s, idx) => (
                            <span key={idx} className="badge bg-slate-100 text-slate-600">
                              {s.dayOfWeek ? `${s.dayOfWeek.slice(0, 3)} ` : ''}{s.fromTime || '?'}–{s.toTime || '?'}
                            </span>
                          ))}
                        </div>
                      ) : '-'}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-1">
                        <button className="btn-ghost px-2 py-1" onClick={() => openEdit(r)}><Pencil size={15} /></button>
                        <button className="btn-ghost px-2 py-1 text-red-500 hover:bg-red-50" onClick={() => remove(r)}><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit Employee" size="lg">
        {editing && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Name *</label>
                <input className="input" value={editing.Name || ''} onChange={(e) => setEditing({ ...editing, Name: e.target.value })} />
              </div>
              <div>
                <label className="label">Mobile No</label>
                <input className="input" value={editing.MobileNo || ''} onChange={(e) => setEditing({ ...editing, MobileNo: e.target.value })} />
              </div>
              <div>
                <label className="label">Type</label>
                <select className="input" value={editing.EmpType || ''} onChange={(e) => setEditing({ ...editing, EmpType: e.target.value })}>
                  <option value="">Select type</option>
                  {empTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Address</label>
                <input className="input" value={editing.Address || ''} onChange={(e) => setEditing({ ...editing, Address: e.target.value })} />
              </div>
              {editing.EmpType === 'Doctor' && (
                <div>
                  <label className="label">Doctor Fee</label>
                  <input type="number" min="0" step="0.01" className="input" value={editing.DoctorFee} onChange={(e) => setEditing({ ...editing, DoctorFee: e.target.value })} placeholder="Consultation fee" />
                </div>
              )}
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="label mb-0">Shift Timings</label>
                <button type="button" className="btn-secondary py-1" onClick={addShift}><Plus size={14} /> Add</button>
              </div>
              <div className="space-y-2">
                {editing.shifts.map((s, i) => (
                  <div key={i} className="flex flex-col gap-2 rounded-lg border border-ink-100 p-2 sm:flex-row sm:items-end">
                    <div className="w-full sm:w-40">
                      <select className="input" value={s.dayOfWeek} onChange={(e) => updateShift(i, 'dayOfWeek', e.target.value)}>
                        <option value="">Select day</option>
                        {weekDays.map((d) => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                    <div className="flex-1">
                      <TimePicker value={s.fromTime} onChange={(v) => updateShift(i, 'fromTime', v)} />
                    </div>
                    <span className="hidden pb-2 text-slate-400 sm:inline">–</span>
                    <div className="flex-1">
                      <TimePicker value={s.toTime} onChange={(v) => updateShift(i, 'toTime', v)} />
                    </div>
                    <button type="button" className="btn-ghost px-2 py-2 text-red-500 hover:bg-red-50 disabled:opacity-30" onClick={() => removeShift(i)} disabled={editing.shifts.length === 1}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
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
