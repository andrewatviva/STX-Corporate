import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useTenant } from '../../contexts/TenantContext';

const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-500';
const lbl = 'block text-xs font-medium text-gray-700 mb-1';

const DISABILITY_TYPES = [
  'Physical / Mobility', 'Intellectual / Developmental', 'Sensory (Vision)',
  'Sensory (Hearing)', 'Psychosocial / Mental Health', 'Neurological',
  'Chronic Illness / Pain', 'Autism Spectrum', 'Other',
];

const MOBILITY_AIDS = [
  'Manual Wheelchair', 'Power Wheelchair', 'Walking Frame / Rollator',
  'Crutches / Walking Stick', 'Mobility Scooter', 'Prosthetic Limb', 'Other',
];

const DIETARY_OPTIONS = [
  'Vegetarian', 'Vegan', 'Gluten Free', 'Halal', 'Kosher',
  'Nut Allergy', 'Dairy Free', 'Egg Free', 'Low FODMAP', 'Diabetic', 'Other',
];

const TITLES = ['Mr', 'Mrs', 'Ms', 'Miss', 'Mx', 'Dr', 'Prof'];
const GENDERS = ['Male', 'Female', 'Non-binary', 'Prefer not to say'];
const SEAT_PREFS = ['Window', 'Aisle', 'No preference'];

function Section({ title, children }) {
  return (
    <div className="border border-gray-200 rounded-xl p-5 space-y-4">
      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">{title}</h3>
      {children}
    </div>
  );
}

function F({ label, children, span2 }) {
  return (
    <div className={span2 ? 'col-span-2' : ''}>
      <label className={lbl}>{label}</label>
      {children}
    </div>
  );
}

