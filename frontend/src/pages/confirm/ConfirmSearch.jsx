import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserCheck, ListChecks } from 'lucide-react';
import { PageHeader, Toast } from '../../components/ui.jsx';
import PatientPicker from '../../components/PatientPicker.jsx';
import { useToast } from '../../hooks/useToast.js';
import { confirmApi } from '../../api/client.js';

export default function ConfirmSearch() {
  const navigate = useNavigate();
  const { toast, show } = useToast();
  const [selected, setSelected] = useState(null);
  const [confirming, setConfirming] = useState(false);

  const addNew = (name, mobile) => {
    navigate('/registration/patient', { state: { prefill: { name, mobileNo: mobile }, fromConfirm: true } });
  };

  const confirmPatient = async () => {
    if (!selected) return;
    setConfirming(true);
    try {
      await confirmApi.create({ patientId: selected.PatientId });
      show(`${selected.Name} confirmed for today`, 'success');
    } catch (err) {
      show(err.response?.data?.error || 'Confirm failed', 'error');
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Confirm Patient"
        actions={
          <button className="btn-secondary" onClick={() => navigate('/confirm/list')}>
            <ListChecks size={16} /> Confirm List
          </button>
        }
      />

      <PatientPicker selected={selected} onSelect={setSelected} onAddNew={addNew} />

      {selected && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-brand-800">{selected.Name}</p>
            <p className="text-xs text-brand-600">{selected.MobileNo || 'No mobile'} · ID #{selected.PatientId}</p>
          </div>
          <button className="btn-primary" onClick={confirmPatient} disabled={confirming}>
            <UserCheck size={16} /> {confirming ? 'Confirming...' : 'Confirm Patient'}
          </button>
        </div>
      )}

      <Toast toast={toast} />
    </div>
  );
}
