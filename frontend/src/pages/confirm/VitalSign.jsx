import { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Save, ListChecks, Upload, Download, FileText, FolderOpen, Eye, Camera, ImagePlus, X } from 'lucide-react';
import { PageHeader, Toast, CardHeader, Spinner, EmptyState } from '../../components/ui.jsx';
import PatientPicker from '../../components/PatientPicker.jsx';
import DocumentPreviewModal from '../../components/DocumentPreviewModal.jsx';
import { useToast } from '../../hooks/useToast.js';
import { vitalApi, patientDocumentApi } from '../../api/client.js';
import { buildPdfFromImages } from '../../utils/imagesToPdf.js';

const empty = { height: '', weight: '', bloodPressure: '', pulseRate: '', temperature: '', comments: '' };
const todayStr = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN') : '-');
const MAX_PHOTOS = 6;
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

export default function VitalSign() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast, show } = useToast();
  const [selected, setSelected] = useState(location.state?.patient || null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [editingVitalId, setEditingVitalId] = useState(null);

  // If this patient already has a vital sign recorded today, load it into
  // the form instead of leaving it blank — same "today auto-loads" pattern
  // as Doctor's Medications, so Save updates that record rather than
  // creating a duplicate for the same day.
  useEffect(() => {
    if (!selected) { setForm(empty); setEditingVitalId(null); return; }
    vitalApi.list({ patientId: selected.PatientId, date: todayStr() })
      .then((rows) => {
        const todays = rows?.[0];
        if (todays) {
          setForm({
            height: todays.Height ?? '',
            weight: todays.Weight ?? '',
            bloodPressure: todays.BloodPressure || '',
            pulseRate: todays.PulseRate ?? '',
            temperature: todays.Temperature ?? '',
            comments: todays.Comments || '',
          });
          setEditingVitalId(todays.VitalId);
        } else {
          setForm(empty);
          setEditingVitalId(null);
        }
      })
      .catch(() => { setForm(empty); setEditingVitalId(null); });
  }, [selected]);

  // Attachments (lab reports, scans, etc.) — saved to the same Patient
  // Records/Cloudinary store the prescription PDF uses, dated to today so
  // a later review's uploads never mix with an earlier review's.
  const [docs, setDocs] = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [attachmentType, setAttachmentType] = useState('');
  const [file, setFile] = useState(null);
  const [photoFiles, setPhotoFiles] = useState([]);
  const [category, setCategory] = useState('');
  const [uploading, setUploading] = useState(false);
  const [converting, setConverting] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);
  const [previewDoc, setPreviewDoc] = useState(null);

  const loadDocs = useCallback((patient) => {
    if (!patient) return;
    setDocsLoading(true);
    patientDocumentApi.list(patient.PatientId)
      .then(setDocs)
      .catch(() => setDocs([]))
      .finally(() => setDocsLoading(false));
  }, []);

  useEffect(() => { loadDocs(selected); }, [selected, loadDocs]);

  // Shared by both the camera capture input and the gallery multi-select
  // input — each new batch is added to whatever's already queued (so a few
  // camera shots can be mixed with a gallery pick) up to the 6-photo cap.
  const addPhotos = (newFiles) => {
    setPhotoFiles((existing) => {
      const combined = [...existing, ...newFiles];
      if (combined.length > MAX_PHOTOS) {
        show(`Select at most ${MAX_PHOTOS} photos — ${existing.length} already queued`, 'error');
        return existing;
      }
      return combined;
    });
  };
  const removePhoto = (index) => setPhotoFiles((arr) => arr.filter((_, i) => i !== index));

  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!selected) return show('Select a patient first', 'error');
    setSaving(true);
    try {
      const payload = {
        patientId: selected.PatientId,
        height: form.height || null,
        weight: form.weight || null,
        bloodPressure: form.bloodPressure || null,
        pulseRate: form.pulseRate || null,
        temperature: form.temperature || null,
        comments: form.comments || null,
      };
      if (editingVitalId) {
        await vitalApi.update(editingVitalId, payload);
        show('Vital sign updated', 'success');
      } else {
        const created = await vitalApi.create(payload);
        setEditingVitalId(created.VitalId);
        show('Vital sign recorded', 'success');
      }
    } catch (err) {
      show(err.response?.data?.error || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const submitUpload = async (e) => {
    e.preventDefault();
    if (!selected) return show('Select a patient first', 'error');
    if (!attachmentType) return show('Choose an Attachment Type first', 'error');

    setUploading(true);
    try {
      let uploadFile;
      if (attachmentType === 'Photo') {
        if (!photoFiles.length) return show(`Choose up to ${MAX_PHOTOS} photos`, 'error');
        setConverting(true);
        let pdfBlob;
        try {
          pdfBlob = await buildPdfFromImages(photoFiles, { maxBytes: MAX_ATTACHMENT_BYTES });
        } finally {
          setConverting(false);
        }
        uploadFile = new File([pdfBlob], `${selected.Name.replace(/\s+/g, '_')}-scan-${todayStr()}.pdf`, { type: 'application/pdf' });
      } else {
        if (!file) return show('Choose a PDF file', 'error');
        if (file.type !== 'application/pdf') return show('Only PDF files are allowed for the PDF option', 'error');
        if (file.size > MAX_ATTACHMENT_BYTES) return show('PDF exceeds 8 MB — compress it before uploading', 'error');
        uploadFile = file;
      }

      const data = new FormData();
      data.append('file', uploadFile);
      data.append('patientId', selected.PatientId);
      data.append('category', category);
      // Dated to today — the current booking/review's date — so a later
      // review's attachments stay grouped separately from this one's.
      data.append('documentDate', todayStr());
      await patientDocumentApi.upload(data);
      show('Document uploaded', 'success');
      setAttachmentType('');
      setFile(null);
      setPhotoFiles([]);
      setCategory('');
      loadDocs(selected);
    } catch (err) {
      show(err.message || err.response?.data?.error || 'Upload failed', 'error');
    } finally {
      setUploading(false);
    }
  };

  const download = async (doc) => {
    setDownloadingId(doc.DocumentId);
    try {
      await patientDocumentApi.download(doc.DocumentId, doc.FileName);
    } catch (err) {
      show(err.response?.data?.error || 'Download failed', 'error');
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div>
      <PageHeader title="Vital Sign" />

      <div className="space-y-5">
        <PatientPicker selected={selected} onSelect={setSelected} />

        <form onSubmit={submit} className="card">
          {editingVitalId && (
            <p className="mb-3 text-xs font-medium text-brand-600">
              Already recorded today for this patient — editing that record instead of creating a new one.
            </p>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="label">Height (cm)</label>
              <input type="number" step="0.1" className="input" value={form.height} onChange={update('height')} />
            </div>
            <div>
              <label className="label">Weight (kg)</label>
              <input type="number" step="0.1" className="input" value={form.weight} onChange={update('weight')} />
            </div>
            <div>
              <label className="label">Blood Pressure</label>
              <input className="input" placeholder="e.g. 120/80" value={form.bloodPressure} onChange={update('bloodPressure')} />
            </div>
            <div>
              <label className="label">Pulse Rate (bpm)</label>
              <input type="number" className="input" value={form.pulseRate} onChange={update('pulseRate')} />
            </div>
            <div>
              <label className="label">Temperature (°C)</label>
              <input type="number" step="0.1" className="input" value={form.temperature} onChange={update('temperature')} />
            </div>
          </div>
          <div className="mt-4">
            <label className="label">Comments</label>
            <textarea className="input" rows={3} value={form.comments} onChange={update('comments')} placeholder="Additional notes" />
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button type="submit" className="btn-primary" disabled={saving || !selected}>
              <Save size={16} /> {saving ? 'Saving...' : editingVitalId ? 'Update Vital Sign' : 'Save Vital Sign'}
            </button>
            <button type="button" className="btn-secondary" onClick={() => navigate('/confirm/list')}>
              <ListChecks size={16} /> Confirm List
            </button>
          </div>
        </form>

        {selected && (
          <div className="card">
            <CardHeader
              icon={FolderOpen}
              title="Lab Reports & Scans"
              subtitle={`Attachments for ${selected.Name} — saved with today's date, alongside their prescriptions`}
            />
            <form onSubmit={submitUpload} className="flex flex-wrap items-end gap-3">
              <div className="w-full sm:w-44">
                <label className="label">Attachment Type *</label>
                <select
                  className="input"
                  value={attachmentType}
                  onChange={(e) => { setAttachmentType(e.target.value); setFile(null); setPhotoFiles([]); }}
                >
                  <option value="">Select type</option>
                  <option value="Photo">Photo</option>
                  <option value="PDF">PDF</option>
                </select>
              </div>

              {attachmentType === 'Photo' && (
                <div className="w-full">
                  <label className="label">Photos * (up to {MAX_PHOTOS})</label>
                  <div className="flex flex-wrap gap-2">
                    <label className="btn-secondary cursor-pointer">
                      <Camera size={16} /> Take Photo
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="sr-only"
                        onChange={(e) => {
                          const picked = e.target.files?.[0];
                          e.target.value = '';
                          if (picked) addPhotos([picked]);
                        }}
                      />
                    </label>
                    <label className="btn-secondary cursor-pointer">
                      <ImagePlus size={16} /> Choose from Gallery
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="sr-only"
                        onChange={(e) => {
                          const picked = Array.from(e.target.files || []);
                          e.target.value = '';
                          if (picked.length) addPhotos(picked);
                        }}
                      />
                    </label>
                  </div>

                  {photoFiles.length > 0 && (
                    <>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {photoFiles.map((f, i) => (
                          <span key={i} className="flex items-center gap-1.5 rounded-lg border border-ink-100 bg-ink-50 px-2.5 py-1.5 text-xs text-ink-600">
                            {f.name}
                            <button type="button" className="text-ink-400 hover:text-red-500" onClick={() => removePhoto(i)}>
                              <X size={13} />
                            </button>
                          </span>
                        ))}
                      </div>
                      <p className="mt-1.5 text-xs text-ink-400">
                        {photoFiles.length} of {MAX_PHOTOS} photos queued — will be combined into one PDF under 8 MB.
                      </p>
                    </>
                  )}
                </div>
              )}

              {attachmentType === 'PDF' && (
                <div className="min-w-[200px] flex-1">
                  <label className="label">File * (PDF, max 8 MB)</label>
                  <input
                    type="file"
                    accept="application/pdf"
                    className="input"
                    onChange={(e) => {
                      const picked = e.target.files?.[0] || null;
                      if (picked && picked.size > MAX_ATTACHMENT_BYTES) {
                        show('PDF exceeds 8 MB — compress it before uploading', 'error');
                        e.target.value = '';
                        setFile(null);
                        return;
                      }
                      setFile(picked);
                    }}
                  />
                </div>
              )}

              <div className="w-full sm:w-56">
                <label className="label">Category</label>
                <input className="input" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Lab Report, Scan" />
              </div>
              <button type="submit" className="btn-primary" disabled={uploading || !attachmentType}>
                <Upload size={16} /> {uploading ? (converting ? 'Converting...' : 'Uploading...') : 'Upload'}
              </button>
            </form>

            <div className="mt-5 border-t border-ink-100 pt-4">
              {docsLoading ? (
                <Spinner />
              ) : docs.length === 0 ? (
                <EmptyState message="No documents uploaded yet." />
              ) : (
                <div className="space-y-2">
                  {docs.map((d) => (
                    <div key={d.DocumentId} className="flex items-center justify-between rounded-lg border border-ink-100 p-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                          <FileText size={18} />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-700">{d.FileName}</p>
                          <p className="text-xs text-slate-400">{d.Category ? `${d.Category} · ` : ''}{fmtDate(d.DocumentDate)}</p>
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button className="btn-secondary py-1.5 text-xs" onClick={() => setPreviewDoc(d)}>
                          <Eye size={13} /> Preview
                        </button>
                        <button className="btn-secondary py-1.5 text-xs" onClick={() => download(d)} disabled={downloadingId === d.DocumentId}>
                          <Download size={13} /> Download
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <DocumentPreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />
      <Toast toast={toast} />
    </div>
  );
}
