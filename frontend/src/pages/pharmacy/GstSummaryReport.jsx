import { useCallback, useEffect, useState } from 'react';
import { Landmark, Printer, FileSpreadsheet, Search } from 'lucide-react';
import { CardHeader, Spinner, EmptyState, Toast } from '../../components/ui.jsx';
import { useToast } from '../../hooks/useToast.js';
import { pharmacyReportApi } from '../../api/client.js';
import { exportExcel, money, qty } from './reportExport.js';

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const monthStart = () => { const d = new Date(); return iso(new Date(d.getFullYear(), d.getMonth(), 1)); };
const dateLabel = (s) => new Date(s).toLocaleDateString('en-GB');

const HSN_COLS = [
  { key: 'HSN', label: 'HSN' }, { key: 'GSTPercent', label: 'GST%', type: 'qty' }, { key: 'Qty', label: 'Qty (packs)', type: 'qty' },
  { key: 'Taxable', label: 'Taxable', type: 'money' }, { key: 'CGST', label: 'CGST', type: 'money' }, { key: 'SGST', label: 'SGST', type: 'money' },
  { key: 'IGST', label: 'IGST', type: 'money' }, { key: 'Total', label: 'Total', type: 'money' },
];
const RATE_COLS = HSN_COLS.filter((c) => !['HSN', 'Qty'].includes(c.key));
const sumOf = (rows, keys) => Object.fromEntries(keys.map((k) => [k, Math.round(rows.reduce((s, r) => s + Number(r[k] || 0), 0) * 100) / 100]));

// Pharmacy > Report > GST / HSN Summary: outward supplies for GST filing –
// sales less sales returns, by HSN and GST rate, from the GST saved on each
// bill line. Bills saved before GST recording started are shown apart.
export default function GstSummaryReport() {
  const { toast, show } = useToast();
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(() => iso(new Date()));
  const [tab, setTab] = useState('hsn');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (from && to && from > to) return show('From date is after To date', 'error');
    setLoading(true);
    try {
      setData(await pharmacyReportApi.gstSummary({ from, to }));
    } catch (err) {
      show(err.response?.data?.error || 'Failed to load the GST summary', 'error');
    } finally {
      setLoading(false);
    }
  }, [from, to, show]);
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = data ? (tab === 'hsn' ? data.hsn : data.rates) : [];
  const cols = tab === 'hsn' ? HSN_COLS : RATE_COLS;
  const totals = sumOf(rows, ['Qty', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total']);
  const period = data ? `${dateLabel(data.from)} – ${dateLabel(data.to)}` : '';

  return (
    <div>
      <div className="card">
        <CardHeader
          icon={Landmark}
          title="GST / HSN Summary"
          subtitle={data ? `Sales less sales returns · ${period}` : 'Sales less sales returns, by HSN and GST rate'}
          actions={(
            <div className="no-print flex flex-wrap items-center gap-2 text-sm">
              <label className="text-ink-500">From</label>
              <input type="date" className="input w-auto" value={from} onChange={(e) => setFrom(e.target.value)} />
              <label className="text-ink-500">To</label>
              <input type="date" className="input w-auto" value={to} onChange={(e) => setTo(e.target.value)} />
              <button type="button" className="btn-primary" onClick={load} disabled={loading}><Search size={15} /> Show</button>
              <button type="button" className="btn-secondary" disabled={!rows.length} onClick={() => exportExcel(`GST-${tab === 'hsn' ? 'HSN' : 'Rate'}-${from}-to-${to}`, tab === 'hsn' ? 'HSN Summary' : 'Rate-wise', cols, rows, totals)}>
                <FileSpreadsheet size={15} /> Excel
              </button>
              <button type="button" className="btn-secondary" disabled={!rows.length} onClick={() => window.print()}><Printer size={15} /> Print</button>
            </div>
          )}
        />

        <div className="no-print mb-2 inline-flex rounded-lg bg-ink-100 p-1">
          {[['hsn', 'HSN-wise'], ['rate', 'Rate-wise']].map(([k, label]) => (
            <button key={k} type="button" onClick={() => setTab(k)} className={`rounded-md px-3 py-1 text-sm font-medium ${tab === k ? 'bg-white text-brand-700 shadow-sm' : 'text-ink-500 hover:text-ink-700'}`}>{label}</button>
          ))}
        </div>
        <p className="mb-2 hidden text-sm font-semibold print:block">GST {tab === 'hsn' ? 'HSN-wise' : 'Rate-wise'} Summary · {period}</p>

        {loading ? <Spinner /> : !data ? null : rows.length === 0 ? (
          <EmptyState message="No sales with GST recorded in this period." />
        ) : (
          <div className="ph-wrap">
            <table className={`ph-table ${tab === 'hsn' ? 'min-w-[760px]' : 'min-w-[560px]'}`}>
              <colgroup>
                {tab === 'hsn' && <col className="w-[16%]" />}
                <col className={tab === 'hsn' ? 'w-[8%]' : 'w-[12%]'} />
                {tab === 'hsn' && <col className="w-[10%]" />}
                {(tab === 'hsn' ? ['w-[14%]', 'w-[12%]', 'w-[12%]', 'w-[12%]', 'w-[16%]'] : ['w-[20%]', 'w-[17%]', 'w-[17%]', 'w-[14%]', 'w-[20%]']).map((w, i) => <col key={i} className={w} />)}
              </colgroup>
              <thead>
                <tr>
                  {tab === 'hsn' && <th className="ph-mid">HSN</th>}
                  <th className="ph-num">GST%</th>
                  {tab === 'hsn' && <th className="ph-num">Qty (packs)</th>}
                  <th className="ph-num">Taxable</th><th className="ph-num">CGST</th><th className="ph-num">SGST</th><th className="ph-num">IGST</th><th className="ph-num">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.HSN || ''}|${r.GSTPercent}`}>
                    {tab === 'hsn' && <td className="ph-mid font-medium">{r.HSN}</td>}
                    <td className="ph-num">{r.GSTPercent}%</td>
                    {tab === 'hsn' && <td className="ph-num">{qty(r.Qty)}</td>}
                    <td className="ph-num">{money(r.Taxable)}</td>
                    <td className="ph-num">{money(r.CGST)}</td>
                    <td className="ph-num">{money(r.SGST)}</td>
                    <td className="ph-num">{money(r.IGST)}</td>
                    <td className="ph-num font-semibold">{money(r.Total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="text-right" colSpan={tab === 'hsn' ? 2 : 1}>Total</td>
                  {tab === 'hsn' && <td className="ph-num">{qty(totals.Qty)}</td>}
                  <td className="ph-num">{money(totals.Taxable)}</td>
                  <td className="ph-num">{money(totals.CGST)}</td>
                  <td className="ph-num">{money(totals.SGST)}</td>
                  <td className="ph-num">{money(totals.IGST)}</td>
                  <td className="ph-num">{money(totals.Total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        {data?.notRecorded?.bills > 0 && (
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm text-amber-800">
            {data.notRecorded.bills} bill(s) in this period, ₹{money(data.notRecorded.amount)}, were saved before GST recording started – not in the table above.
          </p>
        )}
      </div>
      <Toast toast={toast} />
    </div>
  );
}
