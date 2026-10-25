import { useEffect, useState, useCallback } from 'react';
import { Building2, Save, Upload, Pencil, Trash2, List, Image, Mail, Phone, Stethoscope, Store, Search, Plus, Ruler, AppWindow } from 'lucide-react';
import { PageHeader, Toast, Spinner, EmptyState, Modal, CardHeader } from '../../components/ui.jsx';
import { useToast } from '../../hooks/useToast.js';
import { clinicApi, pharmacyApi } from '../../api/client.js';
import { isValidText, isValidNumeric, isValidEmail } from '../../utils/validators.js';

const emptyForm = {
  name: '', doctorName: '', logo: '', address: '', email: '', contactNo: '',
  pageHeight: '', pageWidth: '', appName: '',
};
const toForm = (data) => data ? {
  name: data.Name ?? data.name ?? '',
  doctorName: data.DoctorName ?? data.doctorName ?? '',
  logo: data.Logo ?? data.logo ?? '',
  address: data.Address ?? data.address ?? '',
  email: data.Email ?? data.email ?? '',
  contactNo: data.ContactNo ?? data.contactNo ?? '',
  pageHeight: data.PageHeight ?? data.pageHeight ?? '',
  pageWidth: data.PageWidth ?? data.pageWidth ?? '',
  appName: data.AppName ?? data.appName ?? '',
} : { ...emptyForm };

const emptyPharmacy = { name: '', address: '', contactNo: '' };

