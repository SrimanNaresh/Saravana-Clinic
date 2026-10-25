import { Spinner, EmptyState } from './ui.jsx';

const fmtDate = (d) => new Date(d).toLocaleDateString();
const fmtMoney = (n) => `₹${Number(n).toFixed(2)}`;

export default function BillingReportTable({ loading, data }) {
  if (loading) return <Spinner />;
  if (!data) return null;

  return (
    <div className="card mt-5">
      {data.rows.length === 0 ? (
        <EmptyState message="No patient visits found for this period." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="table-head">
                <th className="rounded-l-lg px-3 py-3">Date</th>
                <th className="px-3 py-3 text-center">Patient Visits</th>
                <th className="px-3 py-3 text-right">Rate / Patient</th>
                <th className="rounded-r-lg px-3 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.date} className="table-row">
                  <td className="px-3 py-3 font-medium text-slate-700">{fmtDate(r.date)}</td>
                  <td className="px-3 py-3 text-center text-slate-600">{r.patientCount}</td>
                  <td className="px-3 py-3 text-right text-slate-600">{fmtMoney(r.rate)}</td>
                  <td className="px-3 py-3 text-right font-medium text-slate-700">{fmtMoney(r.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-ink-200 text-sm font-semibold text-slate-800">
                <td className="px-3 py-3">Total</td>
                <td className="px-3 py-3 text-center">{data.totalPatients}</td>
                <td className="px-3 py-3"></td>
                <td className="px-3 py-3 text-right">{fmtMoney(data.totalAmount)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-ink-400">
        Rate tiers (per patient, per day): up to 10 visits — ₹2.00 · 11–25 visits — ₹1.50 · 26+ visits — ₹1.00
      </p>
    </div>
  );
}
