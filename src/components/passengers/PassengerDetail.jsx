import React from 'react';
import { Edit2, User } from 'lucide-react';

const lbl = 'text-xs font-medium text-gray-500';
const val = 'text-sm text-gray-800 mt-0.5';

function Section({ title, children }) {
  return (
    <div className="border border-gray-200 rounded-xl p-5 space-y-4">
      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, value, placeholder = '—' }) {
  return (
    <div>
      <p className={lbl}>{label}</p>
      <p className={val}>{value || <span className="text-gray-400 italic">{placeholder}</span>}</p>
    </div>
  );
}

function Tags({ label, values = [] }) {
  return (
    <div>
      <p className={lbl}>{label}</p>
      {values.length === 0
        ? <p className={`${val} text-gray-400 italic`}>None recorded</p>
        : (
          <div className="flex flex-wrap gap-1.5 mt-1">
            {values.map(v => (
              <span key={v} className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-medium">
                {v}
              </span>
            ))}
          </div>
        )}
    </div>
  );
}

function formatDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
}

const WHEELCHAIR_AIDS = ['Manual Wheelchair', 'Power Wheelchair'];

export default function PassengerDetail({ passenger, onEdit, onBack, completeness, managerName }) {
  const p = passenger;
  const fullName = [p.preferredName || p.firstName, p.lastName].filter(Boolean).join(' ');
  const legalName = p.preferredName ? `${p.firstName} ${p.lastName}` : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
            <User size={22} className="text-blue-600" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">{fullName}</h2>
            {legalName && <p className="text-sm text-gray-500">Legal name: {legalName}</p>}
            {p.dateOfBirth && (
              <p className="text-sm text-gray-500">{formatDate(p.dateOfBirth)}{p.gender ? ` · ${p.gender}` : ''}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {completeness !== undefined && (
            <div className="flex items-center gap-2">
              <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-500"
                  style={{ width: `${completeness}%` }}
                />
              </div>
              <span className="text-xs text-gray-500">{completeness}% complete</span>
            </div>
          )}
          <button
            onClick={onEdit}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
          >
            <Edit2 size={14} /> Edit profile
          </button>
        </div>
      </div>

      {/* Personal details */}
      <Section title="Personal details">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Email" value={p.email} />
          <Field label="Phone" value={p.phone} />
          {managerName && (
            <div className="col-span-2">
              <p className={lbl}>Reports to</p>
              <p className="text-sm text-gray-800 mt-0.5">{managerName}</p>
            </div>
          )}
        </div>
      </Section>

      {/* Emergency contact */}
      {(p.emergencyName || p.emergencyPhone) && (
        <Section title="Emergency contact">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Name" value={p.emergencyName} />
            <Field label="Relationship" value={p.emergencyRelationship} />
            <Field label="Phone" value={p.emergencyPhone} />
            <Field label="Email" value={p.emergencyEmail} />
          </div>
        </Section>
      )}

      {/* Identity documents */}
      {p.identityDocuments?.length > 0 && (
        <Section title="Identity documents">
          <div className="space-y-3">
            {p.identityDocuments.map((doc, i) => (
              <div key={i} className="grid grid-cols-2 gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <Field label="Document type" value={doc.type} />
                <Field label="Number" value={doc.number} />
                <Field label="Expiry" value={formatDate(doc.expiry)} />
                <Field label="Issuing country / state" value={doc.notes} />
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Accessibility & support needs */}
      {(p.disabilityType?.length > 0 || p.mobilityAids?.length > 0 || p.dietaryRequirements?.length > 0 ||
        p.carerRequired || p.allergyNotes || p.medicalNotes || p.supportNotes) && (
        <Section title="Accessibility & support needs">
          <div className="space-y-4">
            {p.disabilityType?.length > 0 && <Tags label="Disability / support needs" values={p.disabilityType} />}
            {p.mobilityAids?.length > 0 && <Tags label="Mobility aids" values={p.mobilityAids} />}
            {p.carerRequired && (
              <div>
                <p className={lbl}>Carer / support worker</p>
                <p className={val}>{p.carerName ? `Travels with ${p.carerName}` : 'Carer travels with passenger'}</p>
              </div>
            )}

            {/* Wheelchair details */}
            {p.mobilityAids?.some(a => WHEELCHAIR_AIDS.includes(a)) && (
              p.wheelchairTransfer || p.wheelchairModel || p.wheelchairDimensions || p.wheelchairWeight
            ) && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
                <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Wheelchair details</p>
                {p.wheelchairTransfer && <Field label="Transfer method" value={p.wheelchairTransfer} />}
                <div className="grid grid-cols-2 gap-3">
                  {p.wheelchairModel && <Field label="Model" value={p.wheelchairModel} />}
                  {p.wheelchairWeight && <Field label="Weight" value={`${p.wheelchairWeight} kg`} />}
                  {p.wheelchairDimensions && <Field label="Dimensions (L × W × H)" value={`${p.wheelchairDimensions} cm`} />}
                  {p.wheelchairBatteryModel && <Field label="Battery model" value={p.wheelchairBatteryModel} />}
                </div>
              </div>
            )}

            {p.dietaryRequirements?.length > 0 && <Tags label="Dietary requirements" values={p.dietaryRequirements} />}
            {p.allergyNotes && <Field label="Allergy / dietary notes" value={p.allergyNotes} />}
            {p.medicalNotes && <Field label="Medical conditions / notes" value={p.medicalNotes} />}
            {p.supportNotes && <Field label="Additional support requirements" value={p.supportNotes} />}
          </div>
        </Section>
      )}

      {/* Travel preferences */}
      {(p.seatPreference || p.mealPreference || p.frequentFlyer?.length > 0 || p.travelNotes) && (
        <Section title="Travel preferences">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {p.seatPreference && <Field label="Seat preference" value={p.seatPreference} />}
              {p.mealPreference && <Field label="Meal preference" value={p.mealPreference} />}
            </div>
            {p.frequentFlyer?.length > 0 && (
              <div>
                <p className={lbl}>Frequent flyer numbers</p>
                <div className="space-y-1 mt-1">
                  {p.frequentFlyer.map((ff, i) => (
                    <p key={i} className={val}>{ff.airline} — {ff.number}</p>
                  ))}
                </div>
              </div>
            )}
            {p.travelNotes && <Field label="Travel notes" value={p.travelNotes} />}
          </div>
        </Section>
      )}
    </div>
  );
}
