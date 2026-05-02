import React, { useState, useEffect, useMemo } from 'react';
import { doc, setDoc, updateDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import Toggle from '../shared/Toggle';
import TagInput from '../shared/TagInput';
import { DEFAULT_ACCOMMODATION_RATES } from '../../utils/reportHelpers';

const DEFAULT_CONFIG = {
  branding: { logo: '', primaryColor: '#1e40af', secondaryColor: '#93c5fd', portalTitle: '' },
  dropdowns: {
    costCentres: [],
    tripTypes: ['Self-Managed', 'STX-Managed', 'Group Event'],
    sectorTypes: ['Flight', 'Accommodation', 'Car Hire', 'Parking', 'Transfers', 'Meals', 'Other'],
    idTypes: ['Passport', 'Drivers Licence', 'Proof of Age Card', 'Other'],
  },
  fees: { managementFeeEnabled: true, managementFeeAmount: 55, managementFeeLabel: 'STX Management Fee', managementFeeAppliesTo: [], amendmentFeeEnabled: true, amendmentFeeAmount: 30, amendmentFeeAppliesTo: [], gstRate: 0.10 },
  workflow: { requiresApproval: true, approvalLevels: 1, emailNotifications: false, approvalByTripType: null },
  features: { hotelBooking: true, invoiceGeneration: true, reports: true, accessibilityToolbar: true, groupEvents: true, fileAttachments: true, selfManagedTrips: true, accommodationPolicy: true, flightPolicy: false, customPermissions: false },
  hotelBooking: { nuiteeFeed: 'vivatravelholdingscug', bookingPasswordEnabled: false, markupPercent: 0, selfManagedHotelBooking: true },
  policyVariance: {
    accommodation: { enabled: false, type: 'percent', value: 0, action: 'warn' },
    flight:        { enabled: false, type: 'percent', value: 0, action: 'warn' },
  },
  contact: { email: '' },
};

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function Section({ title, children }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 space-y-4">
      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-500';

function FeeAppliesTo({ value, onChange, tripTypes }) {
  const types = tripTypes?.length ? tripTypes : ['Self-Managed', 'STX-Managed', 'Group Event'];
  const appliesAll = !value || value.length === 0;

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-gray-700">Applies to</label>
      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="radio" checked={appliesAll} onChange={() => onChange([])} className="text-blue-600" />
          All trip types
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="radio" checked={!appliesAll} onChange={() => onChange([types[0]])} className="text-blue-600" />
          Specific types only
        </label>
      </div>
      {!appliesAll && (
        <div className="flex flex-wrap gap-3 pt-1">
          {types.map(type => (
            <label key={type} className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={(value || []).includes(type)}
                onChange={e => {
                  const next = e.target.checked
                    ? [...(value || []), type]
                    : (value || []).filter(t => t !== type);
                  onChange(next);
                }}
                className="rounded border-gray-300 text-blue-600"
              />
              <span className="text-gray-700">{type}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function RateTable({ rates, setRates, rateUnit, blanketLabel }) {
  const [cityFilter, setCityFilter] = useState('');
  const [newCity,    setNewCity]    = useState('');
  const [newRate,    setNewRate]    = useState('');

  const filtered = useMemo(() => {
    const q = cityFilter.toLowerCase();
    return Object.keys(rates).filter(c => c !== 'All Cities' && c.toLowerCase().includes(q)).sort();
  }, [rates, cityFilter]);

  const change = (city, val) => setRates(prev => ({ ...prev, [city]: val === '' ? '' : parseFloat(val) || '' }));
  const del    = (city)      => setRates(prev => { const n = { ...prev }; delete n[city]; return n; });
  const add    = ()          => {
    const t = newCity.trim(); const p = parseFloat(newRate);
    if (!t || isNaN(p) || p <= 0) return;
    setRates(prev => ({ ...prev, [t]: p }));
    setNewCity(''); setNewRate('');
  };

  return (
    <div className="space-y-3">
      {/* Blanket rate */}
      <div className="flex items-center gap-3 flex-wrap px-3 py-2 bg-teal-50 border border-teal-200 rounded-lg">
        <input type="checkbox" id={`blanket-chk-${rateUnit}`}
          checked={'All Cities' in rates}
          onChange={e => {
            if (e.target.checked) setRates(prev => ({ ...prev, 'All Cities': prev['All Cities'] || '' }));
            else del('All Cities');
          }}
          className="w-4 h-4 cursor-pointer accent-teal-600"
        />
        <label htmlFor={`blanket-chk-${rateUnit}`} className="text-sm font-semibold text-teal-700 cursor-pointer whitespace-nowrap">
          Blanket rate for all cities
        </label>
        {'All Cities' in rates && (
          <>
            <input type="number" min="0" step="1" placeholder="e.g. 200"
              value={rates['All Cities'] ?? ''}
              onChange={e => change('All Cities', e.target.value)}
              className="border border-gray-300 rounded-lg px-2 py-1 text-sm w-24 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
            <span className="text-xs text-gray-700">{blanketLabel}</span>
          </>
        )}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <input type="text" placeholder="Search city…" value={cityFilter} onChange={e => setCityFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-500 w-48" />
        <span className="text-xs text-gray-600">{filtered.length} cities</span>
      </div>

      <div className="border border-gray-200 rounded-lg overflow-hidden max-h-56 overflow-y-auto">
        <div className="grid grid-cols-[1fr_130px_36px] bg-gray-50 px-3 py-2 border-b border-gray-200 sticky top-0">
          <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">City</span>
          <span className="text-xs font-bold text-gray-600 uppercase tracking-wide text-right">{rateUnit} incl. GST</span>
          <span />
        </div>
        {filtered.length === 0 && (
          <p className="text-xs text-gray-600 px-3 py-3 text-center">No cities added yet.</p>
        )}
        {filtered.map((city, idx) => (
          <div key={city} className={`grid grid-cols-[1fr_130px_36px] px-3 py-1.5 items-center border-b border-gray-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
            <span className="text-sm text-gray-700">{city}</span>
            <div className="flex justify-end">
              <input type="number" min="0" step="1" value={rates[city] ?? ''}
                onChange={e => change(city, e.target.value)}
                className="w-20 border border-gray-300 rounded px-2 py-0.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div className="flex justify-center">
              <button type="button" onClick={() => del(city)} className="text-gray-500 hover:text-red-400 text-base leading-none px-1">×</button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2 items-end flex-wrap">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Add city</label>
          <input type="text" placeholder="City name" value={newCity} onChange={e => setNewCity(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none w-44" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">{rateUnit} ($)</label>
          <input type="number" min="0" step="1" placeholder="e.g. 195" value={newRate}
            onChange={e => setNewRate(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none w-28" />
        </div>
        <button type="button" onClick={add} disabled={!newCity.trim() || !newRate}
          className="px-3 py-1.5 bg-gray-800 text-white text-sm rounded-lg disabled:opacity-40">+ Add</button>
      </div>
    </div>
  );
}

function PolicyRatesEditor({ clientId }) {
  const [accomRates,  setAccomRates]  = useState({});
  const [flightRates, setFlightRates] = useState({});
  const [activeTab,   setActiveTab]   = useState('accommodation');
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [saveMsg,     setSaveMsg]     = useState('');

  useEffect(() => {
    if (!clientId) { setLoading(false); return; }
    getDoc(doc(db, 'clients', clientId, 'config', 'travelPolicy')).then(snap => {
      const d = snap.exists() ? snap.data() : {};
      setAccomRates(d.rates || { ...DEFAULT_ACCOMMODATION_RATES });
      setFlightRates(d.flightRates || {});
    }).catch(() => {
      setAccomRates({ ...DEFAULT_ACCOMMODATION_RATES });
      setFlightRates({});
    }).finally(() => setLoading(false));
  }, [clientId]);

  const handleSave = async () => {
    const cleanRates = {}, cleanFlight = {};
    for (const [c, v] of Object.entries(accomRates))  { const n = parseFloat(v); if (c.trim() && !isNaN(n) && n > 0) cleanRates[c.trim()] = n; }
    for (const [c, v] of Object.entries(flightRates)) { const n = parseFloat(v); if (c.trim() && !isNaN(n) && n > 0) cleanFlight[c.trim()] = n; }
    setSaving(true);
    try {
      await setDoc(doc(db, 'clients', clientId, 'config', 'travelPolicy'), { rates: cleanRates, flightRates: cleanFlight }, { merge: true });
      setAccomRates(cleanRates);
      setFlightRates(cleanFlight);
      setSaveMsg('Saved.');
      setTimeout(() => setSaveMsg(''), 3000);
    } catch { setSaveMsg('Error saving.'); }
    setSaving(false);
  };

  if (loading) return <p className="text-sm text-gray-600">Loading policy rates…</p>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1">
          {[['accommodation','🏨 Accommodation'],['flights','✈️ Flights']].map(([v,l]) => (
            <button key={v} type="button" onClick={() => setActiveTab(v)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${activeTab === v ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
              {l}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {saveMsg && <span className={`text-xs font-semibold ${saveMsg.startsWith('Error') ? 'text-red-500' : 'text-green-600'}`}>{saveMsg}</span>}
          <button type="button" onClick={handleSave} disabled={saving}
            className="px-3 py-1.5 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save rates'}
          </button>
        </div>
      </div>

      {activeTab === 'accommodation' ? (
        <>
          <p className="text-xs text-gray-600">Max allowable nightly accommodation spend per city (incl. GST). Used in the Travel Policy report.</p>
          <RateTable rates={accomRates} setRates={setAccomRates} rateUnit="Max/Night" blanketLabel="/night incl. GST — applies to destinations not listed below" />
        </>
      ) : (
        <>
          <p className="text-xs text-gray-600">Max allowable total flight cost per trip by destination city (incl. GST). Used in the Travel Policy report.</p>
          <RateTable rates={flightRates} setRates={setFlightRates} rateUnit="Max/Trip" blanketLabel="/trip incl. GST — applies to destinations not listed below" />
        </>
      )}
    </div>
  );
}

export default function ClientForm({ existing, onSaved, onCancel }) {
  const isEdit = !!existing;

  const [name, setName]       = useState(existing?.name ?? '');
  const [clientId, setClientId] = useState(existing?.clientId ?? '');
  const [active, setActive]   = useState(existing?.active ?? true);
  const [cfg, setCfg]         = useState(() => {
    if (!existing) return DEFAULT_CONFIG;
    return {
      branding:     { ...DEFAULT_CONFIG.branding,     ...existing.config?.branding },
      dropdowns:    { ...DEFAULT_CONFIG.dropdowns,    ...existing.config?.dropdowns },
      fees:         { ...DEFAULT_CONFIG.fees,         ...existing.config?.fees },
      workflow:     { ...DEFAULT_CONFIG.workflow,     ...existing.config?.workflow },
      features:     { ...DEFAULT_CONFIG.features,     ...existing.config?.features },
      hotelBooking: { ...DEFAULT_CONFIG.hotelBooking, ...existing.config?.hotelBooking },
      contact:      { ...DEFAULT_CONFIG.contact,      ...existing.config?.contact },
      policyVariance: {
        accommodation: { ...DEFAULT_CONFIG.policyVariance.accommodation, ...(existing.config?.policyVariance?.accommodation || {}) },
        flight:        { ...DEFAULT_CONFIG.policyVariance.flight,        ...(existing.config?.policyVariance?.flight        || {}) },
      },
      budgets: existing.config?.budgets || {},
    };
  });
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');

  const set = (section, key, value) =>
    setCfg(prev => ({ ...prev, [section]: { ...prev[section], [key]: value } }));

  const setVariance = (type, key, value) =>
    setCfg(prev => ({
      ...prev,
      policyVariance: {
        ...prev.policyVariance,
        [type]: { ...prev.policyVariance[type], [key]: value },
      },
    }));

  const setApprovalByType = (tripType, value) =>
    setCfg(prev => ({
      ...prev,
      workflow: {
        ...prev.workflow,
        approvalByTripType: { ...(prev.workflow.approvalByTripType || {}), [tripType]: value },
      },
    }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) return setError('Client name is required.');
    const cid = isEdit ? clientId : slugify(name);
    if (!cid) return setError('Could not generate a valid client ID from the name.');
    setSaving(true);
    try {
      await setDoc(doc(db, 'clients', cid), { clientId: cid, name: name.trim(), active, updatedAt: serverTimestamp() }, { merge: true });
      if (!isEdit) await updateDoc(doc(db, 'clients', cid), { createdAt: serverTimestamp() }).catch(() => {});
      await setDoc(doc(db, 'clients', cid, 'config', 'settings'), { ...cfg, updatedAt: serverTimestamp() }, { merge: true });
      onSaved(cid);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">

      <Section title="Identity">
        <Field label="Client name *">
          <input className={inp} value={name} onChange={e => { setName(e.target.value); if (!isEdit) setClientId(slugify(e.target.value)); }} placeholder="e.g. Disability Australia Network" />
        </Field>
        <Field label={`Client ID ${isEdit ? '(cannot change)' : '(auto-generated)'}`}>
          <input className={`${inp} bg-gray-50`} value={isEdit ? clientId : slugify(name)} readOnly />
        </Field>
        {isEdit && (
          <Toggle checked={active} onChange={v => setActive(v)} label="Active" description="Inactive clients cannot log in" />
        )}
      </Section>

      <Section title="Branding">
        <Field label="Portal title (shown in top bar)">
          <input className={inp} value={cfg.branding.portalTitle} onChange={e => set('branding','portalTitle',e.target.value)} placeholder="e.g. DANA Travel Portal" />
        </Field>
        <Field label="Client logo URL">
          <input className={inp} value={cfg.branding.logo} onChange={e => set('branding','logo',e.target.value)} placeholder="https://..." />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Primary colour">
            <div className="flex items-center gap-2">
              <input type="color" value={cfg.branding.primaryColor} onChange={e => set('branding','primaryColor',e.target.value)} className="h-9 w-12 rounded border border-gray-300 cursor-pointer" />
              <input className={inp} value={cfg.branding.primaryColor} onChange={e => set('branding','primaryColor',e.target.value)} />
            </div>
          </Field>
          <Field label="Secondary colour">
            <div className="flex items-center gap-2">
              <input type="color" value={cfg.branding.secondaryColor} onChange={e => set('branding','secondaryColor',e.target.value)} className="h-9 w-12 rounded border border-gray-300 cursor-pointer" />
              <input className={inp} value={cfg.branding.secondaryColor} onChange={e => set('branding','secondaryColor',e.target.value)} />
            </div>
          </Field>
        </div>
      </Section>

      <Section title="Cost Centres">
        <TagInput values={cfg.dropdowns.costCentres} onChange={v => set('dropdowns','costCentres',v)} placeholder="Add cost centre…" />
      </Section>

      <Section title="Trip & Sector Types">
        <Field label="Trip types">
          <TagInput values={cfg.dropdowns.tripTypes} onChange={v => set('dropdowns','tripTypes',v)} placeholder="Add trip type…" />
        </Field>
        <Field label="Sector types">
          <TagInput values={cfg.dropdowns.sectorTypes} onChange={v => set('dropdowns','sectorTypes',v)} placeholder="Add sector type…" />
        </Field>
      </Section>

      <Section title="Fees">
        <Toggle checked={cfg.fees.managementFeeEnabled} onChange={v => set('fees','managementFeeEnabled',v)} label="Management fee" />
        {cfg.fees.managementFeeEnabled && (
          <div className="space-y-3 pl-12">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Fee label"><input className={inp} value={cfg.fees.managementFeeLabel} onChange={e => set('fees','managementFeeLabel',e.target.value)} /></Field>
              <Field label="Amount ($ ex-GST)"><input type="number" className={inp} value={cfg.fees.managementFeeAmount} onChange={e => set('fees','managementFeeAmount',Number(e.target.value))} /></Field>
            </div>
            <FeeAppliesTo
              value={cfg.fees.managementFeeAppliesTo}
              onChange={v => set('fees','managementFeeAppliesTo',v)}
              tripTypes={cfg.dropdowns.tripTypes}
            />
          </div>
        )}
        <Toggle checked={cfg.fees.amendmentFeeEnabled} onChange={v => set('fees','amendmentFeeEnabled',v)} label="Amendment fee" />
        {cfg.fees.amendmentFeeEnabled && (
          <div className="space-y-3 pl-12">
            <Field label="Amount ($ ex-GST)"><input type="number" className={inp} value={cfg.fees.amendmentFeeAmount} onChange={e => set('fees','amendmentFeeAmount',Number(e.target.value))} /></Field>
            <FeeAppliesTo
              value={cfg.fees.amendmentFeeAppliesTo}
              onChange={v => set('fees','amendmentFeeAppliesTo',v)}
              tripTypes={cfg.dropdowns.tripTypes}
            />
          </div>
        )}
        <Field label="GST rate">
          <select className={inp} value={cfg.fees.gstRate} onChange={e => set('fees','gstRate',Number(e.target.value))}>
            <option value={0.10}>10% (Australian GST)</option>
            <option value={0.15}>15% (NZ GST)</option>
            <option value={0}>No GST</option>
          </select>
        </Field>
      </Section>

      <Section title="Approval Workflow">
        <p className="text-xs text-gray-700 -mt-2">Set whether each trip type requires approval before a booking can proceed.</p>
        {(cfg.dropdowns.tripTypes?.length ? cfg.dropdowns.tripTypes : DEFAULT_CONFIG.dropdowns.tripTypes).map(type => (
          <Toggle
            key={type}
            checked={cfg.workflow.approvalByTripType?.[type] ?? cfg.workflow.requiresApproval}
            onChange={v => setApprovalByType(type, v)}
            label={`${type} — requires approval before booking`}
          />
        ))}
        <Toggle checked={cfg.workflow.emailNotifications} onChange={v => set('workflow','emailNotifications',v)} label="Email notifications" description="Notify approvers and travellers by email (requires email provider setup)" />

        {/* B5: Approval escalation */}
        <Toggle
          checked={cfg.workflow.escalationEnabled ?? false}
          onChange={v => set('workflow','escalationEnabled',v)}
          label="Approval escalation"
          description="Automatically send reminders and escalate pending approvals that have been waiting too long"
        />
        {cfg.workflow.escalationEnabled && (
          <div className="ml-8 p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
            <Field label="Send reminder after (days)">
              <input
                type="number"
                min="1"
                max="30"
                className={inp}
                value={cfg.workflow.escalationReminderDays ?? 3}
                onChange={e => set('workflow','escalationReminderDays',parseInt(e.target.value) || 3)}
                placeholder="3"
              />
            </Field>
            <Field label="Escalate to STX after (days)">
              <input
                type="number"
                min="1"
                max="60"
                className={inp}
                value={cfg.workflow.escalationEscalateDays ?? 7}
                onChange={e => set('workflow','escalationEscalateDays',parseInt(e.target.value) || 7)}
                placeholder="7"
              />
            </Field>
            <p className="text-xs text-gray-600">
              Reminders are sent to the original approver. Escalations are forwarded to all STX staff.
            </p>
          </div>
        )}
      </Section>

      <Section title="Features">
        {[
          ['hotelBooking',        'Hotel booking',           'Allow searching and booking hotels via Nuitee'],
          ['invoiceGeneration',   'Invoice generation',      'Allow generating PDF invoices'],
          ['reports',             'Reports',                 'Show analytics reports tab'],
          ['accessibilityToolbar','Accessibility toolbar',   'Show accessibility options in the UI'],
          ['groupEvents',         'Group events',            'Allow Group Event trip type'],
          ['fileAttachments',     'File attachments',        'Allow attaching files to trips'],
          ['selfManagedTrips',    'Self-managed trips',      'Allow Self-Managed trip type'],
          ['accommodationPolicy', 'Accommodation policy',    'Show accommodation spend vs policy rates in Travel Policy report'],
          ['flightPolicy',        'Flight cost policy',      'Show flight spend vs policy rates in Travel Policy report'],
          ['customPermissions',   'Custom user permissions', 'Allow client operations managers to override permissions for individual team members'],
        ].map(([key, label, desc]) => (
          <Toggle key={key} checked={cfg.features[key]} onChange={v => set('features',key,v)} label={label} description={desc} />
        ))}
      </Section>

      <Section title="Contact">
        <Field label="Contact email (client-facing)">
          <input
            type="email"
            className={inp}
            value={cfg.contact.email}
            onChange={e => set('contact', 'email', e.target.value)}
            placeholder="enquiries@supportedtravelx.com.au"
          />
        </Field>
        <p className="text-xs text-gray-600">
          Shown on the Contact page for client users. Leave blank to use the default STX enquiries address.
        </p>
        <Field label="STX notifications email">
          <input
            type="email"
            className={inp}
            value={cfg.contact.stxNotifyEmail || ''}
            onChange={e => set('contact', 'stxNotifyEmail', e.target.value)}
            placeholder="enquiries@supportedtravelx.com.au"
          />
        </Field>
        <p className="text-xs text-gray-600">
          STX inbox that receives portal feedback, fault reports, cancellation alerts, and hotel booking confirmations for this client. Leave blank to use the default STX enquiries address.
        </p>
      </Section>

      {isEdit && (
        <Section title="Travel Policy Rates">
          <PolicyRatesEditor clientId={clientId} />
        </Section>
      )}

      <Section title="Hotel Booking">
        <Field label="Nuitee feed">
          <select className={inp} value={cfg.hotelBooking.nuiteeFeed} onChange={e => set('hotelBooking','nuiteeFeed',e.target.value)}>
            <option value="vivatravelholdingscug">Viva Travel CUG (Best Rates)</option>
            <option value="vivatravelholdingsb2b">Viva Travel B2B</option>
          </select>
        </Field>
        <Toggle checked={cfg.hotelBooking.bookingPasswordEnabled} onChange={v => set('hotelBooking','bookingPasswordEnabled',v)} label="Require booking password" description="Adds an extra confirmation password before completing a hotel booking" />
        <Toggle checked={cfg.hotelBooking.selfManagedHotelBooking !== false} onChange={v => set('hotelBooking','selfManagedHotelBooking',v)} label="Allow hotel booking for Self-Managed trips" description="When off, the Nuitee hotel search is hidden for Self-Managed trip types even if hotel booking is enabled globally" />
        <Field label="Markup % (STX staff only — applied to all displayed hotel rates)">
          <input
            type="number"
            min="0"
            max="100"
            step="0.5"
            className={inp}
            value={cfg.hotelBooking.markupPercent ?? 0}
            onChange={e => set('hotelBooking', 'markupPercent', parseFloat(e.target.value) || 0)}
            placeholder="0"
          />
        </Field>
        <p className="text-xs text-gray-600">Markup is only visible to STX staff when searching hotels. Clients see the final marked-up price.</p>
      </Section>

      <Section title="Policy Variance">
        <p className="text-xs text-gray-700 mb-4">
          Allow bookings above the travel policy rate up to a defined threshold. When the threshold is exceeded,
          the system can either warn the user or require explicit approval before the trip can proceed.
        </p>

        {/* Accommodation variance */}
        <div className="space-y-3">
          <Toggle
            checked={cfg.policyVariance.accommodation.enabled}
            onChange={v => setVariance('accommodation', 'enabled', v)}
            label="Accommodation variance"
            description="Allow per-night accommodation costs to exceed the policy rate up to a threshold"
          />
          {cfg.policyVariance.accommodation.enabled && (
            <div className="ml-8 p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
              <Field label="Variance allowance">
                <div className="flex gap-2 items-center">
                  <select
                    className={`${inp} w-40`}
                    value={cfg.policyVariance.accommodation.type}
                    onChange={e => setVariance('accommodation', 'type', e.target.value)}
                  >
                    <option value="percent">% over policy rate</option>
                    <option value="amount">$ over policy rate</option>
                  </select>
                  <input
                    type="number" min="0"
                    step={cfg.policyVariance.accommodation.type === 'percent' ? '1' : '5'}
                    className={`${inp} w-28`}
                    value={cfg.policyVariance.accommodation.value}
                    onChange={e => setVariance('accommodation', 'value', parseFloat(e.target.value) || 0)}
                    placeholder={cfg.policyVariance.accommodation.type === 'percent' ? '10' : '50'}
                  />
                  <span className="text-sm text-gray-700 shrink-0">
                    {cfg.policyVariance.accommodation.type === 'percent' ? '%' : 'AUD'}
                  </span>
                </div>
              </Field>
              <Field label="When threshold is exceeded">
                <select
                  className={inp}
                  value={cfg.policyVariance.accommodation.action}
                  onChange={e => setVariance('accommodation', 'action', e.target.value)}
                >
                  <option value="warn">Show a warning — allow booking to continue</option>
                  <option value="approve">Require explicit approval before proceeding</option>
                </select>
              </Field>
            </div>
          )}
        </div>

        {/* Flight variance */}
        <div className="space-y-3 mt-5">
          <Toggle
            checked={cfg.policyVariance.flight.enabled}
            onChange={v => setVariance('flight', 'enabled', v)}
            label="Flight variance"
            description="Allow total flight costs to exceed the policy rate up to a threshold"
          />
          {cfg.policyVariance.flight.enabled && (
            <div className="ml-8 p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
              <Field label="Variance allowance">
                <div className="flex gap-2 items-center">
                  <select
                    className={`${inp} w-40`}
                    value={cfg.policyVariance.flight.type}
                    onChange={e => setVariance('flight', 'type', e.target.value)}
                  >
                    <option value="percent">% over policy rate</option>
                    <option value="amount">$ over policy rate</option>
                  </select>
                  <input
                    type="number" min="0"
                    step={cfg.policyVariance.flight.type === 'percent' ? '1' : '5'}
                    className={`${inp} w-28`}
                    value={cfg.policyVariance.flight.value}
                    onChange={e => setVariance('flight', 'value', parseFloat(e.target.value) || 0)}
                    placeholder={cfg.policyVariance.flight.type === 'percent' ? '10' : '50'}
                  />
                  <span className="text-sm text-gray-700 shrink-0">
                    {cfg.policyVariance.flight.type === 'percent' ? '%' : 'AUD'}
                  </span>
                </div>
              </Field>
              <Field label="When threshold is exceeded">
                <select
                  className={inp}
                  value={cfg.policyVariance.flight.action}
                  onChange={e => setVariance('flight', 'action', e.target.value)}
                >
                  <option value="warn">Show a warning — allow booking to continue</option>
                  <option value="approve">Require explicit approval before proceeding</option>
                </select>
              </Field>
            </div>
          )}
        </div>
      </Section>

      {/* B3: Travel Budgets */}
      <Section title="Travel Budgets">
        <p className="text-xs text-gray-700 -mt-2">
          Set FY travel budgets per cost centre. A dashboard widget shows spend vs budget when configured.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Financial year (FY start year)">
            <input
              type="number"
              min="2020"
              max="2040"
              className={inp}
              value={cfg.budgets?.fiscalYear ?? new Date().getFullYear()}
              onChange={e => setCfg(prev => ({ ...prev, budgets: { ...(prev.budgets || {}), fiscalYear: parseInt(e.target.value) || new Date().getFullYear() } }))}
              placeholder={String(new Date().getFullYear())}
            />
          </Field>
          <Field label="Overall FY budget ($ incl. GST)">
            <input
              type="number"
              min="0"
              step="1000"
              className={inp}
              value={cfg.budgets?.overall ?? ''}
              onChange={e => setCfg(prev => ({ ...prev, budgets: { ...(prev.budgets || {}), overall: parseFloat(e.target.value) || 0 } }))}
              placeholder="e.g. 100000"
            />
          </Field>
          <Field label="Alert threshold (% of budget)">
            <input
              type="number"
              min="0"
              max="100"
              className={inp}
              value={cfg.budgets?.alertThreshold ?? 80}
              onChange={e => setCfg(prev => ({ ...prev, budgets: { ...(prev.budgets || {}), alertThreshold: parseInt(e.target.value) || 80 } }))}
              placeholder="80"
            />
          </Field>
        </div>
        {cfg.dropdowns.costCentres?.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">Per cost centre budgets ($ incl. GST)</label>
            <div className="space-y-2">
              {cfg.dropdowns.costCentres.map(cc => (
                <div key={cc} className="flex items-center gap-3">
                  <span className="text-sm text-gray-700 w-40 shrink-0">{cc}</span>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-36 placeholder:text-gray-500"
                    value={cfg.budgets?.byCostCentre?.[cc] ?? ''}
                    onChange={e => setCfg(prev => ({
                      ...prev,
                      budgets: {
                        ...(prev.budgets || {}),
                        byCostCentre: { ...(prev.budgets?.byCostCentre || {}), [cc]: parseFloat(e.target.value) || 0 },
                      },
                    }))}
                    placeholder="e.g. 25000"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </Section>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
        <button type="submit" disabled={saving} className="px-5 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create client'}
        </button>
      </div>
    </form>
  );
}
