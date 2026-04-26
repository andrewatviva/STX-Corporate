import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../../firebase';
import { Plus, UserCheck, UserX, RefreshCw } from 'lucide-react';
import Modal from '../shared/Modal';
import { ROLE_LABELS, CLIENT_ROLES, STX_ROLES } from '../../utils/permissions';

const ALL_ROLES = [...STX_ROLES, ...CLIENT_ROLES];
const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

function CreateUserForm({ clients, onCreated, onCancel }) {
  const [form, setForm] = useState({ email: '', password: '', displayName: '', role: 'client_ops', clientId: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const needsClient = CLIENT_ROLES.includes(form.role);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.email || !form.password) return setError('Email and password are required.');
    if (needsClient && !form.clientId) return setError('Please select a client for this role.');
    setSaving(true);
    try {
      const fns = getFunctions();
      const createFn = httpsCallable(fns, 'createClientUser');
      await createFn({ ...form, clientId: needsClient ? form.clientId : null });
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
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">Email *</label>
          <input type="email" className={inp} value={form.email} onChange={e => set('email', e.target.value)} placeholder="user@client.com" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">Display name</label>
          <input className={inp} value={form.displayName} onChange={e => set('displayName', e.target.value)} placeholder="Jane Smith" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-600 mb-1">Temporary password *</label>
        <input type="password" className={inp} value={form.password} onChange={e => set('password', e.target.value)} placeholder="User will be asked to change this" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">Role *</label>
          <select className={inp} value={form.role} onChange={e => set('role', e.target.value)}>
            {ALL_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
        </div>
        {needsClient && (
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Client *</label>
            <select className={inp} value={form.clientId} onChange={e => set('clientId', e.target.value)}>
              <option value="">Select client…</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
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

export default function UserManager() {
  const [users, setUsers]     = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [toggling, setToggling] = useState(null);
  const [refreshing, setRefreshing] = useState(null);

  useEffect(() => {
    const unsubUsers = onSnapshot(query(collection(db, 'users'), orderBy('displayName')), snap => {
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    const unsubClients = onSnapshot(collection(db, 'clients'), snap => {
      setClients(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => { unsubUsers(); unsubClients(); };
  }, []);

  const clientName = (cid) => clients.find(c => c.id === cid)?.name ?? cid ?? '—';

  const toggleActive = async (user) => {
    setToggling(user.id);
    try {
      const fns = getFunctions();
      await httpsCallable(fns, 'updateClientUser')({ targetUid: user.id, updates: { active: !user.active } });
    } catch (err) {
      alert(err.message);
    } finally {
      setToggling(null);
    }
  };

  const forceRefresh = async (user) => {
    setRefreshing(user.id);
    try {
      const fns = getFunctions();
      await httpsCallable(fns, 'refreshUserClaims')({ targetUid: user.id });
      alert('Claims refreshed. User must sign out and back in.');
    } catch (err) {
      alert(err.message);
    } finally {
      setRefreshing(null);
    }
  };

  if (loading) return <p className="text-sm text-gray-400">Loading users…</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">{users.length} user{users.length !== 1 ? 's' : ''}</p>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">
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
                  <td className="px-4 py-3 font-medium text-gray-800">{user.displayName || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{user.email}</td>
                  <td className="px-4 py-3 text-gray-600">{ROLE_LABELS[user.role] ?? user.role}</td>
                  <td className="px-4 py-3 text-gray-500">{clientName(user.clientId)}</td>
                  <td className="px-4 py-3">
                    {user.active !== false
                      ? <span className="text-green-600 text-xs flex items-center gap-1"><UserCheck size={13} /> Active</span>
                      : <span className="text-red-500 text-xs flex items-center gap-1"><UserX size={13} /> Inactive</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => forceRefresh(user)} disabled={refreshing === user.id} title="Refresh claims"
                        className="text-gray-400 hover:text-blue-600 disabled:opacity-40">
                        <RefreshCw size={14} className={refreshing === user.id ? 'animate-spin' : ''} />
                      </button>
                      <button onClick={() => toggleActive(user)} disabled={toggling === user.id}
                        className={`text-xs px-2 py-1 rounded ${user.active !== false ? 'text-red-600 hover:bg-red-50' : 'text-green-600 hover:bg-green-50'} disabled:opacity-40`}>
                        {toggling === user.id ? '…' : user.active !== false ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <Modal title="Add new user" onClose={() => setShowForm(false)}>
          <CreateUserForm clients={clients} onCreated={() => setShowForm(false)} onCancel={() => setShowForm(false)} />
        </Modal>
      )}
    </div>
  );
}
