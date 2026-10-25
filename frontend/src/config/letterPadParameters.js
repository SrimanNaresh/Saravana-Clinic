import { Activity, Pill, Ruler, Weight as WeightIcon, HeartPulse, Thermometer, MessageSquare, Clock, Utensils, CalendarDays, Hash, User, Cake, Phone } from 'lucide-react';

export const DEFAULT_FONT_SIZE = 12;
export const MIN_FONT_SIZE = 8;
export const MAX_FONT_SIZE = 28;

// Tailwind's build-time scanner only picks up class names that appear as
// literal strings in the source — never interpolated (e.g. `border-${x}-200`),
// which would silently compile to no styling at all. So each variant here is
// spelled out in full rather than built from a shared "accent" color name.
//
// Each Vital Sign field from the Vital Sign screen (vitalKey matches the
// property VitalSign records return) is its own draggable parameter, so it
// can be positioned independently on the letterhead — plus Medication as
// one combined block. All six vital fields share the rose color family so
// they still read as "vitals" at a glance, distinct from Medication's blue.
const ROSE_PALETTE_CLASS = 'border-rose-200 bg-rose-50 text-rose-700';
const ROSE_ICON_CLASS = 'text-rose-600';
const ROSE_EDIT_BADGE_CLASS = 'cursor-grab border-rose-300 bg-rose-100 font-semibold text-rose-800 active:cursor-grabbing';

