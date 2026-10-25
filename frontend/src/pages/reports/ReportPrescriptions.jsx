import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Printer, Pill, User } from 'lucide-react';
import { PageHeader, Spinner, Toast } from '../../components/ui.jsx';
import PatientPicker from '../../components/PatientPicker.jsx';
import { useToast } from '../../hooks/useToast.js';
import { reportApi } from '../../api/client.js';

const fmt = (d) => (d ? new Date(d).toLocaleString() : '-');

// M/A/E/N -> "1-0-0-1" style code, matching Prescription Preview's table format.
const TIMING_ORDER = ['Morning', 'Afternoon', 'Evening', 'Night'];
const frequencyToCode = (frequency) => {
  const chosen = (frequency || '').split(',').map((v) => v.trim()).filter(Boolean);
  return TIMING_ORDER.map((t) => (chosen.includes(t) ? '1' : '0')).join('-');
};

export default function ReportPrescriptions() {
  const location = useLocation();
  const { toast, show } = useToast();
  const [selected, setSelected] = useState(location.state?.patient || null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = (p) => {
    setSelected(p);
    setLoading(true);
    reportApi.medicalHistory(p.PatientId)
      .then(setData)
      .catch(() => { setData(null); show('Failed to load prescriptions', 'error'); })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (selected) load(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const prescriptions = data?.prescriptions || [];

  return (
    <div>
      <PageHeader
        title="Report: Patient Prescriptions"
        actions={
          data && (
            <button className="btn-secondary no-print" onClick={() => window.print()}>
              <Printer size={16} /> Print
            </button>
          )
        }
      />

      <div className="space-y-5">
        <div className="no-print">
          <PatientPicker selected={selected} onSelect={load} />
        </div>

        {loading ? (
          <Spinner />
        ) : data ? (
          <div className="space-y-5">
            <div className="card">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                  <User size={22} />
                </div>
                <div>
                  <p className="text-lg font-semibold text-slate-800">{data.patient?.Name}</p>
                  <p className="text-sm text-slate-500">{data.patient?.MobileNo || 'No mobile'} · {data.patient?.Address || 'No address'}</p>
                </div>
              </div>
            </div>

            <div className="card">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Pill size={16} /> Prescriptions ({prescriptions.length})
              </h3>
              {prescriptions.length === 0 ? (
                <p className="text-sm text-slate-400">No prescriptions.</p>
              ) : (
                <div className="space-y-4">
                  {prescriptions.map((p) => (
                    <div key={p.PrescriptionId} className="rounded-lg border border-slate-100 p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-slate-700">{p.Diagnosis || 'No diagnosis'}</p>
                        <span className="text-xs text-slate-400">{fmt(p.CreatedAt)}</span>
                      </div>
                      {p.Notes && <p className="mt-1 text-xs text-slate-500">{p.Notes}</p>}
                      {p.items?.length > 0 && (
                        <div className="mt-3 overflow-x-auto">
                          <table className="w-full border-collapse text-left text-sm">
                            <thead>
                              <tr className="border-b border-slate-200 text-xs uppercase text-slate-400">
                                <th className="py-2">Medicine</th>
                                <th className="py-2">M / A / E / N</th>
                                <th className="py-2">AF / BF</th>
                                <th className="py-2">Duration</th>
                              </tr>
                            </thead>
                            <tbody>
                              {p.items.map((it) => (
                                <tr key={it.ItemId} className="border-b border-slate-50">
                                  <td className="py-2 font-medium text-slate-700">{it.MedicineName || '-'}</td>
                                  <td className="py-2 text-slate-600">{frequencyToCode(it.Frequency)}</td>
                                  <td className="py-2 text-slate-600">{it.Instructions || '-'}</td>
                                  <td className="py-2 text-slate-600">{it.Duration || '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>

      <Toast toast={toast} />
    </div>
  );
}
