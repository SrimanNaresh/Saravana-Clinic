import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Users, Stethoscope, FileText, ArrowRight, TrendingUp,
  ListChecks, Clock, Activity, CheckCircle2, Calendar, Printer, History,
} from 'lucide-react';
import { CardHeader, Spinner, EmptyState } from '../components/ui.jsx';
import { patientApi, confirmApi, prescriptionApi } from '../api/client.js';

const today = () => new Date().toISOString().slice(0, 10);
const fmtTime = (d) => (d ? new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-');

const statusColor = {
  Confirm: 'bg-brand-100 text-brand-700',
  'Pre-Examine': 'bg-rose-100 text-rose-700',
  Examine: 'bg-purple-100 text-purple-700',
  Billing: 'bg-emerald-100 text-emerald-700',
  Completed: 'bg-teal-100 text-teal-800',
};

const quickLinks = [
  { label: "Doctor's Medications", desc: 'Write today\'s prescription', to: '/confirm/prescription', icon: Stethoscope, color: 'from-purple-500 to-indigo-600' },
  { label: 'Prescription Preview', desc: 'Preview and print', to: '/confirm/prescription-print', icon: Printer, color: 'from-indigo-400 to-indigo-600' },
  { label: 'Confirm List', desc: "Today's token queue", to: '/confirm/list', icon: ListChecks, color: 'from-amber-400 to-amber-600' },
  { label: 'Patient List', desc: 'Search all patients', to: '/reports/patient-list', icon: Users, color: 'from-slate-400 to-slate-600' },
  { label: 'Medical History', desc: 'Review past visits', to: '/reports/medical-history', icon: History, color: 'from-teal-400 to-teal-600' },
];

export default function DoctorDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [patients, setPatients] = useState([]);
  const [queue, setQueue] = useState([]);
  const [prescriptionsToday, setPrescriptionsToday] = useState(0);

  useEffect(() => {
    Promise.all([
      patientApi.list().catch(() => []),
      confirmApi.list(today()).catch(() => []),
      prescriptionApi.list().catch(() => []),
    ]).then(([p, c, pr]) => {
      setPatients(p);
      setQueue(c);
      setPrescriptionsToday(pr.filter((x) => (x.CreatedAt || '').slice(0, 10) === today()).length);
      setLoading(false);
    });
  }, []);

  const counts = {
    Confirm: queue.filter((q) => q.Status === 'Confirm').length,
    'Pre-Examine': queue.filter((q) => q.Status === 'Pre-Examine').length,
    Examine: queue.filter((q) => q.Status === 'Examine').length,
    Billing: queue.filter((q) => q.Status === 'Billing').length,
    Completed: queue.filter((q) => q.Status === 'Completed').length,
  };
  const inQueue = counts['Pre-Examine'] + counts.Examine;

  const cards = [
    { label: 'Total Patients', value: patients.length, icon: Users, ring: 'bg-brand-50 text-brand-600', bar: 'bg-brand-500' },
    { label: 'Waiting for Consultation', value: inQueue, icon: Clock, ring: 'bg-rose-50 text-rose-600', bar: 'bg-rose-400' },
    { label: 'Billing Today', value: counts.Billing, icon: CheckCircle2, ring: 'bg-emerald-50 text-emerald-600', bar: 'bg-emerald-400' },
    { label: 'Prescriptions Today', value: prescriptionsToday, icon: FileText, ring: 'bg-purple-50 text-purple-600', bar: 'bg-purple-400' },
  ];

  const queueSteps = [
    { key: 'Confirm', label: 'Waiting', icon: Clock, color: 'text-brand-600 bg-brand-50' },
    { key: 'Pre-Examine', label: 'Vitals Pending', icon: Activity, color: 'text-rose-600 bg-rose-50' },
    { key: 'Examine', label: 'With Doctor', icon: Stethoscope, color: 'text-purple-600 bg-purple-50' },
    { key: 'Billing', label: 'Billing', icon: CheckCircle2, color: 'text-emerald-600 bg-emerald-50' },
    { key: 'Completed', label: 'Completed', icon: CheckCircle2, color: 'text-teal-600 bg-teal-50' },
  ];

  const waiting = queue
    .filter((q) => q.Status === 'Pre-Examine' || q.Status === 'Examine')
    .sort((a, b) => (a.TokenNo || 0) - (b.TokenNo || 0));

  const openPrescription = (row) =>
    navigate('/confirm/prescription', { state: { patient: { PatientId: row.PatientId, Name: row.PatientName, MobileNo: row.MobileNo, Address: row.Address } } });

  return (
    <div>
      <div className="mb-6 overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-purple-600 to-purple-700 p-6 text-white shadow-elevated sm:p-8">
        <div className="relative z-10">
          <p className="flex items-center gap-1.5 text-sm font-medium text-white/80">
            <Calendar size={14} /> {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Doctor Dashboard</h1>
          <p className="mt-2 max-w-xl text-sm text-white/80">
            See who's waiting, open a consultation and write prescriptions — all from one place.
          </p>
        </div>
      </div>

      {loading ? (
        <Spinner />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {cards.map((c) => (
              <div key={c.label} className="card card-hover relative overflow-hidden">
                <span className={`absolute left-0 top-0 h-full w-1 ${c.bar}`} />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-ink-500">{c.label}</p>
                    <p className="mt-1 text-3xl font-bold text-ink-800">{c.value}</p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-teal-600">
                      <TrendingUp size={13} /> Live count
                    </p>
                  </div>
                  <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${c.ring}`}>
                    <c.icon size={24} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="card mt-6">
            <CardHeader icon={ListChecks} title="Today's Queue" subtitle="Where every confirmed patient stands right now" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {queueSteps.map((s) => (
                <div key={s.key} className={`rounded-xl p-4 ${s.color}`}>
                  <s.icon size={18} />
                  <p className="mt-2 text-2xl font-bold">{counts[s.key]}</p>
                  <p className="text-xs font-medium opacity-80">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          <h2 className="section-title mb-3 mt-8">Quick Actions</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {quickLinks.map((q) => (
              <Link key={q.to} to={q.to} className="card card-hover group flex items-center gap-4">
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${q.color} text-white shadow-sm`}>
                  <q.icon size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink-700">{q.label}</p>
                  <p className="truncate text-xs text-ink-400">{q.desc}</p>
                </div>
                <ArrowRight size={16} className="shrink-0 text-ink-300 transition-transform group-hover:translate-x-1 group-hover:text-brand-500" />
              </Link>
            ))}
          </div>

          <div className="card mt-8">
            <CardHeader icon={Stethoscope} title="Waiting for Consultation" subtitle="Patients ready to be seen, in token order" />
            {waiting.length === 0 ? (
              <EmptyState message="No patients waiting right now." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="table-head">
                      <th className="rounded-l-lg px-3 py-3">Token</th>
                      <th className="px-3 py-3">Patient</th>
                      <th className="px-3 py-3">Mobile</th>
                      <th className="px-3 py-3">Confirmed</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="rounded-r-lg px-3 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {waiting.map((r) => (
                      <tr key={r.ConfirmId} className="table-row">
                        <td className="px-3 py-3">
                          <span className="inline-flex h-8 min-w-[2rem] items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 px-2 text-sm font-bold text-white">
                            {r.TokenNo ?? '-'}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <p className="font-medium text-slate-700">{r.PatientName}</p>
                          <p className="text-xs text-slate-400">ID #{r.PatientId}</p>
                        </td>
                        <td className="px-3 py-3 text-slate-500">{r.MobileNo || '-'}</td>
                        <td className="px-3 py-3 text-slate-500">{fmtTime(r.ConfirmedAt)}</td>
                        <td className="px-3 py-3">
                          <span className={`badge ${statusColor[r.Status] || 'bg-slate-100 text-slate-600'}`}>{r.Status}</span>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <button className="btn-secondary py-1.5 text-xs" onClick={() => openPrescription(r)}>
                            <Stethoscope size={13} /> Open
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
