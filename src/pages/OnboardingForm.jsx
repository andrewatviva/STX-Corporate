import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

// ── Helpers ───────────────────────────────────────────────────────────────────

function Section({ id, title, badge, description, children }) {
  return (
    <div id={id} className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4 scroll-mt-4">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-base font-semibold text-gray-800">{title}</h2>
          {badge && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
              {badge}
            </span>
          )}
        </div>
        {description && (
          <p className="text-sm text-gray-500 leading-relaxed">{description}</p>
        )}
      </div>
      {children}
    </div>
  );
}

function InfoBox({ children }) {
  return (
    <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 text-sm text-blue-800 leading-relaxed">
      {children}
    </div>
  );
}

function Label({ children, optional }) {
  return (
    <label className="block text-sm font-medium text-gray-700 mb-1.5">
      {children}
      {optional && <span className="ml-1 text-xs font-normal text-gray-400">(optional)</span>}
    </label>
  );
}

const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent';

function TagField({ values, onChange, placeholder }) {
  const [input, setInput] = useState('');

  const add = () => {
    const t = input.trim();
    if (!t || values.includes(t)) { setInput(''); return; }
    onChange([...values, t]);
    setInput('');
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {values.map(v => (
          <span key={v} className="inline-flex items-center gap-1 px-2.5 py-1 bg-teal-50 border border-teal-200 rounded-full text-xs font-medium text-teal-800">
            {v}
            <button type="button" onClick={() => onChange(values.filter(x => x !== v))}
              className="text-teal-400 hover:text-teal-700 leading-none ml-0.5">×</button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          className={inp}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder={placeholder}
        />
        <button type="button" onClick={add}
          className="px-3 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 whitespace-nowrap">
          Add
        </button>
      </div>
    </div>
  );
}

function Toggle({ checked, onChange, label, description }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <div className="relative mt-0.5 shrink-0">
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="sr-only peer" />
        <div className={`w-10 h-6 rounded-full transition-colors ${checked ? 'bg-teal-600' : 'bg-gray-200'}`} />
        <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-4' : ''}`} />
      </div>
      <div>
        <p className="text-sm font-medium text-gray-700">{label}</p>
        {description && <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{description}</p>}
      </div>
    </label>
  );
}

const DEFAULT_TRIP_TYPES = [
  {
    id: 'STX-Managed',
    label: 'STX-Managed Travel',
    description: 'STX arranges all bookings (flights, hotels, transfers) on your behalf. Staff submit a travel request and STX handles everything.',
  },
  {
    id: 'Self-Managed',
    label: 'Self-Managed Travel',
    description: 'Staff arrange their own bookings and log the details in the portal for record-keeping, reimbursement, and reporting.',
  },
  {
    id: 'Group Event',
    label: 'Group Events',
    description: 'Group travel for conferences, team events, or multi-person trips. Supports multiple passengers on a single trip record.',
  },
];

const FEATURES = [
  {
    key: 'hotelBooking',
    label: 'Hotel booking through portal',
    description: 'Search and book hotels directly through the STX portal using preferred rates. Useful for STX-Managed trips where STX books accommodation on your behalf.',
    defaultOn: true,
  },
  {
    key: 'reports',
    label: 'Reports & analytics',
    description: 'Access spend dashboards and reports: destination analysis, cost centre breakdowns, accommodation policy compliance, and more.',
    defaultOn: true,
  },
  {
    key: 'fileAttachments',
    label: 'File attachments',
    description: 'Attach documents to trips — such as pre-approval forms, quotes, or receipts.',
    defaultOn: true,
  },
  {
    key: 'accessibilityToolbar',
    label: 'Accessibility toolbar',
    description: 'Provides visual accessibility tools for portal users: text size, contrast modes, dyslexia-friendly fonts, and keyboard navigation.',
    defaultOn: true,
  },
  {
    key: 'accommodationPolicy',
    label: 'Accommodation policy reporting',
    description: 'Set maximum nightly accommodation rates per city and see compliance tracked in the Travel Policy report.',
    defaultOn: false,
  },
  {
    key: 'flightPolicy',
    label: 'Flight cost policy reporting',
    description: 'Set maximum per-trip flight costs by destination and track compliance in the Travel Policy report.',
    defaultOn: false,
  },
];

// ── Main component ────────────────────────────────────────────────────────────

export default function OnboardingForm() {
  const { token } = useParams();

  const [loading, setLoading]   = useState(true);
  const [docData, setDocData]   = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [expired, setExpired]   = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [done, setDone]         = useState(false);
  const [error, setError]       = useState('');

  // Form state
  const [portalTitle, setPortalTitle]           = useState('');
  const [logo, setLogo]                         = useState('');
  const [primaryColor, setPrimaryColor]         = useState('#1e40af');
  const [secondaryColor, setSecondaryColor]     = useState('#93c5fd');
  const [costCentres, setCostCentres]           = useState([]);
  const [enabledTripTypes, setEnabledTripTypes] = useState(['STX-Managed', 'Self-Managed', 'Group Event']);
  const [customTripTypes, setCustomTripTypes]   = useState([]);
  const [approvalByType, setApprovalByType]     = useState({});
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [features, setFeatures]                 = useState(() =>
    Object.fromEntries(FEATURES.map(f => [f.key, f.defaultOn]))
  );
  const [gstRate, setGstRate]                   = useState(0.10);
  const [accomRates, setAccomRates]             = useState([]);
  const [newAccomCity, setNewAccomCity]         = useState('');
  const [newAccomRate, setNewAccomRate]         = useState('');
  const [notes, setNotes]                       = useState('');

  useEffect(() => {
    getDoc(doc(db, 'onboarding', token)).then(snap => {
      if (!snap.exists()) { setNotFound(true); setLoading(false); return; }
      const d = snap.data();
      if (d.status === 'submitted' || d.status === 'applied') { setSubmitted(true); setLoading(false); return; }
      if (d.expiresAt && new Date(d.expiresAt) < new Date()) { setExpired(true); setLoading(false); return; }
      setDocData(d);
      setLoading(false);
    }).catch(() => { setNotFound(true); setLoading(false); });
  }, [token]);

  const allTripTypes = [...enabledTripTypes, ...customTripTypes];

  const toggleTripType = (id) => {
    setEnabledTripTypes(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const addAccomRate = () => {
    const city = newAccomCity.trim();
    const rate = parseFloat(newAccomRate);
    if (!city || isNaN(rate) || rate <= 0) return;
    if (accomRates.find(r => r.city === city)) return;
    setAccomRates(prev => [...prev, { city, rate }]);
    setNewAccomCity('');
    setNewAccomRate('');
  };

  const removeAccomRate = (city) => setAccomRates(prev => prev.filter(r => r.city !== city));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const accomRatesObj = Object.fromEntries(accomRates.map(r => [r.city, r.rate]));
      await updateDoc(doc(db, 'onboarding', token), {
        status: 'submitted',
        submittedAt: new Date().toISOString(),
        responses: {
          portalTitle,
          logo,
          primaryColor,
          secondaryColor,
          costCentres,
          tripTypes: allTripTypes,
          approvalByTripType: approvalByType,
          emailNotifications,
          features,
          gstRate,
          accomRates: accomRatesObj,
          notes,
        },
      });
      setDone(true);
    } catch (err) {
      setError('Something went wrong. Please try again or contact STX.');
      console.error(err);
    }
    setSaving(false);
  };

  // ── Render states ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400 text-sm">Loading…</p>
      </div>
    );
  }

  if (notFound) {
    return (
      <Shell>
        <div className="text-center py-12">
          <p className="text-gray-700 font-medium mb-2">Form not found</p>
          <p className="text-sm text-gray-400">This link may be invalid. Please contact STX Corporate for assistance.</p>
        </div>
      </Shell>
    );
  }

  if (expired) {
    return (
      <Shell>
        <div className="text-center py-12">
          <p className="text-gray-700 font-medium mb-2">This link has expired</p>
          <p className="text-sm text-gray-400">Please contact STX Corporate to receive a new onboarding link.</p>
        </div>
      </Shell>
    );
  }

  if (submitted) {
    return (
      <Shell>
        <div className="text-center py-12">
          <div className="text-4xl mb-4">✓</div>
          <p className="text-gray-700 font-medium mb-2">Your preferences have been submitted</p>
          <p className="text-sm text-gray-500">The STX team will review your responses and be in touch to finalise your portal setup.</p>
        </div>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell clientName={docData?.clientName}>
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-gray-800 font-semibold text-lg mb-2">Thank you, we've received your preferences!</p>
          <p className="text-sm text-gray-500 max-w-md mx-auto leading-relaxed">
            The STX Corporate team will review your responses and be in touch shortly to finalise your portal setup.
            If you have any questions in the meantime, don't hesitate to reach out.
          </p>
        </div>
      </Shell>
    );
  }

  // ── Main form ─────────────────────────────────────────────────────────────

  return (
    <Shell clientName={docData?.clientName}>
      <form onSubmit={handleSubmit} className="space-y-6">

        {/* Intro */}
        <div className="bg-teal-50 border border-teal-200 rounded-2xl p-6">
          <h2 className="text-base font-semibold text-teal-900 mb-2">
            Welcome{docData?.recipientName ? `, ${docData.recipientName.split(' ')[0]}` : ''}!
          </h2>
          <p className="text-sm text-teal-800 leading-relaxed mb-3">
            This form helps us configure your STX Corporate Travel Portal. Work through each section
            and fill in what you can — there are no wrong answers. <strong>Anything you're unsure
            about can be left blank</strong> and we'll discuss it with you when we meet to finalise
            your setup.
          </p>
          {docData?.note && (
            <div className="mt-3 pt-3 border-t border-teal-200">
              <p className="text-xs font-semibold text-teal-700 uppercase tracking-wide mb-1">Note from STX</p>
              <p className="text-sm text-teal-800 italic">"{docData.note}"</p>
            </div>
          )}
        </div>

        {/* 1 — Portal identity */}
        <Section
          id="branding"
          title="1. Portal Identity"
          badge="optional"
          description="Customise how your portal looks. This is entirely optional — we can discuss branding when we meet."
        >
          <InfoBox>
            The portal title appears in the top bar of the portal. We'll show your organisation's name here.
            Colours are used for buttons and highlights throughout the interface.
          </InfoBox>

          <div>
            <Label optional>Portal title</Label>
            <input
              className={inp}
              value={portalTitle}
              onChange={e => setPortalTitle(e.target.value)}
              placeholder={docData?.clientName ? `e.g. ${docData.clientName} Travel Portal` : 'e.g. Acme Corp Travel Portal'}
            />
          </div>

          <div>
            <Label optional>Logo URL</Label>
            <input
              className={inp}
              value={logo}
              onChange={e => setLogo(e.target.value)}
              placeholder="https://yourwebsite.com/logo.png"
            />
            <p className="text-xs text-gray-400 mt-1">A direct link to your logo image (PNG or SVG). We can also set this up for you later.</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label optional>Primary colour</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)}
                  className="h-9 w-12 rounded border border-gray-300 cursor-pointer p-0.5" />
                <input className={inp} value={primaryColor} onChange={e => setPrimaryColor(e.target.value)}
                  placeholder="#1e40af" />
              </div>
            </div>
            <div>
              <Label optional>Secondary colour</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={secondaryColor} onChange={e => setSecondaryColor(e.target.value)}
                  className="h-9 w-12 rounded border border-gray-300 cursor-pointer p-0.5" />
                <input className={inp} value={secondaryColor} onChange={e => setSecondaryColor(e.target.value)}
                  placeholder="#93c5fd" />
              </div>
            </div>
          </div>
        </Section>

        {/* 2 — Cost centres */}
        <Section
          id="costcentres"
          title="2. Cost Centres"
          badge="optional"
          description="Cost centres are used to categorise travel bookings and appear in reports and invoices. These might be department names, project codes, funding streams, or budget lines."
        >
          <InfoBox>
            Examples: <em>NDIS Support, Administration, Programs, Capital Works, Board Travel, Marketing</em>.
            Type each one and press Add (or Enter). You can add more anytime through the portal.
          </InfoBox>
          <TagField values={costCentres} onChange={setCostCentres} placeholder="e.g. NDIS Support" />
        </Section>

        {/* 3 — Trip types */}
        <Section
          id="triptypes"
          title="3. Types of Travel"
          description="Select the travel types your organisation uses. You can enable all of them — they won't appear unless staff actually use them."
        >
          <InfoBox>
            These determine how a booking is processed and tracked in the portal.
          </InfoBox>

          <div className="space-y-3">
            {DEFAULT_TRIP_TYPES.map(type => (
              <label key={type.id} className="flex gap-3 p-4 border border-gray-200 rounded-xl cursor-pointer hover:border-teal-300 transition-colors"
                style={enabledTripTypes.includes(type.id) ? { borderColor: '#0d9488', background: '#f0fdfa' } : {}}>
                <input
                  type="checkbox"
                  checked={enabledTripTypes.includes(type.id)}
                  onChange={() => toggleTripType(type.id)}
                  className="mt-1 w-4 h-4 accent-teal-600 shrink-0 cursor-pointer"
                />
                <div>
                  <p className="text-sm font-medium text-gray-800">{type.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{type.description}</p>
                </div>
              </label>
            ))}
          </div>

          <div>
            <Label optional>Other travel types</Label>
            <p className="text-xs text-gray-400 mb-2">If you use other categories of travel not listed above, add them here.</p>
            <TagField values={customTripTypes} onChange={setCustomTripTypes} placeholder="e.g. Secondments, International Conferences" />
          </div>
        </Section>

        {/* 4 — Approval workflow */}
        <Section
          id="approval"
          title="4. Approval Workflow"
          badge="optional"
          description="You can require travel requests to be approved by a manager or designated approver before STX proceeds with bookings."
        >
          <InfoBox>
            When approval is required for a trip type, a designated approver in your organisation
            must sign off before STX can proceed. This is useful for cost control, NDIS plan
            governance, or simply keeping managers in the loop. If unsure, leave as-is and discuss with STX.
          </InfoBox>

          <div className="space-y-3">
            {allTripTypes.map(type => (
              <Toggle
                key={type}
                checked={approvalByType[type] !== false}
                onChange={v => setApprovalByType(prev => ({ ...prev, [type]: v }))}
                label={`${type} — requires approval before booking`}
                description={
                  (approvalByType[type] !== false)
                    ? 'An approver must sign off before STX arranges this trip.'
                    : 'Trips of this type go straight to STX without an approval step.'
                }
              />
            ))}
          </div>
        </Section>

        {/* 5 — Email notifications */}
        <Section
          id="notifications"
          title="5. Email Notifications"
          description="Control whether the portal sends automatic emails to staff when trip status changes."
        >
          <InfoBox>
            When enabled, travellers and approvers receive emails at key stages: when a trip is submitted
            for approval, approved, declined, or confirmed by STX. They also receive a reminder 3 days
            before their trip. Staff can manage their own email preferences from the portal.
          </InfoBox>

          <Toggle
            checked={emailNotifications}
            onChange={setEmailNotifications}
            label="Send email notifications for trip status changes"
            description={emailNotifications
              ? 'Staff will receive emails at key trip stages.'
              : 'No automatic trip status emails will be sent.'}
          />
        </Section>

        {/* 6 — Features */}
        <Section
          id="features"
          title="6. Portal Features"
          description="Select which features you'd like available in your portal. You can change these at any time — STX can turn features on or off for you."
        >
          <div className="space-y-4">
            {FEATURES.map(f => (
              <Toggle
                key={f.key}
                checked={features[f.key] ?? f.defaultOn}
                onChange={v => setFeatures(prev => ({ ...prev, [f.key]: v }))}
                label={f.label}
                description={f.description}
              />
            ))}
          </div>
        </Section>

        {/* 7 — Accommodation spend limits */}
        <Section
          id="policy"
          title="7. Accommodation Spend Limits"
          badge="optional"
          description="Set maximum nightly accommodation rates per city. These are used in the Travel Policy report to flag bookings that exceed your limits."
        >
          <InfoBox>
            If you have accommodation spend policies (e.g. a maximum of $220/night in Sydney), you can
            enter them here. These are for reporting and compliance tracking only — the portal will flag
            bookings above the limit but not block them. Leave this blank if you'd prefer to set it up
            with STX later.
          </InfoBox>

          {accomRates.length > 0 && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="grid grid-cols-[1fr_120px_36px] bg-gray-50 px-3 py-2 border-b border-gray-200">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">City</span>
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide text-right">Max/night</span>
                <span />
              </div>
              {accomRates.map(({ city, rate }) => (
                <div key={city} className="grid grid-cols-[1fr_120px_36px] px-3 py-2 items-center border-b border-gray-100 last:border-0">
                  <span className="text-sm text-gray-700">{city}</span>
                  <span className="text-sm text-gray-700 text-right">${rate.toFixed(0)} incl. GST</span>
                  <button type="button" onClick={() => removeAccomRate(city)}
                    className="text-gray-300 hover:text-red-400 text-base text-center">×</button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2 items-end flex-wrap">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">City</label>
              <input className={inp + ' w-44'} value={newAccomCity} onChange={e => setNewAccomCity(e.target.value)}
                placeholder="e.g. Sydney" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Max per night ($, incl. GST)</label>
              <input type="number" min="0" step="5" className={inp + ' w-36'} value={newAccomRate}
                onChange={e => setNewAccomRate(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addAccomRate())}
                placeholder="e.g. 220" />
            </div>
            <button type="button" onClick={addAccomRate}
              disabled={!newAccomCity.trim() || !newAccomRate}
              className="px-3 py-2 bg-gray-700 text-white text-sm rounded-lg disabled:opacity-40 hover:bg-gray-800">
              + Add city
            </button>
          </div>
        </Section>

        {/* 8 — Tax settings */}
        <Section
          id="tax"
          title="8. Tax Settings"
          description="Set the GST rate applicable to your travel bookings."
        >
          <InfoBox>
            Most Australian organisations use 10% GST. If you're operating across New Zealand or are
            GST-exempt, select the appropriate option. This affects how costs are displayed and reported.
          </InfoBox>

          <div>
            <Label>GST rate</Label>
            <div className="space-y-2">
              {[
                { value: 0.10, label: '10% — Australian GST (most common)' },
                { value: 0.15, label: '15% — New Zealand GST' },
                { value: 0,    label: 'No GST / GST-exempt' },
              ].map(opt => (
                <label key={opt.value} className="flex items-center gap-3 cursor-pointer">
                  <input type="radio" name="gstRate" value={opt.value}
                    checked={gstRate === opt.value} onChange={() => setGstRate(opt.value)}
                    className="w-4 h-4 accent-teal-600" />
                  <span className="text-sm text-gray-700">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>
        </Section>

        {/* 9 — Notes */}
        <Section
          id="notes"
          title="9. Questions & Notes"
          badge="optional"
          description="Use this space for any questions, special requirements, or anything you'd like to discuss with the STX team."
        >
          <textarea
            className={inp + ' min-h-[100px] resize-y'}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="e.g. We have specific NDIS plan management requirements, some staff require accessible accommodation only, we'd like to discuss our approval hierarchy..."
          />
        </Section>

        {/* Submit */}
        {error && <p className="text-sm text-red-600 text-center">{error}</p>}

        <div className="bg-white border border-gray-200 rounded-2xl p-6 text-center space-y-3">
          <p className="text-sm text-gray-500">
            When you're ready, submit your preferences below. You can always leave sections
            blank — STX will follow up to fill in any gaps.
          </p>
          <button type="submit" disabled={saving}
            className="px-8 py-3 bg-teal-600 text-white font-medium rounded-xl hover:bg-teal-700 disabled:opacity-50 text-sm">
            {saving ? 'Submitting…' : 'Submit my preferences'}
          </button>
        </div>

      </form>
    </Shell>
  );
}

// ── Page shell ────────────────────────────────────────────────────────────────

function Shell({ clientName, children }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-teal-700 text-white px-6 py-5 shadow-sm">
        <div className="max-w-2xl mx-auto">
          <p className="text-xs font-semibold uppercase tracking-widest text-teal-200 mb-0.5">STX Corporate</p>
          <h1 className="text-xl font-bold">
            {clientName ? `${clientName} — Portal Setup` : 'Portal Onboarding'}
          </h1>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-8">
        {children}
      </main>
      <footer className="max-w-2xl mx-auto px-4 pb-8 text-center">
        <p className="text-xs text-gray-400">
          STX Corporate Travel Management · Questions? Contact <a href="mailto:enquiries@supportedtravelx.com.au" className="underline">enquiries@supportedtravelx.com.au</a>
        </p>
      </footer>
    </div>
  );
}
