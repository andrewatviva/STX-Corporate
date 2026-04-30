import React, { useState } from 'react';
import { Edit2, User, Printer, AlertTriangle, X, ClipboardCheck } from 'lucide-react';
import DocumentVault from './DocumentVault';
import { useAuth } from '../../contexts/AuthContext';

const lbl = 'text-xs font-medium text-gray-700';
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
      <p className={val}>{value || <span className="text-gray-600 italic">{placeholder}</span>}</p>
    </div>
  );
}

function Tags({ label, values = [] }) {
  return (
    <div>
      <p className={lbl}>{label}</p>
      {values.length === 0
        ? <p className={`${val} text-gray-600 italic`}>None recorded</p>
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

// ── Emergency Summary Card ────────────────────────────────────────────────────

function ERow({ label, value, highlight }) {
  if (!value) return null;
  return (
    <div className={`py-2 border-b border-gray-100 last:border-0 ${highlight ? 'bg-red-50 -mx-4 px-4 rounded' : ''}`}>
      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-sm text-gray-900 whitespace-pre-line">{value}</p>
    </div>
  );
}

function ESection({ title, color = 'gray', children }) {
  const colors = {
    red:    'border-red-400 bg-red-50',
    amber:  'border-amber-400 bg-amber-50',
    blue:   'border-blue-400 bg-blue-50',
    gray:   'border-gray-300 bg-gray-50',
  };
  return (
    <div className={`rounded-xl border-l-4 p-4 ${colors[color]}`}>
      <p className={`text-xs font-bold uppercase tracking-widest mb-3 ${color === 'red' ? 'text-red-700' : color === 'amber' ? 'text-amber-700' : color === 'blue' ? 'text-blue-700' : 'text-gray-600'}`}>
        {title}
      </p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function EmergencyCard({ passenger: p, onClose }) {
  const fullName  = [p.title, p.preferredName || p.firstName, p.lastName].filter(Boolean).join(' ');
  const legalName = p.preferredName ? [p.title, p.firstName, p.lastName].filter(Boolean).join(' ') : null;
  const age = p.dateOfBirth
    ? Math.floor((new Date() - new Date(p.dateOfBirth)) / (365.25 * 24 * 3600 * 1000))
    : null;

  return (
    <>
      {/* Print isolation styles */}
      <style>{`
        @media print {
          body > * { visibility: hidden !important; }
          #emg-print, #emg-print * { visibility: visible !important; }
          #emg-print { position: fixed; inset: 0; overflow: visible; padding: 24px; background: white; }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 z-40 no-print" onClick={onClose} />

      {/* Scrollable overlay */}
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <div className="min-h-full flex items-start justify-center p-4 sm:p-8">
          <div id="emg-print" className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl">

            {/* Action bar (hidden on print) */}
            <div className="no-print flex items-center justify-between px-6 pt-5 pb-3 border-b border-gray-200">
              <span className="text-sm font-medium text-gray-600">Emergency Summary</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700"
                >
                  <Printer size={14} aria-hidden="true" /> Print / Save PDF
                </button>
                <button onClick={onClose} aria-label="Close emergency card" className="p-1.5 text-gray-600 hover:text-gray-600 rounded-lg">
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* Card content */}
            <div className="p-6 space-y-4">

              {/* Header */}
              <div className="flex items-start gap-4 pb-4 border-b-2 border-red-500">
                <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center shrink-0" aria-hidden="true">
                  <User size={26} className="text-red-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-red-600 uppercase tracking-widest mb-0.5">Emergency Summary</div>
                  <h2 className="text-xl font-bold text-gray-900 leading-tight">{fullName}</h2>
                  {legalName && <p className="text-xs text-gray-700">Legal name: {legalName}</p>}
                  <p className="text-xs text-gray-700">
                    {p.dateOfBirth && formatDate(p.dateOfBirth)}
                    {age != null && ` (age ${age})`}
                    {p.gender && ` · ${p.gender}`}
                  </p>
                </div>
              </div>

              {/* Emergency contacts */}
              {(p.emergencyName || p.emergencyPhone) && (
                <ESection title="Emergency Contact" color="red">
                  <ERow label="Name" value={[p.emergencyName, p.emergencyRelationship && `(${p.emergencyRelationship})`].filter(Boolean).join(' ')} />
                  <ERow label="Phone" value={p.emergencyPhone} />
                  <ERow label="Email" value={p.emergencyEmail} />
                </ESection>
              )}

              {/* Immediate medical requirements */}
              {(p.medicalNotes || p.allergyNotes) && (
                <ESection title="Medical Requirements" color="red">
                  <ERow label="Medical conditions / notes" value={p.medicalNotes} />
                  <ERow label="Allergy / dietary alerts" value={p.allergyNotes} />
                </ESection>
              )}

              {/* Dietary */}
              {p.dietaryRequirements?.length > 0 && (
                <ESection title="Dietary Requirements" color="amber">
                  <p className="text-sm text-gray-900">{p.dietaryRequirements.join(', ')}</p>
                </ESection>
              )}

              {/* Communication & support needs */}
              {p.supportNotes && (
                <ESection title="Communication & Support Needs" color="amber">
                  <p className="text-sm text-gray-900 whitespace-pre-line">{p.supportNotes}</p>
                </ESection>
              )}

              {/* Mobility aids */}
              {p.mobilityAids?.length > 0 && (
                <ESection title="Mobility Aids" color="blue">
                  <p className="text-sm text-gray-900 mb-2">{p.mobilityAids.join(', ')}</p>
                  {p.mobilityAids.some(a => WHEELCHAIR_AIDS.includes(a) || a === 'Mobility Scooter') && (
                    <div className="space-y-1 text-xs text-gray-600">
                      {p.wheelchairModel && <p>Model: {p.wheelchairModel}</p>}
                      {p.wheelchairWeight && <p>Weight: {p.wheelchairWeight} kg</p>}
                      {(p.wheelchairLengthCm || p.wheelchairWidthCm || p.wheelchairHeightCm)
                        ? <p>Dimensions: {[p.wheelchairLengthCm, p.wheelchairWidthCm, p.wheelchairHeightCm].map(v => v || '?').join(' × ')} cm (L × W × H)</p>
                        : p.wheelchairDimensions && <p>Dimensions: {p.wheelchairDimensions} cm</p>}
                      {p.wheelchairBatteryType && <p>Battery: {p.wheelchairBatteryType}{p.wheelchairBatteryWh ? ` · ${p.wheelchairBatteryWh} Wh` : ''}</p>}
                      {p.wheelchairTransfer && <p>Transfer: {p.wheelchairTransfer}</p>}
                      {p.wheelchairAssemblyNotes && <p>Assembly: {p.wheelchairAssemblyNotes}</p>}
                    </div>
                  )}
                  {p.carerRequired && (
                    <p className="text-sm text-gray-900 mt-1">
                      Travels with carer{p.carerName ? `: ${p.carerName}` : ''}
                    </p>
                  )}
                </ESection>
              )}

              {/* Disability / support types */}
              {p.disabilityType?.length > 0 && (
                <ESection title="Disability / Support Needs" color="gray">
                  <p className="text-sm text-gray-900">{p.disabilityType.join(', ')}</p>
                </ESection>
              )}

              {/* Footer */}
              <p className="text-xs text-gray-600 text-center pt-2 border-t border-gray-100">
                Generated {new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })} · Disability Aware Travel Management
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Main detail view ──────────────────────────────────────────────────────────

function reviewStatus(lastReviewedAt) {
  if (!lastReviewedAt) return 'never';
  const months = (Date.now() - new Date(lastReviewedAt)) / (1000 * 60 * 60 * 24 * 30.44);
  if (months >= 12) return 'overdue';
  if (months >= 10) return 'due_soon';
  return 'ok';
}

export default function PassengerDetail({ passenger, onEdit, onBack, completeness, managerName, clientId, onUpdate, canEdit }) {
  const { userProfile } = useAuth();
  const [showEmergency, setShowEmergency] = useState(false);
  const [marking, setMarking] = useState(false);
  const p = passenger;
  const fullName  = [p.title, p.preferredName || p.firstName, p.lastName].filter(Boolean).join(' ');
  const legalName = p.preferredName ? [p.title, p.firstName, p.lastName].filter(Boolean).join(' ') : null;

  const hasEmergencyData = p.emergencyName || p.emergencyPhone || p.medicalNotes ||
    p.allergyNotes || p.supportNotes || p.mobilityAids?.length > 0 || p.disabilityType?.length > 0;

  return (
    <div className="space-y-4">
      {showEmergency && <EmergencyCard passenger={p} onClose={() => setShowEmergency(false)} />}

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center shrink-0" aria-hidden="true">
            <User size={22} className="text-blue-600" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">{fullName}</h2>
            {legalName && <p className="text-sm text-gray-700">Legal name: {legalName}</p>}
            {p.dateOfBirth && (
              <p className="text-sm text-gray-700">{formatDate(p.dateOfBirth)}{p.gender ? ` · ${p.gender}` : ''}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0 flex-wrap justify-end">
          {completeness !== undefined && (
            <div className="flex items-center gap-2">
              <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-500"
                  style={{ width: `${completeness}%` }}
                />
              </div>
              <span className="text-xs text-gray-700">{completeness}% complete</span>
            </div>
          )}
          {hasEmergencyData && (
            <button
              onClick={() => setShowEmergency(true)}
              className="flex items-center gap-2 px-3 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700"
            >
              <AlertTriangle size={14} aria-hidden="true" /> Emergency card
            </button>
          )}
          <button
            onClick={onEdit}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
          >
            <Edit2 size={14} aria-hidden="true" /> Edit profile
          </button>
        </div>
      </div>

      {/* Last reviewed */}
      {(() => {
        const status = reviewStatus(p.lastReviewedAt);
        const statusStyles = {
          ok:       'bg-green-50 border-green-200 text-green-700',
          due_soon: 'bg-amber-50 border-amber-200 text-amber-700',
          overdue:  'bg-red-50 border-red-200 text-red-700',
          never:    'bg-red-50 border-red-200 text-red-700',
        };
        const statusLabels = {
          ok:       'Profile up to date',
          due_soon: 'Annual review due soon',
          overdue:  'Annual review overdue',
          never:    'Profile has never been reviewed',
        };

        // Changes made after the last review
        const changesSinceReview = (p.changeLog || []).filter(
          entry => !p.lastReviewedAt || entry.at > p.lastReviewedAt
        );
        const changedFields = [...new Set(changesSinceReview.flatMap(e => e.fields || []))];

        return (
          <div className={`rounded-xl border ${statusStyles[status]}`}>
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="flex items-center gap-3">
                <ClipboardCheck size={16} aria-hidden="true" className="shrink-0" />
                <div>
                  <p className="text-sm font-medium">{statusLabels[status]}</p>
                  {p.lastReviewedAt ? (
                    <p className="text-xs opacity-70 mt-0.5">
                      Last reviewed {new Date(p.lastReviewedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
                      {p.lastReviewedBy && ` by ${p.lastReviewedBy}`}
                    </p>
                  ) : (
                    <p className="text-xs opacity-70 mt-0.5">Review annually to ensure accessibility needs are current</p>
                  )}
                </div>
              </div>
              {canEdit && (
                <button
                  onClick={async () => {
                    setMarking(true);
                    try {
                      const name = [userProfile?.firstName, userProfile?.lastName].filter(Boolean).join(' ') || userProfile?.email || '';
                      await onUpdate({
                        lastReviewedAt: new Date().toISOString(),
                        lastReviewedBy: name,
                        lastReviewedByUid: userProfile?.uid || '',
                      });
                    } finally {
                      setMarking(false);
                    }
                  }}
                  disabled={marking}
                  className="shrink-0 px-3 py-1.5 bg-white border border-current text-xs font-medium rounded-lg hover:bg-white/80 disabled:opacity-50 transition-colors"
                >
                  {marking ? 'Saving…' : 'Mark as reviewed'}
                </button>
              )}
            </div>

            {/* Fields changed since last review */}
            {changedFields.length > 0 && (
              <div className="px-4 py-2.5 border-t border-current/20">
                <p className="text-xs font-semibold opacity-80 mb-1">Updated since last review:</p>
                <div className="flex flex-wrap gap-1.5">
                  {changedFields.map(f => (
                    <span key={f} className="px-2 py-0.5 bg-white/60 rounded text-xs font-medium border border-current/20">
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

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

            {/* Wheelchair / scooter details */}
            {p.mobilityAids?.some(a => WHEELCHAIR_AIDS.includes(a) || a === 'Mobility Scooter') && (
              p.wheelchairTransfer || p.wheelchairModel || p.wheelchairDimensions ||
              p.wheelchairLengthCm || p.wheelchairWeight || p.wheelchairBatteryType ||
              p.wheelchairBatteryWh || p.wheelchairAssemblyNotes
            ) && (() => {
              // Build display dimensions — prefer separate fields, fallback to legacy string
              const dims = (p.wheelchairLengthCm || p.wheelchairWidthCm || p.wheelchairHeightCm)
                ? [p.wheelchairLengthCm, p.wheelchairWidthCm, p.wheelchairHeightCm]
                    .map(v => v || '?').join(' × ') + ' cm (L × W × H)'
                : p.wheelchairDimensions ? `${p.wheelchairDimensions} cm` : null;

              // Battery air travel flag
              const wh = parseFloat(p.wheelchairBatteryWh) || 0;
              const isWet = p.wheelchairBatteryType === 'Wet Cell (flooded)';
              const isLithium = ['Lithium-ion', 'Lithium Polymer'].includes(p.wheelchairBatteryType);
              const batteryFlag = isWet ? 'not-permitted'
                : isLithium && wh > 300 ? 'not-permitted'
                : isLithium && wh > 160 ? 'approval-required'
                : isLithium && wh > 0 ? 'ok'
                : null;

              return (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
                  <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Wheelchair / mobility device details</p>
                  {p.wheelchairTransfer && <Field label="Transfer method" value={p.wheelchairTransfer} />}
                  <div className="grid grid-cols-2 gap-3">
                    {p.wheelchairModel  && <Field label="Model" value={p.wheelchairModel} />}
                    {p.wheelchairWeight && <Field label="Weight" value={`${p.wheelchairWeight} kg`} />}
                    {dims && <Field label="Dimensions (L × W × H)" value={dims} />}
                    {p.wheelchairBatteryType && <Field label="Battery type" value={p.wheelchairBatteryType} />}
                    {p.wheelchairBatteryWh && <Field label="Battery capacity" value={`${p.wheelchairBatteryWh} Wh`} />}
                  </div>
                  {batteryFlag && (
                    <div className={`px-3 py-2 rounded-lg text-xs font-medium ${
                      batteryFlag === 'not-permitted' ? 'bg-red-100 text-red-700' :
                      batteryFlag === 'approval-required' ? 'bg-amber-100 text-amber-700' :
                      'bg-green-100 text-green-700'
                    }`}>
                      {batteryFlag === 'not-permitted' && 'Air travel: battery not permitted on aircraft'}
                      {batteryFlag === 'approval-required' && 'Air travel: advance airline approval required (>160 Wh)'}
                      {batteryFlag === 'ok' && 'Air travel: within standard airline limits (<160 Wh)'}
                    </div>
                  )}
                  {p.wheelchairAssemblyNotes && <Field label="Assembly / disassembly" value={p.wheelchairAssemblyNotes} />}
                </div>
              );
            })()}

            {p.dietaryRequirements?.length > 0 && <Tags label="Dietary requirements" values={p.dietaryRequirements} />}
            {p.allergyNotes && <Field label="Allergy / dietary notes" value={p.allergyNotes} />}
            {p.medicalNotes && <Field label="Medical conditions / notes" value={p.medicalNotes} />}
            {p.supportNotes && <Field label="Additional support requirements" value={p.supportNotes} />}
          </div>
        </Section>
      )}

      {/* Data sharing consent */}
      <Section title="Data sharing consent">
        <div className="flex items-start gap-3">
          <span className={`mt-0.5 shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold ${
            p.dataShareConsent ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
          }`}>
            {p.dataShareConsent ? '✓' : '!'}
          </span>
          <div>
            <p className="text-sm font-medium text-gray-800">
              {p.dataShareConsent
                ? 'Consent given — accessibility data may be shared with providers'
                : 'No consent — accessibility data cannot be shared with providers'}
            </p>
            {p.dataShareConsent && p.dataShareConsentAt && (
              <p className="text-xs text-gray-600 mt-0.5">
                Recorded {new Date(p.dataShareConsentAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            )}
            {!p.dataShareConsent && (
              <p className="text-xs text-amber-600 mt-0.5">
                Update the profile to record consent before sharing accessibility information with providers.
              </p>
            )}
          </div>
        </div>
      </Section>

      {/* Document Vault */}
      <Section title="Document Vault">
        <DocumentVault
          passengerId={passenger.id}
          clientId={clientId}
          documents={p.documents || []}
          onUpdate={onUpdate}
          canEdit={canEdit}
        />
      </Section>

      {/* Travel preferences */}
      {(p.seatPreference || p.mealPreference || p.loyaltyPrograms?.length > 0 || p.frequentFlyer?.length > 0 || p.travelNotes) && (
        <Section title="Travel preferences">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {p.seatPreference && <Field label="Seat preference" value={p.seatPreference} />}
              {p.mealPreference && <Field label="Meal preference" value={p.mealPreference} />}
            </div>
            {(p.loyaltyPrograms?.length > 0 || p.frequentFlyer?.length > 0) && (
              <div>
                <p className={lbl}>Loyalty programs</p>
                <div className="space-y-1 mt-1">
                  {(p.loyaltyPrograms || []).map((lp, i) => (
                    <p key={i} className={val}>
                      <span className="text-xs text-gray-600 mr-2">{lp.type}</span>
                      {lp.program} — {lp.number}
                    </p>
                  ))}
                  {/* backward compat for old frequentFlyer field */}
                  {!p.loyaltyPrograms && (p.frequentFlyer || []).map((ff, i) => (
                    <p key={i} className={val}>
                      <span className="text-xs text-gray-600 mr-2">Airline</span>
                      {ff.airline} — {ff.number}
                    </p>
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
