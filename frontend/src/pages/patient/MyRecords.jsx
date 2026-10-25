import { useEffect, useState } from 'react';
import { FolderOpen, Download, FileText, Eye } from 'lucide-react';
import { PageHeader, CardHeader, Spinner, EmptyState, Toast } from '../../components/ui.jsx';
import DocumentPreviewModal from '../../components/DocumentPreviewModal.jsx';
import { useToast } from '../../hooks/useToast.js';
import { patientDocumentApi } from '../../api/client.js';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN') : '-');

// Patient-only view: the backend always scopes this to the signed-in
// patient's own records, regardless of anything this page could ever send.
export default function MyRecords() {
  const { toast, show } = useToast();
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState(null);
  const [previewDoc, setPreviewDoc] = useState(null);

  useEffect(() => {
    patientDocumentApi.list()
      .then(setDocs)
      .catch((err) => show(err.response?.data?.error || 'Failed to load your records', 'error'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      <PageHeader title="My Records" />

      <div className="card">
        <CardHeader icon={FolderOpen} title="Documents" subtitle="Download anything your clinic has uploaded for you" />
        {loading ? (
          <Spinner />
        ) : docs.length === 0 ? (
          <EmptyState message="No records have been shared with you yet." />
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

      <DocumentPreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />
      <Toast toast={toast} />
    </div>
  );
}
