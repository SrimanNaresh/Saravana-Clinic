import { StickyNote, CalendarClock, TestTube } from 'lucide-react';
import { PrescriptionHeader, PrescriptionFooter } from './PrescriptionLetterhead.jsx';

const TIMINGS = ['Morning', 'Afternoon', 'Evening', 'Night'];
const timingToCode = (timing) => TIMINGS.map((t) => (timing.includes(t) ? '1' : '0')).join('-');
const fmtVisitDate = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '');

// The one letterhead layout used everywhere a prescription needs to look
// "official" — the on-screen Print Prescription view, the PDF sent to the
// patient's WhatsApp, and Billing's per-patient prescription print all render
// this exact same component, so they can never drift apart visually.
export default function PrescriptionPrintable({ clinic, patient, patientAge, items, notes, date, nextVisitDate, labTestNames = [] }) {
  const rows = items.filter((it) => it.medicineName.trim());

  return (
    <div className="print-prescription card">
      <PrescriptionHeader
        doctorName={clinic?.DoctorName}
        clinicName={clinic?.Name}
        email={clinic?.Email}
        contactNo={clinic?.ContactNo}
        address={clinic?.Address}
        logo={clinic?.Logo}
      />

      <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2.5 rounded-xl border border-brand-100 bg-brand-50/40 px-4 py-3 text-sm sm:grid-cols-2">
        <p>
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-400">Patient Name</span>
          <span className="text-base font-semibold text-ink-800">{patient?.Name}</span>
        </p>
        <p className="sm:text-right">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-400">Patient ID</span>
          <span className="text-base font-semibold text-ink-800">#{patient?.PatientId}</span>
        </p>
        <p>
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-400">Age</span>
          <span className="text-base font-semibold text-ink-800">{patientAge ?? '-'}</span>
        </p>
        <p className="sm:text-right">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-400">Date</span>
          <span className="text-base font-semibold text-ink-800">{date}</span>
        </p>
      </div>

      <div className="py-5">
        <div className="mb-3 flex items-center gap-2">
          <span className="font-serif text-3xl italic leading-none text-brand-600">℞</span>
          <h2 className="text-base font-bold uppercase tracking-wide text-ink-800">Prescription</h2>
        </div>
        <div className="overflow-hidden rounded-xl border border-ink-100">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="bg-brand-700 text-xs uppercase tracking-wide text-white">
                <th className="w-10 py-2.5 pl-4">#</th>
                <th className="py-2.5">Medicine</th>
                <th className="py-2.5">M / A / E / N</th>
                <th className="py-2.5">AF / BF</th>
                <th className="py-2.5 pr-4">Duration</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-ink-400">No medicines added</td>
                </tr>
              ) : rows.map((it, i) => (
                <tr key={i} className={`border-b border-ink-100 last:border-0 ${i % 2 ? 'bg-ink-50/50' : 'bg-white'}`}>
                  <td className="py-2.5 pl-4 text-ink-400">{i + 1}</td>
                  <td className="py-2.5 font-semibold text-ink-800">{it.medicineName}</td>
                  <td className="py-2.5 font-medium text-brand-700">{timingToCode(it.timing)}</td>
                  <td className="py-2.5 font-medium text-amber-700">{it.food[0] || '-'}</td>
                  <td className="py-2.5 pr-4">{it.days ? `${it.days} day(s)` : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {notes && (
        <div className="mb-3 rounded-lg border-l-4 border-teal-400 bg-teal-50/50 px-4 py-3">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-teal-700">
            <StickyNote size={13} /> Notes
          </p>
          <p className="whitespace-pre-wrap text-sm text-ink-700">{notes}</p>
        </div>
      )}

      {labTestNames.length > 0 && (
        <div className="mb-3 rounded-lg border border-violet-100 bg-violet-50/50 px-4 py-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-violet-700">
            <TestTube size={13} /> Lab Tests
          </p>
          <div className="flex flex-wrap gap-1.5">
            {labTestNames.map((name, i) => (
              <span key={i} className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-violet-800 ring-1 ring-violet-200">{name}</span>
            ))}
          </div>
        </div>
      )}

      {nextVisitDate && (
        <div className="mb-1 flex items-center gap-2 rounded-lg border border-brand-100 bg-brand-50/50 px-4 py-3">
          <CalendarClock size={16} className="shrink-0 text-brand-600" />
          <p className="text-sm text-ink-700">
            <span className="font-bold uppercase tracking-wide text-brand-700">Next Visit:</span> {fmtVisitDate(nextVisitDate)}
          </p>
        </div>
      )}

      <PrescriptionFooter clinicName={clinic?.Name} address={clinic?.Address} contactNo={clinic?.ContactNo} />
    </div>
  );
}
