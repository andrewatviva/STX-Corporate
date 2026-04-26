import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../../firebase';
import { Plus, Edit2, UserCheck, UserX, RefreshCw, Mail } from 'lucide-react';
import Modal from '../shared/Modal';
import Toggle from '../shared/Toggle';
import { ROLE_LABELS, CLIENT_ROLES, STX_ROLES } from '../../utils/permissions';

const ALL_ROLES = [...STX_ROLES, ...CLIENT_ROLES];
const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

function ClientSelect({ value, onChange, clients }) {
  return (
    <select className={inp} value={value} onChange={e => onChange(e.target.value)}>
      <option value="">Select client…</option>
      {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
  );
}

// ── Create user form ──────────────────────────────────────────────────────────
function CreateUserForm({ clients, onCreated, onCancel }) {
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', password: '',
    role: 'client_ops', clientId: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const needsClient = CLIENT_ROLES.includes(form.role);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.firstName.trim()) return setError('First name is required.');
    if (!form.email || !form.password)  return setError('Email and password are required.');
    if (needsClient && !form.clientId)  return setError('Please select a client for this role.');
    setSaving(true);
    try {
      const fns = getFunctions();
      await httpsCallable(fns, 'createClientUser')({
        ...form,
        clientId: needsClient ? form.clientId : null,
      });
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name *">
          <input className={inp} value={form.firstName} onChange={e => set('firstName', e.target.value)} placeholder="Jane" />
        </Field>
        <Field label="Last name">
          <input className={inp} value={form.lastName} onChange={e => set('lastName', e.target.value)} placeholder="Smith" />
        </Field>
      </div>
      <Field label="Email *">
        <input type="email" className={inp} value={form.email} onChange={e => set('email', e.target.value)} placeholder="jane@client.com" />
      </Field>
      <Field label="Temporary password *">
        <input type="password" className={inp} value={form.password} onChange={e => set('password', e.target.value)} placeholder="Min 6 characters" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Role *">
          <select className={inp} value={form.role} onChange={e => set('role', e.target.value)}>
            {ALL_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
        </Field>
        {needsClient && (
          <Field label="Client *">
            <ClientSelect value={form.clientId} onChange={v => set('clientId', v)} clients={clients} />
          </Field>
        )}
      </div>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <div className="flex justify-end gap-3 pt-1">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
        <button type="submit" disabled={saving} className="px-5 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'Creating…' : 'Create user'}
        </button>
      </div>
    </form>
  );
}

// ── Edit user form ────────────────────────────────────────────────────────────
function EditUserForm({ user, clients, onSaved, onCancel }) {
  const [form, setForm] = useState({
    firstName: user.firstName || '',
    lastName:  user.lastName  || '',
    role:      user.role      || 'client_ops',
    clientId:  user.clientId  || '',
    active:    user.active !== false,
  });
  const [saving, setSaving]   = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetLink, setResetLink] = useState('');
  const [error, setError]     = useState('');

  const needsClient = CLIENT_ROLES.includes(form.role);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.firstName.trim()) return setError('First name is required.');
    if (needsClient && !form.clientId) return setError('Please select a client for this role.');
    setSaving(true);
    try {
      const fns = getFunctions();
      await httpsCallable(fns, 'updateClientUser')({
        targetUid: user.id,
        updates: {
          firstName: form.firstName,
          lastName:  form.lastName,
          role:      form.role,
          clientId:  needsClient ? form.clientId : null,
          active:    form.active,
        },
      });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordReset = async () => {
    setResetting(true);
    setResetLink('');
    try {
      const fns = getFunctions();
      const result = await httpsCallable(fns, 'sendPasswordReset')({ email: user.email });
      setResetLink(result.data.link);
    } catch (err) {
      setError(err.message);
    } finally {
      setResetting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name *">
          <input className={inp} value={form.firstName} onChange={e => set('firstName', e.target.value)} />
        </Field>
        <Field label="Last name">
          <input className={inp} value={form.lastName} onChange={e => set('lastName', e.target.value)} />
        </Field>
      </div>
      <Field label="Email">
        <input className={`${inp} bg-gray-50`} value={user.email} readOnly />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Role">
          <select className={inp} value={form.role} onChange={e => set('role', e.target.value)}>
            {ALL_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
        </Field>
        {needsClient && (
          <Field label="Client">
            <ClientSelect value={form.clientId} onChange={v => set('clientId', v)} clients={clients} />
          </Field>
        )}
      </div>
      <Toggle checked={form.active} onChange={v => set('active', v)} label="Active account" description="Inactive users cannot log in" />

      {/* Password reset section */}
      <div className="border border-gray-200 rounded-lg p-4">
        <p className="text-sm font-medium text-gray-700 mb-2">Password reset</p>
        {resetLink ? (
          <div className="space-y-2">
            <p className="text-xs text-green-700 bg-green-50 rounded p-2">
              Reset link generated. Copy and share with the user — it expires in 1 hour.
            </p>
            <div className="flex gap-2">
              <input readOnly value={resetLink} className={`${inp} text-xs font-mono`} />
              <button type="button" onClick={() => navigator.clipboard.writeText(resetLink)}
                className="px-3 py-1.5 bg-gray-100 text-gray-700 text-xs rounded-lg hover:bg-gray-200 whitespace-nowrap">
                Copy link
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={handlePasswordReset} disabled={resetting}
            className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50">
            <Mail size={14} />
            {resetting ? 'Generating…' : 'Generate password reset link'}
          </button>
        )}
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}
      <div className="flex justify-end gap-3 pt-1">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
        <button type="submit" disabled={saving} className="px-5 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}

// ── Main UserManager component ────────────────────────────────────────────────
export default function UserManager() {
  const [users, setUsers]       = useState([]);
  const [clients, setClients]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing]   = useState(null);

  useEffect(() => {
    const unsubUsers = onSnapshot(
      query(collection(db, 'users'), orderBy('lastName')),
      snap => { setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false); }
    );
    const unsubClients = onSnapshot(collection(db, 'clients'), snap => {
      setClients(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => { unsubUsers(); unsubClients(); };
  }, []);

  const clientName = (cid) => clients.find(c => c.id === cid)?.name ?? cid ?? '—';

  if (loading) return <p className="text-sm text-gray-400">Loading users…</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">{users.length} user{users.length !== 1 ? 's' : ''}</p>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">
          <Plus size={15} /> Add user
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {users.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">No users yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Role</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Client</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {users.map((user, i) => (
                <tr key={user.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-4 py-3 font-medium text-gray-800">
                    {[user.firstName, user.lastName].filter(Boolean).join(' ') || user.displayName || '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{user.email}</td>
                  <td className="px-4 py-3 text-gray-600">{ROLE_LABELS[user.role] ?? user.role}</td>
                  <td className="px-4 py-3 text-gray-500">{clientName(user.clientId)}</td>
                  <td className="px-4 py-3">
                    {user.active !== false
                      ? <span className="flex items-center gap-1 text-green-600 text-xs"><UserCheck size={13} /> Active</span>
                      : <span className="flex items-center gap-1 text-red-500 text-xs"><UserX size={13} /> Inactive</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => setEditing(user)}
                      className="text-blue-600 hover:text-blue-800 p-1">
                      <Edit2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && (
        <Modal title="Add new user" onClose={() => setShowCreate(false)}>
          <CreateUserForm clients={clients} onCreated={() => setShowCreate(false)} onCancel={() => setShowCreate(false)} />
        </Modal>
      )}

      {editing && (
        <Modal title={`Edit — ${[editing.firstName, editing.lastName].filter(Boolean).join(' ') || editing.email}`} onClose={() => setEditing(null)}>
          <EditUserForm user={editing} clients={clients} onSaved={() => setEditing(null)} onCancel={() => setEditing(null)} />
        </Modal>
      )}
    </div>
  );
}
