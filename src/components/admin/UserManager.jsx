import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, where, doc, getDoc, updateDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../../firebase';
import { Plus, Edit2, UserCheck, UserX, Mail, Trash2, Search } from 'lucide-react';
import Modal from '../shared/Modal';
import Toggle from '../shared/Toggle';
import PermissionOverridesEditor from '../shared/PermissionOverridesEditor';
import { ROLE_LABELS, CLIENT_ROLES, STX_ROLES, ROLE_PERMISSIONS } from '../../utils/permissions';
import { useAuth } from '../../contexts/AuthContext';

const ALL_ROLES = [...STX_ROLES, ...CLIENT_ROLES];
const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-500';

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

// ── Cost centres loader hook ──────────────────────────────────────────────────
function useCostCentres(clientId) {
  const [costCentres, setCostCentres] = useState([]);
  useEffect(() => {
    if (!clientId) { setCostCentres([]); return; }
    getDoc(doc(db, 'clients', clientId, 'config', 'settings')).then(snap => {
      setCostCentres(snap.data()?.dropdowns?.costCentres || []);
    });
  }, [clientId]);
  return costCentres;
}

function useClientMembers(clientId) {
  const [members, setMembers] = useState([]);
  useEffect(() => {
    if (!clientId) { setMembers([]); return; }
    const q = query(collection(db, 'users'), where('clientId', '==', clientId));
    const unsub = onSnapshot(q, snap => {
      setMembers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [clientId]);
  return members;
}

// ── Create user form ──────────────────────────────────────────────────────────
function CreateUserForm({ clients, onCreated, onCancel }) {
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', password: '',
    role: 'client_ops', clientId: '', costCentre: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const needsClient  = CLIENT_ROLES.includes(form.role);
  const costCentres  = useCostCentres(needsClient ? form.clientId : null);
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
      const result = await httpsCallable(fns, 'createClientUser')({
        firstName: form.firstName,
        lastName:  form.lastName,
        email:     form.email,
        password:  form.password,
        role:      form.role,
        clientId:  needsClient ? form.clientId : null,
      });
      // Store cost centre directly in Firestore (not handled by CF)
      const uid = result.data?.uid;
      if (uid && form.costCentre) {
        await updateDoc(doc(db, 'users', uid), { costCentre: form.costCentre });
      }
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
            <ClientSelect value={form.clientId} onChange={v => { set('clientId', v); set('costCentre', ''); }} clients={clients} />
          </Field>
        )}
      </div>
      {needsClient && costCentres.length > 0 && (
        <Field label="Cost centre">
          <select className={inp} value={form.costCentre} onChange={e => set('costCentre', e.target.value)}>
            <option value="">Not assigned</option>
            {costCentres.map(c => <option key={c}>{c}</option>)}
          </select>
        </Field>
      )}
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
const OPS_ROLES = ['stx_admin', 'stx_ops', 'client_ops'];

function EditUserForm({ user, clients, onSaved, onCancel }) {
  const initApproveScope = user.approveScope
    ?? ((user.approveFor?.length > 0) ? 'select' : 'all');

  const [form, setForm] = useState({
    firstName:           user.firstName  || '',
    lastName:            user.lastName   || '',
    role:                user.role       || 'client_ops',
    clientId:            user.clientId   || '',
    active:              user.active !== false,
    costCentre:          user.costCentre || '',
    invoiceAccess:       user.invoiceAccess !== undefined
      ? user.invoiceAccess
      : OPS_ROLES.includes(user.role || 'client_ops'),
    approveScope:        initApproveScope,
    approveFor:          user.approveFor || [],
    approveReportsDepth: user.approveReportsDepth || 1,
    permissionOverrides: user.permissionOverrides || {},
  });
  const [saving, setSaving]       = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetLink, setResetLink] = useState('');
  const [error, setError]         = useState('');

  const needsClient    = CLIENT_ROLES.includes(form.role);
  const costCentres    = useCostCentres(needsClient ? form.clientId : null);
  const clientMembers  = useClientMembers(needsClient && form.approveScope === 'select' ? form.clientId : null);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const roleHasApprove  = !!(ROLE_PERMISSIONS[form.role]?.includes('trip:approve'));
  const overrideApprove = form.permissionOverrides?.['trip:approve'];
  const canApproveTrips = overrideApprove !== undefined ? overrideApprove : roleHasApprove;

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
      // Store cost centre, access flags, and approval scope directly (not in CF allowlist)
      await updateDoc(doc(db, 'users', user.id), {
        costCentre:          form.costCentre || null,
        invoiceAccess:       form.invoiceAccess,
        approveScope:        form.approveScope,
        approveFor:          form.approveScope === 'select' ? (form.approveFor || []) : [],
        approveReportsDepth: form.approveReportsDepth || 1,
        permissionOverrides: form.permissionOverrides,
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
          <select className={inp} value={form.role} onChange={e => {
            const newRole = e.target.value;
            setForm(p => ({ ...p, role: newRole, invoiceAccess: OPS_ROLES.includes(newRole), permissionOverrides: {}, approveScope: 'all', approveFor: [] }));
          }}>
            {ALL_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
        </Field>
        {needsClient && (
          <Field label="Client">
            <ClientSelect value={form.clientId} onChange={v => set('clientId', v)} clients={clients} />
          </Field>
        )}
      </div>
      {needsClient && costCentres.length > 0 && (
        <Field label="Cost centre">
          <select className={inp} value={form.costCentre} onChange={e => set('costCentre', e.target.value)}>
            <option value="">Not assigned</option>
            {costCentres.map(c => <option key={c}>{c}</option>)}
          </select>
        </Field>
      )}
      <Toggle checked={form.active} onChange={v => set('active', v)} label="Active account" description="Inactive users cannot log in" />
      <Toggle
        checked={form.invoiceAccess}
        onChange={v => set('invoiceAccess', v)}
        label="Invoice access"
        description="Can view and generate invoices. On by default for operations roles."
      />

      {needsClient && (
        <div className="border border-gray-200 rounded-lg p-4">
          <p className="text-sm font-semibold text-gray-700 mb-1">Permission overrides</p>
          <p className="text-xs text-gray-600 mb-3">
            Override individual permissions for this user. "Role default" means no override — the user's role determines access.
          </p>
          <PermissionOverridesEditor
            role={form.role}
            overrides={form.permissionOverrides}
            onChange={v => set('permissionOverrides', v)}
          />
        </div>
      )}

      {needsClient && canApproveTrips && (
        <div className="border border-gray-200 rounded-lg p-4 space-y-3">
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-0.5">Approval scope</p>
            <p className="text-xs text-gray-600">Which team members' trips this person can approve or decline.</p>
          </div>
          <div className="space-y-2">
            {[
              { value: 'all',     label: 'All team members',            hint: 'Can approve any trip in this client account.' },
              { value: 'select',  label: 'Specific members only',       hint: 'Choose below.' },
              { value: 'reports', label: 'Staff reporting to this user', hint: 'Approves for their reporting hierarchy.' },
            ].map(({ value, label, hint }) => (
              <label key={value} className="flex items-start gap-2.5 cursor-pointer">
                <input type="radio" checked={form.approveScope === value}
                  onChange={() => set('approveScope', value)}
                  className="mt-0.5 text-blue-600 focus:ring-blue-500" />
                <div>
                  <span className="text-sm text-gray-700">{label}</span>
                  <p className="text-xs text-gray-600">{hint}</p>
                </div>
              </label>
            ))}
          </div>
          {form.approveScope === 'select' && (
            <div className="ml-6 border border-gray-200 rounded-lg p-3 max-h-48 overflow-y-auto space-y-1.5">
              {clientMembers.filter(m => m.id !== user.id).length === 0
                ? <p className="text-xs text-gray-600">No other members in this client.</p>
                : clientMembers.filter(m => m.id !== user.id).map(m => {
                    const name = [m.firstName, m.lastName].filter(Boolean).join(' ') || m.email;
                    const checked = (form.approveFor || []).includes(m.id);
                    return (
                      <label key={m.id} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox" checked={checked}
                          onChange={() => {
                            const cur = form.approveFor || [];
                            set('approveFor', checked ? cur.filter(id => id !== m.id) : [...cur, m.id]);
                          }}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                        <span className="text-gray-700">{name}</span>
                        <span className="text-xs text-gray-600">{ROLE_LABELS[m.role] ?? m.role}</span>
                      </label>
                    );
                  })
              }
            </div>
          )}
          {form.approveScope === 'reports' && (
            <div className="ml-6 space-y-1.5">
              <label className="block text-xs font-medium text-gray-600">Hierarchy depth</label>
              <select value={form.approveReportsDepth}
                onChange={e => set('approveReportsDepth', Number(e.target.value))}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-500">
                <option value={1}>Direct reports only</option>
                <option value={2}>Direct reports + once removed</option>
                <option value={3}>Direct reports + twice removed</option>
              </select>
            </div>
          )}
        </div>
      )}

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
            <Mail size={14} aria-hidden="true" />
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
  const { userProfile } = useAuth();
  const isSTXAdmin = userProfile?.role === 'stx_admin';

  const [users, setUsers]       = useState([]);
  const [clients, setClients]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing]   = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [search, setSearch]     = useState('');

  useEffect(() => {
    const unsubUsers = onSnapshot(
      query(collection(db, 'users'), orderBy('email')),
      snap => { setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false); }
    );
    const unsubClients = onSnapshot(collection(db, 'clients'), snap => {
      setClients(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => { unsubUsers(); unsubClients(); };
  }, []);

  const clientName = (cid) => clients.find(c => c.id === cid)?.name ?? cid ?? '—';

  const visibleUsers = (() => {
    const q = search.toLowerCase();
    if (!q) return users;
    return users.filter(u =>
      [u.firstName, u.lastName].filter(Boolean).join(' ').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (ROLE_LABELS[u.role] || u.role || '').toLowerCase().includes(q) ||
      clientName(u.clientId).toLowerCase().includes(q)
    );
  })();

  const handleDelete = async (user) => {
    setDeleting(user.id);
    try {
      const fns = getFunctions();
      await httpsCallable(fns, 'deleteClientUser')({ targetUid: user.id });
    } catch (err) {
      alert(err.message);
    } finally {
      setDeleting(null);
    }
  };

  if (loading) return <p className="text-sm text-gray-600">Loading users…</p>;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="text-sm text-gray-700">
          {search
            ? `${visibleUsers.length} of ${users.length} user${users.length !== 1 ? 's' : ''}`
            : `${users.length} user${users.length !== 1 ? 's' : ''}`}
        </p>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-600 pointer-events-none" aria-hidden="true" />
            <input
              type="text"
              placeholder="Search users…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-7 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg w-44 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-600"
            />
          </div>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">
            <Plus size={15} aria-hidden="true" /> Add user
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {users.length === 0 ? (
          <div className="p-8 text-center text-gray-600 text-sm">No users yet.</div>
        ) : visibleUsers.length === 0 ? (
          <div className="p-8 text-center text-gray-600 text-sm">
            No users match <strong className="text-gray-600">"{search}"</strong>.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th scope="col" className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                <th scope="col" className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
                <th scope="col" className="text-left px-4 py-3 font-medium text-gray-600">Role</th>
                <th scope="col" className="text-left px-4 py-3 font-medium text-gray-600">Client</th>
                <th scope="col" className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th scope="col" className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {visibleUsers.map((user, i) => (
                <tr key={user.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-4 py-3 font-medium text-gray-800">
                    {[user.firstName, user.lastName].filter(Boolean).join(' ') || user.displayName || '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{user.email}</td>
                  <td className="px-4 py-3 text-gray-600">{ROLE_LABELS[user.role] ?? user.role}</td>
                  <td className="px-4 py-3 text-gray-700">{clientName(user.clientId)}</td>
                  <td className="px-4 py-3">
                    {user.active !== false
                      ? <span className="flex items-center gap-1 text-green-600 text-xs"><UserCheck size={13} aria-hidden="true" /> Active</span>
                      : <span className="flex items-center gap-1 text-red-500 text-xs"><UserX size={13} aria-hidden="true" /> Inactive</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setEditing(user)}
                        className="text-blue-600 hover:text-blue-800 p-1" title="Edit user">
                        <Edit2 size={14} aria-hidden="true" />
                      </button>
                      {isSTXAdmin && (
                        <button
                          onClick={() => setDeleting(user.id)}
                          className="text-gray-600 hover:text-red-600 p-1" title="Delete user"
                          disabled={deleting === user.id}
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </button>
                      )}
                    </div>
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

      {deleting && deleting !== true && (() => {
        const user = users.find(u => u.id === deleting);
        if (!user) return null;
        const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
        return (
          <Modal title="Delete user" onClose={() => setDeleting(null)}>
            <div className="space-y-4">
              <p className="text-sm text-gray-700">
                Are you sure you want to permanently delete <strong>{name}</strong> ({user.email})?
              </p>
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                This cannot be undone. The user will be removed from Firebase Auth and all portal access will be revoked immediately.
              </p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setDeleting(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                  Cancel
                </button>
                <button
                  onClick={() => { handleDelete(user); setDeleting(null); }}
                  className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700"
                >
                  Yes, delete permanently
                </button>
              </div>
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}
