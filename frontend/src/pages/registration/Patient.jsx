import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Save, List, Users, UserCheck } from 'lucide-react';
import { Toast, CardHeader, Modal } from '../../components/ui.jsx';
import BulkImport from '../../components/BulkImport.jsx';
import { useToast } from '../../hooks/useToast.js';
import { patientApi, confirmApi } from '../../api/client.js';

// Letters, spaces and periods only (e.g. "Dr. A. Kumar") — no digits or other punctuation.
const NAME_PATTERN = /^[A-Za-z][A-Za-z\s.]*$/;
const MOBILE_PATTERN = /^\d{10}$/;

export default function Patient() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast, show } = useToast();

  const prefill = location.state?.prefill;
  const fromConfirm = location.state?.fromConfirm === true;

  const [form, setForm] = useState({
    name: prefill?.name || '',
    mobileNo: prefill?.mobileNo || '',
    age: '',
    address: '',
  });
  const [nextId, setNextId] = useState(null);
  const [saving, setSaving] = useState(false);
  // Holds the just-saved patient when we need to offer confirmation
  const [confirmPrompt, setConfirmPrompt] = useState(null);

  const loadNextId = useCallback(() => {
    patientApi.nextId().then((d) => setNextId(d.nextId)).catch(() => setNextId(null));
  }, []);

  useEffect(() => { loadNextId(); }, [loadNextId]);

  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return show('Name is required', 'error');
    if (!NAME_PATTERN.test(form.name.trim())) return show('Name must contain letters only (periods allowed)', 'error');
    if (!form.mobileNo.trim()) return show('Mobile No is required', 'error');
    if (!MOBILE_PATTERN.test(form.mobileNo.trim())) return show('Mobile No must be exactly 10 digits', 'error');
    setSaving(true);
    try {
      const created = await patientApi.create(form);
      show(`Patient saved (ID: ${created.PatientId})`, 'success');
      setForm({ name: '', mobileNo: '', age: '', address: '' });
      loadNextId();
      // If we came from the Confirm flow, offer to confirm this new patient.
      if (fromConfirm) setConfirmPrompt(created);
    } catch (err) {
      show(err.response?.data?.error || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const doConfirm = async () => {
    if (!confirmPrompt) return;
    try {
      await confirmApi.create({ patientId: confirmPrompt.PatientId });
      show(`${confirmPrompt.Name} confirmed`, 'success');
      setConfirmPrompt(null);
      navigate('/confirm/list');
    } catch (err) {
      show(err.response?.data?.error || 'Confirm failed', 'error');
    }
  };

  return (
    <div>
      <form onSubmit={submit} className="card">
        <CardHeader
          icon={Users}
          title="Patient Details"
          subtitle="Enter the patient's basic information"
          actions={
            <>
              <BulkImport
                variant="inline"
                fileName="patient"
                columns={['PatientId', 'Name', 'MobileNo', 'Address']}
                sample={[
                  ['', 'John Doe', '9999911111', '12 Main St'],
                  ['', 'Jane Smith', '8888822222', '45 Park Ave'],
                ]}
                note="Leave PatientId blank to insert, or fill it to update. Only Name is required."
                onImport={(rows) => patientApi.bulk(rows)}
              />
              <button type="button" className="btn-secondary" onClick={() => navigate('/registration/patient-list')}>
                <List size={16} /> View List
              </button>
            </>
          }
        />

        {fromConfirm && (
          <div className="mb-4 rounded-lg border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm text-brand-700">
            Adding a new patient from Confirm — after saving you'll be asked to confirm them.
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="label">Patient ID</label>
            <input
              className="input bg-ink-50 font-semibold text-ink-500"
              value={nextId != null ? `P-${nextId}` : 'Auto'}
              readOnly
              tabIndex={-1}
              title="Auto-generated on save"
            />
          </div>
          <div>
            <label className="label">Name *</label>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value.replace(/[^A-Za-z\s.]/g, '') }))}
              placeholder="Patient name"
            />
          </div>
          <div>
            <label className="label">Mobile No *</label>
            <input
              className="input"
              value={form.mobileNo}
              onChange={(e) => setForm((f) => ({ ...f, mobileNo: e.target.value.replace(/\D/g, '') }))}
              placeholder="10-digit mobile number"
              inputMode="numeric"
              maxLength={10}
            />
          </div>
          <div>
            <label className="label">Age</label>
            <input type="number" min="0" className="input" value={form.age} onChange={update('age')} placeholder="Age in years" />
          </div>
          <div>
            <label className="label">Address</label>
            <input className="input" value={form.address} onChange={update('address')} placeholder="Address" />
          </div>
        </div>
        <div className="mt-5 flex justify-end border-t border-ink-100 pt-4">
          <button type="submit" className="btn-primary" disabled={saving}>
            <Save size={16} /> {saving ? 'Saving...' : 'Save Patient'}
          </button>
        </div>
      </form>

      {/* After-save confirmation prompt (only in the Confirm flow) */}
      <Modal open={!!confirmPrompt} onClose={() => setConfirmPrompt(null)} title="Confirm this patient?">
        {confirmPrompt && (
          <div>
            <p className="text-sm text-ink-600">
              <span className="font-semibold text-ink-800">{confirmPrompt.Name}</span>
              {confirmPrompt.MobileNo ? ` · ${confirmPrompt.MobileNo}` : ''} (ID #{confirmPrompt.PatientId})
              was saved. Do you want to confirm this patient now? Confirming adds them to today's Confirm List with a token.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setConfirmPrompt(null)}>No</button>
              <button className="btn-primary" onClick={doConfirm}>
                <UserCheck size={16} /> Confirm Patient
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Toast toast={toast} />
    </div>
  );
}
