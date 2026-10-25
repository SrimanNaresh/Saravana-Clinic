// Shared header/footer for printed prescriptions, sourced from Clinic Master.
// Header: Doctor Name on the left, Clinic Name/Email/Contact/Address on the right.
// Footer: Clinic Name/Address on the left, Contact No on the right.

import { Mail, Phone, MapPin } from 'lucide-react';

export function PrescriptionHeader({ doctorName, clinicName, email, contactNo, address, logo }) {
  const initial = (doctorName || 'D').trim().charAt(0).toUpperCase();
  return (
    <div className="border-b-2 border-brand-600 pb-4">
      <div className="mb-3 h-1.5 w-full rounded-full bg-brand-gradient" />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          {logo ? (
            <img src={logo} alt="Clinic logo" className="h-14 w-14 shrink-0 rounded-xl object-contain ring-1 ring-ink-100" />
          ) : (
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-brand-gradient text-xl font-bold text-white">
              {initial}
            </div>
          )}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-teal-600">Prescribed By</p>
            <h1 className="text-xl font-bold leading-tight text-ink-800">{doctorName || 'Doctor'}</h1>
          </div>
        </div>
        <div className="max-w-[260px] text-right">
          <p className="text-lg font-bold leading-tight text-brand-700">{clinicName || 'Clinic'}</p>
          <div className="mt-1.5 space-y-1 text-xs text-ink-500">
            {email && (
              <p className="flex items-start justify-end gap-1.5">
                <Mail size={12} className="mt-0.5 shrink-0 text-ink-400" />
                <span className="min-w-0 break-words">{email}</span>
              </p>
            )}
            {contactNo && (
              <p className="flex items-start justify-end gap-1.5">
                <Phone size={12} className="mt-0.5 shrink-0 text-ink-400" />
                <span className="min-w-0 break-words">{contactNo}</span>
              </p>
            )}
            {address && (
              <p className="flex items-start justify-end gap-1.5">
                <MapPin size={12} className="mt-0.5 shrink-0 text-ink-400" />
                <span className="min-w-0 break-words">{address}</span>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function PrescriptionFooter({ clinicName, address, contactNo }) {
  return (
    <div className="mt-8 border-t-2 border-brand-100 pt-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-brand-700">{clinicName || 'Clinic'}</p>
          {address && <p className="mt-0.5 text-xs text-ink-500">{address}</p>}
        </div>
        {contactNo && (
          <p className="flex items-center gap-1.5 text-xs font-medium text-ink-600">
            <Phone size={12} className="text-teal-600" />
            {contactNo}
          </p>
        )}
      </div>
      <div className="mt-3 h-1 w-full rounded-full bg-brand-gradient opacity-70" />
      <p className="mt-2 text-center text-[10px] uppercase tracking-widest text-ink-300">
        This is a computer-generated prescription
      </p>
    </div>
  );
}

// Sets the physical paper size for window.print() via @page, from Clinic Master's
// configured Height/Width (cm). Renders nothing when either value is missing,
// leaving the browser's default page size in place.
export function PrescriptionPageSize({ height, width }) {
  if (!height || !width) return null;
  return <style>{`@page { size: ${width}cm ${height}cm; }`}</style>;
}