function CheckGroup({ options, value = [], onChange }) {
  const toggle = (opt) => {
    onChange(value.includes(opt) ? value.filter(v => v !== opt) : [...value, opt]);
  };
  return (
    <div className="grid grid-cols-2 gap-2 mt-1">
      {options.map(opt => (
        <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={value.includes(opt)}
            onChange={() => toggle(opt)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-gray-700">{opt}</span>
        </label>
      ))}
    </div>
  );
}

const LOYALTY_TYPES = ['Airline', 'Hotel / Accommodation', 'Car Rental', 'Rail', 'Other'];

const WHEELCHAIR_AIDS = ['Manual Wheelchair', 'Power Wheelchair'];

const WHEELCHAIR_TRANSFERS = [
  'Self Transfer — I can transfer by myself, unsupported',
  'Self Transfer — I can transfer by myself with the use of a slide board (or equivalent)',
  'Assistance Required — I need assistance from another person to transfer',
  'Assistance Required — I need a hoist to transfer in and out of my wheelchair',
];

const BATTERY_TYPES = [
  'Sealed Lead Acid (non-spillable)',
  'Gel Cell (non-spillable)',
  'Dry Cell',
  'Lithium-ion',
  'Lithium Polymer',
  'Wet Cell (flooded)',
  'Other',
];

const EMPTY = {
  title: '', firstName: '', lastName: '', preferredName: '', dateOfBirth: '', gender: '',
  email: '', phone: '',
  emergencyName: '', emergencyPhone: '', emergencyRelationship: '', emergencyEmail: '',
  identityDocuments: [],
  disabilityType: [], mobilityAids: [], carerRequired: false, carerName: '',
  wheelchairTransfer: '', wheelchairModel: '',
  wheelchairLengthCm: '', wheelchairWidthCm: '', wheelchairHeightCm: '',
  wheelchairWeight: '',
  wheelchairBatteryType: '', wheelchairBatteryWh: '',
  wheelchairAssemblyNotes: '',
  dietaryRequirements: [], allergyNotes: '', medicalNotes: '', supportNotes: '',
  seatPreference: '', mealPreference: '', loyaltyPrograms: [], travelNotes: '',
  dataShareConsent: false, dataShareConsentAt: '',
  userId: '',
};

export default function PassengerForm({ passenger, teamMembers = [], onSave, onCancel }) {
  const { clientConfig } = useTenant();
  const idTypes = clientConfig?.dropdowns?.idTypes || ['Passport', 'Drivers Licence', 'Proof of Age Card', 'Other'];

  const [form, setForm] = useState(() => {
    if (!passenger) return { ...EMPTY };
    return {
      title:                passenger.title                || '',
      firstName:            passenger.firstName            || '',
      lastName:             passenger.lastName             || '',
      preferredName:        passenger.preferredName        || '',
      dateOfBirth:          passenger.dateOfBirth          || '',
      gender:               passenger.gender               || '',
      email:                passenger.email                || '',
      phone:                passenger.phone                || '',
      emergencyName:        passenger.emergencyName        || '',
      emergencyPhone:       passenger.emergencyPhone       || '',
      emergencyRelationship:passenger.emergencyRelationship|| '',
      emergencyEmail:       passenger.emergencyEmail       || '',
      identityDocuments:    passenger.identityDocuments    || [],
      disabilityType:       passenger.disabilityType       || [],
      mobilityAids:         passenger.mobilityAids         || [],
      carerRequired:        passenger.carerRequired        || false,
      carerName:            passenger.carerName            || '',
      wheelchairTransfer:    passenger.wheelchairTransfer    || '',
      wheelchairModel:       passenger.wheelchairModel       || '',
      wheelchairLengthCm:    passenger.wheelchairLengthCm    || '',
      wheelchairWidthCm:     passenger.wheelchairWidthCm     || '',
      wheelchairHeightCm:    passenger.wheelchairHeightCm    || '',
      wheelchairWeight:      passenger.wheelchairWeight      || '',
      wheelchairBatteryType: passenger.wheelchairBatteryType || '',
      wheelchairBatteryWh:   passenger.wheelchairBatteryWh   || '',
      wheelchairAssemblyNotes: passenger.wheelchairAssemblyNotes || '',
      dietaryRequirements:  passenger.dietaryRequirements  || [],
      allergyNotes:         passenger.allergyNotes         || '',
      medicalNotes:         passenger.medicalNotes         || '',
      supportNotes:         passenger.supportNotes         || '',
      seatPreference:       passenger.seatPreference       || '',
      mealPreference:       passenger.mealPreference       || '',
      loyaltyPrograms:      passenger.loyaltyPrograms      ||
        (passenger.frequentFlyer?.map(ff => ({ type: 'Airline', program: ff.airline || '', number: ff.number || '' })) ?? []),
      travelNotes:          passenger.travelNotes          || '',
      dataShareConsent:     passenger.dataShareConsent     || false,
      dataShareConsentAt:   passenger.dataShareConsentAt   || '',
      userId:               passenger.userId               || '',
    };
  });

  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // Identity documents
  const addDoc = () => set('identityDocuments', [...form.identityDocuments, { type: idTypes[0] || '', number: '', expiry: '', notes: '' }]);
  const updateDoc = (i, k, v) => set('identityDocuments', form.identityDocuments.map((d, j) => j === i ? { ...d, [k]: v } : d));
  const removeDoc = (i) => set('identityDocuments', form.identityDocuments.filter((_, j) => j !== i));

  // Loyalty programs
  const addLP    = () => set('loyaltyPrograms', [...form.loyaltyPrograms, { type: LOYALTY_TYPES[0], program: '', number: '' }]);
  const updateLP = (i, k, v) => set('loyaltyPrograms', form.loyaltyPrograms.map((lp, j) => j === i ? { ...lp, [k]: v } : lp));
  const removeLP = (i) => set('loyaltyPrograms', form.loyaltyPrograms.filter((_, j) => j !== i));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.firstName.trim()) return setError('First name is required.');
    if (!form.lastName.trim())  return setError('Last name is required.');
    setSaving(true);
    try {
      await onSave(form);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      {/* ── Personal details ──────────────────────────────────────────── */}
      <Section title="Personal details">
        <div className="grid grid-cols-2 gap-4">
          <F label="Title">
            <select className={inp} value={form.title} onChange={e => set('title', e.target.value)}>
              <option value="">Not specified</option>
              {TITLES.map(t => <option key={t}>{t}</option>)}
            </select>
          </F>
          <F label="First name *">
            <input className={inp} value={form.firstName} onChange={e => set('firstName', e.target.value)} placeholder="Jane" />
          </F>
          <F label="Last name *">
            <input className={inp} value={form.lastName} onChange={e => set('lastName', e.target.value)} placeholder="Smith" />
          </F>
          <F label="Preferred name">
            <input className={inp} value={form.preferredName} onChange={e => set('preferredName', e.target.value)} placeholder="e.g. nickname or name used on bookings" />
          </F>
          <F label="Date of birth">
            <input type="date" className={inp} value={form.dateOfBirth} onChange={e => set('dateOfBirth', e.target.value)} />
          </F>
          <F label="Gender">
            <select className={inp} value={form.gender} onChange={e => set('gender', e.target.value)}>
              <option value="">Not specified</option>
              {GENDERS.map(g => <option key={g}>{g}</option>)}
            </select>
          </F>
          <F label="Email">
            <input type="email" className={inp} value={form.email} onChange={e => set('email', e.target.value)} placeholder="jane@example.com" />
          </F>
          <F label="Phone">
            <input className={inp} value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+61 4xx xxx xxx" />
          </F>
        </div>
      </Section>

      {/* ── Emergency contact ─────────────────────────────────────────── */}
      <Section title="Emergency contact">
        <div className="grid grid-cols-2 gap-4">
          <F label="Name">
            <input className={inp} value={form.emergencyName} onChange={e => set('emergencyName', e.target.value)} placeholder="John Smith" />
          </F>
          <F label="Relationship">
            <input className={inp} value={form.emergencyRelationship} onChange={e => set('emergencyRelationship', e.target.value)} placeholder="e.g. Spouse, Parent, Sibling" />
          </F>
          <F label="Phone">
            <input className={inp} value={form.emergencyPhone} onChange={e => set('emergencyPhone', e.target.value)} placeholder="+61 4xx xxx xxx" />
          </F>
          <F label="Email">
            <input type="email" className={inp} value={form.emergencyEmail} onChange={e => set('emergencyEmail', e.target.value)} />
          </F>
        </div>
      </Section>

      {/* ── Identity documents ────────────────────────────────────────── */}
      <Section title="Identity documents">
        <div className="space-y-3">
          {form.identityDocuments.map((doc, i) => (
            <div key={i} className="grid grid-cols-2 gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <F label="Document type">
                <select className={inp} value={doc.type} onChange={e => updateDoc(i, 'type', e.target.value)}>
                  {idTypes.map(t => <option key={t}>{t}</option>)}
                </select>
              </F>
              <F label="Number">
                <input className={inp} value={doc.number} onChange={e => updateDoc(i, 'number', e.target.value)} placeholder="e.g. PA1234567" />
              </F>
              <F label="Expiry date">
                <input type="date" className={inp} value={doc.expiry} onChange={e => updateDoc(i, 'expiry', e.target.value)} />
              </F>
              <F label="Issuing country / state">
                <input className={inp} value={doc.notes} onChange={e => updateDoc(i, 'notes', e.target.value)} placeholder="e.g. Australia / NSW" />
              </F>
              <div className="col-span-2 flex justify-end">
                <button type="button" onClick={() => removeDoc(i)} className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700">
                  <Trash2 size={12} aria-hidden="true" /> Remove
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={addDoc}
            className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800"
          >
            <Plus size={14} aria-hidden="true" /> Add document
          </button>
        </div>
      </Section>

      {/* ── Accessibility & support needs ─────────────────────────────── */}
      <Section title="Accessibility & support needs">
        <div className="space-y-4">
          <div>
            <label className={lbl}>Disability / support needs</label>
            <CheckGroup options={DISABILITY_TYPES} value={form.disabilityType} onChange={v => set('disabilityType', v)} />
          </div>

          <div>
            <label className={lbl}>Mobility aids used</label>
            <CheckGroup options={MOBILITY_AIDS} value={form.mobilityAids} onChange={v => set('mobilityAids', v)} />
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.carerRequired}
                onChange={e => set('carerRequired', e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-gray-700 font-medium">Carer / support worker travels with passenger</span>
            </label>
          </div>
          {form.carerRequired && (
            <F label="Carer name">
              <input className={inp} value={form.carerName} onChange={e => set('carerName', e.target.value)} placeholder="Support worker name" />
            </F>
          )}

          {/* Wheelchair details — shown when a wheelchair aid is selected */}
          {form.mobilityAids.some(a => WHEELCHAIR_AIDS.includes(a)) && (
            <div className="space-y-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h4 className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Wheelchair details</h4>

              <F label="Transfer method" span2>
                <div className="space-y-2 mt-1">
                  {WHEELCHAIR_TRANSFERS.map(opt => (
                    <label key={opt} className="flex items-start gap-2 text-sm cursor-pointer select-none">
                      <input
                        type="radio"
                        name="wheelchairTransfer"
                        value={opt}
                        checked={form.wheelchairTransfer === opt}
                        onChange={() => set('wheelchairTransfer', opt)}
                        className="mt-0.5 border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-gray-700">{opt}</span>
                    </label>
                  ))}
                </div>
              </F>

              <div className="grid grid-cols-2 gap-4">
                <F label="Wheelchair model">
                  <input className={inp} value={form.wheelchairModel} onChange={e => set('wheelchairModel', e.target.value)} placeholder="e.g. Permobil M3 Corpus" />
                </F>
                <F label="Weight (kg)">
                  <input type="number" min="0" step="0.1" className={inp} value={form.wheelchairWeight} onChange={e => set('wheelchairWeight', e.target.value)} placeholder="e.g. 23.5" />
                </F>

                {/* Separate dimension fields */}
                <div className="col-span-2">
                  <label className={lbl}>Dimensions (cm)</label>
                  <div className="grid grid-cols-3 gap-2 mt-1">
                    <div>
                      <input type="number" min="0" step="0.1" className={inp} value={form.wheelchairLengthCm} onChange={e => set('wheelchairLengthCm', e.target.value)} placeholder="Length" />
                      <p className="text-xs text-gray-600 mt-0.5 text-center">Length</p>
                    </div>
                    <div>
                      <input type="number" min="0" step="0.1" className={inp} value={form.wheelchairWidthCm} onChange={e => set('wheelchairWidthCm', e.target.value)} placeholder="Width" />
                      <p className="text-xs text-gray-600 mt-0.5 text-center">Width</p>
                    </div>
                    <div>
                      <input type="number" min="0" step="0.1" className={inp} value={form.wheelchairHeightCm} onChange={e => set('wheelchairHeightCm', e.target.value)} placeholder="Height" />
                      <p className="text-xs text-gray-600 mt-0.5 text-center">Height</p>
                    </div>
                  </div>
                </div>

                {/* Battery — shown for both power and mobility scooter */}
                {(form.mobilityAids.includes('Power Wheelchair') || form.mobilityAids.includes('Mobility Scooter')) && (
                  <>
                    <F label="Battery type">
                      <select className={inp} value={form.wheelchairBatteryType} onChange={e => set('wheelchairBatteryType', e.target.value)}>
                        <option value="">Not specified</option>
                        {BATTERY_TYPES.map(t => <option key={t}>{t}</option>)}
                      </select>
                    </F>
                    <F label="Battery capacity (Wh)">
                      <input type="number" min="0" step="1" className={inp} value={form.wheelchairBatteryWh} onChange={e => set('wheelchairBatteryWh', e.target.value)} placeholder="e.g. 160" />
                    </F>

                    {/* Air travel battery warning */}
                    {form.wheelchairBatteryType === 'Wet Cell (flooded)' && (
                      <div className="col-span-2 p-3 bg-red-50 border border-red-300 rounded-lg text-xs text-red-700">
                        <strong>Not permitted on aircraft.</strong> Wet cell (flooded) batteries cannot be transported by air. Airline arrangements must account for this.
                      </div>
                    )}
                    {['Lithium-ion', 'Lithium Polymer'].includes(form.wheelchairBatteryType) && form.wheelchairBatteryWh && (
                      (() => {
                        const wh = parseFloat(form.wheelchairBatteryWh);
                        if (wh > 300) return (
                          <div className="col-span-2 p-3 bg-red-50 border border-red-300 rounded-lg text-xs text-red-700">
                            <strong>Not permitted on aircraft.</strong> Lithium batteries above 300 Wh are not allowed on commercial flights.
                          </div>
                        );
                        if (wh > 160) return (
                          <div className="col-span-2 p-3 bg-amber-50 border border-amber-300 rounded-lg text-xs text-amber-700">
                            <strong>Airline approval required.</strong> Lithium batteries between 160–300 Wh require advance airline approval before travel.
                          </div>
                        );
                        return (
                          <div className="col-span-2 p-3 bg-green-50 border border-green-300 rounded-lg text-xs text-green-700">
                            Battery capacity is within standard airline limits (under 160 Wh). Standard MEDIF/FREMEC process applies.
                          </div>
                        );
                      })()
                    )}
                  </>
                )}

                <F label="Assembly / disassembly notes" span2>
                  <textarea className={inp} rows={2} value={form.wheelchairAssemblyNotes} onChange={e => set('wheelchairAssemblyNotes', e.target.value)} placeholder="e.g. removes footrests and headrest; joystick folds in; seat cushion stored separately" />
                </F>
              </div>
            </div>
          )}

          <div>
            <label className={lbl}>Dietary requirements</label>
            <CheckGroup options={DIETARY_OPTIONS} value={form.dietaryRequirements} onChange={v => set('dietaryRequirements', v)} />
          </div>

          <F label="Allergy / dietary notes">
            <textarea className={inp} rows={2} value={form.allergyNotes} onChange={e => set('allergyNotes', e.target.value)} placeholder="e.g. severe peanut allergy — carries EpiPen" />
          </F>

          <F label="Medical conditions / notes">
            <textarea className={inp} rows={3} value={form.medicalNotes} onChange={e => set('medicalNotes', e.target.value)} placeholder="e.g. insulin-dependent diabetic, requires refrigerated medication storage" />
          </F>

          <F label="Additional support requirements">
            <textarea className={inp} rows={2} value={form.supportNotes} onChange={e => set('supportNotes', e.target.value)} placeholder="e.g. requires wheelchair-accessible transfers, needs extra boarding time" />
          </F>
        </div>
      </Section>

      {/* ── Travel preferences ────────────────────────────────────────── */}
      <Section title="Travel preferences">
        <div className="grid grid-cols-2 gap-4">
          <F label="Seat preference">
            <select className={inp} value={form.seatPreference} onChange={e => set('seatPreference', e.target.value)}>
              <option value="">Not specified</option>
              {SEAT_PREFS.map(s => <option key={s}>{s}</option>)}
            </select>
          </F>
          <F label="Meal preference">
            <input className={inp} value={form.mealPreference} onChange={e => set('mealPreference', e.target.value)} placeholder="e.g. VLML (vegan low-fat meal)" />
          </F>
        </div>

        <div className="space-y-2">
          <label className={lbl}>Loyalty programs</label>
          {form.loyaltyPrograms.map((lp, i) => (
            <div key={i} className="grid grid-cols-[140px_1fr_1fr_auto] gap-2 items-center">
              <select
                className={inp}
                value={lp.type}
                onChange={e => updateLP(i, 'type', e.target.value)}
              >
                {LOYALTY_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
              <input className={inp} value={lp.program} onChange={e => updateLP(i, 'program', e.target.value)} placeholder="Program name" />
              <input className={inp} value={lp.number} onChange={e => updateLP(i, 'number', e.target.value)} placeholder="Member number" />
              <button type="button" onClick={() => removeLP(i)} aria-label="Remove loyalty program" className="p-1 text-gray-600 hover:text-red-500 shrink-0">
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </div>
          ))}
          <button type="button" onClick={addLP} className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800">
            <Plus size={14} aria-hidden="true" /> Add loyalty program
          </button>
        </div>

        <F label="Additional travel notes">
          <textarea className={inp} rows={2} value={form.travelNotes} onChange={e => set('travelNotes', e.target.value)} placeholder="e.g. prefers morning flights, always books aisle seat" />
        </F>
      </Section>

      {/* ── Data sharing consent ──────────────────────────────────────── */}
      <Section title="Data sharing consent">
        <div className="space-y-3">
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.dataShareConsent}
              onChange={e => {
                set('dataShareConsent', e.target.checked);
                set('dataShareConsentAt', new Date().toISOString());
              }}
              className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 shrink-0"
            />
            <div>
              <p className="text-sm font-medium text-gray-800">
                Consent to share accessibility information with travel providers
              </p>
              <p className="text-xs text-gray-700 mt-1 leading-relaxed">
                I consent to my accessibility and support needs (including disability type, mobility aids, dietary requirements,
                and medical requirements relevant to travel) being shared with travel providers — such as airlines, hotels,
                and transfer companies — to facilitate appropriate assistance during travel.
              </p>
            </div>
          </label>
          {form.dataShareConsent && form.dataShareConsentAt && (
            <p className="text-xs text-gray-600 pl-7">
              Consent recorded {new Date(form.dataShareConsentAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          )}
          {!form.dataShareConsent && (
            <p className="text-xs text-amber-600 pl-7">
              Without consent, accessibility information cannot be shared with providers on behalf of this traveller.
            </p>
          )}
        </div>
      </Section>

      {/* ── Portal account link ───────────────────────────────────────── */}
      {teamMembers.length > 0 && (
        <Section title="Portal account">
          <F label="Linked user account" hint="Link this profile to a portal user so their trips are scoped correctly.">
            <select className={inp} value={form.userId} onChange={e => set('userId', e.target.value)}>
              <option value="">Not linked to a portal account</option>
              {teamMembers.map(m => {
                const name = [m.firstName, m.lastName].filter(Boolean).join(' ') || m.email;
                return <option key={m.id} value={m.id}>{name} ({m.email})</option>;
              })}
            </select>
          </F>
        </Section>
      )}

      {error && (
        <p role="alert" aria-live="assertive" className="text-red-700 text-sm">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-3 pt-1">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
          Cancel
        </button>
        <button type="submit" disabled={saving} className="px-5 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'Saving…' : (passenger ? 'Save changes' : 'Create profile')}
        </button>
      </div>
    </form>
  );
}
