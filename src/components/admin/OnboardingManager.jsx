import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, getDocs, doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../../firebase';
import Modal from '../shared/Modal';

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

// Mirrors ClientForm DEFAULT_CONFIG — used when creating a new client from onboarding
const BASE_CONFIG = {
  branding:  { logo: '', primaryColor: '#1e40af', secondaryColor: '#93c5fd', portalTitle: '' },
  dropdowns: {
    costCentres: [],
    tripTypes:   ['Self-Managed', 'STX-Managed', 'Group Event'],
    sectorTypes: ['Flight', 'Accommodation', 'Car Hire', 'Parking', 'Transfers', 'Meals', 'Other'],
    idTypes:     ['Passport', 'Drivers Licence', 'Proof of Age Card', 'Other'],
  },
  fees: { managementFeeEnabled: true, managementFeeAmount: 55, managementFeeLabel: 'STX Management Fee', managementFeeAppliesTo: [], amendmentFeeEnabled: true, amendmentFeeAmount: 30, amendmentFeeAppliesTo: [], gstRate: 0.10 },
  workflow:  { requiresApproval: true, approvalLevels: 1, emailNotifications: false, approvalByTripType: null },
  features:  { hotelBooking: true, invoiceGeneration: true, reports: true, accessibilityToolbar: true, groupEvents: true, fileAttachments: true, selfManagedTrips: true, accommodationPolicy: true, flightPolicy: false },
  hotelBooking: { nuiteeFeed: 'vivatravelholdingscug', bookingPasswordEnabled: false, markupPercent: 0, selfManagedHotelBooking: true },
  policyVariance: {
    accommodation: { enabled: false, type: 'percent', value: 0, action: 'warn' },
    flight:        { enabled: false, type: 'percent', value: 0, action: 'warn' },
  },
  contact: { email: '' },
};

// Build a flat dot-notation update object from onboarding responses.
// Used with updateDoc so nested fields are patched without clobbering siblings.
function buildUpdatePatch(r) {
  const d = {};

  if (r.portalTitle)    d['branding.portalTitle']    = r.portalTitle;
  if (r.logo)           d['branding.logo']           = r.logo;
  if (r.primaryColor && r.primaryColor !== '#1e40af')     d['branding.primaryColor']   = r.primaryColor;
  if (r.secondaryColor && r.secondaryColor !== '#93c5fd') d['branding.secondaryColor'] = r.secondaryColor;

  if (r.costCentres?.length) d['dropdowns.costCentres'] = r.costCentres;
  if (r.tripTypes?.length)   d['dropdowns.tripTypes']   = r.tripTypes;

  if (r.approvalByTripType && Object.keys(r.approvalByTripType).length) {
    d['workflow.approvalByTripType'] = r.approvalByTripType;
    d['workflow.requiresApproval']   = Object.values(r.approvalByTripType).some(Boolean);
  }
  if (r.emailNotifications !== undefined) d['workflow.emailNotifications'] = r.emailNotifications;

  if (r.features) {
    for (const [key, val] of Object.entries(r.features)) d[`features.${key}`] = val;
  }

  if (r.gstRate !== undefined) d['fees.gstRate'] = r.gstRate;

  if (r.selfManagedHotelBooking !== undefined)
    d['hotelBooking.selfManagedHotelBooking'] = r.selfManagedHotelBooking;

  if (r.policyVariance?.accommodation) {
    const a = r.policyVariance.accommodation;
    d['policyVariance.accommodation.enabled'] = a.enabled;
    if (a.enabled) {
      d['policyVariance.accommodation.type']   = a.type;
      d['policyVariance.accommodation.value']  = a.value;
      d['policyVariance.accommodation.action'] = a.action;
    }
  }
  if (r.policyVariance?.flight) {
    const f = r.policyVariance.flight;
    d['policyVariance.flight.enabled'] = f.enabled;
    if (f.enabled) {
      d['policyVariance.flight.type']   = f.type;
      d['policyVariance.flight.value']  = f.value;
      d['policyVariance.flight.action'] = f.action;
    }
  }

  return d;
}

