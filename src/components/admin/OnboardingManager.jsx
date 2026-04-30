import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, getDocs, doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../../firebase';
import Modal from '../shared/Modal';

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
  const [clients, setClients]         = useState([]);
  const [clientId, setClientId]       = useState('');
  const [applying, setApplying]       = useState(false);
  const [applyError, setApplyError]   = useState('');
  const [applyDone, setApplyDone]     = useState(false);

  useEffect(() => {
    getDocs(collection(db, 'clients')).then(snap => {
      setClients(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => c.active !== false).sort((a, b) => a.name.localeCompare(b.name)));
    }).catch(() => {});
  }, []);

  const r = form.responses || {};

  const handleApply = async () => {
    if (!clientId) return setApplyError('Please select a client to apply the settings to.');
    setApplyError('');
    setApplying(true);
    try {
      // Build partial config from responses (only populate sections that were answered)
      const configPatch = {};

      // Branding — only include if at least the portal title was set
      const hasBranding = r.portalTitle || r.logo || (r.primaryColor && r.primaryColor !== '#1e40af') || (r.secondaryColor && r.secondaryColor !== '#93c5fd');
      if (hasBranding) {
        configPatch.branding = {};
        if (r.portalTitle) configPatch.branding.portalTitle = r.portalTitle;
        if (r.logo)        configPatch.branding.logo        = r.logo;
        if (r.primaryColor)   configPatch.branding.primaryColor   = r.primaryColor;
        if (r.secondaryColor) configPatch.branding.secondaryColor = r.secondaryColor;
      }

      // Dropdowns
      if (r.costCentres?.length) configPatch['dropdowns.costCentres'] = r.costCentres;
      if (r.tripTypes?.length)   configPatch['dropdowns.tripTypes']   = r.tripTypes;

      // Workflow
      if (r.approvalByTripType && Object.keys(r.approvalByTripType).length) {
        configPatch['workflow.approvalByTripType'] = r.approvalByTripType;
        // derive requiresApproval from whether any type requires it
        const anyRequired = Object.values(r.approvalByTripType).some(Boolean);
        configPatch['workflow.requiresApproval'] = anyRequired;
      }
      if (r.emailNotifications !== undefined) {
        configPatch['workflow.emailNotifications'] = r.emailNotifications;
      }

      // Features
      if (r.features) {
        for (const [key, val] of Object.entries(r.features)) {
          configPatch[`features.${key}`] = val;
        }
      }

      // GST rate
      if (r.gstRate !== undefined) {
        configPatch['fees.gstRate'] = r.gstRate;
      }

      // Write settings patch
      await setDoc(
        doc(db, 'clients', clientId, 'config', 'settings'),
        { ...configPatch, updatedAt: serverTimestamp() },
        { merge: true }
      );

      // Accommodation rates (separate doc)
      if (r.accomRates && Object.keys(r.accomRates).length) {
        await setDoc(
          doc(db, 'clients', clientId, 'config', 'travelPolicy'),
          { rates: r.accomRates },
          { merge: true }
        );
      }

      // Mark onboarding as applied
      await updateDoc(doc(db, 'onboarding', form.token), {
        status: 'applied',
        appliedAt: serverTimestamp(),
        appliedToClientId: clientId,
      });

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
          <p className="text-sm font-medium text-gray-800">Preferences applied to client config</p>
          <p className="text-xs text-gray-500">
            You can now review and finalise the full settings in the Clients tab.
            Remember to set management fees, contact emails, and any hotel booking configuration.
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
            <Row key={type} label={type} value={renderValue(required ? 'Approval required' : 'No approval')} />
          ))}
          <Row label="Email notifications" value={renderValue(r.emailNotifications)} />
        </ResponseGroup>

        <ResponseGroup title="Features">
          {r.features && Object.entries(r.features).map(([key, val]) => (
            <Row key={key} label={key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())} value={renderValue(val)} />
          ))}
        </ResponseGroup>

        <ResponseGroup title="Tax & Policy">
          <Row label="GST rate" value={r.gstRate === 0.10 ? '10%' : r.gstRate === 0.15 ? '15%' : r.gstRate === 0 ? 'None' : r.gstRate} />
          {r.accomRates && Object.keys(r.accomRates).length > 0 && (
            <Row label="Accom. rates" value={
              <div className="space-y-0.5">
                {Object.entries(r.accomRates).map(([city, rate]) => (
                  <div key={city} className="text-xs">{city}: ${rate}/night</div>
                ))}
              </div>
            } />
          )}
        </ResponseGroup>

        {r.notes && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <p className="text-xs font-semibold text-yellow-800 mb-1">Client notes / questions</p>
            <p className="text-sm text-yellow-900 whitespace-pre-wrap leading-relaxed">{r.notes}</p>
          </div>
        )}

        {/* Apply section */}
        {form.status !== 'applied' && (
          <div className="border-t border-gray-200 pt-4 space-y-3">
            <p className="text-sm font-medium text-gray-700">Apply to client configuration</p>
            <p className="text-xs text-gray-500">
              Select the client account to populate with these preferences. Only responses the client
              filled in will be applied — blank fields are left as-is. Management fees, contact emails,
              and hotel booking settings are <strong>not</strong> touched and must be configured separately.
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
            {applyError && <p className="text-xs text-red-600">{applyError}</p>}
            <div className="flex justify-end gap-3">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Close</button>
              <button type="button" onClick={handleApply} disabled={applying || !clientId}
                className="px-5 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 disabled:opacity-50">
                {applying ? 'Applying…' : 'Apply to client'}
              </button>
            </div>
          </div>
        )}

        {form.status === 'applied' && (
          <div className="border-t border-gray-200 pt-4">
            <p className="text-sm text-green-600 font-medium">
              Applied{form.appliedToClientId ? ` to client: ${form.appliedToClientId}` : ''} on {fmt(form.appliedAt)}
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