// Shared by the Letter Pad Prescription builder (Coming Up's) and anywhere
// else a prescription needs to print on the same letterhead template (e.g.
// Billing -> Patient Bill), so both stay in sync with one source of truth.
export const PARAMETER_TYPES = [
  { type: 'Height', label: 'Height', group: 'Vital Sign', vitalKey: 'Height', unit: 'cm', icon: Ruler,
    paletteClass: ROSE_PALETTE_CLASS, iconClass: ROSE_ICON_CLASS, editBadgeClass: ROSE_EDIT_BADGE_CLASS },
  { type: 'Weight', label: 'Weight', group: 'Vital Sign', vitalKey: 'Weight', unit: 'kg', icon: WeightIcon,
    paletteClass: ROSE_PALETTE_CLASS, iconClass: ROSE_ICON_CLASS, editBadgeClass: ROSE_EDIT_BADGE_CLASS },
  { type: 'BloodPressure', label: 'Blood Pressure', group: 'Vital Sign', vitalKey: 'BloodPressure', unit: '', icon: HeartPulse,
    paletteClass: ROSE_PALETTE_CLASS, iconClass: ROSE_ICON_CLASS, editBadgeClass: ROSE_EDIT_BADGE_CLASS },
  { type: 'PulseRate', label: 'Pulse Rate', group: 'Vital Sign', vitalKey: 'PulseRate', unit: 'bpm', icon: Activity,
    paletteClass: ROSE_PALETTE_CLASS, iconClass: ROSE_ICON_CLASS, editBadgeClass: ROSE_EDIT_BADGE_CLASS },
  { type: 'Temperature', label: 'Temperature', group: 'Vital Sign', vitalKey: 'Temperature', unit: '°C', icon: Thermometer,
    paletteClass: ROSE_PALETTE_CLASS, iconClass: ROSE_ICON_CLASS, editBadgeClass: ROSE_EDIT_BADGE_CLASS },
  { type: 'Comments', label: 'Comments', group: 'Vital Sign', vitalKey: 'Comments', unit: '', icon: MessageSquare,
    paletteClass: ROSE_PALETTE_CLASS, iconClass: ROSE_ICON_CLASS, editBadgeClass: ROSE_EDIT_BADGE_CLASS },

  // Medicine columns — same split-per-field approach as Vital Sign, and the
  // same color coding as the Medications table itself: Medicine Name and
  // M/A/E/N in blue, AF/BF in amber, Days in neutral gray.
  { type: 'MedicineName', label: 'Medicine Name', group: 'Medicine', icon: Pill,
    paletteClass: 'border-brand-200 bg-brand-50 text-brand-700', iconClass: 'text-brand-600',
    editBadgeClass: 'cursor-grab border-brand-300 bg-brand-100 font-semibold text-brand-800 active:cursor-grabbing' },
  { type: 'Timing', label: 'M / A / E / N', group: 'Medicine', icon: Clock,
    paletteClass: 'border-brand-200 bg-brand-50 text-brand-700', iconClass: 'text-brand-600',
    editBadgeClass: 'cursor-grab border-brand-300 bg-brand-100 font-semibold text-brand-800 active:cursor-grabbing' },
  { type: 'FoodTiming', label: 'AF / BF', group: 'Medicine', icon: Utensils,
    paletteClass: 'border-amber-200 bg-amber-50 text-amber-700', iconClass: 'text-amber-600',
    editBadgeClass: 'cursor-grab border-amber-300 bg-amber-100 font-semibold text-amber-800 active:cursor-grabbing' },
  { type: 'Days', label: 'Days', group: 'Medicine', icon: CalendarDays,
    paletteClass: 'border-slate-200 bg-slate-50 text-slate-700', iconClass: 'text-slate-500',
    editBadgeClass: 'cursor-grab border-slate-300 bg-slate-100 font-semibold text-slate-800 active:cursor-grabbing' },

  // Patient Details — sourced from the patient record itself (teal, distinct
  // from vitals/medicine), each its own draggable parameter.
  { type: 'PatientId', label: 'ID', group: 'Patient', icon: Hash,
    paletteClass: 'border-teal-200 bg-teal-50 text-teal-700', iconClass: 'text-teal-600',
    editBadgeClass: 'cursor-grab border-teal-300 bg-teal-100 font-semibold text-teal-800 active:cursor-grabbing' },
  { type: 'PatientName', label: 'Patient Name', group: 'Patient', icon: User,
    paletteClass: 'border-teal-200 bg-teal-50 text-teal-700', iconClass: 'text-teal-600',
    editBadgeClass: 'cursor-grab border-teal-300 bg-teal-100 font-semibold text-teal-800 active:cursor-grabbing' },
  { type: 'Age', label: 'Age', group: 'Patient', icon: Cake,
    paletteClass: 'border-teal-200 bg-teal-50 text-teal-700', iconClass: 'text-teal-600',
    editBadgeClass: 'cursor-grab border-teal-300 bg-teal-100 font-semibold text-teal-800 active:cursor-grabbing' },
  { type: 'MobileNo', label: 'Mobile No', group: 'Patient', icon: Phone,
    paletteClass: 'border-teal-200 bg-teal-50 text-teal-700', iconClass: 'text-teal-600',
    editBadgeClass: 'cursor-grab border-teal-300 bg-teal-100 font-semibold text-teal-800 active:cursor-grabbing' },
];

const TIMING_ORDER = ['Morning', 'Afternoon', 'Evening', 'Night'];
export const frequencyToCode = (frequency) => {
  const chosen = (frequency || '').split(',').map((v) => v.trim()).filter(Boolean);
  return TIMING_ORDER.map((t) => (chosen.includes(t) ? '1' : '0')).join('-');
};

export const fmtVitalValue = (def, vitals) => {
  const v = vitals?.[def.vitalKey];
  if (!v) return `${def.label}: -`;
  return `${def.label}: ${v}${def.unit ? ` ${def.unit}` : ''}`;
};

// Patient identity fields expect { PatientId, PatientName, MobileNo } — Age
// is passed separately since it doesn't come from the same source record
// on every screen that binds this template to a patient.
export const PATIENT_FIELD_GETTERS = {
  PatientId: (patient) => `ID: ${patient?.PatientId ?? '-'}`,
  PatientName: (patient) => `Patient Name: ${patient?.PatientName ?? '-'}`,
  MobileNo: (patient) => `Mobile No: ${patient?.MobileNo ?? '-'}`,
};

export const MED_FIELD_GETTERS = {
  MedicineName: (it) => it.MedicineName || '-',
  Timing: (it) => frequencyToCode(it.Frequency),
  FoodTiming: (it) => it.Instructions || '-',
  Days: (it) => it.Duration || '-',
};
