import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Printer, Eye, EyeOff, Ruler, Pencil, Trash2, Save, Plus, X } from 'lucide-react';
import { PageHeader, Toast, Spinner } from '../../components/ui.jsx';
import { PrescriptionHeader, PrescriptionFooter, PrescriptionPageSize } from '../../components/PrescriptionLetterhead.jsx';
import PrescriptionPrintable from '../../components/PrescriptionPrintable.jsx';
import SearchSelect from '../../components/SearchSelect.jsx';
import { useToast } from '../../hooks/useToast.js';
import { clinicApi, prescriptionApi, patientApi, medicationApi } from '../../api/client.js';

const fmt = (date) => (date ? new Date(date).toLocaleString() : '-');
const normalizeClinic = (data) => data ? {
  name: data.Name ?? data.name ?? '',
  doctorName: data.DoctorName ?? data.doctorName ?? '',
  logo: data.Logo ?? data.logo ?? '',
  address: data.Address ?? data.address ?? '',
  email: data.Email ?? data.email ?? '',
  contactNo: data.ContactNo ?? data.contactNo ?? '',
  pageHeight: data.PageHeight ?? data.pageHeight ?? '',
  pageWidth: data.PageWidth ?? data.pageWidth ?? '',
} : null;

const TIMINGS = [
  { full: 'Morning', short: 'M' },
  { full: 'Afternoon', short: 'A' },
  { full: 'Evening', short: 'E' },
  { full: 'Night', short: 'N' },
];
const FOOD = ['AF', 'BF']; // AF = After Food, BF = Before Food
const emptyEditItem = { medicineName: '', timing: [], food: [], days: '' };

// Sample patient/prescription so the letterhead + table format can be checked without a real patient.
const samplePatient = { Name: 'Sample Patient', PatientId: '0000', MobileNo: '98765 43210', Age: '32' };
const samplePrescription = {
  CreatedAt: new Date().toISOString(),
  Notes: 'Sample notes for letterhead preview.',
  items: [
    { ItemId: 'sample-1', MedicineName: 'Paracetamol 500mg', Frequency: 'Morning, Night', Instructions: 'AF', Duration: '5 day(s)' },
    { ItemId: 'sample-2', MedicineName: 'Amoxicillin 250mg', Frequency: 'Morning, Afternoon, Night', Instructions: 'AF', Duration: '7 day(s)' },
  ],
};

