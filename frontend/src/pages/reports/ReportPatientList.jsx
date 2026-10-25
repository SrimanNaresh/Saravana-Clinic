import { useEffect, useState } from 'react';
import { Printer, Users, X } from 'lucide-react';
import { Spinner, EmptyState, Toast, CardHeader } from '../../components/ui.jsx';
import { useToast } from '../../hooks/useToast.js';
import { reportApi } from '../../api/client.js';

const fmt = (d) => (d ? new Date(d).toLocaleDateString() : '-');

export default function ReportPatientList() {
  const { toast, show } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const load = (from, to) => {
    setLoading(true);
    reportApi.patients(from, to)
      .then(setRows)
      .catch(() => show('Failed to load report', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyFilter = () => {
    if (!fromDate || !toDate) return show('Select both From and To dates', 'error');
    if (fromDate > toDate) return show('From date must be before To date', 'error');
    load(fromDate, toDate);
  };

  const clearFilter = () => {
    setFromDate('');
    setToDate('');
    load();
  };

  return (
    <div>
      <div className="card">
        <CardHeader
          icon={Users}
          title="Report: Patient List"
          subtitle="All registered patients with activity counts"
          actions={
            <button className="btn-secondary no-print" onClick={() => window.print()}>
              <Printer size={16} /> Print
            </button>
          }
        />

        <div className="mb-4 flex flex-wrap items-end gap-3 no-print">
          <div>
            <label className="label">From Date</label>
            <input type="date" className="input" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div>
            <label className="label">To Date</label>
            <input type="date" className="input" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
          <button className="btn-primary" onClick={applyFilter} disabled={loading}>
            {loading ? 'Loading...' : 'Filter'}
          </button>
          {(fromDate || toDate) && (
            <button className="btn-secondary" onClick={clearFilter} disabled={loading}>
              <X size={16} /> Clear
            </button>
          )}
        </div>
        {loading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState message="No patients." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="table-head">
                  <th className="rounded-l-lg px-3 py-3">#</th>
                  <th className="px-3 py-3">Name</th>
                  <th className="px-3 py-3">Mobile</th>
                  <th className="px-3 py-3">Address</th>
                  <th className="px-3 py-3 text-center">Vitals</th>
                  <th className="px-3 py-3 text-center">Prescriptions</th>
                  <th className="rounded-r-lg px-3 py-3">Registered</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.PatientId} className="table-row">
                    <td className="px-3 py-3 text-slate-400">{i + 1}</td>
                    <td className="px-3 py-3 font-medium text-slate-700">{r.Name}</td>
                    <td className="px-3 py-3 text-slate-500">{r.MobileNo || '-'}</td>
                    <td className="px-3 py-3 text-slate-500">{r.Address || '-'}</td>
                    <td className="px-3 py-3 text-center">
                      <span className="badge bg-rose-100 text-rose-700">{r.VitalCount}</span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="badge bg-brand-100 text-brand-700">{r.PrescriptionCount}</span>
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-400">{fmt(r.CreatedAt)}</td>
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
