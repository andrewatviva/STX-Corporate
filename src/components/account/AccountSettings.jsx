import React, { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { sendPasswordResetEmail } from 'firebase/auth';
import { X, CheckCircle2, Mail, Lock } from 'lucide-react';
import { auth, db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';

const NOTIFICATION_TYPES = [
  {
    key:       'trip_approved',
    label:     'Trip approved',
    desc:      'When your travel request is approved.',
    mandatory: true,
  },
  {
    key:       'trip_declined',
    label:     'Trip not approved',
    desc:      'When your travel request is declined, with the reason given.',
    mandatory: true,
  },
  {
    key:   'trip_submitted',
    label: 'Approval requests',
    desc:  'When a trip is submitted and is waiting for your approval.',
    approverOnly: true,
  },
  {
    key:   'trip_booked',
    label: 'Booking confirmation',
    desc:  'When your trip is fully booked and confirmed.',
  },
  {
    key:   'trip_itinerary_added',
    label: 'Digital itinerary ready',
    desc:  'When your digital travel itinerary is added to your trip.',
  },
  {
    key:   'trip_pre_departure',
    label: 'Pre-departure reminder',
    desc:  'Sent 3 days before your trip starts with itinerary details.',
  },
  {
    key:   'trip_rating_request',
    label: 'Post-trip rating request',
    desc:  'Sent 2 days after your trip ends — rate your providers.',
  },
];

function MiniToggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent
        transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500
        ${checked ? 'bg-teal-600' : 'bg-gray-200'}
        ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow
          transition-transform duration-200 ${checked ? 'translate-x-4' : 'translate-x-0'}`}
      />
    </button>
  );
}

export default function AccountSettings({ onClose }) {
  const { userProfile, currentUser } = useAuth();
  const [resetSent,  setResetSent]  = useState(false);
  const [savingKey,  setSavingKey]  = useState(null);

  const prefs = userProfile?.emailPreferences || {};
  const role  = userProfile?.role || '';
  const isApprover = ['stx_admin', 'stx_ops', 'client_approver'].includes(role);

  const visibleTypes = NOTIFICATION_TYPES.filter(t => !t.approverOnly || isApprover);

  const getValue = (key) => prefs[key] !== false;

  const handleToggle = async (key, value) => {
    setSavingKey(key);
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        [`emailPreferences.${key}`]: value,
      });
    } finally {
      setSavingKey(null);
    }
  };

  const handlePasswordReset = async () => {
    if (!currentUser?.email) return;
    try {
      await sendPasswordResetEmail(auth, currentUser.email);
      setResetSent(true);
    } catch {}
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-base font-semibold text-gray-900">Account settings</h2>
          <button
            onClick={onClose}
            aria-label="Close account settings"
            className="p-1 text-gray-600 hover:text-gray-700 rounded-lg transition-colors"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-5 space-y-6">

          {/* ── Security ── */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Lock size={13} aria-hidden="true" className="text-gray-600" />
              <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Security</h3>
            </div>
            <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
              <p className="text-sm text-gray-700 mb-2">
                Send a password reset link to{' '}
                <span className="font-medium">{currentUser?.email}</span>
              </p>
              {resetSent ? (
                <span role="status" aria-live="polite" className="flex items-center gap-1.5 text-sm text-green-600">
                  <CheckCircle2 size={14} aria-hidden="true" /> Reset link sent — check your inbox
                </span>
              ) : (
                <button
                  onClick={handlePasswordReset}
                  className="text-sm text-teal-600 font-medium hover:underline"
                >
                  Send password reset email
                </button>
              )}
            </div>
          </section>

          {/* ── Email notifications ── */}
          <section>
            <div className="flex items-center gap-2 mb-1">
              <Mail size={13} aria-hidden="true" className="text-gray-600" />
              <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Email notifications</h3>
            </div>
            <p className="text-xs text-gray-600 mb-4">
              Sent to <span className="font-medium text-gray-700">{currentUser?.email}</span>
            </p>

            <div className="space-y-4">
              {visibleTypes.map(t => (
                <div key={t.key} className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium text-gray-800">{t.label}</p>
                      {t.mandatory && (
                        <span className="text-xs text-gray-600">· required</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{t.desc}</p>
                  </div>
                  <div className="shrink-0 mt-0.5">
                    <MiniToggle
                      checked={t.mandatory ? true : getValue(t.key)}
                      onChange={v => handleToggle(t.key, v)}
                      disabled={t.mandatory || savingKey === t.key}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 shrink-0 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
