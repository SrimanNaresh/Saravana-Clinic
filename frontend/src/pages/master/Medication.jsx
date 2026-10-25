import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save, List, Pill } from 'lucide-react';
import { Toast, CardHeader } from '../../components/ui.jsx';
import BulkImport from '../../components/BulkImport.jsx';
import { useToast } from '../../hooks/useToast.js';
import { medicationApi } from '../../api/client.js';

const categories = ['Tablet', 'Capsule', 'Syrup', 'Injection', 'Ointment', 'Drops', 'Other'];

export default function Medication() {
  const navigate = useNavigate();
  const { toast, show } = useToast();
  const [form, setForm] = useState({ medicineName: '', genericName: '', category: '' });
  const [saving, setSaving] = useState(false);

  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.medicineName.trim()) return show('Medicine Name is required', 'error');
    setSaving(true);
    try {
      await medicationApi.create(form);
      show('Medication saved', 'success');
      setForm({ medicineName: '', genericName: '', category: '' });
    } catch (err) {
      show(err.response?.data?.error || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <form onSubmit={submit} className="card">
        <CardHeader
          icon={Pill}
          title="Medicine Details"
          subtitle="Fill in the medicine information below"
          actions={
            <>
              <BulkImport
                variant="inline"
                fileName="medication"
                columns={['MedicationId', 'MedicineName', 'GenericName', 'Category']}
                sample={[
                  ['', 'Paracetamol 500mg', 'Acetaminophen', 'Tablet'],
                  ['', 'Amoxicillin 250mg', 'Amoxicillin', 'Capsule'],
                ]}
                note="Leave MedicationId blank to insert a new medicine, or fill it to update an existing one. Only MedicineName is required."
                onImport={(rows) => medicationApi.bulk(rows)}
              />
              <button type="button" className="btn-secondary" onClick={() => navigate('/master/medication-list')}>
                <List size={16} /> View List
              </button>
            </>
          }
        />

        {/* All fields + action on a single row across 4 columns on large screens */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
          <div>
            <label className="label">Medicine Name *</label>
            <input className="input" value={form.medicineName} onChange={update('medicineName')} placeholder="e.g. Paracetamol 500mg" />
          </div>
          <div>
            <label className="label">Generic Name</label>
            <input className="input" value={form.genericName} onChange={update('genericName')} placeholder="e.g. Acetaminophen" />
          </div>
          <div>
            <label className="label">Category</label>
            <select className="input" value={form.category} onChange={update('category')}>
              <option value="">Select category</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <button type="submit" className="btn-primary w-full" disabled={saving}>
              <Save size={16} /> {saving ? 'Saving...' : 'Save Medication'}
            </button>
          </div>
        </div>
      </form>

      <Toast toast={toast} />
    </div>
  );
}
