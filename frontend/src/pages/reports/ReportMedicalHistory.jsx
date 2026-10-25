import { useState } from 'react';
import { Printer, Activity, Pill, User } from 'lucide-react';
import { PageHeader, Spinner, Toast } from '../../components/ui.jsx';
import PatientPicker from '../../components/PatientPicker.jsx';
import { useToast } from '../../hooks/useToast.js';
import { reportApi } from '../../api/client.js';

const fmt = (d) => (d ? new Date(d).toLocaleString() : '-');

export default function ReportMedicalHistory() {
  const { toast, show } = useToast();
  const [selected, setSelected] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const onSelect = (p) => {
    setSelected(p);
    setLoading(true);
    reportApi.medicalHistory(p.PatientId)
      .then(setData)
      .catch(() => { setData(null); show('Failed to load history', 'error'); })
      .finally(() => setLoading(false));
  };

  return (
    <div>
      <PageHeader
        title="Report: Patient Medical History"
        actions={
          data && (
            <button className="btn-secondary" onClick={() => window.print()}>
              <Printer size={16} /> Print
            </button>
          )
        }
      />

      <div className="space-y-5">
        <PatientPicker selected={selected} onSelect={onSelect} />

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
                <Activity size={16} /> Vital Signs ({data.vitals.length})
              </h3>
              {data.vitals.length === 0 ? (
                <p className="text-sm text-slate-400">No vitals recorded.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                        <th className="px-3 py-2">Date</th><th className="px-3 py-2">Ht</th><th className="px-3 py-2">Wt</th>
                        <th className="px-3 py-2">BP</th><th className="px-3 py-2">Pulse</th><th className="px-3 py-2">Temp</th><th className="px-3 py-2">Comments</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.vitals.map((v) => (
                        <tr key={v.VitalId} className="border-b border-slate-50">
                          <td className="px-3 py-2 text-xs text-slate-400">{fmt(v.RecordedAt)}</td>
                          <td className="px-3 py-2 text-slate-600">{v.Height ?? '-'}</td>
                          <td className="px-3 py-2 text-slate-600">{v.Weight ?? '-'}</td>
                          <td className="px-3 py-2 text-slate-600">{v.BloodPressure || '-'}</td>
                          <td className="px-3 py-2 text-slate-600">{v.PulseRate ?? '-'}</td>
                          <td className="px-3 py-2 text-slate-600">{v.Temperature ?? '-'}</td>
                          <td className="px-3 py-2 text-slate-500">{v.Comments || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="card">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Pill size={16} /> Prescriptions ({data.prescriptions.length})
              </h3>
              {data.prescriptions.length === 0 ? (
                <p className="text-sm text-slate-400">No prescriptions.</p>
              ) : (
                <div className="space-y-3">
                  {data.prescriptions.map((p) => (
                    <div key={p.PrescriptionId} className="rounded-lg border border-slate-100 p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-slate-700">{p.Diagnosis || 'No diagnosis'}</p>
                        <span className="text-xs text-slate-400">{fmt(p.CreatedAt)}</span>
                      </div>
                      {p.Notes && <p className="mt-1 text-xs text-slate-500">{p.Notes}</p>}
                      {p.items?.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {p.items.map((it) => (
                            <li key={it.ItemId} className="text-sm text-slate-600">
                              • {it.MedicineName} {it.Dosage && `(${it.Dosage})`} {it.Frequency && `– ${it.Frequency}`} {it.Duration && `for ${it.Duration}`} {it.Instructions && `· ${it.Instructions}`}
                            </li>
                          ))}
                        </ul>
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