// Merge responses onto BASE_CONFIG to produce a complete config for a brand-new client.
function buildFullConfig(r) {
  const cfg = {
    branding:  { ...BASE_CONFIG.branding },
    dropdowns: { ...BASE_CONFIG.dropdowns },
    fees:      { ...BASE_CONFIG.fees },
    workflow:  { ...BASE_CONFIG.workflow },
    features:  { ...BASE_CONFIG.features },
    hotelBooking:   { ...BASE_CONFIG.hotelBooking },
    policyVariance: {
      accommodation: { ...BASE_CONFIG.policyVariance.accommodation },
      flight:        { ...BASE_CONFIG.policyVariance.flight },
    },
    contact: { ...BASE_CONFIG.contact },
  };

  if (r.portalTitle)    cfg.branding.portalTitle    = r.portalTitle;
  if (r.logo)           cfg.branding.logo           = r.logo;
  if (r.primaryColor)   cfg.branding.primaryColor   = r.primaryColor;
  if (r.secondaryColor) cfg.branding.secondaryColor = r.secondaryColor;

  if (r.costCentres?.length) cfg.dropdowns.costCentres = r.costCentres;
  if (r.tripTypes?.length)   cfg.dropdowns.tripTypes   = r.tripTypes;

  if (r.approvalByTripType && Object.keys(r.approvalByTripType).length) {
    cfg.workflow.approvalByTripType = r.approvalByTripType;
    cfg.workflow.requiresApproval   = Object.values(r.approvalByTripType).some(Boolean);
  }
  if (r.emailNotifications !== undefined) cfg.workflow.emailNotifications = r.emailNotifications;

  if (r.features) cfg.features = { ...cfg.features, ...r.features };
  if (r.gstRate !== undefined) cfg.fees.gstRate = r.gstRate;

  if (r.selfManagedHotelBooking !== undefined)
    cfg.hotelBooking.selfManagedHotelBooking = r.selfManagedHotelBooking;

  if (r.policyVariance?.accommodation)
    cfg.policyVariance.accommodation = { ...cfg.policyVariance.accommodation, ...r.policyVariance.accommodation };
  if (r.policyVariance?.flight)
    cfg.policyVariance.flight = { ...cfg.policyVariance.flight, ...r.policyVariance.flight };

  return cfg;
}

const STATUS_COLOURS = {
  pending:   'bg-amber-100 text-amber-700',
  submitted: 'bg-blue-100 text-blue-700',
  applied:   'bg-green-100 text-green-700',
};

const STATUS_LABELS = {
  pending:   'Awaiting client',
  submitted: 'Submitted — review needed',
  applied:   'Applied',
};

function fmt(iso) {
  if (!iso) return '—';
  try {
    const d = iso?.toDate ? iso.toDate() : new Date(iso);
    return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return '—'; }
}

