import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../firebase';
import { Plus, Edit2, UserCheck, UserX, Mail, Trash2, Users } from 'lucide-react';
import Modal from '../components/shared/Modal';
import Toggle from '../components/shared/Toggle';
import { ROLE_LABELS, CLIENT_ROLES } from '../utils/permissions';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';

const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

// ── Create member form ────────────────────────────────────────────────────────
function CreateMemberForm({ clientId, onCreated, onCancel }) {
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', password: '',
    role: 'client_traveller',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.firstName.trim()) return setError('First name is required.');
    if (!form.email.trim())     return setError('Email is required.');
    if (!form.password)         return setError('A temporary password is required.');
    setSaving(true);
    try {
      await httpsCallable(getFunctions(), 'createClientUser')({
        ...form,
        clientId,
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
        <input type="email" className={inp} value={form.email} onChange={e => set('email', e.target.value)} placeholder="jane@company.com" />
      </Field>
      <Field label="Temporary password *">
        <input type="password" className={inp} value={form.password} onChange={e => set('password', e.target.value)} placeholder="Min 6 characters" />
      </Field>
      <Field label="Role *">
        <select className={inp} value={form.role} onChange={e => set('role', e.target.value)}>
          {CLIENT_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </select>
      </Field>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <div className="flex justify-end gap-3 pt-1">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
        <button type="submit" disabled={saving} className="px-5 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'Creating…' : 'Add member'}
        </button>
      </div>
    </form>
  );
}

// ── Edit member form ──────────────────────────────────────────────────────────
function EditMemberForm({ user, canDelete, onSaved, onDeleted, onCancel }) {
  const [form, setForm] = useState({
    firstName: user.firstName || '',
    lastName:  user.lastName  || '',
    role:      user.role      || 'client_traveller',
    active:    user.active !== false,
  });
  const [saving, setSaving]       = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetLink, setResetLink] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError]         = useState('');

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.firstName.trim()) return setError('First name is required.');
    setSaving(true);
    try {
      await httpsCallable(getFunctions(), 'updateClientUser')({
        targetUid: user.id,
        updates: {
          firstName: form.firstName,
          lastName:  form.lastName,
          role:      form.role,
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
      const result = await httpsCallable(getFunctions(), 'sendPasswordReset')({ email: user.email });
      setResetLink(result.data.link);
    } catch (err) {
      setError(err.message);
    } finally {
      setResetting(false);
    }
  };

  const handleDelete = async () => {
    try {
      await httpsCallable(getFunctions(), 'deleteClientUser')({ targetUid: user.id });
      onDeleted();
    } catch (err) {
      setError(err.message);
    }
  };

  if (confirmDelete) {
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-700">Permanently delete <strong>{name}</strong> ({user.email})?</p>
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
          This cannot be undone. All portal access will be revoked immediately.
        </p>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <div className="flex justify-end gap-3">
          <button onClick={() => setConfirmDelete(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
          <button onClick={handleDelete} className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700">
            Yes, delete permanently
          </button>
        </div>
      </div>
    );
  }

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
      <Field label="Role">
        <select className={inp} value={form.role} onChange={e => set('role', e.target.value)}>
          {CLIENT_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </select>
      </Field>
      <Toggle checked={form.active} onChange={v => set('active', v)} label="Active account" description="Inactive users cannot log in" />

      {/* Password reset */}
      <div className="border border-gray-200 rounded-lg p-4">
        <p className="text-sm font-medium text-gray-700 mb-2">Password reset</p>
        {resetLink ? (
          <div className="space-y-2">
            <p className="text-xs text-green-700 bg-green-50 rounded p-2">
              Reset link generated. Copy and share — expires in 1 hour.
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
      <div className="flex items-center justify-between pt-1">
        {canDelete ? (
          <button type="button" onClick={() => setConfirmDelete(true)}
            className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700">
            <Trash2 size={13} /> Remove member
          </button>
        ) : <span />}
        <div className="flex gap-3">
          <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
          <button type="submit" disabled={saving} className="px-5 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </form>
  );
}

// ── Role badge ────────────────────────────────────────────────────────────────
const ROLE_COLORS = {
  client_ops:       'bg-blue-100 text-blue-700',
  client_approver:  'bg-purple-100 text-purple-700',
  client_traveller: 'bg-gray-100 text-gray-600',
};

function RoleBadge({ role }) {
  const cls = ROLE_COLORS[role] || 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {ROLE_LABELS[role] ?? role}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Team() {
  const { userProfile } = useAuth();
  const { isSTX, clientId, activeClientId, clientsList } = useTenant();

  const role = userProfile?.role;
  const isAdmin = role === 'stx_admin';

  // Effective client: STX uses activeClientId, client users use own clientId
  const effectiveClientId = isSTX ? activeClientId : clientId;
  const activeClientName  = clientsList?.find(c => c.id === activeClientId)?.name;

  const [members, setMembers]   = useState([]);
  const [loading, setLoading]   = useState(false);
  const [showCreate, setCreate] = useState(false);
  const [editing, setEditing]   = useState(null);

  useEffect(() => {
    if (!effectiveClientId) { setMembers([]); setLoading(false); return; }
    setLoading(true);
    const q = query(collection(db, 'users'), where('clientId', '==', effectiveClientId));
    const unsub = onSnapshot(q, snap => {
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const an = [a.firstName, a.lastName].filter(Boolean).join(' ') || a.email;
          const bn = [b.firstName, b.lastName].filter(Boolean).join(' ') || b.email;
          return an.localeCompare(bn);
        });
      setMembers(list);
      setLoading(false);
    });
    return unsub;
  }, [effectiveClientId]);

  const closeEdit = () => setEditing(null);

  // STX users who haven't selected a client yet
  if (isSTX && !activeClientId) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-800 mb-6">Team</h1>
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400">
          <Users size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium text-gray-500">No client selected</p>
          <p className="text-xs mt-1">Select a client from the header to manage their team.</p>
        </div>
      </div>
    );
  }

  const heading = isSTX && activeClientName
    ? `${activeClientName} — Team`
    : 'Team';

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-1">{heading}</h1>
      <p className="text-gray-500 text-sm mb-6">
        {isSTX ? 'Manage client team members and their access levels.' : 'Manage your team members and their portal access.'}
      </p>

      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">
          {loading ? 'Loading…' : `${members.length} member${members.length !== 1 ? 's' : ''}`}
        </p>
        <button
          onClick={() => setCreate(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700"
        >
          <Plus size={15} /> Add member
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {!loading && members.length === 0 ? (
          <div className="p-10 text-center text-gray-400 text-sm">
            No team members yet. Click "Add member" to invite someone.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Role</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {members.map((member, i) => {
                const name = [member.firstName, member.lastName].filter(Boolean).join(' ') || '—';
                const isInactive = member.active === false;
                return (
                  <tr
                    key={member.id}
                    className={`border-b border-gray-100 last:border-0 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} ${isInactive ? 'opacity-60' : ''}`}
                  >
                    <td className="px-4 py-3 font-medium text-gray-800">{name}</td>
                    <td className="px-4 py-3 text-gray-500">{member.email}</td>
                    <td className="px-4 py-3"><RoleBadge role={member.role} /></td>
                    <td className="px-4 py-3">
                      {isInactive
                        ? <span className="flex items-center gap-1 text-red-500 text-xs"><UserX size={13} /> Inactive</span>
                        : <span className="flex items-center gap-1 text-green-600 text-xs"><UserCheck size={13} /> Active</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setEditing(member)}
                        className="text-blue-600 hover:text-blue-800 p-1 rounded"
                        title="Edit member"
                      >
                        <Edit2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && (
        <Modal title="Add team member" onClose={() => setCreate(false)}>
          <CreateMemberForm
            clientId={effectiveClientId}
            onCreated={() => setCreate(false)}
            onCancel={() => setCreate(false)}
          />
        </Modal>
      )}

      {editing && (
        <Modal
          title={`Edit — ${[editing.firstName, editing.lastName].filter(Boolean).join(' ') || editing.email}`}
          onClose={closeEdit}
        >
          <EditMemberForm
            user={editing}
            canDelete={isAdmin}
            onSaved={closeEdit}
            onDeleted={closeEdit}
            onCancel={closeEdit}
          />
        </Modal>
      )}
    </div>
  );
}
