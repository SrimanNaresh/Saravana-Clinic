import { useState } from 'react';
import { FolderOpen, Upload, Download, Trash2, FileText, Eye } from 'lucide-react';
import { PageHeader, CardHeader, Spinner, EmptyState, Toast } from '../../components/ui.jsx';
import PatientPicker from '../../components/PatientPicker.jsx';
import DocumentPreviewModal from '../../components/DocumentPreviewModal.jsx';
import { useToast } from '../../hooks/useToast.js';
import { patientDocumentApi } from '../../api/client.js';

const todayStr = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN') : '-');

export default function PatientRecords() {
  const { toast, show } = useToast();
  const [selected, setSelected] = useState(null);
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(false);

  const [file, setFile] = useState(null);
  const [category, setCategory] = useState('');
  const [documentDate, setDocumentDate] = useState(todayStr());
  const [uploading, setUploading] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);
  const [previewDoc, setPreviewDoc] = useState(null);

  const load = async (patient) => {
    setLoading(true);
    try {
      setDocs(await patientDocumentApi.list(patient.PatientId));
    } catch (err) {
      show(err.response?.data?.error || 'Failed to load documents', 'error');
    } finally {
      setLoading(false);
    }
  };

  const selectPatient = (patient) => {
    setSelected(patient);
    load(patient);
  };

  const submitUpload = async (e) => {
    e.preventDefault();
    if (!selected) return show('Select a patient first', 'error');
    if (!file) return show('Choose a file to upload', 'error');
    setUploading(true);
    try {
      const data = new FormData();
      data.append('file', file);
      data.append('patientId', selected.PatientId);
      data.append('category', category);
      data.append('documentDate', documentDate);
      await patientDocumentApi.upload(data);
      show('Document uploaded', 'success');
      setFile(null);
      setCategory('');
      setDocumentDate(todayStr());
      load(selected);
    } catch (err) {
      show(err.response?.data?.error || 'Upload failed', 'error');
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

  const remove = async (doc) => {
    if (!confirm(`Delete "${doc.FileName}"?`)) return;
    try {
      await patientDocumentApi.remove(doc.DocumentId);
      show('Deleted', 'success');
      load(selected);
    } catch (err) {
      show(err.response?.data?.error || 'Delete failed', 'error');
    }
  };

  return (
    <div>
      <PageHeader title="Patient Records" />

      <PatientPicker selected={selected} onSelect={selectPatient} />

      {selected && (
        <>
          <div className="card mt-5">
            <CardHeader icon={Upload} title="Upload Document" subtitle={`Adds a new document for ${selected.Name}`} />
            <form onSubmit={submitUpload} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
              <div>
                <label className="label">File *</label>
                <input type="file" className="input" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              </div>
              <div>
                <label className="label">Category</label>
                <input className="input" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Lab Report, Scan" />
              </div>
              <div>
                <label className="label">Document Date</label>
                <input type="date" className="input" value={documentDate} onChange={(e) => setDocumentDate(e.target.value || todayStr())} />
              </div>
              <button type="submit" className="btn-primary" disabled={uploading}>
                <Upload size={16} /> {uploading ? 'Uploading...' : 'Upload'}
              </button>
            </form>
          </div>

          <div className="card mt-5">
            <CardHeader icon={FolderOpen} title="Documents" subtitle={`All records on file for ${selected.Name}`} />
            {loading ? (
              <Spinner />
            ) : docs.length === 0 ? (
              <EmptyState message="No documents found for this patient." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="table-head">
                      <th className="rounded-l-lg px-3 py-3">File</th>
                      <th className="px-3 py-3">Category</th>
                      <th className="px-3 py-3">Date</th>
                      <th className="px-3 py-3">Uploaded By</th>
                      <th className="rounded-r-lg px-3 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {docs.map((d) => (
                      <tr key={d.DocumentId} className="table-row">
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <FileText size={15} className="text-slate-400" />
                            <span className="font-medium text-slate-700">{d.FileName}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-slate-500">{d.Category || '-'}</td>
                        <td className="px-3 py-3 text-slate-500">{fmtDate(d.DocumentDate)}</td>
                        <td className="px-3 py-3 text-slate-500">{d.UploadedBy || '-'}</td>
                        <td className="px-3 py-3">
                          <div className="flex justify-end gap-1">
                            <button className="btn-ghost px-2 py-1" title="Preview" onClick={() => setPreviewDoc(d)}>
                              <Eye size={15} />
                            </button>
                            <button className="btn-ghost px-2 py-1" title="Download" onClick={() => download(d)} disabled={downloadingId === d.DocumentId}>
                              <Download size={15} />
                            </button>
                            <button className="btn-ghost px-2 py-1 text-red-500 hover:bg-red-50" title="Delete" onClick={() => remove(d)}>
                              <Trash2 size={15} />
                            </button>
                          </div>
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

      <DocumentPreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />
      <Toast toast={toast} />
    </div>
  );
}
