import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HandCoins, Save, Trash2, X } from 'lucide-react';
import { CardHeader, Spinner, EmptyState, Toast } from '../../components/ui.jsx';
import SearchPick from '../../components/grid/SearchPick.jsx';
import { useToast } from '../../hooks/useToast.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { customerPaymentApi } from '../../api/client.js';
import { money } from './reportExport.js';

const PAY_MODES = ['Cash', 'UPI', 'Card', 'Bank Transfer', 'Cheque'];
const today = () => new Date().toISOString().slice(0, 10);
const dateLabel = (iso) => new Date(iso).toLocaleDateString('en-GB');
const emptyPay = () => ({ payDate: today(), amount: '', payMode: 'Cash', referenceNo: '', notes: '' });

// Pharmacy > Sales > Credit Ledger: patients who bought on credit, their
// running ledger (credit bills, credit returns, payments) and Receive payment.
export default function CreditLedger() {
  const navigate = useNavigate();
  const { toast, show } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [settled, setSettled] = useState(false);
  const [patientId, setPatientId] = useState('');
  const [ledger, setLedger] = useState(null);
  const [pay, setPay] = useState(emptyPay);
  const [saving, setSaving] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await customerPaymentApi.patients({ settled: settled ? '1' : '' }));
    } catch {
      show('Failed to load the credit list', 'error');
    } finally {
      setLoading(false);
    }
  }, [settled, show]);
  useEffect(() => { loadList(); }, [loadList]);

  const loadLedger = useCallback(async (id) => {
    if (!id) { setLedger(null); return; }
    try {
      setLedger(await customerPaymentApi.ledger(id));
    } catch {
      show('Failed to load the ledger', 'error');
    }
  }, [show]);
  const pick = (id) => { setPatientId(id || ''); setPay(emptyPay()); loadLedger(id); };

  const options = useMemo(() => rows.map((r) => ({
    value: String(r.PatientId), label: `${r.Name}${r.MobileNo ? ` · ${r.MobileNo}` : ''} · #${r.PatientId}`,
    hint: r.Balance > 0 ? `₹${money(r.Balance)}` : 'settled',
  })), [rows]);
  const totals = useMemo(() => ['Due', 'Returns', 'Paid', 'Balance'].reduce((t, k) => ({ ...t, [k]: rows.reduce((s, r) => s + r[k], 0) }), {}), [rows]);

  const amount = Number(pay.amount);
  const refNeeded = pay.payMode !== 'Cash';
  const payProblem = pay.amount === '' ? null : !(amount > 0) ? 'Amount must be more than 0'
    : ledger && amount > ledger.Balance + 0.005 ? `Not more than the balance ₹${money(ledger.Balance)}` : null;
  const set = (k) => (e) => setPay((p) => ({ ...p, [k]: e.target.value }));

  const receive = async (e) => {
    e.preventDefault();
    if (!(amount > 0)) return show('Enter the Amount', 'error');
    if (payProblem) return show(payProblem, 'error');
    if (refNeeded && !pay.referenceNo.trim()) return show(`${pay.payMode === 'Cheque' ? 'Cheque No' : 'Reference No'} is required for ${pay.payMode}`, 'error');
    setSaving(true);
    try {
      const r = await customerPaymentApi.create({ ...pay, patientId: Number(patientId), amount });
      show(`Received ${r.PaymentNo} · ₹${money(amount)}`, 'success');
      setPay(emptyPay());
      await Promise.all([loadLedger(patientId), loadList()]);
    } catch (err) {
      show(err.response?.data?.error || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const removePayment = async (e) => {
    if (!confirm(`Delete payment ${e.DocNo} (₹${money(e.Credit)})?\n\nThe patient's balance goes up again.`)) return;
    try {
      await customerPaymentApi.remove(e.DocId);
      show(`${e.DocNo} deleted`, 'success');
      await Promise.all([loadLedger(patientId), loadList()]);
    } catch (err) {
      show(err.response?.data?.error || 'Delete failed', 'error');
    }
  };

  const openDoc = (e) => {
    if (e.Type === 'Bill') navigate('/pharmacy/sales-billing-list', { state: { search: e.DocNo } });
    else if (e.Type === 'Return') navigate('/pharmacy/sales-return-list', { state: { search: e.DocNo } });
  };

  return (
    <div>
      <div className="card">
        <CardHeader
          icon={HandCoins}
          title="Credit Ledger"
          subtitle={ledger ? `${ledger.Name} · balance ₹${money(ledger.Balance)}` : `${rows.length} patient(s) · total due ₹${money(totals.Balance)}`}
          actions={(
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex w-full gap-1 sm:w-80">
                <div className="min-w-0 flex-1">
                  <SearchPick className="input" placeholder="Search patient..." options={options} value={patientId} onChange={pick} />
                </div>
                {patientId && <button type="button" className="btn-secondary px-2" title="Back to all patients" onClick={() => pick('')}><X size={14} /></button>}
              </div>
              <label className="flex items-center gap-1.5 text-sm text-ink-600">
                <input type="checkbox" checked={settled} onChange={(e) => setSettled(e.target.checked)} /> Show settled
              </label>
            </div>
          )}
        />

        {!patientId ? (
          loading ? <Spinner /> : rows.length === 0 ? <EmptyState message={settled ? 'No credit sales yet.' : 'No patient owes anything.'} /> : (
            <div className="ph-wrap">
              <table className="ph-table min-w-[820px]">
                <colgroup><col className="w-[25%]" /><col className="w-[13%]" /><col className="w-[9%]" /><col className="w-[12%]" /><col className="w-[11%]" /><col className="w-[11%]" /><col className="w-[11%]" /><col className="w-[8%]" /></colgroup>
                <thead>
                  <tr>
                    <th>Patient</th><th className="ph-mid">Mobile</th><th className="ph-num">Credit Bills</th><th className="ph-num">Due</th>
                    <th className="ph-num">Returns</th><th className="ph-num">Paid</th><th className="ph-num">Balance</th><th className="ph-mid">Last Bill</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.PatientId} className="cursor-pointer" title="Open the ledger" onClick={() => pick(String(r.PatientId))}>
                      <td className="truncate font-medium text-ink-800">{r.Name} <span className="text-ink-400">#{r.PatientId}</span></td>
                      <td className="ph-mid">{r.MobileNo || '-'}</td>
                      <td className="ph-num">{r.Bills}</td>
                      <td className="ph-num">{money(r.Due)}</td>
                      <td className="ph-num text-emerald-700">{r.Returns ? money(r.Returns) : '-'}</td>
                      <td className="ph-num text-emerald-700">{r.Paid ? money(r.Paid) : '-'}</td>
                      <td className={`ph-num font-semibold ${r.Balance > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{money(r.Balance)}</td>
                      <td className="ph-mid">{r.LastBill ? dateLabel(r.LastBill) : '-'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="text-right" colSpan={3}>Total ({rows.length})</td>
                    <td className="ph-num">{money(totals.Due)}</td><td className="ph-num">{money(totals.Returns)}</td>
                    <td className="ph-num">{money(totals.Paid)}</td><td className="ph-num">{money(totals.Balance)}</td><td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )
        ) : !ledger ? <Spinner /> : (
          <>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg bg-ink-50 px-3 py-2 text-sm">
              <span><span className="text-ink-500">Patient:</span> <b>{ledger.Name}</b> <span className="text-ink-400">#{ledger.PatientId}</span></span>
              {ledger.MobileNo && <span><span className="text-ink-500">Mobile:</span> {ledger.MobileNo}</span>}
              <span className={`ml-auto rounded px-2 py-0.5 font-semibold ${ledger.Balance > 0 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'}`}>
                Balance ₹{money(ledger.Balance)}
              </span>
            </div>

            {ledger.Balance > 0 && (
              <form onSubmit={receive} className="mt-3 rounded-lg border border-ink-200 p-3">
                <h4 className="mb-2 text-sm font-bold text-ink-800">Receive payment</h4>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1.2fr)_minmax(0,1.6fr)_auto] lg:items-end">
                  <div><label className="label">Date *</label><input type="date" className="input" max={today()} value={pay.payDate} onChange={set('payDate')} /></div>
                  <div>
                    <label className="label">Amount *</label>
                    <input
                      type="number" min="0" step="0.01" autoFocus className={`input no-spin text-right ${payProblem ? 'border-red-400 bg-red-50 text-red-700' : ''}`}
                      value={pay.amount} onChange={set('amount')} placeholder={money(ledger.Balance)}
                    />
                  </div>
                  <div>
                    <label className="label">Payment Mode *</label>
                    <select className="input" value={pay.payMode} onChange={set('payMode')}>{PAY_MODES.map((m) => <option key={m} value={m}>{m}</option>)}</select>
                  </div>
                  <div>
                    <label className="label">{pay.payMode === 'Cheque' ? 'Cheque No' : 'Reference No'}{refNeeded ? ' *' : ''}</label>
                    <input className="input" maxLength={50} value={pay.referenceNo} onChange={set('referenceNo')} placeholder={pay.payMode === 'UPI' || pay.payMode === 'Bank Transfer' ? 'UTR / Txn ID' : ''} />
                  </div>
                  <div><label className="label">Notes</label><input className="input" maxLength={300} value={pay.notes} onChange={set('notes')} /></div>
                  <button type="submit" className="btn-primary justify-center" disabled={saving || !!payProblem}><Save size={16} /> {saving ? 'Saving...' : 'Receive'}</button>
                </div>
                {payProblem && <p className="mt-1 text-xs text-red-600">{payProblem}</p>}
              </form>
            )}

            <h4 className="mb-1 mt-3 text-sm font-bold text-ink-800">Ledger</h4>
            {ledger.entries.length === 0 ? <EmptyState message="No credit entries." /> : (
              <div className="ph-wrap">
                <table className="ph-table min-w-[820px]">
                  <colgroup><col className="w-[10%]" /><col className="w-[9%]" /><col className="w-[11%]" /><col className="w-[26%]" /><col className="w-[11%]" /><col className="w-[11%]" /><col className="w-[12%]" /><col className="w-[10%]" /></colgroup>
                  <thead>
                    <tr>
                      <th className="ph-mid">Date</th><th className="ph-mid">Type</th><th className="ph-mid">No</th><th>Details</th>
                      <th className="ph-num">Debit</th><th className="ph-num">Credit</th><th className="ph-num">Balance</th><th className="ph-mid">{isAdmin ? 'By / Delete' : 'By'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.entries.map((e) => {
                      const tone = e.Type === 'Bill' ? 'bg-amber-100 text-amber-800' : e.Type === 'Return' ? 'bg-sky-100 text-sky-800' : 'bg-emerald-100 text-emerald-700';
                      const details = e.Type === 'Bill'
                        ? `Bill ₹${money(e.BillTotal)}${Number(e.PaidNow) > 0 ? `, paid ₹${money(e.PaidNow)} (${e.Mode})` : ''}, rest on credit`
                        : e.Type === 'Return' ? `Return of ${e.Reference} adjusted in credit`
                          : [e.Mode, e.Reference, e.Notes].filter(Boolean).join(' · ');
                      return (
                        <tr key={`${e.Type}-${e.DocId}`} className={e.Type !== 'Payment' ? 'cursor-pointer' : ''} onClick={() => openDoc(e)}>
                          <td className="ph-mid">{dateLabel(e.DocDate)}</td>
                          <td className="ph-mid"><span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${tone}`}>{e.Type}</span></td>
                          <td className="ph-mid font-medium text-brand-700">{e.DocNo}</td>
                          <td className="truncate text-ink-600" title={details}>{details}</td>
                          <td className="ph-num">{e.Debit ? money(e.Debit) : ''}</td>
                          <td className="ph-num text-emerald-700">{e.Credit ? money(e.Credit) : ''}</td>
                          <td className="ph-num font-semibold">{money(e.Balance)}</td>
                          <td className="ph-mid">
                            <span className="inline-flex items-center gap-1">
                              <span className="truncate text-ink-500">{e.CreatedBy || ''}</span>
                              {isAdmin && e.Type === 'Payment' && (
                                <button type="button" className="ph-icon-del" title="Delete payment (Admin only)" onClick={(ev) => { ev.stopPropagation(); removePayment(e); }}><Trash2 size={13} /></button>
                              )}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
      <Toast toast={toast} />
    </div>
  );
}
