import { PrescriptionPageSize } from './PrescriptionLetterhead.jsx';
import { PARAMETER_TYPES, DEFAULT_FONT_SIZE, MED_FIELD_GETTERS, PATIENT_FIELD_GETTERS, fmtVitalValue } from '../config/letterPadParameters.js';

// One line per medicine, in the same order across every medicine column —
// so lining Medicine Name / M-A-E-N / AF-BF / Days up as separate columns
// on the letterhead still reads as one table, row for row.
function MedicineFieldLines({ type, items }) {
  if (!items?.length) return <p className="text-ink-400">No medicines recorded today</p>;
  const getter = MED_FIELD_GETTERS[type];
  return (
    <div className="space-y-1.5">
      {items.map((it, i) => <p key={i}>{getter(it)}</p>)}
    </div>
  );
}

// Renders a clinic's saved Letter Pad template (letterhead image + its
// positioned parameter fields) filled in with one patient's real data. Used
// both by the Letter Pad Prescription builder page (Coming Up's) after
// selecting a patient, and by any other screen that needs to print a
// prescription on that same letterhead — e.g. Billing -> Patient Bill —
// so every print of this template stays in sync with the saved layout.
export default function LetterPadBoundView({ imageData, pageHeight, pageWidth, fields, patient, vitals, meds, age }) {
  if (!imageData) return null;

  const renderValue = (def) => {
    if (MED_FIELD_GETTERS[def.type]) return <MedicineFieldLines type={def.type} items={meds} />;
    if (def.type === 'Age') return `Age: ${age ?? '-'}`;
    if (PATIENT_FIELD_GETTERS[def.type]) return PATIENT_FIELD_GETTERS[def.type](patient);
    return fmtVitalValue(def, vitals);
  };

  return (
    <>
      <PrescriptionPageSize height={pageHeight} width={pageWidth} />
      <div className="relative w-full overflow-hidden rounded-lg border border-ink-100 bg-white">
        <img src={imageData} alt="Letterhead" className="block w-full select-none" draggable={false} />
        {(fields || []).map((f) => {
          const def = PARAMETER_TYPES.find((p) => p.type === f.type);
          if (!def) return null; // a field type from before this parameter set changed
          const Icon = def.icon;
          return (
            <div
              key={f.id}
              style={{
                left: `${f.x}%`,
                top: `${f.y}%`,
                // Anchor to the near edge instead of always centering once the
                // drop point is close to it, so the badge always renders fully
                // inside the image regardless of container width.
                transform: `translate(${f.x < 15 ? '0' : f.x > 85 ? '-100%' : '-50%'}, ${f.y < 15 ? '0' : f.y > 85 ? '-100%' : '-50%'})`,
              }}
              className="absolute flex max-w-[85%] items-start gap-1.5 text-xs text-ink-800"
            >
              <Icon size={13} className={`mt-0.5 shrink-0 ${def.iconClass}`} />
              <div style={{ fontSize: `${f.fontSize || DEFAULT_FONT_SIZE}px` }}>{renderValue(def)}</div>
            </div>
          );
        })}
      </div>
    </>
  );
}
