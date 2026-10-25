import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { Modal, Spinner } from './ui.jsx';
import { patientDocumentApi } from '../api/client.js';

// Reused everywhere a patient document list shows a "Preview" action —
// Doctor's Patient History, Patient Records, My Records, and the Vital Sign
// attachments list — so the viewer looks and behaves the same everywhere.
export default function DocumentPreviewModal({ doc, onClose }) {
  const [state, setState] = useState({ loading: true, url: null, mimeType: '', error: '' });

  useEffect(() => {
    if (!doc) return;
    let objectUrl = null;
    let cancelled = false;
    setState({ loading: true, url: null, mimeType: '', error: '' });
    patientDocumentApi.getBlobUrl(doc.DocumentId)
      .then(({ url, mimeType }) => {
        if (cancelled) { URL.revokeObjectURL(url); return; }
        objectUrl = url;
        setState({ loading: false, url, mimeType, error: '' });
      })
      .catch((err) => {
        if (!cancelled) setState({ loading: false, url: null, mimeType: '', error: err.response?.data?.error || 'Could not load preview' });
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [doc]);

  const download = () => doc && patientDocumentApi.download(doc.DocumentId, doc.FileName);

  return (
    <Modal open={!!doc} onClose={onClose} title={doc?.FileName || 'Preview'} size="xl">
      {state.loading ? (
        <Spinner label="Loading preview..." />
      ) : state.error ? (
        <p className="py-10 text-center text-sm text-red-600">{state.error}</p>
      ) : state.mimeType.startsWith('image/') ? (
        <img src={state.url} alt={doc?.FileName} className="mx-auto max-h-[70vh] rounded-lg object-contain" />
      ) : state.mimeType === 'application/pdf' ? (
        <iframe src={state.url} title={doc?.FileName} className="h-[70vh] w-full rounded-lg border border-ink-100" />
      ) : (
        <div className="py-10 text-center text-sm text-ink-500">
          <p>No inline preview available for this file type.</p>
          <button type="button" className="btn-secondary mt-3" onClick={download}>
            <Download size={16} /> Download instead
          </button>
        </div>
      )}
    </Modal>
  );
}
