import { useState, useEffect } from 'react';
import { Printer, Calendar, Save, FileText } from 'lucide-react';
import { PageHeader, CardHeader, Spinner, EmptyState, Toast } from '../../components/ui.jsx';
import { PrescriptionHeader, PrescriptionFooter, PrescriptionPageSize } from '../../components/PrescriptionLetterhead.jsx';
import LetterPadBoundView from '../../components/LetterPadBoundView.jsx';
import { useToast } from '../../hooks/useToast.js';
import { billingApi, clinicApi, employeeApi, prescriptionApi, vitalApi } from '../../api/client.js';

const todayStr = () => new Date().toISOString().slice(0, 10);
const fmtTime = (d) => (d ? new Date(d).toLocaleString() : '-');
const fmtMoney = (n) => `₹${Number(n || 0).toFixed(2)}`;
const dateKey = (d) => (d ? new Date(d).toISOString().slice(0, 10) : 'unknown');

const statusTone = {
  Confirm: 'bg-slate-100 text-slate-600',
  'Pre-Examine': 'bg-amber-100 text-amber-700',
  Examine: 'bg-brand-100 text-brand-700',
  Billing: 'bg-emerald-100 text-emerald-700',
  Completed: 'bg-teal-100 text-teal-800',
};

export default function BillingPatientBill() {
  const { toast, show } = useToast();
  const [date, setDate] = useState(todayStr());
  const [data, setData] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [clinic, setClinic] = useState(null);
  const [letterPadFields, setLetterPadFields] = useState([]);
  const [printPatient, setPrintPatient] = useState(null);
  const [printRx, setPrintRx] = useState(null);
  const [printingRxId, setPrintingRxId] = useState(null);
  const [defaultDoctorFee, setDefaultDoctorFee] = useState(0);

  useEffect(() => {
    clinicApi.get()
      .then((c) => {
        setClinic(c);
        try { setLetterPadFields(c?.LetterPadFields ? JSON.parse(c.LetterPadFields) : []); } catch { setLetterPadFields([]); }
      })
      .catch(() => setClinic(null));
  }, []);

  // load() takes an explicit fee (falling back to state) so the very first
  // call — fired before the doctors fetch below has resolved — still uses
  // the freshly-resolved value instead of a stale closure over the initial 0.
  const load = async (d, feeOverride) => {
    const fee = feeOverride !== undefined ? feeOverride : defaultDoctorFee;
    setLoading(true);
    try {
      const res = await billingApi.patients(d);
      setData(res);
      setRows(res.rows.map((r) => ({
        ...r,
        doctorFeesInput: String(r.billId ? r.doctorFees : (fee || r.doctorFees || '')),
        extraFeesInput: String(r.extraFees || ''),
      })));
    } catch (err) {
      show(err.response?.data?.error || 'Failed to load patient bill', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Primary doctor = lowest EmployeeId among EmpType='Doctor'. Its fee
  // pre-fills Doctor Fees for a patient who hasn't been billed yet today.
  useEffect(() => {
    employeeApi.list().then((emps) => {
      const doctors = emps.filter((e) => e.EmpType === 'Doctor').sort((a, b) => a.EmployeeId - b.EmployeeId);
      const fee = doctors.length ? Number(doctors[0].DoctorFee || 0) : 0;
      setDefaultDoctorFee(fee);
      load(date, fee);
    }).catch(() => load(date, 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onDateChange = (e) => {
    const d = e.target.value;
    setDate(d);
    if (d) load(d);
  };

  const updateRow = (patientId, key, value) =>
    setRows((arr) => arr.map((r) => (r.patientId === patientId ? { ...r, [key]: value } : r)));

  const saveRow = async (row) => {
    setSavingId(row.patientId);
    try {
      await billingApi.saveFees(row.patientId, {
        date,
        doctorFees: Number(row.doctorFeesInput) || 0,
        extraFees: Number(row.extraFeesInput) || 0,
        notes: row.notes || '',
      });
      show(`Saved fees for ${row.name}`, 'success');
      load(date);
    } catch (err) {
      show(err.response?.data?.error || 'Save failed', 'error');
    } finally {
      setSavingId(null);
    }
  };

  // Print a single patient's bill (with clinic letterhead) instead of the whole list.
  useEffect(() => {
    if (!printPatient) return;
    const t = setTimeout(() => window.print(), 50);
    return () => clearTimeout(t);
  }, [printPatient]);
  useEffect(() => {
    if (!printRx) return;
    const t = setTimeout(() => window.print(), 50);
    return () => clearTimeout(t);
  }, [printRx]);
  useEffect(() => {
    const onAfterPrint = () => { setPrintPatient(null); setPrintRx(null); };
    window.addEventListener('afterprint', onAfterPrint);
    return () => window.removeEventListener('afterprint', onAfterPrint);
  }, []);

  // Print that day's prescription for a patient on the clinic's saved Letter
  // Pad template (Coming Up's -> Prescription for Your Letter Pad), so this
  // print matches whatever letterhead layout was built there.
  const printPrescriptionFor = async (row) => {
    if (!clinic?.PrescriptionAttachment) {
      show("No Letter Pad template configured. Set it up under Coming Up's -> Prescription for Your Letter Pad.", 'error');
      return;
    }
    setPrintingRxId(row.patientId);
    try {
      const [history, vitals] = await Promise.all([
        prescriptionApi.history(row.patientId),
        vitalApi.list({ patientId: row.patientId, date }).catch(() => []),
      ]);
      const rx = history?.prescriptions?.find((p) => dateKey(p.CreatedAt) === date);
      if (!rx) {
        show(`No prescription found for ${row.name} on this date`, 'error');
        return;
      }
      setPrintRx({
        patient: { PatientId: row.patientId, PatientName: row.name, MobileNo: row.mobileNo },
        meds: rx.items || [],
        vitals: vitals?.[0] || null,
        age: row.age,
      });
    } catch (err) {
      show(err.response?.data?.error || 'Failed to load prescription', 'error');
    } finally {
      setPrintingRxId(null);
    }
  };

  const totalDoctorFees = rows.reduce((sum, r) => sum + (Number(r.doctorFeesInput) || 0), 0);
  const totalExtraFees = rows.reduce((sum, r) => sum + (Number(r.extraFeesInput) || 0), 0);
  const grandTotal = totalDoctorFees + totalExtraFees;

  return (
    <div>
      <PageHeader
        title="Billing - Patient Bill"
        actions={data && (
          <button className="btn-secondary no-print" onClick={() => window.print()}>
            <Printer size={16} /> Print List
          </button>
        )}
      />

      <div className="card no-print">
        <CardHeader icon={Calendar} title="Select Date" subtitle="Defaults to today" />
        <div className="max-w-xs">
          <label className="label">Date</label>
          <input type="date" className="input" value={date} onChange={onDateChange} />
        </div>
      </div>

      {loading ? (
        <div className="mt-5 no-print"><Spinner /></div>
      ) : data && (
        <div className={`card mt-5 ${(printPatient || printRx) ? 'no-print' : ''}`}>
          <p className="no-print mb-3 text-sm font-semibold text-slate-700">{new Date(`${date}T00:00:00`).toLocaleDateString()}</p>
          {rows.length === 0 ? (
            <EmptyState message="No patient visits found for this date." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="table-head">
                    <th className="rounded-l-lg px-3 py-3">Token</th>
                    <th className="px-3 py-3">Patient</th>
                    <th className="px-3 py-3">Mobile</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3 text-right">Doctor Fees</th>
                    <th className="px-3 py-3 text-right">Medical Fee</th>
                    <th className="px-3 py-3 text-right">Total</th>
                    <th className="no-print rounded-r-lg px-3 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const total = (Number(r.doctorFeesInput) || 0) + (Number(r.extraFeesInput) || 0);
                    return (
                      <tr key={r.patientId} className="table-row">
                        <td className="px-3 py-3">
                          <span className="inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-lg bg-brand-gradient px-2 text-xs font-bold text-white">
                            {r.tokenNo ?? '-'}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <p className="font-medium text-slate-700">{r.name}</p>
                          <p className="text-xs text-slate-400">{fmtTime(r.confirmedAt)}</p>
                        </td>
                        <td className="px-3 py-3 text-slate-500">{r.mobileNo || '-'}</td>
                        <td className="px-3 py-3"><span className={`badge ${statusTone[r.status] || 'bg-slate-100 text-slate-600'}`}>{r.status}</span></td>
                        <td className="px-3 py-3 text-right">
                          <input
                            type="number" min="0" step="0.01"
                            className="input w-24 py-1.5 text-right"
                            value={r.doctorFeesInput}
                            onChange={(e) => updateRow(r.patientId, 'doctorFeesInput', e.target.value)}
                            placeholder="0.00"
                          />
                        </td>
                        <td className="px-3 py-3 text-right">
                          <input
                            type="number" min="0" step="0.01"
                            className="input w-24 py-1.5 text-right"
                            value={r.extraFeesInput}
                            onChange={(e) => updateRow(r.patientId, 'extraFeesInput', e.target.value)}
                            placeholder="0.00"
                          />
                        </td>
                        <td className="px-3 py-3 text-right font-semibold text-slate-800">{fmtMoney(total)}</td>
                        <td className="no-print px-3 py-3">
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              className="btn-ghost px-2 py-1.5 text-brand-600 hover:bg-brand-50"
                              onClick={() => saveRow(r)}
                              disabled={savingId === r.patientId}
                              title="Save Doctor Fees / Medical Fee"
                            >
                              <Save size={15} />
                            </button>
                            <button
                              type="button"
                              className="btn-ghost px-2 py-1.5 text-teal-600 hover:bg-teal-50"
                              onClick={() => setPrintPatient(r)}
                              title="Print this patient's bill"
                            >
                              <Printer size={15} />
                            </button>
                            <button
                              type="button"
                              className="btn-ghost px-2 py-1.5 text-violet-600 hover:bg-violet-50"
                              onClick={() => printPrescriptionFor(r)}
                              disabled={printingRxId === r.patientId}
                              title="Print this patient's prescription"
                            >
                              <FileText size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-ink-200 text-sm font-semibold text-slate-800">
                    <td className="px-3 py-3" colSpan={4}>Total ({rows.length} patients)</td>
                    <td className="px-3 py-3 text-right">{fmtMoney(totalDoctorFees)}</td>
                    <td className="px-3 py-3 text-right">{fmtMoney(totalExtraFees)}</td>
                    <td className="px-3 py-3 text-right">{fmtMoney(grandTotal)}</td>
                    <td className="no-print px-3 py-3"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <p className="no-print mt-4 text-xs text-ink-400">
            Doctor Fees defaults from the registered Doctor Fee until saved, and Medical Fee is entered per patient — adjust either and save with the button on each row.
            Use the print icon on a row to print that patient's bill on its own, with the clinic letterhead.
          </p>
        </div>
      )}

      {printPatient && (
        <div className="hidden print:block">
          <PrescriptionPageSize height={clinic?.PageHeight} width={clinic?.PageWidth} />
          <div className="print-prescription card">
            <PrescriptionHeader
              doctorName={clinic?.DoctorName}
              clinicName={clinic?.Name}
              email={clinic?.Email}
              contactNo={clinic?.ContactNo}
              address={clinic?.Address}
              logo={clinic?.Logo}
            />

            <div className="grid grid-cols-1 gap-2 border-b border-ink-100 py-4 text-sm sm:grid-cols-2">
              <p><span className="font-semibold">Patient Name:</span> {printPatient.name}</p>
              <p className="text-right"><span className="font-semibold">Token No:</span> {printPatient.tokenNo ?? '-'}</p>
              <p><span className="font-semibold">Age:</span> {printPatient.age ?? '-'}</p>
              <p className="text-right"><span className="font-semibold">Date:</span> {new Date(`${date}T00:00:00`).toLocaleDateString()}</p>
            </div>

            <div className="py-4">
              <h2 className="font-semibold text-ink-800">Bill Details</h2>
              <table className="mt-3 w-full border-collapse text-left text-sm">
                <tbody>
                  <tr className="border-b border-ink-100">
                    <td className="py-2">Doctor Fees</td>
                    <td className="py-2 text-right">{fmtMoney(printPatient.doctorFeesInput)}</td>
                  </tr>
                  <tr className="border-b border-ink-100">
                    <td className="py-2">Medical Fee</td>
                    <td className="py-2 text-right">{fmtMoney(printPatient.extraFeesInput)}</td>
                  </tr>
                  <tr className="text-base font-semibold text-ink-800">
                    <td className="py-2">Total</td>
                    <td className="py-2 text-right">
                      {fmtMoney((Number(printPatient.doctorFeesInput) || 0) + (Number(printPatient.extraFeesInput) || 0))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <PrescriptionFooter clinicName={clinic?.Name} address={clinic?.Address} contactNo={clinic?.ContactNo} />
          </div>
        </div>
      )}

      {printRx && (
        <div className="hidden print:block">
          <LetterPadBoundView
            imageData={clinic?.PrescriptionAttachment}
            pageHeight={clinic?.AttachmentHeight}
            pageWidth={clinic?.AttachmentWidth}
            fields={letterPadFields}
            patient={printRx.patient}
            vitals={printRx.vitals}
            meds={printRx.meds}
            age={printRx.age}
          />
        </div>
      )}

      <Toast toast={toast} />
    </div>
  );
}