export default function PrescriptionPrint() {
  const location = useLocation();
  const { toast, show } = useToast();
  const [selected] = useState(location.state?.patient || null);
  const [patientDetails, setPatientDetails] = useState(null);
  const [clinic, setClinic] = useState(null);
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [pageHeight, setPageHeight] = useState('');
  const [pageWidth, setPageWidth] = useState('');
  const [meds, setMeds] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editNotes, setEditNotes] = useState('');
  const [editItems, setEditItems] = useState([{ ...emptyEditItem }]);
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    clinicApi.get().then(normalizeClinic).then((c) => {
      setClinic(c);
      setPageHeight(c?.pageHeight || '');
      setPageWidth(c?.pageWidth || '');
    }).catch(() => setClinic(null));
  }, []);
  useEffect(() => { medicationApi.list().then(setMeds).catch(() => setMeds([])); }, []);

  const loadHistory = () => {
    if (!selected) return;
    setLoading(true);
    Promise.all([
      prescriptionApi.history(selected.PatientId),
      patientApi.get(selected.PatientId).catch(() => null),
    ])
      .then(([h, p]) => { setHistory(h); setPatientDetails(p); })
      .catch(() => { setHistory(null); show('Failed to load prescription', 'error'); })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!selected) {
      setHistory(null);
      setPatientDetails(null);
      return;
    }
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const prescriptions = history?.prescriptions || [];
  const effectiveSelected = previewMode ? samplePatient : selected;
  const effectiveAge = previewMode ? samplePatient.Age : patientDetails?.Age;
  const prescription = previewMode ? samplePrescription : prescriptions[0];
  const patientNameParameter = effectiveSelected?.Name || '';
  const canManage = !previewMode && !!prescription?.PrescriptionId;

  // PrescriptionPrintable expects the raw PascalCase clinic shape (as returned
  // directly by the API) and { medicineName, timing, food, days } items —
  // adapt this page's lowercase-normalized clinic and DB item shape to match,
  // so the read-only view renders through the one shared letterhead component.
  const clinicForPrintable = clinic ? {
    DoctorName: clinic.doctorName,
    Name: clinic.name,
    Email: clinic.email,
    ContactNo: clinic.contactNo,
    Address: clinic.address,
    Logo: clinic.logo,
  } : null;
  const viewItems = prescription?.items?.length ? prescription.items.map((item) => ({
    medicineName: item.MedicineName || '',
    timing: item.Frequency ? item.Frequency.split(',').map((v) => v.trim()).filter(Boolean) : [],
    food: item.Instructions ? item.Instructions.split(',').map((v) => v.trim()).filter((v) => FOOD.includes(v)) : [],
    days: item.Duration?.match(/\d+/)?.[0] || '',
  })) : [];

  const startEdit = () => {
    setEditNotes(prescription.Notes || '');
    setEditItems(prescription.items?.length ? prescription.items.map((item) => ({
      medicineName: item.MedicineName || '',
      timing: item.Frequency ? item.Frequency.split(',').map((v) => v.trim()).filter(Boolean) : [],
      food: item.Instructions ? item.Instructions.split(',').map((v) => v.trim()).filter((v) => FOOD.includes(v)) : [],
      days: item.Duration?.match(/\d+/)?.[0] || '',
    })) : [{ ...emptyEditItem }]);
    setIsEditing(true);
  };
  const cancelEdit = () => setIsEditing(false);

  const updateEditItem = (i, key, value) => setEditItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, [key]: value } : it)));
  const toggleEditTiming = (i, value) => setEditItems((arr) => arr.map((it, idx) => {
    if (idx !== i) return it;
    const list = it.timing;
    return { ...it, timing: list.includes(value) ? list.filter((v) => v !== value) : [...list, value] };
  }));
  const setEditFood = (i, value) => setEditItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, food: it.food.includes(value) ? [] : [value] } : it)));
  const addEditItem = () => setEditItems((arr) => [...arr, { ...emptyEditItem }]);
  const removeEditItem = (i) => setEditItems((arr) => arr.filter((_, idx) => idx !== i));

  const saveEdit = async () => {
    setSavingEdit(true);
    try {
      const payloadItems = editItems
        .filter((it) => it.medicineName.trim())
        .map((it) => ({
          medicineName: it.medicineName.trim(),
          frequency: it.timing.join(', '),
          instructions: it.food.join(', '),
          duration: it.days ? `${it.days} day(s)` : '',
        }));
      await prescriptionApi.update(prescription.PrescriptionId, { notes: editNotes, items: payloadItems });
      show('Prescription updated', 'success');
      setIsEditing(false);
      loadHistory();
    } catch (err) {
      show(err.response?.data?.error || 'Update failed', 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  const deletePrescriptionNow = async () => {
    if (!confirm('Delete this prescription and its notes?')) return;
    try {
      await prescriptionApi.remove(prescription.PrescriptionId);
      show('Prescription deleted', 'success');
      loadHistory();
    } catch (err) {
      show(err.response?.data?.error || 'Delete failed', 'error');
    }
  };

  return (
    <div>
      <PageHeader
        title="Prescription Preview"
        actions={
          <div className="no-print flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" onClick={() => setPreviewMode((v) => !v)}>
              {previewMode ? <><EyeOff size={16} /> Exit Preview</> : <><Eye size={16} /> Preview Letterhead</>}
            </button>
            {canManage && !isEditing && (
              <>
                <button type="button" className="btn-secondary" onClick={startEdit}><Pencil size={16} /> Edit</button>
                <button type="button" className="btn-secondary text-red-500 hover:bg-red-50" onClick={deletePrescriptionNow}><Trash2 size={16} /> Delete</button>
              </>
            )}
            {isEditing && (
              <>
                <button type="button" className="btn-ghost" onClick={cancelEdit} disabled={savingEdit}><X size={16} /> Cancel</button>
                <button type="button" className="btn-primary" onClick={saveEdit} disabled={savingEdit}><Save size={16} /> {savingEdit ? 'Saving...' : 'Save'}</button>
              </>
            )}
            {prescription && !isEditing && <button className="btn-primary" onClick={() => window.print()}><Printer size={16} /> Print Prescription</button>}
          </div>
        }
      />

      <div className="no-print mb-5 flex flex-wrap items-end gap-3 rounded-lg border border-ink-100 bg-white px-3 py-2.5">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-600"><Ruler size={14} /> Print Size</p>
        <div>
          <label className="label mb-1 text-[11px]">Height (cm)</label>
          <input type="number" min="0.1" step="0.1" className="input h-9 w-28" value={pageHeight} onChange={(e) => setPageHeight(e.target.value)} placeholder="e.g. 21" />
        </div>
        <div>
          <label className="label mb-1 text-[11px]">Width (cm)</label>
          <input type="number" min="0.1" step="0.1" className="input h-9 w-28" value={pageWidth} onChange={(e) => setPageWidth(e.target.value)} placeholder="e.g. 14.8" />
        </div>
        <p className="text-[11px] text-ink-400">Leave blank to use the browser's default page size. Defaults come from Clinic Master.</p>
      </div>

      {previewMode && (
        <div className="no-print mb-5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Showing a sample prescription with placeholder patient details so you can check the letterhead (header, body and footer). Nothing here is saved or real.
        </div>
      )}

      {effectiveSelected && !previewMode && (
        <div className="no-print mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-ink-100 bg-white px-3 py-2 text-xs">
          <span className="font-mono text-brand-700">{'{PatientName}'} = {patientNameParameter}</span>
        </div>
      )}

      {loading ? <Spinner /> : effectiveSelected && prescription ? (
        isEditing ? (
          <div className="print-prescription card mt-5">
            <PrescriptionPageSize height={pageHeight} width={pageWidth} />
            <PrescriptionHeader
              doctorName={clinic?.doctorName}
              clinicName={clinic?.name}
              email={clinic?.email}
              contactNo={clinic?.contactNo}
              address={clinic?.address}
              logo={clinic?.logo}
            />

            <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2.5 rounded-xl border border-brand-100 bg-brand-50/40 px-4 py-3 text-sm sm:grid-cols-2">
              <p><span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-400">Patient Name</span><span className="text-base font-semibold text-ink-800">{patientNameParameter}</span></p>
              <p className="sm:text-right"><span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-400">Patient ID</span><span className="text-base font-semibold text-ink-800">#{effectiveSelected.PatientId}</span></p>
              <p><span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-400">Age</span><span className="text-base font-semibold text-ink-800">{effectiveAge ?? '-'}</span></p>
              <p className="sm:text-right"><span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-400">Date</span><span className="text-base font-semibold text-ink-800">{fmt(prescription.CreatedAt)}</span></p>
            </div>

            <div className="py-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-bold uppercase tracking-wide text-ink-800">Prescription</h2>
                <button type="button" className="no-print btn-secondary" onClick={addEditItem}><Plus size={16} /> Add Medicine</button>
              </div>
              <div className="space-y-3">
                {editItems.map((it, i) => (
                  <div key={i} className="flex flex-col gap-3 rounded-lg border border-ink-100 bg-ink-50/40 p-3 lg:flex-row lg:items-center">
                    <div className="flex-1">
                      <SearchSelect
                        value={it.medicineName}
                        onChange={(v) => updateEditItem(i, 'medicineName', v)}
                        placeholder="Select medicine"
                        options={meds.map((m) => ({ value: m.MedicineName, label: `${m.MedicineName}${m.GenericName ? ` (${m.GenericName})` : ''}` }))}
                      />
                    </div>
                    <div className="flex flex-col gap-3 lg:contents">
                      <div className="flex shrink-0 gap-3 rounded-lg border border-brand-100 bg-brand-50/50 px-3 py-2 lg:w-[180px] lg:rounded-none lg:border-0 lg:bg-transparent lg:px-0 lg:py-0">
                        {TIMINGS.map((t) => (
                          <label key={t.full} title={t.full} className="flex cursor-pointer items-center gap-1 text-sm font-medium text-brand-700">
                            <input type="checkbox" className="h-4 w-4 rounded border-brand-300 text-brand-600 focus:ring-brand-300" checked={it.timing.includes(t.full)} onChange={() => toggleEditTiming(i, t.full)} />
                            {t.short}
                          </label>
                        ))}
                      </div>

                      <div className="overflow-x-auto lg:contents">
                        <div className="flex min-w-max items-center gap-3 lg:contents">
                          <div className="flex shrink-0 gap-3 rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2 lg:w-[100px] lg:rounded-none lg:border-0 lg:bg-transparent lg:px-0 lg:py-0">
                            {FOOD.map((f) => (
                              <label key={f} className="flex cursor-pointer items-center gap-1.5 text-sm text-amber-700">
                                <input type="checkbox" className="h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-300" checked={it.food.includes(f)} onChange={() => setEditFood(i, f)} />
                                {f}
                              </label>
                            ))}
                          </div>
                          <div className="w-[90px] shrink-0">
                            <input type="number" min="1" className="input" value={it.days} onChange={(e) => updateEditItem(i, 'days', e.target.value)} placeholder="Days" />
                          </div>
                          <button type="button" className="no-print btn-ghost shrink-0 px-2 py-2 text-red-500 hover:bg-red-50 disabled:opacity-30" onClick={() => removeEditItem(i)} disabled={editItems.length === 1}>
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-ink-100 py-4">
              <h2 className="font-semibold text-ink-800">Notes</h2>
              <textarea className="input mt-2" rows={3} value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="General notes / advice" />
            </div>

            <PrescriptionFooter clinicName={clinic?.name} address={clinic?.address} contactNo={clinic?.contactNo} />
          </div>
        ) : (
          <div className="mt-5">
            <PrescriptionPageSize height={pageHeight} width={pageWidth} />
            <PrescriptionPrintable
              clinic={clinicForPrintable}
              patient={effectiveSelected}
              patientAge={effectiveAge}
              items={viewItems}
              notes={prescription.Notes}
              date={fmt(prescription.CreatedAt)}
              nextVisitDate={prescription.NextVisitDate ? prescription.NextVisitDate.slice(0, 10) : ''}
              labTestNames={prescription.labTests?.map((t) => t.TestName) || []}
            />
          </div>
        )
      ) : effectiveSelected ? <div className="card mt-5"><p className="text-sm text-slate-400">No prescription found for this patient.</p></div> : <div className="no-print card mt-5"><p className="text-sm text-slate-400">Open Prescription Preview from a selected patient in Doctor's, or click "Preview Letterhead" above to check the letterhead design.</p></div>}

      <Toast toast={toast} />
    </div>
  );
}
