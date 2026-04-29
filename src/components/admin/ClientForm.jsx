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
  features: { hotelBooking: true, invoiceGeneration: true, reports: true, accessibilityToolbar: true, groupEvents: true, fileAttachments: true, selfManagedTrips: true, accommodationPolicy: true, flightPolicy: false },
  hotelBooking: { nuiteeFeed: 'vivatravelholdingscug', bookingPasswordEnabled: false },
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

const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

function FeeAppliesTo({ value, onChange, tripTypes }) {
  const types = tripTypes?.length ? tripTypes : ['Self-Managed', 'STX-Managed', 'Group Event'];
  const appliesAll = !value || value.length === 0;

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-gray-500">Applies to</label>
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
            <span className="text-xs text-gray-500">{blanketLabel}</span>
          </>
        )}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <input type="text" placeholder="Search city…" value={cityFilter} onChange={e => setCityFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-48" />
        <span className="text-xs text-gray-400">{filtered.length} cities</span>
      </div>

      <div className="border border-gray-200 rounded-lg overflow-hidden max-h-56 overflow-y-auto">
        <div className="grid grid-cols-[1fr_130px_36px] bg-gray-50 px-3 py-2 border-b border-gray-200 sticky top-0">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">City</span>
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wide text-right">{rateUnit} incl. GST</span>
          <span />
        </div>
        {filtered.length === 0 && (
          <p className="text-xs text-gray-400 px-3 py-3 text-center">No cities added yet.</p>
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
              <button type="button" onClick={() => del(city)} className="text-gray-300 hover:text-red-400 text-base leading-none px-1">×</button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2 items-end flex-wrap">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Add city</label>
          <input type="text" placeholder="City name" value={newCity} onChange={e => setNewCity(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none w-44" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">{rateUnit} ($)</label>
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

  if (loading) return <p className="text-sm text-gray-400">Loading policy rates…</p>;

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
          <p className="text-xs text-gray-400">Max allowable nightly accommodation spend per city (incl. GST). Used in the Travel Policy report.</p>
          <RateTable rates={accomRates} setRates={setAccomRates} rateUnit="Max/Night" blanketLabel="/night incl. GST — applies to destinations not listed below" />
        </>
      ) : (
        <>
          <p className="text-xs text-gray-400">Max allowable total flight cost per trip by destination city (incl. GST). Used in the Travel Policy report.</p>
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
    };
  });
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');

  const set = (section, key, value) =>
    setCfg(prev => ({ ...prev, [section]: { ...prev[section], [key]: value } }));

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
        <p className="text-xs text-gray-500 -mt-2">Set whether each trip type requires approval before a booking can proceed.</p>
        {(cfg.dropdowns.tripTypes?.length ? cfg.dropdowns.tripTypes : DEFAULT_CONFIG.dropdowns.tripTypes).map(type => (
          <Toggle
            key={type}
            checked={cfg.workflow.approvalByTripType?.[type] ?? cfg.workflow.requiresApproval}
            onChange={v => setApprovalByType(type, v)}
            label={`${type} — requires approval before booking`}
          />
        ))}
        <Toggle checked={cfg.workflow.emailNotifications} onChange={v => set('workflow','emailNotifications',v)} label="Email notifications" description="Notify approvers and travellers by email (requires email provider setup)" />
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
        ].map(([key, label, desc]) => (
          <Toggle key={key} checked={cfg.features[key]} onChange={v => set('features',key,v)} label={label} description={desc} />
        ))}
      </Section>

      <Section title="Contact">
        <Field label="Contact email">
          <input
            type="email"
            className={inp}
            value={cfg.contact.email}
            onChange={e => set('contact', 'email', e.target.value)}
            placeholder="enquiries@supportedtravelx.com.au"
          />
        </Field>
        <p className="text-xs text-gray-400">
          Shown on the Contact page for client users. Leave blank to use the default STX enquiries address.
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
