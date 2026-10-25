import { useEffect, useState, useCallback } from 'react';
import { CalendarClock, Search, Calendar, MessageCircle, Pencil, Check, X } from 'lucide-react';
import { CardHeader, Spinner, EmptyState, Toast } from '../../components/ui.jsx';
import { useToast } from '../../hooks/useToast.js';
import { prescriptionApi, clinicApi } from '../../api/client.js';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN') : '-');

// Assumes a 10-digit number is Indian (+91) since no country-code field
// exists on the patient record — matches the same convention used for the
// Doctor's -> Send action.
const normalizeMobile = (raw) => {
  const digits = (raw || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.length === 10 ? `91${digits}` : digits;
};

export default function FollowUpPatients() {
  const { toast, show } = useToast();
  const [date, setDate] = useState('');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clinic, setClinic] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editDate, setEditDate] = useState('');
  const [savingId, setSavingId] = useState(null);

  useEffect(() => { clinicApi.get().then(setClinic).catch(() => setClinic(null)); }, []);

  const load = useCallback((d, s) => {
    setLoading(true);
    prescriptionApi.followUp({ date: d || undefined, search: s || undefined })
      .then(setRows)
      .catch(() => show('Failed to load follow-up patients', 'error'))
      .finally(() => setLoading(false));
  }, [show]);

  // Debounced so typing in the search box doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => load(date, search), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, search]);

  const startEdit = (row) => {
    setEditingId(row.PrescriptionId);
    setEditDate(row.NextVisitDate ? row.NextVisitDate.slice(0, 10) : '');
  };

  const saveNextVisitDate = async (row) => {
    setSavingId(row.PrescriptionId);
    try {
      await prescriptionApi.updateNextVisitDate(row.PrescriptionId, editDate || null);
      show('Next visit date updated', 'success');
      setEditingId(null);
      load(date, search);
    } catch (err) {
      show(err.response?.data?.error || 'Update failed', 'error');
    } finally {
      setSavingId(null);
    }
  };

  const sendReminder = (row) => {
    const mobile = normalizeMobile(row.MobileNo);
    if (!mobile) return show(`${row.Name} has no mobile number on file`, 'error');

    const message = [
      `${clinic?.Name || 'Clinic'} - Follow Up Reminder`,
      `Patient: ${row.Name}`,
      `Last Visit Date: ${fmtDate(row.LastVisitDate)}`,
      `Plan Date: ${fmtDate(row.NextVisitDate)}`,
    ].join('\n');

    window.open(`https://wa.me/${mobile}?text=${encodeURIComponent(message)}`, '_blank');
  };

  return (
    <div>
      <div className="card">
        <CardHeader
          icon={CalendarClock}
          title="Follow Up Patients"
          subtitle="Patients with a next visit date scheduled from Doctor's"
          actions={
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              <div className="relative flex-1 sm:w-64 sm:flex-none">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                <input
                  className="input pl-9"
                  placeholder="Search name or mobile..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="relative flex-1 sm:w-56 sm:flex-none">
                <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                <input
                  type="date"
                  className="input pl-9"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
            </div>
          }
        />

        {loading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState message="No follow-up patients found." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="table-head">
                  <th className="rounded-l-lg px-3 py-3">Patient Name</th>
                  <th className="px-3 py-3">Mobile No</th>
                  <th className="px-3 py-3">Last Visit Date</th>
                  <th className="px-3 py-3">Next Visit Date</th>
                  <th className="rounded-r-lg px-3 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.PatientId} className="table-row">
                    <td className="px-3 py-3">
                      <p className="font-medium text-slate-700">{r.Name}</p>
                      <p className="text-xs text-slate-400">ID #{r.PatientId}</p>
                    </td>
                    <td className="px-3 py-3 text-slate-500">{r.MobileNo || '-'}</td>
                    <td className="px-3 py-3 text-slate-500">{fmtDate(r.LastVisitDate)}</td>
                    <td className="px-3 py-3">
                      {editingId === r.PrescriptionId ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="date"
                            className="input h-9 w-40"
                            value={editDate}
                            onChange={(e) => setEditDate(e.target.value)}
                          />
                          <button
                            className="btn-ghost px-2 py-1.5 text-emerald-600 hover:bg-emerald-50 disabled:opacity-30"
                            title="Save"
                            onClick={() => saveNextVisitDate(r)}
                            disabled={savingId === r.PrescriptionId}
                          >
                            <Check size={15} />
                          </button>
                          <button
                            className="btn-ghost px-2 py-1.5 text-red-500 hover:bg-red-50"
                            title="Cancel"
                            onClick={() => setEditingId(null)}
                            disabled={savingId === r.PrescriptionId}
                          >
                            <X size={15} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="badge bg-brand-100 text-brand-700">{fmtDate(r.NextVisitDate)}</span>
                          <button className="btn-ghost px-1.5 py-1 text-ink-400 hover:text-brand-600" title="Edit next visit date" onClick={() => startEdit(r)}>
                            <Pencil size={13} />
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button className="btn-secondary py-1.5" onClick={() => sendReminder(r)} title="Send a WhatsApp reminder">
                        <MessageCircle size={15} /> Send
                      </button>
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
