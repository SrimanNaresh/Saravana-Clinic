import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Store, Save, Trash2, X } from 'lucide-react';
import { CardHeader, Toast } from '../../components/ui.jsx';
import { useToast } from '../../hooks/useToast.js';
import { vendorApi } from '../../api/client.js';
import { isValidNumeric, isValidEmail } from '../../utils/validators.js';

const emptyForm = {
  vendorName: '', companyName: '', contactPerson: '', contactNo: '', alternateNo: '',
  address: '', gstNo: '', dlNo: '', email: '',
};

const rowToForm = (r) => ({
  vendorName: r.VendorName || '', companyName: r.CompanyName || '', contactPerson: r.ContactPerson || '',
  contactNo: r.ContactNo || '', alternateNo: r.AlternateNo || '', address: r.Address || '',
  gstNo: r.GSTNo || '', dlNo: r.DLNo || '', email: r.Email || '',
});

export default function VendorMaster() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast, show } = useToast();
  const [form, setForm] = useState(emptyForm);
  // Set when Vendor List's Edit opened a vendor here; null while adding a new one.
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (location.state?.editVendor) {
      setForm(rowToForm(location.state.editVendor));
      setEditingId(location.state.editVendor.VendorId);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, navigate]);

  const update = (key) => (e) => setForm((c) => ({ ...c, [key]: e.target.value }));

  const backToList = () => navigate('/pharmacy/vendor-list');

  const cancel = () => {
    if (editingId) return backToList();
    setForm(emptyForm);
  };

  const save = async (e) => {
    e.preventDefault();
    if (!form.vendorName.trim()) return show('Vendor name is required', 'error');
    if (!isValidNumeric(form.contactNo)) return show('Contact Number must contain numbers only', 'error');
    if (!isValidNumeric(form.alternateNo)) return show('Alternate Number must contain numbers only', 'error');
    if (!isValidEmail(form.email)) return show('Enter a valid email address', 'error');
    setSaving(true);
    try {
      if (editingId) {
        await vendorApi.update(editingId, form);
        show('Vendor updated successfully', 'success');
      } else {
        await vendorApi.create(form);
        show('Vendor saved successfully', 'success');
      }
      setForm(emptyForm);
      setEditingId(null);
    } catch (err) {
      show(err.response?.data?.error || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!editingId) return;
    if (!confirm(`Delete vendor "${form.vendorName}"?`)) return;
    try {
      await vendorApi.remove(editingId);
      show('Vendor deleted successfully', 'success');
      setForm(emptyForm);
      setEditingId(null);
    } catch (err) {
      show(err.response?.data?.error || 'Delete failed', 'error');
    }
  };

  return (
    <div>
      <div className="card">
        <form onSubmit={save}>
          <CardHeader
            icon={Store}
            title={editingId ? 'Edit Vendor' : 'Vendor Master'}
            subtitle={editingId ? 'Update or delete this vendor' : 'Register a new vendor'}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="label">Vendor Name *</label>
              <input className="input" value={form.vendorName} onChange={update('vendorName')} placeholder="e.g. Sri Murugan Medicals" />
            </div>
            <div>
              <label className="label">Company Name</label>
              <input className="input" value={form.companyName} onChange={update('companyName')} placeholder="Registered company name" />
            </div>
            <div>
              <label className="label">Contact Person</label>
              <input className="input" value={form.contactPerson} onChange={update('contactPerson')} placeholder="Person to contact" />
            </div>
            <div>
              <label className="label">Contact Number</label>
              <input type="tel" inputMode="numeric" className="input" value={form.contactNo} onChange={update('contactNo')} placeholder="e.g. 98765 43210" />
            </div>
            <div>
              <label className="label">Alternate Number</label>
              <input type="tel" inputMode="numeric" className="input" value={form.alternateNo} onChange={update('alternateNo')} placeholder="Optional second number" />
            </div>
            <div>
              <label className="label">Email</label>
              <input type="email" className="input" value={form.email} onChange={update('email')} placeholder="e.g. orders@vendor.com" />
            </div>
            <div>
              <label className="label">GST No</label>
              <input className="input" value={form.gstNo} onChange={update('gstNo')} placeholder="e.g. 33AAAAA0000A1Z5" />
            </div>
            <div>
              <label className="label">DL.No</label>
              <input className="input" value={form.dlNo} onChange={update('dlNo')} placeholder="Drug licence number" />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="label">Address</label>
              <textarea className="input" rows={2} value={form.address} onChange={update('address')} placeholder="Vendor address" />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={cancel}>
              <X size={16} /> Cancel
            </button>
            <button type="button" className="btn-danger" onClick={remove} disabled={!editingId} title={editingId ? 'Delete this vendor' : 'Open a vendor from Vendor List to delete it'}>
              <Trash2 size={16} /> Delete
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              <Save size={16} /> {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>

      <Toast toast={toast} />
    </div>
  );
}
