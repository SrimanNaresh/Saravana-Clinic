import { useState } from 'react';
import { Search, User, Phone, Check, UserPlus } from 'lucide-react';
import { patientApi } from '../api/client.js';
import { Spinner } from './ui.jsx';

/**
 * Search patients by name and/or mobile. When multiple patients share a
 * mobile number, all matches are listed so the user can pick the right one.
 */
export default function PatientPicker({ selected, onSelect, onAddNew }) {
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // Letters and single spaces only — strips anything else, then collapses
  // repeated spaces so "John   Doe" typed fast still comes out "John Doe".
  const onNameChange = (e) => {
    const cleaned = e.target.value.replace(/[^A-Za-z\s]/g, '').replace(/\s{2,}/g, ' ');
    setName(cleaned);
  };

  // Digits only, capped at 10.
  const onMobileChange = (e) => {
    setMobile(e.target.value.replace(/\D/g, '').slice(0, 10));
  };

  const doSearch = async (e) => {
    e?.preventDefault();
    setLoading(true);
    setSearched(true);
    try {
      const data = await patientApi.list({ search: name, mobile });
      setResults(data);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <form onSubmit={doSearch} className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[180px]">
          <label className="label">Patient Name</label>
          <div className="relative">
            <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Name" value={name} onChange={onNameChange} />
          </div>
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="label">Mobile No</label>
          <div className="relative">
            <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="tel" inputMode="numeric" className="input pl-9" placeholder="Mobile" value={mobile} onChange={onMobileChange} />
          </div>
        </div>
        <button type="submit" className="btn-primary">
          <Search size={16} /> Search
        </button>
      </form>

      {selected && (
        <div className="mt-4 flex items-center justify-between rounded-lg border border-brand-200 bg-brand-50 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-brand-800">{selected.Name}</p>
            <p className="text-xs text-brand-600">{selected.MobileNo || 'No mobile'} · ID #{selected.PatientId}</p>
          </div>
          <span className="badge bg-brand-600 text-white"><Check size={12} className="mr-1" /> Selected</span>
        </div>
      )}

      {loading ? (
        <Spinner label="Searching..." />
      ) : searched && results.length === 0 ? (
        <div className="mt-4 flex flex-col items-center gap-3 rounded-lg border border-dashed border-ink-200 bg-ink-50/50 py-8">
          <p className="text-sm text-ink-400">No matching patients.</p>
          {onAddNew && (
            <button type="button" className="btn-primary" onClick={() => onAddNew(name.trim(), mobile.trim())}>
              <UserPlus size={16} /> Add New Patient
            </button>
          )}
        </div>
      ) : results.length > 0 ? (
        <div className="mt-4">
          {results.length > 1 && (
            <p className="mb-2 text-xs font-medium text-amber-600">
              {results.length} patients matched — select the correct one.
            </p>
          )}
          <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-100">
            {results.map((p) => (
              <button
                key={p.PatientId}
                onClick={() => onSelect(p)}
                className={`flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-slate-50 ${
                  selected?.PatientId === p.PatientId ? 'bg-brand-50' : ''
                }`}
              >
                <div>
                  <p className="text-sm font-medium text-slate-700">{p.Name}</p>
                  <p className="text-xs text-slate-400">{p.MobileNo || 'No mobile'} · {p.Address || 'No address'}</p>
                </div>
                <span className="text-xs text-slate-400">#{p.PatientId}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
