import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { Save, Plus, Trash2, History, Activity, Pill, ClipboardList, ChevronRight, ArrowLeft, Search, CheckCircle2, Pencil, Printer, MessageCircle, Paperclip, Eye, Download, TestTube } from 'lucide-react';
import { PageHeader, Toast, Spinner, EmptyState, CardHeader } from '../../components/ui.jsx';
import LetterPadBoundView from '../../components/LetterPadBoundView.jsx';
import DocumentPreviewModal from '../../components/DocumentPreviewModal.jsx';
import PatientPicker from '../../components/PatientPicker.jsx';
import SearchSelect from '../../components/SearchSelect.jsx';
import { useToast } from '../../hooks/useToast.js';
import { prescriptionApi, medicationApi, confirmApi, clinicApi, patientApi, patientDocumentApi, labTestApi } from '../../api/client.js';

// Timing options with short labels (shown) + full names (tooltip / stored).
const TIMINGS = [
  { full: 'Morning', short: 'M' },
  { full: 'Afternoon', short: 'A' },
  { full: 'Evening', short: 'E' },
  { full: 'Night', short: 'N' },
];
const FOOD = ['AF', 'BF']; // AF = After Food, BF = Before Food
const emptyItem = { medicineName: '', timing: [], food: [], days: '' };
// M/A/E/N -> "1-0-0-1" style code for the printed prescription table.
const timingToCode = (timing) => TIMINGS.map((t) => (timing.includes(t.full) ? '1' : '0')).join('-');
const fmt = (d) => (d ? new Date(d).toLocaleString() : '-');
const fmtTime = (d) => (d ? new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-');
const dateKey = (d) => (d ? new Date(d).toISOString().slice(0, 10) : 'unknown');
const dateLabel = (key) => (key === 'unknown' ? 'Unknown date' : new Date(`${key}T00:00:00`).toLocaleDateString());
const currentDateKey = () => new Date().toISOString().slice(0, 10);
const vitalTone = (value, type) => {
  const number = Number(value);
  const attention = type === 'pulse' ? number < 60 || number > 100 : type === 'temperature' ? number < 36.1 || number > 37.2 : false;
  return attention ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-100 bg-emerald-50 text-emerald-800';
};

export default function Prescription() {
  const location = useLocation();
  const { toast, show } = useToast();
  const [selected, setSelected] = useState(location.state?.patient || null);
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState([{ ...emptyItem }]);
  const [nextVisitDate, setNextVisitDate] = useState('');
  const [meds, setMeds] = useState([]);
  const [labTests, setLabTests] = useState([]);
  const [selectedTestIds, setSelectedTestIds] = useState([]);
  const [showLabTests, setShowLabTests] = useState(false);
  const [clinic, setClinic] = useState(null);
  const [letterPadFields, setLetterPadFields] = useState([]);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState(null);
  const [editingPrescription, setEditingPrescription] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [patientAge, setPatientAge] = useState(null);
  const [docs, setDocs] = useState([]);
  const [previewDoc, setPreviewDoc] = useState(null);
  const [sending, setSending] = useState(false);

  // Two lists for today: vital-completed (Pre-Examine) and examine-completed (Billing).
  const [readyList, setReadyList] = useState([]);
  const [doneList, setDoneList] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [readySearch, setReadySearch] = useState('');
  const [doneSearch, setDoneSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => { medicationApi.list().then(setMeds).catch(() => setMeds([])); }, []);
  useEffect(() => { labTestApi.list().then((rows) => setLabTests(rows.filter((r) => r.IsActive))).catch(() => setLabTests([])); }, []);
  useEffect(() => {
    clinicApi.get()
      .then((c) => {
        setClinic(c);
        try { setLetterPadFields(c?.LetterPadFields ? JSON.parse(c.LetterPadFields) : []); } catch { setLetterPadFields([]); }
      })
      .catch(() => setClinic(null));
  }, []);

  const loadReadyList = useCallback(() => {
    setLoadingList(true);
    Promise.all([
      confirmApi.list(undefined, 'Pre-Examine').catch(() => []),
      confirmApi.list(undefined, 'Examine').catch(() => []),
      confirmApi.list(undefined, 'Billing').catch(() => []),
    ])
      .then(([preExamine, examine, done]) => {
        const ready = [...preExamine, ...examine].sort((a, b) => (a.TokenNo || 0) - (b.TokenNo || 0));
        setReadyList(ready);
        setDoneList(done);
      })
      .finally(() => setLoadingList(false));
  }, []);

  useEffect(() => { loadReadyList(); }, [loadReadyList]);

  const filterRows = (rows, q) => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter(
      (r) =>
        (r.PatientName || '').toLowerCase().includes(t) ||
        (r.MobileNo || '').toLowerCase().includes(t) ||
        String(r.TokenNo || '').includes(t)
    );
  };

  // Opening a patient only selects them; status changes when the prescription is saved.
  const pickFromList = (r) => {
    setSelected({ PatientId: r.PatientId, Name: r.PatientName, MobileNo: r.MobileNo, Address: r.Address });
  };

  // autoEditToday: when opening a patient who already has a prescription started today,
  // load it into the form by default instead of leaving it blank.
  const loadHistory = useCallback((patientId, { autoEditToday = false } = {}) => {
    setLoadingHistory(true);
    prescriptionApi.history(patientId)
      .then((data) => {
        setHistory(data);
        if (autoEditToday) {
          const todays = data.prescriptions?.find((p) => dateKey(p.CreatedAt) === currentDateKey());
          if (todays) editPrescription(todays);
          else { setEditingPrescription(null); setNotes(''); setItems([{ ...emptyItem }]); setNextVisitDate(''); setSelectedTestIds([]); setShowLabTests(false); }
        }
      })
      .catch(() => setHistory(null))
      .finally(() => setLoadingHistory(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selected) loadHistory(selected.PatientId, { autoEditToday: true });
    else setHistory(null);
  }, [selected, loadHistory]);

  useEffect(() => {
    if (!selected) return setPatientAge(null);
    patientApi.get(selected.PatientId).then((p) => setPatientAge(p.Age)).catch(() => setPatientAge(null));
  }, [selected]);

  // Attachments (lab reports/scans from Vital Sign) — shown per-date
  // alongside that same date's vitals/prescriptions in Patient History below.
  useEffect(() => {
    if (!selected) return setDocs([]);
    patientDocumentApi.list(selected.PatientId).then(setDocs).catch(() => setDocs([]));
  }, [selected]);

  const updateItem = (i, k, v) => setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, [k]: v } : it)));
  const toggleInItem = (i, key, value) =>
    setItems((arr) =>
      arr.map((it, idx) => {
        if (idx !== i) return it;
        const list = it[key];
        return { ...it, [key]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value] };
      })
    );
  // AF/BF is either-or per medicine, so picking one clears the other instead of toggling independently.
  const setExclusiveInItem = (i, key, value) =>
    setItems((arr) =>
      arr.map((it, idx) => (idx === i ? { ...it, [key]: it[key].includes(value) ? [] : [value] } : it))
    );
  const addItem = () => setItems((arr) => [...arr, { ...emptyItem }]);
  const removeItem = (i) => setItems((arr) => arr.filter((_, idx) => idx !== i));

  const editPrescription = (prescription) => {
    setEditingPrescription(prescription);
    setNotes(prescription.Notes || '');
    setItems(prescription.items?.length ? prescription.items.map((item) => ({
      medicineName: item.MedicineName || '',
      timing: item.Frequency ? item.Frequency.split(',').map((value) => value.trim()).filter(Boolean) : [],
      food: item.Instructions ? item.Instructions.split(',').map((value) => value.trim()).filter((value) => FOOD.includes(value)) : [],
      days: item.Duration?.match(/\d+/)?.[0] || '',
    })) : [{ ...emptyItem }]);
    setNextVisitDate(prescription.NextVisitDate ? prescription.NextVisitDate.slice(0, 10) : '');
    const testIds = prescription.labTests?.map((t) => t.TestId) || [];
    setSelectedTestIds(testIds);
    setShowLabTests(testIds.length > 0);
  };

  const toggleTest = (testId) =>
    setSelectedTestIds((ids) => (ids.includes(testId) ? ids.filter((id) => id !== testId) : [...ids, testId]));
  const toggleShowLabTests = (checked) => {
    setShowLabTests(checked);
    if (!checked) setSelectedTestIds([]);
  };
  const selectedTestNames = labTests.filter((t) => selectedTestIds.includes(t.TestId)).map((t) => t.TestName);

  // Letter Pad print uses the same Frequency/Instructions/Duration shape the
  // form saves to the server, built from the in-progress (not-yet-saved) rows
  // so Print always reflects exactly what's on screen.
  const printMeds = items
    .filter((it) => it.medicineName.trim())
    .map((it) => ({
      MedicineName: it.medicineName.trim(),
      Frequency: it.timing.join(', '),
      Instructions: it.food.join(', '),
      Duration: it.days ? `${it.days} day(s)` : '',
    }));
  const todaysVitals = history?.vitals?.find((v) => dateKey(v.RecordedAt) === currentDateKey()) || null;

  const printPrescription = () => {
    if (!clinic?.PrescriptionAttachment) {
      return show("No Letter Pad template configured. Set it up under Coming Up's -> Prescription for Your Letter Pad.", 'error');
    }
    window.print();
  };

  const deletePrescription = async (prescription) => {
    if (!confirm('Delete this prescription and its notes?')) return;
    try {
      await prescriptionApi.remove(prescription.PrescriptionId);
      show('Prescription deleted', 'success');
      loadHistory(selected.PatientId);
    } catch (err) {
      show(err.response?.data?.error || 'Delete failed', 'error');
    }
  };

  const submit = async (e, complete = false) => {
    e.preventDefault();
    if (!selected) return show('Select a patient first', 'error');

    // Every medicine row that has a name filled in must have its timing,
    // AF/BF and Days set too — a medicine can't be half-specified.
    for (const it of items) {
      if (!it.medicineName.trim()) continue;
      if (!it.timing.length) return show(`${it.medicineName}: select at least one timing (M/A/E/N)`, 'error');
      if (!it.food.length) return show(`${it.medicineName}: select AF or BF`, 'error');
      if (!it.days) return show(`${it.medicineName}: enter Days`, 'error');
    }

    setSaving(true);
    try {
      // Map timing checkboxes -> Frequency, food checkboxes -> Instructions.
      const payloadItems = items
        .filter((it) => it.medicineName.trim())
        .map((it) => ({
          medicineName: it.medicineName.trim(),
          frequency: it.timing.join(', '),
          instructions: it.food.join(', '),
          duration: it.days ? `${it.days} day(s)` : '',
        }));
      if (editingPrescription) {
        await prescriptionApi.update(editingPrescription.PrescriptionId, { notes, items: payloadItems, complete, nextVisitDate: nextVisitDate || null, labTestIds: selectedTestIds });
      } else {
        await prescriptionApi.create({ patientId: selected.PatientId, notes, items: payloadItems, complete, nextVisitDate: nextVisitDate || null, labTestIds: selectedTestIds });
      }
      show(complete ? 'Prescription completed' : editingPrescription ? 'Prescription updated' : 'Prescription saved', 'success');

      setNotes(''); setItems([{ ...emptyItem }]); setNextVisitDate(''); setSelectedTestIds([]); setShowLabTests(false);
      setEditingPrescription(null);
      if (complete) setSelected(null);
      loadReadyList();
      if (selected && !complete) loadHistory(selected.PatientId);
    } catch (err) {
      show(err.response?.data?.error || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Assumes a 10-digit number is Indian (+91) since no country-code field
  // exists on the patient record.
  const normalizeMobile = (raw) => {
    const digits = (raw || '').replace(/\D/g, '');
    if (!digits) return '';
    return digits.length === 10 ? `91${digits}` : digits;
  };

  const buildWhatsAppMessage = () => {
    const medLines = items
      .filter((it) => it.medicineName.trim())
      .map((it) => `- ${it.medicineName.trim()} (${timingToCode(it.timing)}, ${it.food[0] || '-'}, ${it.days ? `${it.days} day(s)` : '-'})`)
      .join('\n');

    return [
      `${clinic?.Name || 'Clinic'} - Prescription`,
      clinic?.DoctorName || null,
      `Patient: ${selected.Name}${patientAge ? ` (Age ${patientAge})` : ''}`,
      `Date: ${new Date().toLocaleDateString()}`,
      '',
      medLines || 'No medicines added yet.',
      notes ? `\nNotes: ${notes}` : null,
      clinic?.ContactNo ? `\nClinic Contact: ${clinic.ContactNo}` : null,
    ].filter(Boolean).join('\n');
  };

  // Builds the prescription PDF and hands it to the OS share sheet (WhatsApp
  // included) via the Web Share API — the only browser-native way to actually
  // attach a file to a chat, since WhatsApp's wa.me links only pre-fill text.
  // Falls back to downloading the PDF + opening a pre-filled WhatsApp chat on
  // browsers/devices that can't share files (e.g. most desktop browsers).
  const sendWhatsApp = async () => {
    if (!selected) return show('Select a patient first', 'error');
    const mobile = normalizeMobile(selected.MobileNo);
    if (!mobile) return show('This patient has no mobile number on file', 'error');
    if (!items.some((it) => it.medicineName.trim())) return show('Add at least one medicine first', 'error');

    setSending(true);
    try {
      const { buildPrescriptionPdf } = await import('../../utils/prescriptionPdf.jsx');
      const today = new Date().toISOString().slice(0, 10);
      const pdfBlob = await buildPrescriptionPdf({
        clinic, patient: selected, patientAge, items, notes, date: new Date().toLocaleString(), nextVisitDate, labTestNames: selectedTestNames,
      });
      const fileName = `Prescription-${selected.Name}-${today}.pdf`;
      const file = new File([pdfBlob], fileName, { type: 'application/pdf' });
      const message = buildWhatsAppMessage();

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: fileName, text: message });
        show('Prescription sent', 'success');
      } else {
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        window.open(`https://wa.me/${mobile}?text=${encodeURIComponent(message)}`, '_blank');
        show('PDF downloaded — attach it in the WhatsApp chat that just opened (this browser can\'t share files directly)', 'success');
      }
    } catch (err) {
      if (err?.name !== 'AbortError') show(err.message || 'Failed to send prescription', 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <PageHeader title="Doctor's" />

      <div className="space-y-5">
        {!selected ? (
          showSearch ? (
            <div className="space-y-3">
              <button className="btn-ghost" onClick={() => setShowSearch(false)}>
                <ArrowLeft size={16} /> Back to lists
              </button>
              <PatientPicker selected={selected} onSelect={setSelected} />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              {/* LEFT: Vital Completed (ready for the doctor) */}
              <div className="card">
                <CardHeader
                  icon={ClipboardList}
                  title="Vital Completed"
                  subtitle="Today — ready for examination"
                  actions={
                    <button className="btn-secondary" onClick={() => setShowSearch(true)}>Search patient</button>
                  }
                />
                <div className="relative mb-3">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                  <input className="input pl-9" placeholder="Search name, mobile or token..." value={readySearch} onChange={(e) => setReadySearch(e.target.value)} />
                </div>
                {loadingList ? (
                  <Spinner />
                ) : filterRows(readyList, readySearch).length === 0 ? (
                  <EmptyState message="No vital-completed patients." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="table-head">
                          <th className="rounded-l-lg px-3 py-3">Token</th>
                          <th className="px-3 py-3">Patient</th>
                          <th className="px-3 py-3">Time</th>
                          <th className="px-3 py-3">Status</th>
                          <th className="rounded-r-lg px-3 py-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filterRows(readyList, readySearch).map((r) => (
                          <tr key={r.ConfirmId} className="table-row cursor-pointer" onClick={() => pickFromList(r)}>
                            <td className="px-3 py-3">
                              <span className="inline-flex h-8 min-w-[2rem] items-center justify-center rounded-lg bg-brand-gradient px-2 text-sm font-bold text-white">
                                {r.TokenNo ?? '-'}
                              </span>
                            </td>
                            <td className="px-3 py-3">
                              <p className="font-medium text-slate-700">{r.PatientName}</p>
                              <p className="text-xs text-slate-400">{r.MobileNo || '-'} · ID #{r.PatientId}</p>
                            </td>
                            <td className="px-3 py-3 text-slate-500">{fmtTime(r.ConfirmedAt)}</td>
                            <td className="px-3 py-3">
                              <span className="badge bg-amber-100 text-amber-700">Examine</span>
                            </td>
                            <td className="px-3 py-3 text-right">
                              <button className="btn-primary py-1.5" onClick={(e) => { e.stopPropagation(); pickFromList(r); }}>
                                Examine <ChevronRight size={15} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* RIGHT: Billing (examination finished, sent to billing) */}
              <div className="card">
                <CardHeader
                  icon={CheckCircle2}
                  title="Billing"
                  subtitle="Today — examination finished, ready for billing"
                />
                <div className="relative mb-3">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                  <input className="input pl-9" placeholder="Search name, mobile or token..." value={doneSearch} onChange={(e) => setDoneSearch(e.target.value)} />
                </div>
                {loadingList ? (
                  <Spinner />
                ) : filterRows(doneList, doneSearch).length === 0 ? (
                  <EmptyState message="No patients sent to billing yet." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="table-head">
                          <th className="rounded-l-lg px-3 py-3">Token</th>
                          <th className="px-3 py-3">Patient</th>
                          <th className="px-3 py-3">Time</th>
                          <th className="rounded-r-lg px-3 py-3 text-right">View</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filterRows(doneList, doneSearch).map((r) => (
                          <tr key={r.ConfirmId} className="table-row cursor-pointer" onClick={() => pickFromList(r)}>
                            <td className="px-3 py-3">
                              <span className="inline-flex h-8 min-w-[2rem] items-center justify-center rounded-lg bg-emerald-500 px-2 text-sm font-bold text-white">
                                {r.TokenNo ?? '-'}
                              </span>
                            </td>
                            <td className="px-3 py-3">
                              <p className="font-medium text-slate-700">{r.PatientName}</p>
                              <p className="text-xs text-slate-400">{r.MobileNo || '-'} · ID #{r.PatientId}</p>
                            </td>
                            <td className="px-3 py-3 text-slate-500">{fmtTime(r.ConfirmedAt)}</td>
                            <td className="px-3 py-3 text-right">
                              <button className="btn-secondary py-1.5" onClick={(e) => { e.stopPropagation(); pickFromList(r); }}>
                                Open <ChevronRight size={15} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )
        ) : (
          <>
            <div className="no-print flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-brand-800">{selected.Name}</p>
                <p className="text-xs text-brand-600">{selected.MobileNo || 'No mobile'} · ID #{selected.PatientId}</p>
              </div>
              <button className="btn-secondary" onClick={() => setSelected(null)}>
                <ArrowLeft size={16} /> Change patient
              </button>
            </div>

            {history?.vitals.filter((v) => dateKey(v.RecordedAt) === currentDateKey()).length > 0 && (
              <div className="no-print rounded-md border border-brand-100 bg-white px-3 py-2">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-brand-600">Current Vital Signs</p>
                <div className="flex flex-wrap gap-1.5 text-xs">
                  {history.vitals.filter((v) => dateKey(v.RecordedAt) === currentDateKey()).map((v) => (
                    <div key={v.VitalId} className="flex flex-wrap gap-1.5">
                      <span className="rounded bg-slate-100 px-2 py-1 text-slate-600">Ht {v.Height ?? '-'} cm</span>
                      <span className="rounded bg-slate-100 px-2 py-1 text-slate-600">Wt {v.Weight ?? '-'} kg</span>
                      <span className="rounded bg-slate-100 px-2 py-1 text-slate-600">BP {v.BloodPressure || '-'}</span>
                      <span className={`rounded px-2 py-1 ${v.PulseRate == null ? 'bg-slate-100 text-slate-600' : vitalTone(v.PulseRate, 'pulse')}`}>Pulse {v.PulseRate ?? '-'} bpm</span>
                      <span className={`rounded px-2 py-1 ${v.Temperature == null ? 'bg-slate-100 text-slate-600' : vitalTone(v.Temperature, 'temperature')}`}>Temp {v.Temperature ?? '-'} °C</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <form onSubmit={(e) => submit(e, false)} className="card">
              <div className="hidden print:block">
                <LetterPadBoundView
                  imageData={clinic?.PrescriptionAttachment}
                  pageHeight={clinic?.AttachmentHeight}
                  pageWidth={clinic?.AttachmentWidth}
                  fields={letterPadFields}
                  patient={{ PatientId: selected.PatientId, PatientName: selected.Name, MobileNo: selected.MobileNo }}
                  vitals={todaysVitals}
                  meds={printMeds}
                  age={patientAge}
                />
              </div>

              <div className="no-print">
                <label className="label">Notes</label>
                <textarea
                  className="input"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="General notes / advice"
                />
              </div>

              <div className="mt-5 print:mt-0">
                <div className="no-print mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="text-sm font-semibold text-slate-700">Medications {editingPrescription && <span className="text-xs font-normal text-brand-600">(Editing)</span>}</h3>
                  <div className="flex gap-2">
                    <button type="button" className="btn-secondary" onClick={printPrescription} title="Print prescription">
                      <Printer size={16} /> Print
                    </button>
                    <button type="button" className="btn-secondary" onClick={sendWhatsApp} disabled={sending} title="Send the prescription PDF to the patient's WhatsApp">
                      <MessageCircle size={16} /> {sending ? 'Sending...' : 'Send'}
                    </button>
                  </div>
                </div>

                {/* Medication rows (editing UI; replaced by a clean read-only table on print) */}
                <div className="no-print space-y-3">
                  {/* Column labels (desktop) */}
                  <div className="hidden gap-3 px-1 text-xs font-semibold uppercase tracking-wide text-ink-400 lg:flex">
                    <div className="flex-1">Medicine</div>
                    <div className="w-[180px] text-brand-600">M / A / E / N *</div>
                    <div className="w-[100px] text-amber-600">AF / BF *</div>
                    <div className="w-[90px]">Days *</div>
                    <div className="w-[68px]" />
                  </div>

                  {items.map((it, i) => (
                    <div key={i} className="flex flex-col gap-3 rounded-lg border border-ink-100 bg-ink-50/40 p-3 lg:flex-row lg:items-center">
                      <div className="flex-1">
                        <SearchSelect
                          value={it.medicineName}
                          onChange={(v) => updateItem(i, 'medicineName', v)}
                          placeholder="Select medicine"
                          options={meds.map((m) => ({
                            value: m.MedicineName,
                            label: `${m.MedicineName}${m.GenericName ? ` (${m.GenericName})` : ''}`,
                          }))}
                        />
                      </div>

                      {/* Row 1: Timing. Row 2: AF/BF + Days + add/remove, scrolling
                          horizontally on narrow screens instead of wrapping.
                          (lg:contents unwraps every level on desktop so it doesn't
                          affect the existing multi-column layout there). */}
                      <div className="flex flex-col gap-3 lg:contents">
                        {/* Timing checkboxes (short labels) */}
                        <div className="flex shrink-0 gap-3 rounded-lg border border-brand-100 bg-brand-50/50 px-3 py-2 lg:w-[180px] lg:rounded-none lg:border-0 lg:bg-transparent lg:px-0 lg:py-0">
                          {TIMINGS.map((t) => (
                            <label key={t.full} title={t.full} className="flex cursor-pointer items-center gap-1 text-sm font-medium text-brand-700">
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-brand-300 text-brand-600 focus:ring-brand-300"
                                checked={it.timing.includes(t.full)}
                                onChange={() => toggleInItem(i, 'timing', t.full)}
                              />
                              {t.short}
                            </label>
                          ))}
                        </div>

                        <div className="overflow-x-auto lg:contents">
                          <div className="flex min-w-max items-center gap-3 lg:contents">
                            {/* AF / BF checkboxes */}
                            <div className="flex shrink-0 gap-3 rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2 lg:w-[100px] lg:rounded-none lg:border-0 lg:bg-transparent lg:px-0 lg:py-0">
                              {FOOD.map((f) => (
                                <label key={f} className="flex cursor-pointer items-center gap-1.5 text-sm text-amber-700">
                                  <input
                                    type="checkbox"
                                    className="h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-300"
                                    checked={it.food.includes(f)}
                                    onChange={() => setExclusiveInItem(i, 'food', f)}
                                  />
                                  {f}
                                </label>
                              ))}
                            </div>

                            {/* Days */}
                            <div className="w-[90px] shrink-0">
                              <input
                                type="number"
                                min="1"
                                className="input"
                                value={it.days}
                                onChange={(e) => updateItem(i, 'days', e.target.value)}
                                placeholder="Days"
                              />
                            </div>

                            <div className="flex shrink-0 gap-1">
                              <button
                                type="button"
                                className="no-print btn-ghost px-2 py-2 text-brand-600 hover:bg-brand-50"
                                onClick={addItem}
                                title="Add another medicine"
                              >
                                <Plus size={16} />
                              </button>
                              <button
                                type="button"
                                className="no-print btn-ghost px-2 py-2 text-red-500 hover:bg-red-50 disabled:opacity-30"
                                onClick={() => removeItem(i)}
                                disabled={items.length === 1}
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {labTests.length > 0 && (
                  <div className="no-print mt-4 rounded-lg border border-violet-100 bg-violet-50/30 p-3">
                    <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-violet-800">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-violet-300 text-violet-600 focus:ring-violet-300"
                        checked={showLabTests}
                        onChange={(e) => toggleShowLabTests(e.target.checked)}
                      />
                      <TestTube size={14} /> Lab Tests
                    </label>
                    {showLabTests && (
                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                        {labTests.map((t) => (
                          <label key={t.TestId} className="flex cursor-pointer items-center gap-2 rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm text-violet-800">
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-violet-300 text-violet-600 focus:ring-violet-300"
                              checked={selectedTestIds.includes(t.TestId)}
                              onChange={() => toggleTest(t.TestId)}
                            />
                            {t.TestName}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="no-print mt-4 max-w-xs">
                  <label className="label">Next Visit Date</label>
                  <input
                    type="date"
                    className="input"
                    value={nextVisitDate}
                    onChange={(e) => setNextVisitDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="no-print mt-5 flex justify-end gap-2">
                <button type="submit" className="btn-secondary" disabled={saving}>
                  <Save size={16} /> {saving ? 'Holding...' : 'Hold'}
                </button>
                <button type="button" className="btn-primary" disabled={saving} onClick={(e) => submit(e, true)}>
                  <CheckCircle2 size={16} /> Completed
                </button>
                {editingPrescription && <button type="button" className="btn-ghost" disabled={saving} onClick={() => { setEditingPrescription(null); setNotes(''); setItems([{ ...emptyItem }]); setNextVisitDate(''); setSelectedTestIds([]); setShowLabTests(false); }}>Cancel Edit</button>}
              </div>
            </form>

            <div className="no-print card">
              <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <History size={16} /> Patient History
              </h3>
              {loadingHistory ? (
                <Spinner />
              ) : !history ? (
                <p className="text-sm text-slate-400">No history available.</p>
              ) : (
                <div className="space-y-5">
                  {Object.values(
                    [...history.vitals.map((v) => ({ ...v, recordType: 'vital', recordDate: v.RecordedAt })),
                      ...history.prescriptions.map((p) => ({ ...p, recordType: 'prescription', recordDate: p.CreatedAt })),
                      // Attachment-only dates (e.g. a lab report dropped off with no
                      // visit that day) still need their own section — these entries
                      // only exist to seed that date's group key.
                      ...docs.map((d) => ({ recordType: 'attachment', recordDate: d.DocumentDate }))]
                      .reduce((groups, record) => {
                        const key = dateKey(record.recordDate);
                        (groups[key] ||= []).push(record);
                        return groups;
                      }, {})
                  )
                    .sort((a, b) => dateKey(b[0].recordDate).localeCompare(dateKey(a[0].recordDate)))
                    .map((records) => {
                      const date = dateKey(records[0].recordDate);
                      const notes = records.filter((record) => record.Notes || record.Comments);
                      const vitals = records.filter((record) => record.recordType === 'vital');
                      const prescriptions = records.filter((record) => record.recordType === 'prescription');
                      const dateDocs = docs.filter((d) => dateKey(d.DocumentDate) === date);
                      return (
                        <section key={date} className={`rounded-lg border p-4 ${date === currentDateKey() ? 'border-brand-200 bg-brand-50/30' : 'border-slate-100'}`}>
                          <div className="mb-4 flex flex-wrap items-center gap-2">
                            <h4 className="text-sm font-bold text-slate-700">{dateLabel(date)}</h4>
                            {date === currentDateKey() && <span className="badge bg-brand-100 text-brand-700">Current Date</span>}
                          </div>

                          <div className="space-y-4">
                            <div>
                              <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Notes</p>
                              {notes.length === 0 ? <p className="text-sm text-slate-400">No notes recorded.</p> : (
                                <div className="space-y-1 text-sm text-slate-600">
                                  {notes.map((record) => <p key={`${record.recordType}-${record.VitalId || record.PrescriptionId}`}>{record.Notes || record.Comments}</p>)}
                                </div>
                              )}
                            </div>

                            {date !== currentDateKey() && <div>
                              <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400"><Activity size={14} /> Vital Signs</p>
                              {vitals.length === 0 ? <p className="text-sm text-slate-400">No vitals recorded.</p> : (
                                <div className="space-y-2">
                                  {vitals.map((v) => (
                                    <div key={v.VitalId} className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                                      <span className="text-xs text-slate-400">{fmt(v.RecordedAt)}</span>
                                      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                                        <span className="rounded-md border border-slate-100 bg-white px-2 py-1.5"><small className="block text-[10px] uppercase text-slate-400">Height</small><strong>{v.Height ?? '-'} <small>cm</small></strong></span>
                                        <span className="rounded-md border border-slate-100 bg-white px-2 py-1.5"><small className="block text-[10px] uppercase text-slate-400">Weight</small><strong>{v.Weight ?? '-'} <small>kg</small></strong></span>
                                        <span className="rounded-md border border-slate-100 bg-white px-2 py-1.5"><small className="block text-[10px] uppercase text-slate-400">Blood Pressure</small><strong>{v.BloodPressure || '-'}</strong></span>
                                        <span className={`rounded-md border px-2 py-1.5 ${v.PulseRate == null ? 'border-slate-100 bg-white text-slate-600' : vitalTone(v.PulseRate, 'pulse')}`}><small className="block text-[10px] uppercase opacity-70">Pulse</small><strong>{v.PulseRate ?? '-'} <small>bpm</small></strong></span>
                                        <span className={`rounded-md border px-2 py-1.5 ${v.Temperature == null ? 'border-slate-100 bg-white text-slate-600' : vitalTone(v.Temperature, 'temperature')}`}><small className="block text-[10px] uppercase opacity-70">Temperature</small><strong>{v.Temperature ?? '-'} <small>°C</small></strong></span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>}

                            <div>
                              <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400"><Pill size={14} /> Prescriptions</p>
                              {prescriptions.length === 0 ? <p className="text-sm text-slate-400">No prescriptions recorded.</p> : (
                                <div className="space-y-3">
                                  {prescriptions.map((p) => (
                                    <div key={p.PrescriptionId} className="rounded-lg bg-slate-50 p-3">
                                      <div className="flex items-center justify-between gap-2"><p className="text-xs text-slate-400">{fmt(p.CreatedAt)}</p>{date === currentDateKey() && <div className="flex gap-1"><button type="button" className="btn-ghost px-2 py-1" title="Edit prescription" onClick={() => editPrescription(p)}><Pencil size={14} /></button><button type="button" className="btn-ghost px-2 py-1 text-red-500 hover:bg-red-50" title="Delete prescription" onClick={() => deletePrescription(p)}><Trash2 size={14} /></button></div>}</div>
                                      {p.items?.length > 0 && <ul className="mt-2 space-y-1">{p.items.map((it) => <li key={it.ItemId} className="text-sm text-slate-600">{it.MedicineName}{it.Frequency && ` — ${it.Frequency}`}{it.Instructions && ` · ${it.Instructions}`}{it.Duration && ` · ${it.Duration}`}</li>)}</ul>}
                                      {p.NextVisitDate && <p className="mt-2 text-xs font-medium text-brand-700">Next Visit: {new Date(p.NextVisitDate).toLocaleDateString()}</p>}
                                      {p.labTests?.length > 0 && (
                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                          {p.labTests.map((t) => (
                                            <span key={t.Id} className="badge bg-violet-100 text-violet-700">{t.TestName}</span>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            <div>
                              <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400"><Paperclip size={14} /> Attachments</p>
                              {dateDocs.length === 0 ? <p className="text-sm text-slate-400">No attachments for this date.</p> : (
                                <div className="space-y-2">
                                  {dateDocs.map((d) => (
                                    <div key={d.DocumentId} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                                      <div className="min-w-0">
                                        <p className="truncate text-sm font-medium text-slate-700">{d.FileName}</p>
                                        <p className="text-xs text-slate-400">{d.Category || 'Document'}</p>
                                      </div>
                                      <div className="flex shrink-0 gap-1">
                                        <button type="button" className="btn-ghost px-2 py-1" title="Preview" onClick={() => setPreviewDoc(d)}><Eye size={14} /></button>
                                        <button type="button" className="btn-ghost px-2 py-1" title="Download" onClick={() => patientDocumentApi.download(d.DocumentId, d.FileName)}><Download size={14} /></button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </section>
                      );
                    })}
                  {history.vitals.length === 0 && history.prescriptions.length === 0 && docs.length === 0 && <p className="text-sm text-slate-400">No records available.</p>}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <DocumentPreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />
      <Toast toast={toast} />
    </div>
  );
}