function pill(status) {
  return (
    <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLOURS[status] || 'bg-gray-100 text-gray-500'}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

// ── Send form modal ───────────────────────────────────────────────────────────

function SendModal({ onClose, onSent }) {
  const [clientName, setClientName]   = useState('');
  const [recipEmail, setRecipEmail]   = useState('');
  const [recipName, setRecipName]     = useState('');
  const [note, setNote]               = useState('');
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');

  const handleSend = async (e) => {
    e.preventDefault();
    setError('');
    if (!clientName.trim()) return setError('Client name is required.');
    if (!recipEmail.trim()) return setError('Recipient email is required.');
    setSaving(true);
    try {
      const fn = httpsCallable(getFunctions(), 'sendOnboardingForm');
      await fn({ clientName: clientName.trim(), recipientEmail: recipEmail.trim(), recipientName: recipName.trim(), note: note.trim() });
      onSent();
    } catch (err) {
      setError(err.message || 'Failed to send. Please try again.');
    }
    setSaving(false);
  };

  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <Modal title="Send Onboarding Form" onClose={onClose}>
      <form onSubmit={handleSend} className="space-y-4">
        <p className="text-sm text-gray-500">
          The client will receive an email with a personalised link to their preferences form.
          Once submitted, you'll receive a notification and can apply the responses to their client config.
        </p>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Client / organisation name *</label>
          <input className={inp} value={clientName} onChange={e => setClientName(e.target.value)}
            placeholder="e.g. Disability Australia Network" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Recipient email *</label>
            <input type="email" className={inp} value={recipEmail} onChange={e => setRecipEmail(e.target.value)}
              placeholder="name@organisation.com.au" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Recipient name <span className="text-gray-400 font-normal">(optional)</span></label>
            <input className={inp} value={recipName} onChange={e => setRecipName(e.target.value)}
              placeholder="First name" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Personal note <span className="text-gray-400 font-normal">(optional)</span></label>
          <textarea className={inp + ' min-h-[72px] resize-none'} value={note} onChange={e => setNote(e.target.value)}
            placeholder="e.g. Hi Sarah, we've pre-configured your approval workflow as discussed — please review section 4." />
          <p className="text-xs text-gray-400 mt-1">Appears as a highlighted note at the top of the form.</p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-3 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
          <button type="submit" disabled={saving}
            className="px-5 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Sending…' : 'Send form'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Review & Apply modal ──────────────────────────────────────────────────────

function ReviewModal({ form, onClose, onApplied }) {
  const [clients, setClients]       = useState([]);
  const [mode, setMode]             = useState('existing'); // 'existing' | 'new'
  const [clientId, setClientId]     = useState('');
  const [newName, setNewName]       = useState(form.clientName || '');
  const [newCid, setNewCid]         = useState(slugify(form.clientName || ''));
  const [applying, setApplying]     = useState(false);
  const [applyError, setApplyError] = useState('');
  const [applyDone, setApplyDone]   = useState(false);
  const [appliedCid, setAppliedCid] = useState('');

  useEffect(() => {
    getDocs(collection(db, 'clients')).then(snap => {
      setClients(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name)));
    }).catch(() => {});
  }, []);

  const r = form.responses || {};

  const handleApply = async () => {
    setApplyError('');
    if (mode === 'existing' && !clientId) return setApplyError('Please select a client.');
    if (mode === 'new') {
      if (!newName.trim()) return setApplyError('Client name is required.');
      if (!newCid.trim())  return setApplyError('Client ID is required.');
    }

    const targetId = mode === 'new' ? newCid.trim() : clientId;
    setApplying(true);
    try {
      if (mode === 'new') {
        // Create client root doc
        await setDoc(doc(db, 'clients', targetId), {
          clientId: targetId,
          name: newName.trim(),
          active: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        // Create full initial config merged with responses
        await setDoc(
          doc(db, 'clients', targetId, 'config', 'settings'),
          { ...buildFullConfig(r), updatedAt: serverTimestamp() }
        );
      } else {
        // Patch existing config — dot-notation keys update nested fields without clobbering siblings
        const patch = buildUpdatePatch(r);
        if (Object.keys(patch).length) {
          await updateDoc(
            doc(db, 'clients', targetId, 'config', 'settings'),
            { ...patch, updatedAt: serverTimestamp() }
          );
        }
      }

      // Travel policy rates (separate doc) — same for both paths
      const policyPatch = {};
      if (r.accomRates  && Object.keys(r.accomRates).length)  policyPatch.rates       = r.accomRates;
      if (r.flightRates && Object.keys(r.flightRates).length) policyPatch.flightRates = r.flightRates;
      if (Object.keys(policyPatch).length) {
        await setDoc(
          doc(db, 'clients', targetId, 'config', 'travelPolicy'),
          policyPatch,
          { merge: true }
        );
      }

      // Mark onboarding as applied
      await updateDoc(doc(db, 'onboarding', form.token), {
        status: 'applied',
        appliedAt: serverTimestamp(),
        appliedToClientId: targetId,
      });

      setAppliedCid(targetId);
      setApplyDone(true);
      onApplied();
    } catch (err) {
      setApplyError(err.message || 'Failed to apply settings. Please try again.');
    }
    setApplying(false);
  };

  const renderValue = (val) => {
    if (val === null || val === undefined) return <span className="text-gray-400">Not set</span>;
    if (typeof val === 'boolean') return val ? <span className="text-green-600 font-medium">Yes</span> : <span className="text-gray-400">No</span>;
    if (Array.isArray(val)) return val.length ? val.join(', ') : <span className="text-gray-400">None</span>;
    if (typeof val === 'object') return <span className="text-xs text-gray-500">{JSON.stringify(val)}</span>;
    return String(val);
  };

  if (applyDone) {
    return (
      <Modal title="Settings applied" onClose={onClose}>
        <div className="text-center py-6 space-y-3">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-800">
            {mode === 'new' ? 'Client created and preferences applied' : 'Preferences applied to client config'}
          </p>
          <p className="text-xs text-gray-500 max-w-xs mx-auto">
            Client ID: <strong>{appliedCid}</strong>. Finalise the remaining settings (fees, contact emails,
            hotel booking) in the Clients tab.
          </p>
          <button onClick={onClose} className="mt-2 px-4 py-2 bg-gray-800 text-white text-sm rounded-lg hover:bg-gray-900">Done</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={`Review: ${form.clientName}`} onClose={onClose}>
      <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">

        {/* Meta */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs space-y-1">
          <div className="flex gap-2"><span className="text-gray-400 w-24 shrink-0">Submitted by</span><span className="text-gray-700">{form.recipientName ? `${form.recipientName} — ` : ''}{form.recipientEmail}</span></div>
          <div className="flex gap-2"><span className="text-gray-400 w-24 shrink-0">Submitted at</span><span className="text-gray-700">{fmt(form.submittedAt)}</span></div>
          {form.note && <div className="flex gap-2"><span className="text-gray-400 w-24 shrink-0">Note sent</span><span className="text-gray-700 italic">"{form.note}"</span></div>}
        </div>

        {/* Responses */}
        <ResponseGroup title="Portal Identity">
          <Row label="Portal title" value={r.portalTitle} />
          <Row label="Logo URL" value={r.logo} />
          <Row label="Primary colour" value={r.primaryColor && (
            <span className="flex items-center gap-2">
              <span style={{ background: r.primaryColor }} className="w-4 h-4 rounded border border-gray-200 inline-block" />
              {r.primaryColor}
            </span>
          )} />
          <Row label="Secondary colour" value={r.secondaryColor && (
            <span className="flex items-center gap-2">
              <span style={{ background: r.secondaryColor }} className="w-4 h-4 rounded border border-gray-200 inline-block" />
              {r.secondaryColor}
            </span>
          )} />
        </ResponseGroup>

        <ResponseGroup title="Departments & Travel">
          <Row label="Cost centres" value={r.costCentres?.length ? r.costCentres.join(', ') : null} />
          <Row label="Trip types" value={r.tripTypes?.length ? r.tripTypes.join(', ') : null} />
        </ResponseGroup>

        <ResponseGroup title="Workflow">
          {r.approvalByTripType && Object.entries(r.approvalByTripType).map(([type, required]) => (
            <Row key={type} label={type} value={required ? 'Approval required' : 'No approval'} />
          ))}
          <Row label="Email notifications" value={renderValue(r.emailNotifications)} />
        </ResponseGroup>

        <ResponseGroup title="Features">
          {r.features && Object.entries(r.features).map(([key, val]) => (
            <Row key={key} label={key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())} value={renderValue(val)} />
          ))}
          <Row label="Self-managed hotel booking" value={renderValue(r.selfManagedHotelBooking)} />
        </ResponseGroup>

        <ResponseGroup title="Spend Limits">
          {r.accomRates && Object.keys(r.accomRates).length > 0 && (
            <Row label="Accommodation" value={
              <div className="space-y-0.5">
                {Object.entries(r.accomRates).map(([city, rate]) => (
                  <div key={city} className="text-xs">{city}: ${rate}/night</div>
                ))}
              </div>
            } />
          )}
          {r.flightRates && Object.keys(r.flightRates).length > 0 && (
            <Row label="Flights" value={
              <div className="space-y-0.5">
                {Object.entries(r.flightRates).map(([city, rate]) => (
                  <div key={city} className="text-xs">{city}: ${rate}/trip</div>
                ))}
              </div>
            } />
          )}
        </ResponseGroup>

        <ResponseGroup title="Policy Compliance">
          {r.policyVariance?.accommodation?.enabled && (
            <Row label="Accommodation" value={`${r.policyVariance.accommodation.value}${r.policyVariance.accommodation.type === 'percent' ? '%' : '$'} over → ${r.policyVariance.accommodation.action === 'warn' ? 'warn' : 'require approval'}`} />
          )}
          {r.policyVariance?.accommodation?.enabled === false && (
            <Row label="Accommodation" value="No compliance rules" />
          )}
          {r.policyVariance?.flight?.enabled && (
            <Row label="Flights" value={`${r.policyVariance.flight.value}${r.policyVariance.flight.type === 'percent' ? '%' : '$'} over → ${r.policyVariance.flight.action === 'warn' ? 'warn' : 'require approval'}`} />
          )}
          {r.policyVariance?.flight?.enabled === false && (
            <Row label="Flights" value="No compliance rules" />
          )}
        </ResponseGroup>

        <ResponseGroup title="Tax">
          <Row label="GST rate" value={r.gstRate === 0.10 ? '10%' : r.gstRate === 0.15 ? '15%' : r.gstRate === 0 ? 'None' : r.gstRate} />
        </ResponseGroup>

        {r.notes && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <p className="text-xs font-semibold text-yellow-800 mb-1">Client notes / questions</p>
            <p className="text-sm text-yellow-900 whitespace-pre-wrap leading-relaxed">{r.notes}</p>
          </div>
        )}

        {/* Apply section */}
        {form.status !== 'applied' ? (
          <div className="border-t border-gray-200 pt-4 space-y-3">
            <p className="text-sm font-medium text-gray-700">Apply to client configuration</p>

            {/* Mode toggle */}
            <div className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit">
              {[['existing', 'Existing client'], ['new', 'Create new client']].map(([v, l]) => (
                <button key={v} type="button" onClick={() => { setMode(v); setApplyError(''); }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${mode === v ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  {l}
                </button>
              ))}
            </div>

            {mode === 'existing' ? (
              <div className="space-y-2">
                <p className="text-xs text-gray-500">
                  Only responses the client filled in will be applied — blank fields are left as-is.
                  Management fees, contact emails, and hotel booking settings are not touched.
                </p>
                <select
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={clientId}
                  onChange={e => setClientId(e.target.value)}
                >
                  <option value="">— Select client —</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.id})</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-gray-500">
                  A new client account will be created using the responses as the starting configuration.
                  You can add fees, contact emails, and other settings in the Clients tab afterwards.
                </p>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Client name</label>
                  <input
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={newName}
                    onChange={e => { setNewName(e.target.value); setNewCid(slugify(e.target.value)); }}
                    placeholder="e.g. Disability Australia Network"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Client ID (URL-safe, cannot be changed later)</label>
                  <input
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={newCid}
                    onChange={e => setNewCid(slugify(e.target.value))}
                    placeholder="e.g. disability-australia-network"
                  />
                </div>
              </div>
            )}

            {applyError && <p className="text-xs text-red-600">{applyError}</p>}

            <div className="flex justify-end gap-3">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Close</button>
              <button type="button" onClick={handleApply} disabled={applying}
                className="px-5 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 disabled:opacity-50">
                {applying
                  ? 'Applying…'
                  : mode === 'new' ? 'Create client & apply' : 'Apply to client'}
              </button>
            </div>
          </div>
        ) : (
          <div className="border-t border-gray-200 pt-4">
            <p className="text-sm text-green-600 font-medium">
              Applied{form.appliedToClientId ? ` to: ${form.appliedToClientId}` : ''} on {fmt(form.appliedAt)}
            </p>
            <div className="flex justify-end mt-3">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Close</button>
            </div>
          </div>
        )}

      </div>
    </Modal>
  );
}

function ResponseGroup({ title, children }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{title}</p>
      <div className="border border-gray-100 rounded-lg overflow-hidden divide-y divide-gray-50">
        {children}
      </div>
    </div>
  );
}

function Row({ label, value }) {
  if (!value && value !== false && value !== 0) return null;
  return (
    <div className="flex gap-3 px-3 py-2 bg-white">
      <span className="text-xs text-gray-400 w-36 shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-gray-700 leading-snug flex-1">{value}</span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function OnboardingManager() {
  const [forms, setForms]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showSend, setShowSend]   = useState(false);
  const [reviewForm, setReviewForm] = useState(null);
  const [refresh, setRefresh]     = useState(0);

  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, 'onboarding'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setForms(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, [refresh]);

  const portalUrl = window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : window.location.origin;

  const copyLink = (token) => {
    navigator.clipboard.writeText(`${portalUrl}/onboarding/${token}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">Send onboarding forms to new clients to collect their portal preferences.</p>
        </div>
        <button
          onClick={() => setShowSend(true)}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Send onboarding form
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400 py-8 text-center">Loading…</p>
      ) : forms.length === 0 ? (
        <div className="border border-dashed border-gray-200 rounded-xl py-12 text-center">
          <p className="text-sm font-medium text-gray-500 mb-1">No onboarding forms yet</p>
          <p className="text-xs text-gray-400">Send a form to a new client to get started.</p>
        </div>
      ) : (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Client</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Recipient</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Sent</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {forms.map(f => (
                <tr key={f.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-800">{f.clientName}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {f.recipientName && <span className="block text-gray-700 text-xs font-medium">{f.recipientName}</span>}
                    {f.recipientEmail}
                  </td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmt(f.createdAt)}</td>
                  <td className="px-4 py-3">{pill(f.status)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      {f.status === 'pending' && (
                        <button
                          onClick={() => copyLink(f.token)}
                          title="Copy form link"
                          className="text-xs text-gray-400 hover:text-gray-700 px-2 py-1 border border-gray-200 rounded-lg hover:border-gray-300"
                        >
                          Copy link
                        </button>
                      )}
                      {(f.status === 'submitted' || f.status === 'applied') && (
                        <button
                          onClick={() => setReviewForm(f)}
                          className={`text-xs px-3 py-1.5 rounded-lg font-medium border transition-colors ${
                            f.status === 'submitted'
                              ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
                              : 'text-gray-600 border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          {f.status === 'submitted' ? 'Review & Apply' : 'View responses'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showSend && (
        <SendModal
          onClose={() => setShowSend(false)}
          onSent={() => { setShowSend(false); setRefresh(r => r + 1); }}
        />
      )}

      {reviewForm && (
        <ReviewModal
          form={reviewForm}
          onClose={() => setReviewForm(null)}
          onApplied={() => {
            setReviewForm(null);
            setRefresh(r => r + 1);
          }}
        />
      )}
    </div>
  );
}