export default function ClinicDetails() {
  const { toast, show } = useToast();
  const [form, setForm] = useState(emptyForm);
  const [savedClinic, setSavedClinic] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    clinicApi.get().then((data) => { setSavedClinic(data); setForm(toForm(data)); }).catch(() => show('Failed to load clinic details', 'error')).finally(() => setLoading(false));
  }, [show]);

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const uploadLogo = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) return show('Use a PNG or JPG file', 'error');
    if (file.size > 2 * 1024 * 1024) return show('Logo must be 2 MB or smaller', 'error');
    const reader = new FileReader();
    reader.onload = () => setForm((current) => ({ ...current, logo: reader.result }));
    reader.readAsDataURL(file);
  };

  const save = async (event) => {
    event.preventDefault();
    if (!form.name.trim()) return show('Clinic name is required', 'error');
    if (!isValidText(form.name)) return show('Clinic Name must contain letters only', 'error');
    if (!isValidText(form.doctorName)) return show('Doctor Name must contain letters only', 'error');
    if (!isValidText(form.appName)) return show('App Name must contain letters only', 'error');
    if (!isValidEmail(form.email)) return show('Enter a valid email address', 'error');
    if (!isValidNumeric(form.contactNo)) return show('Contact No must contain numbers only', 'error');
    setSaving(true);
    try {
      const saved = await clinicApi.save({
        ...form,
        pageHeight: form.pageHeight ? Number(Number(form.pageHeight).toFixed(2)) : null,
        pageWidth: form.pageWidth ? Number(Number(form.pageWidth).toFixed(2)) : null,
      });
      setSavedClinic(saved);
      show('Clinic details saved', 'success');
    } catch (err) {
      show(err.response?.data?.error || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const editClinic = () => setForm(toForm(savedClinic));
  const deleteClinic = async () => {
    if (!confirm(`Delete clinic "${savedClinic.Name}"?`)) return;
    try {
      await clinicApi.remove();
      setSavedClinic(null);
      setForm(emptyForm);
      show('Clinic deleted', 'success');
    } catch (err) {
      show(err.response?.data?.error || 'Delete failed', 'error');
    }
  };

  // Pharmacy Details: a separate list of pharmacies (add / search / edit / delete).
  const [pharmacyRows, setPharmacyRows] = useState([]);
  const [pharmacyLoading, setPharmacyLoading] = useState(true);
  const [pharmacySearch, setPharmacySearch] = useState('');
  const [pharmacyForm, setPharmacyForm] = useState(emptyPharmacy);
  const [pharmacySaving, setPharmacySaving] = useState(false);
  const [pharmacyEditing, setPharmacyEditing] = useState(null);

  const loadPharmacy = useCallback(async (q = '') => {
    setPharmacyLoading(true);
    try {
      setPharmacyRows(await pharmacyApi.list(q));
    } catch {
      show('Failed to load pharmacies', 'error');
    } finally {
      setPharmacyLoading(false);
    }
  }, [show]);

  useEffect(() => { loadPharmacy(); }, [loadPharmacy]);
  useEffect(() => {
    const t = setTimeout(() => loadPharmacy(pharmacySearch), 350);
    return () => clearTimeout(t);
  }, [pharmacySearch, loadPharmacy]);

  const updatePharmacyForm = (key) => (event) => setPharmacyForm((current) => ({ ...current, [key]: event.target.value }));

  const savePharmacy = async (event) => {
    event.preventDefault();
    if (!pharmacyForm.name.trim()) return show('Pharmacy name is required', 'error');
    if (!isValidText(pharmacyForm.name)) return show('Pharmacy Name must contain letters only', 'error');
    if (!isValidNumeric(pharmacyForm.contactNo)) return show('Contact No must contain numbers only', 'error');
    setPharmacySaving(true);
    try {
      await pharmacyApi.create(pharmacyForm);
      show('Pharmacy saved', 'success');
      setPharmacyForm(emptyPharmacy);
      loadPharmacy(pharmacySearch);
    } catch (err) {
      show(err.response?.data?.error || 'Save failed', 'error');
    } finally {
      setPharmacySaving(false);
    }
  };

  const savePharmacyEdit = async () => {
    if (!pharmacyEditing.Name?.trim()) return show('Pharmacy name is required', 'error');
    if (!isValidText(pharmacyEditing.Name)) return show('Pharmacy Name must contain letters only', 'error');
    if (!isValidNumeric(pharmacyEditing.ContactNo)) return show('Contact No must contain numbers only', 'error');
    try {
      await pharmacyApi.update(pharmacyEditing.PharmacyId, {
        name: pharmacyEditing.Name,
        address: pharmacyEditing.Address,
        contactNo: pharmacyEditing.ContactNo,
      });
      show('Pharmacy updated', 'success');
      setPharmacyEditing(null);
      loadPharmacy(pharmacySearch);
    } catch (err) {
      show(err.response?.data?.error || 'Update failed', 'error');
    }
  };

  const deletePharmacy = async (row) => {
    if (!confirm(`Delete pharmacy "${row.Name}"?`)) return;
    try {
      await pharmacyApi.remove(row.PharmacyId);
      show('Pharmacy deleted', 'success');
      loadPharmacy(pharmacySearch);
    } catch (err) {
      show(err.response?.data?.error || 'Delete failed', 'error');
    }
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader title="Clinic Master" />

      <div className="card mb-5">
        <CardHeader icon={List} title="Clinic List" subtitle="View, edit or delete the saved clinic configuration" />
        {!savedClinic ? (
          <p className="py-4 text-sm text-slate-400">No clinic details saved.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="table-head"><th className="rounded-l-lg px-3 py-3">Clinic Name</th><th className="px-3 py-3">Doctor</th><th className="px-3 py-3">Contact</th><th className="px-3 py-3">Address</th><th className="rounded-r-lg px-3 py-3 text-right">Actions</th></tr></thead>
              <tbody><tr className="table-row"><td className="px-3 py-3 font-medium text-slate-700">{savedClinic.Name}</td><td className="px-3 py-3 text-slate-500">{savedClinic.DoctorName || '-'}</td><td className="px-3 py-3 text-slate-500">{savedClinic.ContactNo || '-'}</td><td className="px-3 py-3 text-slate-500">{savedClinic.Address || '-'}</td><td className="px-3 py-3"><div className="flex justify-end gap-1"><button type="button" className="btn-ghost px-2 py-1" title="Edit clinic" onClick={editClinic}><Pencil size={15} /></button><button type="button" className="btn-ghost px-2 py-1 text-red-500 hover:bg-red-50" title="Delete clinic" onClick={deleteClinic}><Trash2 size={15} /></button></div></td></tr></tbody>
            </table>
          </div>
        )}
      </div>

      <form onSubmit={save} className="space-y-5">
        <div className="card">
          <CardHeader icon={Building2} title="Clinic Details" subtitle="These details appear on printed prescriptions" />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <label className="label">Clinic Name *</label>
              <input className="input" value={form.name} onChange={update('name')} placeholder="Clinic name" />
            </div>
            <div>
              <label className="label"><Stethoscope size={13} className="mb-0.5 inline" /> Doctor Name</label>
              <input className="input" value={form.doctorName} onChange={update('doctorName')} placeholder="e.g. Dr. Rico V. Sailles" />
            </div>
            <div>
              <label className="label"><Mail size={13} className="mb-0.5 inline" /> Email ID</label>
              <input type="email" className="input" value={form.email} onChange={update('email')} placeholder="clinic@example.com" />
            </div>
            <div>
              <label className="label"><Phone size={13} className="mb-0.5 inline" /> Contact No</label>
              <input type="tel" inputMode="numeric" className="input" value={form.contactNo} onChange={update('contactNo')} placeholder="e.g. 98765 43210" />
            </div>
            <div className="lg:col-span-2">
              <label className="label">Address</label>
              <textarea className="input" rows={3} value={form.address} onChange={update('address')} placeholder="Full clinic address" />
            </div>
          </div>

          <div className="mt-5 border-t border-ink-100 pt-4">
            <label className="label"><Image size={13} className="mb-0.5 inline" /> Logo</label>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-brand-200 bg-brand-50/50 px-4 py-3 text-sm text-brand-700 hover:bg-brand-50">
                <Upload size={16} />
                <span>{form.logo ? 'Replace logo' : 'Choose PNG or JPG logo'}</span>
                <input type="file" accept="image/png,image/jpeg" className="sr-only" onChange={uploadLogo} />
              </label>
              {form.logo && <img src={form.logo} alt="Clinic logo preview" className="h-16 w-16 rounded-lg border border-ink-100 object-contain p-1" />}
            </div>
          </div>

          <div className="mt-5 border-t border-ink-100 pt-4">
            <label className="label"><AppWindow size={13} className="mb-0.5 inline" /> App Name</label>
            <p className="mb-3 text-xs text-ink-400">Used only when installing this app to a device's home screen (the name shown there and while downloading). It does not change the "Ayush Pro" product name shown in the sidebar or sign-in screen. Leave blank to use "Ayush Pro".</p>
            <input className="input max-w-sm" value={form.appName} onChange={update('appName')} placeholder="e.g. Ayush Pro" />
          </div>

          <div className="mt-5 border-t border-ink-100 pt-4">
            <label className="label"><Ruler size={13} className="mb-0.5 inline" /> Prescription Print Size</label>
            <p className="mb-3 text-xs text-ink-400">Sets the physical paper size the prescription prints on. Leave blank to use the browser's default page size.</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Height (cm)</label>
                <input type="number" min="0.1" step="0.1" className="input" value={form.pageHeight} onChange={update('pageHeight')} placeholder="e.g. 21" />
              </div>
              <div>
                <label className="label">Width (cm)</label>
                <input type="number" min="0.1" step="0.1" className="input" value={form.pageWidth} onChange={update('pageWidth')} placeholder="e.g. 14.8" />
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button type="submit" className="btn-primary" disabled={saving}><Save size={16} /> {saving ? 'Saving...' : 'Save Clinic Master'}</button>
        </div>
      </form>

      <div className="card mt-5">
        <form onSubmit={savePharmacy}>
          <CardHeader
            icon={Store}
            title="Pharmacy Details"
            subtitle="Add pharmacies linked to this clinic"
            actions={
              <div className="relative w-full sm:w-72">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                <input className="input pl-9" placeholder="Search pharmacies..." value={pharmacySearch} onChange={(e) => setPharmacySearch(e.target.value)} />
              </div>
            }
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
            <div>
              <label className="label">Pharmacy Name *</label>
              <input className="input" value={pharmacyForm.name} onChange={updatePharmacyForm('name')} placeholder="e.g. City Pharmacy" />
            </div>
            <div>
              <label className="label">Address</label>
              <input className="input" value={pharmacyForm.address} onChange={updatePharmacyForm('address')} placeholder="Pharmacy address" />
            </div>
            <div>
              <label className="label">Contact No</label>
              <input type="tel" inputMode="numeric" className="input" value={pharmacyForm.contactNo} onChange={updatePharmacyForm('contactNo')} placeholder="e.g. 98765 43210" />
            </div>
            <div>
              <button type="submit" className="btn-primary w-full" disabled={pharmacySaving}>
                <Plus size={16} /> {pharmacySaving ? 'Saving...' : 'Add Pharmacy'}
              </button>
            </div>
          </div>
        </form>

        <div className="mt-5 border-t border-ink-100 pt-4">
          {pharmacyLoading ? (
            <Spinner />
          ) : pharmacyRows.length === 0 ? (
            <EmptyState message="No pharmacies found." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="table-head">
                    <th className="rounded-l-lg px-3 py-3">Pharmacy Name</th>
                    <th className="px-3 py-3">Address</th>
                    <th className="px-3 py-3">Contact No</th>
                    <th className="rounded-r-lg px-3 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pharmacyRows.map((r) => (
                    <tr key={r.PharmacyId} className="table-row">
                      <td className="px-3 py-3 font-medium text-slate-700">{r.Name}</td>
                      <td className="px-3 py-3 text-slate-500">{r.Address || '-'}</td>
                      <td className="px-3 py-3 text-slate-500">{r.ContactNo || '-'}</td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end gap-1">
                          <button type="button" className="btn-ghost px-2 py-1" title="Edit pharmacy" onClick={() => setPharmacyEditing({ ...r })}><Pencil size={15} /></button>
                          <button type="button" className="btn-ghost px-2 py-1 text-red-500 hover:bg-red-50" title="Delete pharmacy" onClick={() => deletePharmacy(r)}><Trash2 size={15} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Modal open={!!pharmacyEditing} onClose={() => setPharmacyEditing(null)} title="Edit Pharmacy">
        {pharmacyEditing && (
          <div className="space-y-4">
            <div>
              <label className="label">Pharmacy Name *</label>
              <input className="input" value={pharmacyEditing.Name || ''} onChange={(e) => setPharmacyEditing({ ...pharmacyEditing, Name: e.target.value })} />
            </div>
            <div>
              <label className="label">Address</label>
              <input className="input" value={pharmacyEditing.Address || ''} onChange={(e) => setPharmacyEditing({ ...pharmacyEditing, Address: e.target.value })} />
            </div>
            <div>
              <label className="label">Contact No</label>
              <input type="tel" inputMode="numeric" className="input" value={pharmacyEditing.ContactNo || ''} onChange={(e) => setPharmacyEditing({ ...pharmacyEditing, ContactNo: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setPharmacyEditing(null)}>Cancel</button>
              <button className="btn-primary" onClick={savePharmacyEdit}><Save size={16} /> Save Changes</button>
            </div>
          </div>
        )}
      </Modal>

      <Toast toast={toast} />
    </div>
  );
}
