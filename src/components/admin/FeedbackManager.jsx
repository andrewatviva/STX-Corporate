import React, { useState, useEffect } from 'react';
import {
  collection, query, orderBy, onSnapshot,
  doc, updateDoc, arrayUnion, addDoc,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import {
  MessageSquare, AlertTriangle, ChevronLeft, ChevronRight,
  Send, User, Calendar, Building2, Filter,
} from 'lucide-react';

const STATUS_CONFIG = {
  open:        { label: 'Open',        className: 'bg-yellow-100 text-yellow-800' },
  in_progress: { label: 'In Progress', className: 'bg-blue-100 text-blue-800' },
  resolved:    { label: 'Resolved',    className: 'bg-green-100 text-green-800' },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.open;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

function TypeBadge({ type }) {
  return type === 'fault' ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
      <AlertTriangle size={11} /> Fault
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
      <MessageSquare size={11} /> Feedback
    </span>
  );
}

export default function FeedbackManager({ initialId }) {
  const { userProfile } = useAuth();
  const [items, setItems]             = useState([]);
  const [loading, setLoading]         = useState(true);
  const [selected, setSelected]       = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter]   = useState('all');
  const [responseText, setResponseText] = useState('');
  const [newStatus, setNewStatus]     = useState('open');
  const [sending, setSending]         = useState(false);
  const [sendError, setSendError]     = useState('');
  const [initialHandled, setInitialHandled] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'portalFeedback'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setItems(docs);
      setLoading(false);
    });
    return unsub;
  }, []);

  // Auto-open initialId from URL once items load
  useEffect(() => {
    if (!initialHandled && initialId && items.length > 0) {
      const found = items.find(d => d.id === initialId);
      if (found) {
        setSelected(found);
        setNewStatus(found.status || 'open');
        setInitialHandled(true);
      }
    }
  }, [initialId, items, initialHandled]);

  // Keep selected in sync with live Firestore updates
  useEffect(() => {
    if (selected) {
      const updated = items.find(i => i.id === selected.id);
      if (updated) setSelected(updated);
    }
  }, [items]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = items.filter(item => {
    if (statusFilter !== 'all' && (item.status || 'open') !== statusFilter) return false;
    if (typeFilter !== 'all' && item.type !== typeFilter) return false;
    return true;
  });

  const openItem = (item) => {
    setSelected(item);
    setNewStatus(item.status || 'open');
    setResponseText('');
    setSendError('');
  };

  const handleSendResponse = async () => {
    const hasResponse = responseText.trim().length > 0;
    const statusChanged = newStatus !== (selected.status || 'open');
    if (!hasResponse && !statusChanged) return;

    setSending(true);
    setSendError('');
    try {
      const now = new Date().toISOString();
      const respondedByName = [userProfile?.firstName, userProfile?.lastName]
        .filter(Boolean).join(' ') || userProfile?.email || 'STX';

      const updates = { updatedAt: now, status: newStatus };
      if (newStatus === 'resolved') updates.resolvedAt = now;
      if (hasResponse) {
        updates.responses = arrayUnion({ text: responseText.trim(), respondedByName, respondedAt: now });
      }

      await updateDoc(doc(db, 'portalFeedback', selected.id), updates);

      if (hasResponse && selected.userId) {
        await addDoc(collection(db, 'emailQueue'), {
          type:            'feedback_response',
          status:          'pending',
          scheduledFor:    now,
          createdAt:       now,
          recipientId:     selected.userId,
          feedbackType:    selected.type,
          subject:         selected.subject,
          responseText:    responseText.trim(),
          respondedByName,
        });
      }

      setResponseText('');
    } catch (err) {
      console.error('Error sending response:', err);
      setSendError('Something went wrong. Please try again.');
    } finally {
      setSending(false);
    }
  };

  if (loading) return <p className="text-sm text-gray-700 py-4">Loading…</p>;

  // ── Detail view ────────────────────────────────────────────────────────────
  if (selected) {
    const responses = selected.responses || [];
    const currentStatus = selected.status || 'open';

    return (
      <div>
        <button
          onClick={() => setSelected(null)}
          className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 mb-5"
        >
          <ChevronLeft size={15} /> Back to list
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-4">
            {/* Original submission */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center gap-2 mb-3">
                <TypeBadge type={selected.type} />
                <StatusBadge status={currentStatus} />
              </div>
              <h2 className="text-base font-semibold text-gray-900 mb-3">{selected.subject}</h2>
              <div className="flex flex-wrap gap-4 text-xs text-gray-700 mb-4">
                <span className="flex items-center gap-1">
                  <User size={11} /> {selected.userName || selected.userEmail || 'Unknown'}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar size={11} /> {new Date(selected.createdAt).toLocaleString('en-AU')}
                </span>
                {selected.clientId && (
                  <span className="flex items-center gap-1">
                    <Building2 size={11} /> {selected.clientId}
                  </span>
                )}
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{selected.description}</p>
              </div>
            </div>

            {/* Response thread */}
            {responses.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">
                  Responses ({responses.length})
                </h3>
                <div className="space-y-4">
                  {responses.map((r, i) => (
                    <div key={i} className="border-l-2 border-blue-200 pl-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-blue-700">{r.respondedByName}</span>
                        <span className="text-xs text-gray-600">
                          {new Date(r.respondedAt).toLocaleString('en-AU')}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{r.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Reply box */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Respond</h3>
              <textarea
                value={responseText}
                onChange={e => setResponseText(e.target.value)}
                rows={4}
                placeholder="Type your response to the user…"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none mb-3"
              />
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-700 font-medium">Status:</label>
                  <select
                    value={newStatus}
                    onChange={e => setNewStatus(e.target.value)}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="open">Open</option>
                    <option value="in_progress">In Progress</option>
                    <option value="resolved">Resolved</option>
                  </select>
                </div>
                <button
                  onClick={handleSendResponse}
                  disabled={sending || (!responseText.trim() && newStatus === currentStatus)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Send size={13} />
                  {sending ? 'Saving…' : responseText.trim() ? 'Send response' : 'Update status'}
                </button>
              </div>
              {responseText.trim() && selected.userId && (
                <p className="text-xs text-gray-600 mt-2">
                  An email will be sent to {selected.userEmail} notifying them of your response.
                </p>
              )}
              {responseText.trim() && !selected.userId && (
                <p className="text-xs text-amber-500 mt-2">
                  No user account linked — response will be saved but no email will be sent.
                </p>
              )}
              {sendError && <p className="text-xs text-red-600 mt-2">{sendError}</p>}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-3">Details</h3>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-xs text-gray-600 mb-0.5">From</dt>
                  <dd className="font-medium text-gray-800">{selected.userName || '—'}</dd>
                  <dd className="text-gray-700 text-xs break-all">{selected.userEmail || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-600 mb-0.5">Client</dt>
                  <dd className="font-medium text-gray-800">{selected.clientId || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-600 mb-0.5">Submitted</dt>
                  <dd className="font-medium text-gray-800">
                    {new Date(selected.createdAt).toLocaleString('en-AU')}
                  </dd>
                </div>
                {selected.updatedAt && (
                  <div>
                    <dt className="text-xs text-gray-600 mb-0.5">Last updated</dt>
                    <dd className="font-medium text-gray-800">
                      {new Date(selected.updatedAt).toLocaleString('en-AU')}
                    </dd>
                  </div>
                )}
                {selected.resolvedAt && (
                  <div>
                    <dt className="text-xs text-gray-600 mb-0.5">Resolved</dt>
                    <dd className="font-medium text-gray-800">
                      {new Date(selected.resolvedAt).toLocaleString('en-AU')}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── List view ──────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Summary counts */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {Object.entries(STATUS_CONFIG).map(([status, cfg]) => {
          const count = items.filter(i => (i.status || 'open') === status).length;
          return (
            <button
              key={status}
              onClick={() => setStatusFilter(statusFilter === status ? 'all' : status)}
              className={`bg-white rounded-xl border p-4 text-left transition-colors ${
                statusFilter === status ? 'border-blue-400 ring-1 ring-blue-300' : 'border-gray-200 hover:border-blue-200'
              }`}
            >
              <p className="text-2xl font-bold text-gray-900">{count}</p>
              <p className="text-xs text-gray-700">{cfg.label}</p>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Filter size={13} className="text-gray-600" />
          <span className="text-xs text-gray-700 font-medium">Status:</span>
          {['all', 'open', 'in_progress', 'resolved'].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${
                statusFilter === s
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
            >
              {s === 'all' ? 'All' : s === 'in_progress' ? 'In Progress' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-700 font-medium">Type:</span>
          {['all', 'feedback', 'fault'].map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${
                typeFilter === t
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <MessageSquare size={32} className="text-gray-500 mx-auto mb-2" />
          <p className="text-sm text-gray-700">No submissions match the current filters.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(item => (
            <button
              key={item.id}
              onClick={() => openItem(item)}
              className="w-full text-left bg-white rounded-xl border border-gray-200 p-4 hover:border-blue-200 hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <TypeBadge type={item.type} />
                    <StatusBadge status={item.status || 'open'} />
                    {(item.responses || []).length > 0 && (
                      <span className="text-xs text-gray-600">
                        {item.responses.length} response{item.responses.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium text-gray-900 truncate">{item.subject}</p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    {item.userName || item.userEmail || 'Unknown'} ·{' '}
                    {item.clientId || 'No client'} ·{' '}
                    {new Date(item.createdAt).toLocaleDateString('en-AU')}
                  </p>
                </div>
                <ChevronRight size={16} className="text-gray-500 shrink-0 mt-1" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
