import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../firebase';
import {
  Plus, Edit2, UserCheck, UserX, Mail, Trash2,
  Users, GitBranch, ChevronRight, User, Search,
} from 'lucide-react';
import Modal from '../components/shared/Modal';
import Toggle from '../components/shared/Toggle';
import PermissionOverridesEditor from '../components/shared/PermissionOverridesEditor';
import PassengerForm from '../components/passengers/PassengerForm';
import { ROLE_LABELS, CLIENT_ROLES, ROLE_PERMISSIONS } from '../utils/permissions';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import { usePassengers } from '../hooks/usePassengers';

const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-500';

function Field({ label, children, hint }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-600 mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-600 mt-1">{hint}</p>}
    </div>
  );
}

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

function memberName(m) {
  return [m?.firstName, m?.lastName].filter(Boolean).join(' ') || m?.email || '—';
}

// ── Hierarchy tree view ───────────────────────────────────────────────────────

function TreeNode({ member, members, depth = 0 }) {
  const memberMap = useMemo(() => Object.fromEntries(members.map(m => [m.id, m])), [members]);
  const directReports = members.filter(m => m.managerId === member.id);
  const approveForNames = (member.approveFor || [])
    .map(uid => memberMap[uid])
    .filter(Boolean)
    .map(memberName);

  // Infer scope for backward compat (old records with only approveFor set)
  const approveScope = member.approveScope
    ?? ((member.approveFor?.length > 0) ? 'select' : 'all');

  const approveScopeLabel = (() => {
    if (approveScope === 'select' && approveForNames.length > 0)
      return `Approves for: ${approveForNames.join(', ')}`;
    if (approveScope === 'reports') {
      const depth = member.approveReportsDepth || 1;
      return `Approves for: ${
        depth === 1 ? 'direct reports' :
        depth === 2 ? 'direct + once removed' :
                      'direct + twice removed'
      }`;
    }
    return 'Approves for: all team members';
  })();

  return (
    <div>
      <div className="flex items-start gap-2 py-1.5 group" style={{ paddingLeft: depth * 24 }}>
        {depth > 0 && (
          <span className="text-gray-500 mt-0.5 shrink-0">
            <ChevronRight size={14} />
          </span>
        )}
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className={`font-medium text-sm ${member.active === false ? 'text-gray-600 line-through' : 'text-gray-800'}`}>
            {memberName(member)}
          </span>
          <RoleBadge role={member.role} />
          {(ROLE_PERMISSIONS[member.role]?.includes('trip:approve') || member.approveScope) && (
            <span className="text-xs text-purple-500">{approveScopeLabel}</span>
          )}
        </div>
      </div>
      {directReports.map(r => (
        <TreeNode key={r.id} member={r} members={members} depth={depth + 1} />
      ))}
    </div>
  );
}

function HierarchyView({ members }) {
  const memberIds = new Set(members.map(m => m.id));
  const roots = members.filter(m => !m.managerId || !memberIds.has(m.managerId));

  if (roots.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-600 text-sm">
        No team members yet.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-xs text-gray-600 mb-4">
        Reporting structure — edit members to assign managers and approver delegations.
      </p>
      {roots.map(m => (
        <TreeNode key={m.id} member={m} members={members} depth={0} />
      ))}
    </div>
  );
}

// ── Create member form ────────────────────────────────────────────────────────

