import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save, List, Plus, Trash2, UserPlus, Clock } from 'lucide-react';
import { Toast, CardHeader } from '../../components/ui.jsx';
import BulkImport from '../../components/BulkImport.jsx';
import TimePicker from '../../components/TimePicker.jsx';
import MultiSelect from '../../components/MultiSelect.jsx';
import { useToast } from '../../hooks/useToast.js';
import { employeeApi } from '../../api/client.js';

const empTypes = ['Reception', 'Nurse', 'Doctor', 'Cleaning'];
// Letters, spaces and periods only (e.g. "Dr. A. Kumar") — no digits or other punctuation.
const NAME_PATTERN = /^[A-Za-z][A-Za-z\s.]*$/;
const MOBILE_PATTERN = /^\d{10}$/;
export const weekDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// Convert "hh:mm AM/PM" to minutes since midnight (for comparison). Returns null if invalid.
export function timeToMinutes(t) {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec((t || '').trim());
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (m[3].toUpperCase() === 'PM') h += 12;
  return h * 60 + Number(m[2]);
}

export default function Employee() {
  const navigate = useNavigate();
  const { toast, show } = useToast();
  const [form, setForm] = useState({ name: '', mobileNo: '', address: '', empType: '', doctorFee: '' });
  const [shifts, setShifts] = useState([{ days: [], fromTime: '', toTime: '' }]);
  const [saving, setSaving] = useState(false);

  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const addShift = () => setShifts((s) => [...s, { days: [], fromTime: '', toTime: '' }]);
  const removeShift = (i) => setShifts((s) => s.filter((_, idx) => idx !== i));
  const updateShift = (i, k, v) => setShifts((s) => s.map((row, idx) => (idx === i ? { ...row, [k]: v } : row)));

  // Validate shift rows and expand each into one record per selected day.
  const buildShiftPayload = () => {
    const used = shifts.filter((s) => s.days.length || s.fromTime || s.toTime);
    const expanded = [];
    for (let i = 0; i < used.length; i++) {
      const s = used[i];
      const label = `Shift ${i + 1}`;
      if (!s.days.length) throw new Error(`${label}: select at least one day`);
      if (!s.fromTime || !s.toTime) throw new Error(`${label}: From and To time are required`);
      const from = timeToMinutes(s.fromTime);
      const to = timeToMinutes(s.toTime);
      if (from == null || to == null) throw new Error(`${label}: invalid time`);
      if (to <= from) throw new Error(`${label}: To time must be after From time`);
      for (const day of s.days) {
        expanded.push({ dayOfWeek: day, fromTime: s.fromTime, toTime: s.toTime });
      }
    }
    return expanded;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return show('Name is required', 'error');
    if (!NAME_PATTERN.test(form.name.trim())) return show('Name must contain letters only (periods allowed)', 'error');
    if (!form.mobileNo.trim()) return show('Mobile No is required', 'error');
    if (!MOBILE_PATTERN.test(form.mobileNo.trim())) return show('Mobile No must be exactly 10 digits', 'error');
    if (!form.empType) return show('Type is required', 'error');

    let payloadShifts = [];
    if (form.empType === 'Doctor') {
      try {
        payloadShifts = buildShiftPayload();
      } catch (verr) {
        return show(verr.message, 'error');
      }
    }

    setSaving(true);
    try {
      await employeeApi.create({ ...form, doctorFee: Number(form.doctorFee) || 0, shifts: payloadShifts });
      show('Employee saved', 'success');
      setForm({ name: '', mobileNo: '', address: '', empType: '', doctorFee: '' });
      setShifts([{ days: [], fromTime: '', toTime: '' }]);
    } catch (err) {
      show(err.response?.data?.error || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <form onSubmit={submit} className="space-y-5">
        <div className="card">
          <CardHeader
            icon={UserPlus}
            title="Employee Details"
            subtitle="Register staff and assign shift timings"
            actions={
              <>
                <BulkImport
                  variant="inline"
                  fileName="employee"
                  columns={['EmployeeId', 'Name', 'MobileNo', 'Address', 'EmpType', 'DoctorFee', 'Shifts']}
                  sample={[
                    ['', 'Dr Smith', '8888822222', '45 Park Ave', 'Doctor', '500', 'Monday|09:00 AM-01:00 PM;Tuesday|05:00 PM-08:00 PM'],
                    ['', 'Nurse Amy', '7777733333', '9 Oak Rd', 'Nurse', '', ''],
                  ]}
                  note="Leave EmployeeId blank to insert, or fill it to update. Name is required. Shifts format: Day|from-to, separated by ';' e.g. Monday|09:00 AM-01:00 PM;Tuesday|05:00 PM-08:00 PM. EmpType: Reception/Nurse/Doctor/Cleaning. DoctorFee only applies when EmpType is Doctor."
                  onImport={(rows) => employeeApi.bulk(rows)}
                />
                <button type="button" className="btn-secondary" onClick={() => navigate('/registration/employee-list')}>
                  <List size={16} /> View List
                </button>
              </>
            }
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="label">Name *</label>
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value.replace(/[^A-Za-z\s.]/g, '') }))}
                placeholder="Full name"
              />
            </div>
            <div>
              <label className="label">Mobile No *</label>
              <input
                className="input"
                value={form.mobileNo}
                onChange={(e) => setForm((f) => ({ ...f, mobileNo: e.target.value.replace(/\D/g, '') }))}
                placeholder="10-digit mobile number"
                inputMode="numeric"
                maxLength={10}
              />
            </div>
            <div>
              <label className="label">Type *</label>
              <select className="input" value={form.empType} onChange={update('empType')}>
                <option value="">Select type</option>
                {empTypes.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Address</label>
              <input className="input" value={form.address} onChange={update('address')} placeholder="Address" />
            </div>
            {form.empType === 'Doctor' && (
              <div>
                <label className="label">Doctor Fee</label>
                <input type="number" min="0" step="0.01" className="input" value={form.doctorFee} onChange={update('doctorFee')} placeholder="Consultation fee" />
              </div>
            )}
          </div>
        </div>

        {form.empType === 'Doctor' && (
        <div className="card">
          <CardHeader
            icon={Clock}
            title="Shift Timings"
            subtitle="Add one or more shift ranges"
            actions={
              <button type="button" className="btn-secondary" onClick={addShift}>
                <Plus size={16} /> Add Shift
              </button>
            }
          />
          <div className="space-y-3">
            {shifts.map((s, i) => (
              <div key={i} className="flex flex-col gap-3 rounded-lg border border-ink-100 bg-ink-50/40 p-3 sm:flex-row sm:items-end">
                <div className="w-full sm:w-64">
                  <label className="label">Days (select multiple)</label>
                  <MultiSelect
                    options={weekDays}
                    value={s.days}
                    onChange={(days) => updateShift(i, 'days', days)}
                    placeholder="Select day(s)"
                  />
                </div>
                <div className="flex-1">
                  <label className="label">From Time</label>
                  <TimePicker value={s.fromTime} onChange={(v) => updateShift(i, 'fromTime', v)} />
                </div>
                <div className="flex-1">
                  <label className="label">To Time</label>
                  <TimePicker value={s.toTime} onChange={(v) => updateShift(i, 'toTime', v)} />
                </div>
                <button
                  type="button"
                  className="btn-ghost mb-0.5 px-2 py-2 text-red-500 hover:bg-red-50 disabled:opacity-30"
                  onClick={() => removeShift(i)}
                  disabled={shifts.length === 1}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
        )}

        <div className="flex justify-end">
          <button type="submit" className="btn-primary" disabled={saving}>
            <Save size={16} /> {saving ? 'Saving...' : 'Save Employee'}
          </button>
        </div>
      </form>

      <Toast toast={toast} />
    </div>
  );
}
