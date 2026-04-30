import React, { useState, useEffect } from 'react';
import { Mail, Phone, MessageSquare, Send, CheckCircle } from 'lucide-react';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';

const STX_PHONE     = '1300 200 789';
const STX_SMS       = '+61 482 071 108';
const STX_SMS_HREF  = 'sms:+61482071108';
const DEFAULT_EMAIL = 'enquiries@supportedtravelx.com.au';

export default function Contact() {
  useEffect(() => {
    document.title = 'Contact — STX Connect';
  }, []);

  const { clientConfig, isSTX, activeClientConfig, clientId } = useTenant();
  const { userProfile, currentUser } = useAuth();
  const effectiveConfig = isSTX ? activeClientConfig : clientConfig;
  const contactEmail    = effectiveConfig?.contact?.email || DEFAULT_EMAIL;

  const [type,        setType]        = useState('feedback');
  const [subject,     setSubject]     = useState('');
  const [description, setDescription] = useState('');
  const [submitting,  setSubmitting]  = useState(false);
  const [submitted,   setSubmitted]   = useState(false);
  const [error,       setError]       = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!subject.trim() || !description.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const now = new Date().toISOString();
      const userName = [userProfile?.firstName, userProfile?.lastName].filter(Boolean).join(' ') || userProfile?.email || currentUser?.email || '';
      const feedbackRef = await addDoc(collection(db, 'portalFeedback'), {
        type,
        subject:     subject.trim(),
        description: description.trim(),
        clientId:    clientId || null,
        userId:      currentUser?.uid || null,
        userName,
        userEmail:   currentUser?.email || '',
        status:      'open',
        createdAt:   now,
      });
      // Queue notification email to STX admins
      await addDoc(collection(db, 'emailQueue'), {
        type:          'portal_feedback',
        status:        'pending',
        scheduledFor:  now,
        createdAt:     now,
        feedbackType:  type,
        subject:       subject.trim(),
        description:   description.trim(),
        userName,
        userEmail:     currentUser?.email || '',
        clientId:      clientId || null,
        feedbackId:    feedbackRef.id,
      });
      setSubmitted(true);
      setSubject('');
      setDescription('');
    } catch (err) {
      console.error('Feedback submit error', err);
      setError('Something went wrong. Please try again or contact us directly.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Contact STX</h1>
      <div className="grid gap-6 max-w-2xl">

        {/* Contact details */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-gray-600 text-sm mb-5">
            For any travel queries or support, contact your STX travel coordinator.
          </p>
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-sm">
              <Mail size={16} className="text-blue-500 shrink-0" />
              <a href={`mailto:${contactEmail}`} className="text-blue-600 hover:underline break-all">
                {contactEmail}
              </a>
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-700">
              <Phone size={16} className="text-blue-500 shrink-0" />
              <a href={`tel:${STX_PHONE.replace(/\s/g, '')}`} className="hover:text-blue-600">
                {STX_PHONE}
              </a>
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-700">
              <MessageSquare size={16} className="text-blue-500 shrink-0" />
              <div>
                <a href={STX_SMS_HREF} className="hover:text-blue-600">{STX_SMS}</a>
                <p className="text-xs text-gray-600 mt-0.5">Text message (SMS)</p>
              </div>
            </div>
          </div>
        </div>

        {/* Feedback / fault form */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-1">Send feedback or report a fault</h2>
          <p className="text-sm text-gray-700 mb-5">
            Let us know how we can improve the portal, or flag a technical issue and our team will follow up.
          </p>

          {submitted ? (
            <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
              <CheckCircle size={18} className="text-green-600 shrink-0" />
              <div>
                <p className="text-sm font-medium text-green-800">Thanks — your message has been sent.</p>
                <p className="text-xs text-green-600 mt-0.5">Our team will review it shortly.</p>
              </div>
              <button
                onClick={() => setSubmitted(false)}
                className="ml-auto text-xs text-green-600 hover:text-green-800 underline"
              >
                Send another
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Type toggle */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Type</label>
                <div className="flex gap-2">
                  {[['feedback', 'Feedback'], ['fault', 'Report a fault']].map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setType(val)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        type === val
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Subject */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1.5">
                  Subject
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  placeholder={type === 'fault' ? 'e.g. Filter not working on trip list' : 'e.g. Suggestion for the dashboard'}
                  required
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-500"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1.5">
                  {type === 'fault' ? 'What happened? (steps to reproduce if known)' : 'Details'}
                </label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={4}
                  required
                  placeholder={type === 'fault' ? 'Describe what you were doing and what went wrong…' : 'Share your idea or feedback…'}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-500 resize-none"
                />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <button
                type="submit"
                disabled={submitting || !subject.trim() || !description.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Send size={14} />
                {submitting ? 'Sending…' : 'Send'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