function CreateMemberForm({ clientId, members, costCentres = [], onCreated, onCancel }) {
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', password: '',
    role: 'client_traveller', managerId: '', costCentre: '',
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
      const result = await httpsCallable(getFunctions(), 'createClientUser')({
        firstName: form.firstName,
        lastName:  form.lastName,
        email:     form.email,
        password:  form.password,
        role:      form.role,
        clientId,
      });
      // Set hierarchy and cost centre fields directly in Firestore
      const uid = result.data?.uid;
      if (uid && (form.managerId || form.costCentre)) {
        await updateDoc(doc(db, 'users', uid), {
          ...(form.managerId   ? { managerId: form.managerId }     : {}),
          ...(form.costCentre  ? { costCentre: form.costCentre }   : {}),
        });
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
      <div className="grid grid-cols-2 gap-3">
        <Field label="Reports to">
          <select className={inp} value={form.managerId} onChange={e => set('managerId', e.target.value)}>
            <option value="">No manager</option>
            {members.map(m => (
              <option key={m.id} value={m.id}>{memberName(m)} — {ROLE_LABELS[m.role] ?? m.role}</option>
            ))}
          </select>
        </Field>
        {costCentres.length > 0 && (
          <Field label="Cost centre">
            <select className={inp} value={form.costCentre} onChange={e => set('costCentre', e.target.value)}>
              <option value="">Not assigned</option>
              {costCentres.map(c => <option key={c}>{c}</option>)}
            </select>
          </Field>
        )}
      </div>
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

function EditMemberForm({ user, members, costCentres = [], canDelete, showPermissions, onSaved, onDeleted, onCancel }) {
  // Backward-compat: infer approveScope from legacy approveFor if not set explicitly
  const initApproveScope = user.approveScope
    ?? ((user.approveFor?.length > 0) ? 'select' : 'all');

  const [form, setForm] = useState({
    firstName:           user.firstName  || '',
    lastName:            user.lastName   || '',
    role:                user.role       || 'client_traveller',
    active:              user.active !== false,
    managerId:           user.managerId  || '',
    approveScope:        initApproveScope,
    approveFor:          user.approveFor || [],
    approveReportsDepth: user.approveReportsDepth || 1,
    costCentre:          user.costCentre || '',
    permissionOverrides: user.permissionOverrides || {},
  });
  const [saving, setSaving]       = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetLink, setResetLink] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // Other members in same client (exclude self)
  const otherMembers = members.filter(m => m.id !== user.id);

  const toggleApproveFor = (uid) => {
    const current = form.approveFor || [];
    set('approveFor', current.includes(uid) ? current.filter(id => id !== uid) : [...current, uid]);
  };

  // Whether this user effectively has approval permission (role default + overrides)
  const roleHasApprove = !!(ROLE_PERMISSIONS[form.role]?.includes('trip:approve'));
  const overrideApprove = form.permissionOverrides?.['trip:approve'];
  const canApproveTrips = overrideApprove !== undefined ? overrideApprove : roleHasApprove;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.firstName.trim()) return setError('First name is required.');
    setSaving(true);
    try {
      // Cloud Function handles name/role/active (may affect Auth claims)
      await httpsCallable(getFunctions(), 'updateClientUser')({
        targetUid: user.id,
        updates: {
          firstName: form.firstName,
          lastName:  form.lastName,
          role:      form.role,
          active:    form.active,
        },
      });
      // Direct Firestore update for hierarchy metadata, approval scope, and cost centre
      await updateDoc(doc(db, 'users', user.id), {
        managerId:           form.managerId || null,
        approveScope:        form.approveScope,
        approveFor:          form.approveScope === 'select' ? (form.approveFor || []) : [],
        approveReportsDepth: form.approveReportsDepth || 1,
        costCentre:          form.costCentre || null,
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
    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-700">
          Permanently delete <strong>{memberName(user)}</strong> ({user.email})?
        </p>
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
      {/* Name */}
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

      {/* Role */}
      <Field label="Role">
        <select className={inp} value={form.role} onChange={e => {
          set('role', e.target.value);
          set('permissionOverrides', {});
        }}>
          {CLIENT_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </select>
      </Field>

      {/* Cost centre */}
      {costCentres.length > 0 && (
        <Field label="Cost centre">
          <select className={inp} value={form.costCentre} onChange={e => set('costCentre', e.target.value)}>
            <option value="">Not assigned</option>
            {costCentres.map(c => <option key={c}>{c}</option>)}
          </select>
        </Field>
      )}

      {/* Reporting structure */}
      <div className="border border-gray-200 rounded-lg p-4 space-y-4">
        <p className="text-sm font-semibold text-gray-700">Reporting structure</p>

        <Field label="Reports to" hint="Who this person's travel is managed by.">
          <select className={inp} value={form.managerId} onChange={e => set('managerId', e.target.value)}>
            <option value="">No manager (top level)</option>
            {otherMembers.map(m => (
              <option key={m.id} value={m.id}>
                {memberName(m)} — {ROLE_LABELS[m.role] ?? m.role}
              </option>
            ))}
          </select>
        </Field>

        {/* Approval scope — shown for any user who has (or can have) approval permission */}
        {canApproveTrips && (
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium text-gray-700 mb-0.5">Approval scope</p>
              <p className="text-xs text-gray-600">Which team members' trips this person can approve or decline.</p>
            </div>

            {/* Scope selector */}
            <div className="space-y-2">
              {[
                { value: 'all',     label: 'All team members',            hint: 'Can approve any trip within this client account.' },
                { value: 'select',  label: 'Specific members only',       hint: 'Choose which team members below.' },
                { value: 'reports', label: 'Staff reporting to this user', hint: 'Approves for their direct reports and optionally deeper in the hierarchy.' },
              ].map(({ value, label, hint }) => (
                <label key={value} className="flex items-start gap-2.5 cursor-pointer group">
                  <input
                    type="radio"
                    checked={form.approveScope === value}
                    onChange={() => set('approveScope', value)}
                    className="mt-0.5 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <span className="text-sm text-gray-700 group-hover:text-gray-900">{label}</span>
                    <p className="text-xs text-gray-600">{hint}</p>
                  </div>
                </label>
              ))}
            </div>

            {/* Select-specific member list */}
            {form.approveScope === 'select' && (
              <div className="ml-6 space-y-1.5 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-3">
                {otherMembers.length === 0 && (
                  <p className="text-xs text-gray-600">No other members in this client.</p>
                )}
                {otherMembers.map(m => {
                  const checked = (form.approveFor || []).includes(m.id);
                  return (
                    <label key={m.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleApproveFor(m.id)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-gray-700">{memberName(m)}</span>
                      <RoleBadge role={m.role} />
                    </label>
                  );
                })}
              </div>
            )}

            {/* Reports-scope depth selector */}
            {form.approveScope === 'reports' && (
              <div className="ml-6 space-y-2">
                <label className="block text-xs font-medium text-gray-600">How deep in the reporting structure</label>
                <select
                  value={form.approveReportsDepth}
                  onChange={e => set('approveReportsDepth', Number(e.target.value))}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-500"
                >
                  <option value={1}>Direct reports only</option>
                  <option value={2}>Direct reports + once removed</option>
                  <option value={3}>Direct reports + twice removed</option>
                </select>
                <p className="text-xs text-gray-600">
                  Staff must have this user set as their manager (or report to someone who does) for this to apply.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Active toggle */}
      <Toggle checked={form.active} onChange={v => set('active', v)} label="Active account" description="Inactive users cannot log in" />

      {/* Permission overrides */}
      {showPermissions && (
        <div className="border border-gray-200 rounded-lg p-4">
          <p className="text-sm font-semibold text-gray-700 mb-1">Permission overrides</p>
          <p className="text-xs text-gray-600 mb-3">
            Override individual permissions for this user. "Role default" means the user's role determines access.
          </p>
          <PermissionOverridesEditor
            role={form.role}
            overrides={form.permissionOverrides}
            onChange={v => set('permissionOverrides', v)}
          />
        </div>
      )}

      {/* Password reset */}
      <div className="border border-gray-200 rounded-lg p-4">
        <p className="text-sm font-medium text-gray-700 mb-2">Password reset</p>
        {resetLink ? (
          <div className="space-y-2">
            <p className="text-xs text-green-700 bg-green-50 rounded p-2">
              Reset link generated — copy and share with the user. Expires in 1 hour.
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

// ── Main component ────────────────────────────────────────────────────────────

export default function Team() {
  useEffect(() => {
    document.title = 'Team — STX Connect';
  }, []);
  const { userProfile } = useAuth();
  const { isSTX, clientId, activeClientId, clientsList, clientConfig, activeClientConfig } = useTenant();
  const effectiveConfig = isSTX ? activeClientConfig : clientConfig;
  const effectiveCostCentres = effectiveConfig?.dropdowns?.costCentres || [];
  const showPermissions = isSTX || !!effectiveConfig?.features?.customPermissions;

  const role = userProfile?.role;
  const isAdmin = role === 'stx_admin';

  const effectiveClientId = isSTX ? activeClientId : clientId;
  const activeClientName  = clientsList?.find(c => c.id === activeClientId)?.name;

  const { passengers, addPassenger, updatePassenger } = usePassengers(effectiveClientId);

  const [members, setMembers]       = useState([]);
  const [loading, setLoading]       = useState(false);
  const [tab, setTab]               = useState('members'); // 'members' | 'hierarchy'
  const [showCreate, setCreate]     = useState(false);
  const [editing, setEditing]       = useState(null);
  const [passengerFor, setPassengerFor] = useState(null); // member whose passenger profile is open
  const [search, setSearch]         = useState('');

  useEffect(() => {
    if (!effectiveClientId) { setMembers([]); setLoading(false); return; }
    setLoading(true);
    const q = query(collection(db, 'users'), where('clientId', '==', effectiveClientId));
    const unsub = onSnapshot(q, snap => {
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => memberName(a).localeCompare(memberName(b)));
      setMembers(list);
      setLoading(false);
    });
    return unsub;
  }, [effectiveClientId]);

  if (isSTX && !activeClientId) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-800 mb-6">Team</h1>
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-600">
          <Users size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium text-gray-700">No client selected</p>
          <p className="text-xs mt-1">Select a client from the header to manage their team.</p>
        </div>
      </div>
    );
  }

  const heading = isSTX && activeClientName ? `${activeClientName} — Team` : 'Team';

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-1">{heading}</h1>
      <p className="text-gray-700 text-sm mb-5">
        {isSTX
          ? 'Manage team members, reporting structure, and approver delegations.'
          : 'Manage your team, who reports to whom, and who approves travel requests.'}
      </p>

      {/* Tabs + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setTab('members')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors
              ${tab === 'members' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-700 hover:text-gray-700'}`}
          >
            <Users size={14} /> Members
            <span className="text-xs text-gray-600 font-normal">({members.length})</span>
          </button>
          <button
            onClick={() => setTab('hierarchy')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors
              ${tab === 'hierarchy' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-700 hover:text-gray-700'}`}
          >
            <GitBranch size={14} /> Hierarchy
          </button>
        </div>
        <div className="flex items-center gap-2">
          {tab === 'members' && (
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-600 pointer-events-none" />
              <input
                type="text"
                placeholder="Search members…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-7 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg w-44 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-600"
              />
            </div>
          )}
          <button
            onClick={() => setCreate(true)}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700"
          >
            <Plus size={15} /> Add member
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-600 py-8 text-center">Loading…</p>
      ) : tab === 'hierarchy' ? (
        <HierarchyView members={members} />
      ) : (
        /* Members table */
        (() => {
          const q = search.toLowerCase();
          const visible = q
            ? members.filter(m =>
                memberName(m).toLowerCase().includes(q) ||
                (m.email || '').toLowerCase().includes(q) ||
                (ROLE_LABELS[m.role] || m.role || '').toLowerCase().includes(q) ||
                (m.costCentre || '').toLowerCase().includes(q)
              )
            : members;
          return (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {members.length === 0 ? (
            <div className="p-10 text-center text-gray-600 text-sm">
              No team members yet. Click "Add member" to get started.
            </div>
          ) : visible.length === 0 ? (
            <div className="p-10 text-center text-gray-600 text-sm">
              No members match <strong className="text-gray-600">"{search}"</strong>.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th scope="col" className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                  <th scope="col" className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
                  <th scope="col" className="text-left px-4 py-3 font-medium text-gray-600">Role</th>
                  <th scope="col" className="text-left px-4 py-3 font-medium text-gray-600">Reports to</th>
                  <th scope="col" className="text-left px-4 py-3 font-medium text-gray-600 hidden lg:table-cell">Cost centre</th>
                  <th scope="col" className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th scope="col" className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Profile</th>
                  <th scope="col" className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {visible.map((m, i) => {
                  const manager    = members.find(x => x.id === m.managerId);
                  const hasProfile = passengers.some(p => p.userId === m.id);
                  return (
                    <tr
                      key={m.id}
                      className={`border-b border-gray-100 last:border-0 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} ${m.active === false ? 'opacity-60' : ''}`}
                    >
                      <td className="px-4 py-3 font-medium text-gray-800">{memberName(m)}</td>
                      <td className="px-4 py-3 text-gray-700">{m.email}</td>
                      <td className="px-4 py-3"><RoleBadge role={m.role} /></td>
                      <td className="px-4 py-3 text-gray-700 text-xs">
                        {manager ? memberName(manager) : <span className="text-gray-500">—</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-700 text-xs hidden lg:table-cell">
                        {m.costCentre || <span className="text-gray-500">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {m.active === false
                          ? <span className="flex items-center gap-1 text-red-500 text-xs"><UserX size={13} /> Inactive</span>
                          : <span className="flex items-center gap-1 text-green-600 text-xs"><UserCheck size={13} /> Active</span>}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <button
                          onClick={() => setPassengerFor(m)}
                          className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg border ${
                            hasProfile
                              ? 'border-blue-200 text-blue-600 hover:bg-blue-50'
                              : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:text-gray-600'
                          }`}
                          title={hasProfile ? 'Edit passenger profile' : 'Create passenger profile'}
                        >
                          <User size={12} />
                          {hasProfile ? 'View / edit' : 'Add profile'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setEditing(m)}
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
          );
        })()
      )}

      {showCreate && (
        <Modal title="Add team member" onClose={() => setCreate(false)} wide>
          <CreateMemberForm
            clientId={effectiveClientId}
            members={members}
            costCentres={effectiveCostCentres}
            onCreated={() => setCreate(false)}
            onCancel={() => setCreate(false)}
          />
        </Modal>
      )}

      {editing && (
        <Modal
          title={`Edit — ${memberName(editing)}`}
          onClose={() => setEditing(null)}
          wide
        >
          <EditMemberForm
            user={editing}
            members={members}
            costCentres={effectiveCostCentres}
            canDelete={isAdmin}
            showPermissions={showPermissions}
            onSaved={() => setEditing(null)}
            onDeleted={() => setEditing(null)}
            onCancel={() => setEditing(null)}
          />
        </Modal>
      )}

      {passengerFor && (() => {
        const existingProfile = passengers.find(p => p.userId === passengerFor.id);
        const prefilled = existingProfile || {
          firstName: passengerFor.firstName || '',
          lastName:  passengerFor.lastName  || '',
          email:     passengerFor.email     || '',
          userId:    passengerFor.id,
        };
        const handlePassengerSave = async (data) => {
          if (existingProfile) {
            await updatePassenger(existingProfile.id, { ...data, updatedBy: userProfile.uid });
          } else {
            await addPassenger({ ...data, createdBy: userProfile.uid });
          }
          setPassengerFor(null);
        };
        return (
          <Modal
            title={existingProfile
              ? `Passenger profile — ${memberName(passengerFor)}`
              : `New passenger profile — ${memberName(passengerFor)}`}
            onClose={() => setPassengerFor(null)}
            wide
          >
            <PassengerForm
              passenger={prefilled}
              teamMembers={members}
              onSave={handlePassengerSave}
              onCancel={() => setPassengerFor(null)}
            />
          </Modal>
        );
      })()}
    </div>
  );
}
