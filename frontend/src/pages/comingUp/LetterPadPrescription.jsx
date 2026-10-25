import { useState, useEffect, useCallback } from 'react';
import { Upload, Activity, Pill, X, Save, Printer, ArrowLeft, UserCheck, GripVertical, Image as ImageIcon, User, ChevronDown, Minus, Plus } from 'lucide-react';
import { PageHeader, CardHeader, Spinner, EmptyState, Toast } from '../../components/ui.jsx';
import LetterPadBoundView from '../../components/LetterPadBoundView.jsx';
import { useToast } from '../../hooks/useToast.js';
import { clinicApi, confirmApi, vitalApi, prescriptionApi, patientApi } from '../../api/client.js';
import { PARAMETER_TYPES, DEFAULT_FONT_SIZE, MIN_FONT_SIZE, MAX_FONT_SIZE } from '../../config/letterPadParameters.js';

const todayStr = () => new Date().toISOString().slice(0, 10);

// Group headers use each group's own dominant color so the collapsed palette
// still hints at what's inside — teal for Patient, blue for Medicine, rose
// for Vital Sign — matching the parameter chips revealed underneath.
const PARAMETER_GROUPS = [
  { name: 'Patient', icon: User, headerClass: 'border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100' },
  { name: 'Medicine', icon: Pill, headerClass: 'border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100' },
  { name: 'Vital Sign', icon: Activity, headerClass: 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100' },
];

export default function LetterPadPrescription() {
  const { toast, show } = useToast();
  const [loading, setLoading] = useState(true);
  const [imageData, setImageData] = useState('');
  const [pageHeight, setPageHeight] = useState('');
  const [pageWidth, setPageWidth] = useState('');
  const [fields, setFields] = useState([]);
  const [saving, setSaving] = useState(false);
  const [openGroup, setOpenGroup] = useState(null);

  const [patients, setPatients] = useState([]);
  const [loadingPatients, setLoadingPatients] = useState(true);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [boundVitals, setBoundVitals] = useState(null);
  const [boundMeds, setBoundMeds] = useState([]);
  const [boundAge, setBoundAge] = useState(null);
  const [binding, setBinding] = useState(false);

  useEffect(() => {
    clinicApi.get()
      .then((c) => {
        setImageData(c?.PrescriptionAttachment || '');
        setPageHeight(c?.AttachmentHeight ?? '');
        setPageWidth(c?.AttachmentWidth ?? '');
        try { setFields(c?.LetterPadFields ? JSON.parse(c.LetterPadFields) : []); } catch { setFields([]); }
      })
      .catch(() => show('Failed to load the saved template', 'error'))
      .finally(() => setLoading(false));
  }, [show]);

  const loadPatients = useCallback(() => {
    setLoadingPatients(true);
    Promise.all([
      confirmApi.list(todayStr(), 'Billing').catch(() => []),
      confirmApi.list(todayStr(), 'Completed').catch(() => []),
    ])
      .then(([billing, completed]) => {
        setPatients([...billing, ...completed].sort((a, b) => (a.TokenNo || 0) - (b.TokenNo || 0)));
      })
      .finally(() => setLoadingPatients(false));
  }, []);

  useEffect(() => { loadPatients(); }, [loadPatients]);

  const uploadImage = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) return show('Use a PNG or JPG image', 'error');
    if (file.size > 4 * 1024 * 1024) return show('Image must be 4 MB or smaller', 'error');
    const reader = new FileReader();
    reader.onload = () => setImageData(reader.result);
    reader.readAsDataURL(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const data = e.dataTransfer.getData('text/plain');
    if (!data) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100));
    if (data.startsWith('move:')) {
      const id = data.slice(5);
      setFields((arr) => arr.map((f) => (f.id === id ? { ...f, x, y } : f)));
    } else {
      setFields((arr) => [...arr, { id: `${Date.now()}`, type: data, x, y, fontSize: DEFAULT_FONT_SIZE }]);
    }
  };

  const removeField = (id) => setFields((arr) => arr.filter((f) => f.id !== id));

  const updateFontSize = (id, delta) => {
    setFields((arr) =>
      arr.map((f) =>
        f.id === id
          ? { ...f, fontSize: Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, (f.fontSize || DEFAULT_FONT_SIZE) + delta)) }
          : f
      )
    );
  };

  const saveTemplate = async () => {
    if (!imageData) return show('Upload a letterhead image first', 'error');
    setSaving(true);
    try {
      await clinicApi.saveLetterPad({
        prescriptionAttachment: imageData,
        attachmentHeight: pageHeight || null,
        attachmentWidth: pageWidth || null,
        letterPadFields: fields,
      });
      show('Template saved', 'success');
    } catch (err) {
      show(err.response?.data?.error || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const selectPatient = async (row) => {
    setSelectedPatient(row);
    setBinding(true);
    try {
      const [vitals, history, patient] = await Promise.all([
        vitalApi.list({ patientId: row.PatientId, date: todayStr() }).catch(() => []),
        prescriptionApi.history(row.PatientId).catch(() => null),
        patientApi.get(row.PatientId).catch(() => null),
      ]);
      setBoundVitals(vitals?.[0] || null);
      const todaysRx = history?.prescriptions?.find((p) => (p.CreatedAt || '').slice(0, 10) === todayStr());
      setBoundMeds(todaysRx?.items || []);
      setBoundAge(patient?.Age ?? null);
    } finally {
      setBinding(false);
    }
  };

  const clearPatient = () => {
    setSelectedPatient(null);
    setBoundVitals(null);
    setBoundMeds([]);
    setBoundAge(null);
  };

  const bound = !!selectedPatient;

  return (
    <div>
      <PageHeader
        title="Prescription for Your Letter Pad"
        actions={
          bound && (
            <div className="no-print flex gap-2">
              <button className="btn-secondary" onClick={clearPatient}><ArrowLeft size={16} /> Back to Template</button>
              <button className="btn-primary" onClick={() => window.print()}><Printer size={16} /> Print</button>
            </div>
          )
        }
      />

      {loading ? (
        <Spinner />
      ) : (
        <div className="grid grid-cols-[220px_1fr] gap-5">
          {!bound && (
            <div className="no-print card h-fit">
              <CardHeader title="Parameters" subtitle="Click a group, then drag onto the image" />
              <div className="space-y-2">
                {PARAMETER_GROUPS.map((g) => {
                  const isOpen = openGroup === g.name;
                  const items = PARAMETER_TYPES.filter((p) => p.group === g.name);
                  return (
                    <div key={g.name}>
                      <button
                        type="button"
                        onClick={() => setOpenGroup(isOpen ? null : g.name)}
                        className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-sm font-semibold transition-colors ${g.headerClass}`}
                      >
                        <span className="flex items-center gap-2">
                          <g.icon size={16} className="shrink-0" />
                          {g.name}
                        </span>
                        <ChevronDown size={14} className={`shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {isOpen && (
                        <div className="mt-2 space-y-2 pl-1">
                          {items.map((p) => (
                            <div
                              key={p.type}
                              draggable
                              onDragStart={(e) => e.dataTransfer.setData('text/plain', p.type)}
                              className={`flex cursor-grab items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium active:cursor-grabbing ${p.paletteClass}`}
                            >
                              <GripVertical size={14} className="shrink-0 opacity-50" />
                              <p.icon size={16} className="shrink-0" />
                              {p.label}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-ink-400">Click a group to reveal its parameters, drag one onto the letterhead image, then click Save.</p>
            </div>
          )}

          <div className={bound ? 'col-span-2' : ''}>
            <div className="card">
              {!bound && (
                <CardHeader
                  icon={ImageIcon}
                  title="Letterhead Template"
                  subtitle="Upload your clinic's letterhead paper as an image"
                  actions={
                    <button className="btn-primary" onClick={saveTemplate} disabled={saving}>
                      <Save size={16} /> {saving ? 'Saving...' : 'Save'}
                    </button>
                  }
                />
              )}

              {!bound && (
                <div className="no-print mb-4 flex flex-wrap items-end gap-4">
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-brand-200 bg-brand-50/50 px-4 py-2.5 text-sm text-brand-700 hover:bg-brand-50">
                    <Upload size={16} />
                    <span>{imageData ? 'Replace image' : 'Choose PNG or JPG'}</span>
                    <input type="file" accept="image/png,image/jpeg" className="sr-only" onChange={uploadImage} />
                  </label>
                  <div>
                    <label className="label mb-1 text-[11px]">Height (cm)</label>
                    <input type="number" min="0.1" step="0.1" className="input h-9 w-28" value={pageHeight} onChange={(e) => setPageHeight(e.target.value)} placeholder="e.g. 29.7" />
                  </div>
                  <div>
                    <label className="label mb-1 text-[11px]">Width (cm)</label>
                    <input type="number" min="0.1" step="0.1" className="input h-9 w-28" value={pageWidth} onChange={(e) => setPageWidth(e.target.value)} placeholder="e.g. 21" />
                  </div>
                </div>
              )}

              {!imageData ? (
                <EmptyState message="No letterhead image uploaded yet." />
              ) : bound ? (
                <LetterPadBoundView
                  imageData={imageData}
                  pageHeight={pageHeight}
                  pageWidth={pageWidth}
                  fields={fields}
                  patient={selectedPatient}
                  vitals={boundVitals}
                  meds={boundMeds}
                  age={boundAge}
                />
              ) : (
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                  className="relative w-full overflow-hidden rounded-lg border border-ink-100 bg-white"
                >
                  <img src={imageData} alt="Letterhead" className="block w-full select-none" draggable={false} />
                  {fields.map((f) => {
                    const def = PARAMETER_TYPES.find((p) => p.type === f.type);
                    if (!def) return null; // a field type from before this parameter set changed
                    const Icon = def.icon;
                    return (
                      <div
                        key={f.id}
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData('text/plain', `move:${f.id}`)}
                        style={{
                          left: `${f.x}%`,
                          top: `${f.y}%`,
                          // Centering every badge on its drop point (translate -50%) pushes it
                          // past the letterhead's edge once the badge is a large fraction of the
                          // container's width — exactly what happens on a narrow mobile screen.
                          // Anchor to the near edge instead once the point is close to it, so the
                          // badge always renders fully inside the image.
                          transform: `translate(${f.x < 15 ? '0' : f.x > 85 ? '-100%' : '-50%'}, ${f.y < 15 ? '0' : f.y > 85 ? '-100%' : '-50%'})`,
                        }}
                        className={`absolute flex max-w-[85%] items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-sm ${def.editBadgeClass}`}
                      >
                        <Icon size={13} className={`mt-0.5 shrink-0 ${def.iconClass}`} />
                        <div style={{ fontSize: `${f.fontSize || DEFAULT_FONT_SIZE}px` }}>{def.label}</div>
                        <div className="no-print ml-1 flex shrink-0 items-center gap-0.5">
                          <button
                            type="button"
                            className="rounded p-0.5 text-ink-400 hover:text-ink-700"
                            title={`Decrease font size (${f.fontSize || DEFAULT_FONT_SIZE}px)`}
                            onClick={() => updateFontSize(f.id, -1)}
                          >
                            <Minus size={11} />
                          </button>
                          <button
                            type="button"
                            className="rounded p-0.5 text-ink-400 hover:text-ink-700"
                            title={`Increase font size (${f.fontSize || DEFAULT_FONT_SIZE}px)`}
                            onClick={() => updateFontSize(f.id, 1)}
                          >
                            <Plus size={11} />
                          </button>
                          <button type="button" className="text-ink-400 hover:text-red-500" onClick={() => removeField(f.id)}>
                            <X size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {binding && <div className="mt-3"><Spinner /></div>}
            </div>
          </div>
        </div>
      )}

      <div className="no-print card mt-5">
        <CardHeader
          icon={UserCheck}
          title="Select Patient"
          subtitle="Today — Billing or Completed status; selecting a patient auto-fills the template above"
        />
        {loadingPatients ? (
          <Spinner />
        ) : patients.length === 0 ? (
          <EmptyState message="No Billing or Completed patients yet today." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="table-head">
                  <th className="rounded-l-lg px-3 py-3">Token</th>
                  <th className="px-3 py-3">Patient</th>
                  <th className="px-3 py-3">Mobile</th>
                  <th className="rounded-r-lg px-3 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {patients.map((r) => (
                  <tr
                    key={r.ConfirmId}
                    className={`table-row cursor-pointer ${selectedPatient?.ConfirmId === r.ConfirmId ? 'bg-brand-50/60' : ''}`}
                    onClick={() => selectPatient(r)}
                  >
                    <td className="px-3 py-3">
                      <span className="inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-lg bg-brand-gradient px-2 text-xs font-bold text-white">
                        {r.TokenNo ?? '-'}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-medium text-slate-700">{r.PatientName}</p>
                      <p className="text-xs text-slate-400">ID #{r.PatientId}</p>
                    </td>
                    <td className="px-3 py-3 text-slate-500">{r.MobileNo || '-'}</td>
                    <td className="px-3 py-3">
                      <span className={`badge ${r.Status === 'Completed' ? 'bg-teal-100 text-teal-700' : 'bg-emerald-100 text-emerald-700'}`}>{r.Status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Toast toast={toast} />
    </div>
  );
}
