import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListChecks, Activity, Trash2, Calendar, Search } from 'lucide-react';
import { Spinner, EmptyState, Toast, CardHeader } from '../../components/ui.jsx';
import { useToast } from '../../hooks/useToast.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { confirmApi } from '../../api/client.js';

const today = () => new Date().toISOString().slice(0, 10);
// Always Indian Standard Time, regardless of the viewing device's own timezone —
// and uppercase AM/PM, matching the convention Indian systems use (not "pm").
const fmtTime = (d) => (d ? new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }).toUpperCase() : '-');

// Status badge colors. Status is advanced automatically by actions (not manually).
// Confirm -> Pre-Examine -> Examine -> Billing -> Completed
const statusColor = {
  Confirm: 'bg-brand-100 text-brand-700',
  'Pre-Examine': 'bg-rose-100 text-rose-700',
  Examine: 'bg-purple-100 text-purple-700',
  Billing: 'bg-emerald-100 text-emerald-700',
  Completed: 'bg-teal-100 text-teal-800',
};
const statusOrder = { Confirm: 0, 'Pre-Examine': 1, Examine: 2, Billing: 3, Completed: 4 };

export default function ConfirmList() {
  const navigate = useNavigate();
  const { toast, show } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.username === 'Admin';
  const [date, setDate] = useState(today());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = useCallback(async (d) => {
    setLoading(true);
    try {
      const result = await confirmApi.list(d);
      setRows(result.sort((a, b) => {
        const statusDifference = (statusOrder[a.Status] ?? 99) - (statusOrder[b.Status] ?? 99);
        return statusDifference || (a.TokenNo || 0) - (b.TokenNo || 0);
      }));
    } catch {
      show('Failed to load confirmations', 'error');
    } finally {
      setLoading(false);
    }
  }, [show]);

  useEffect(() => { load(date); }, [date, load]);

  const query = search.trim().toLowerCase();
  const visibleRows = query
    ? rows.filter((row) =>
        (row.PatientName || '').toLowerCase().includes(query) ||
        (row.MobileNo || '').toLowerCase().includes(query) ||
        String(row.TokenNo || '').includes(query)
      )
    : rows;

  const remove = async (row) => {
    if (!confirm(`Remove confirmation for "${row.PatientName}"?`)) return;
    try {
      await confirmApi.remove(row.ConfirmId);
      show('Removed', 'success');
      load(date);
    } catch {
      show('Remove failed', 'error');
    }
  };

  const goto = (path, row) =>
    navigate(path, { state: { patient: { PatientId: row.PatientId, Name: row.PatientName, MobileNo: row.MobileNo, Address: row.Address } } });

  return (
    <div>
      <div className="card">
        <CardHeader
          icon={ListChecks}
          title="Confirm List"
          subtitle="Patients confirmed on the selected date"
          actions={
            <div className="flex w-full items-center gap-2 sm:w-auto sm:flex-row">
              <div className="relative flex-1 sm:w-64 sm:flex-none">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                <input className="input pl-9" placeholder="Search patient, mobile or token..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <div className="relative hidden sm:block sm:w-56">
                <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                <input type="date" className="input pl-9" value={date} onChange={(e) => setDate(e.target.value || today())} />
              </div>
              <button type="button" className="btn-secondary shrink-0" onClick={() => navigate('/confirm/search')}>
                <Search size={16} /> Booking
              </button>
            </div>
          }
        />

        {loading ? (
          <Spinner />
        ) : visibleRows.length === 0 ? (
          <EmptyState message={rows.length === 0 ? 'No confirmed patients for this date.' : 'No matching patients found.'} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="table-head">
                  <th className="rounded-l-lg px-3 py-3">Token</th>
                  <th className="px-3 py-3">Patient</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Vital Sign</th>
                  <th className="px-3 py-3">Mobile</th>
                  <th className="px-3 py-3">Confirmed</th>
                  <th className="rounded-r-lg px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r) => (
                  <tr key={r.ConfirmId} className="table-row">
                    <td className="px-3 py-3">
                      <span className="inline-flex h-8 min-w-[2rem] items-center justify-center rounded-lg bg-brand-gradient px-2 text-sm font-bold text-white">
                        {r.TokenNo ?? '-'}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-medium text-slate-700">{r.PatientName}</p>
                      <p className="text-xs text-slate-400">ID #{r.PatientId}</p>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`badge ${statusColor[r.Status] || 'bg-slate-100 text-slate-600'}`}>{r.Status}</span>
                    </td>
                    <td className="px-3 py-3">
                      {r.Status !== 'Billing' && r.Status !== 'Completed' ? (
                        <button
                          className="inline-flex items-center gap-1.5 rounded-lg bg-rose-100 px-2.5 py-1.5 text-xs font-semibold text-rose-700 shadow-sm transition-colors hover:bg-rose-200"
                          title="Record Vital Sign"
                          onClick={() => goto('/confirm/vital-sign', r)}
                        >
                          <Activity size={14} /> Vital Sign
                        </button>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-slate-500">{r.MobileNo || '-'}</td>
                    <td className="px-3 py-3 text-slate-500">{fmtTime(r.ConfirmedAt)}</td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-1">
                        {(isAdmin || r.Status === 'Confirm') && (
                          <button className="btn-ghost px-2 py-1 text-red-500 hover:bg-red-50" title="Remove" onClick={() => remove(r)}>
                            <Trash2 size={15} />
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

      <Toast toast={toast} />
    </div>
  );
}
