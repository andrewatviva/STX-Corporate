import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { Plus, Edit2, CheckCircle, XCircle } from 'lucide-react';
import Modal from '../shared/Modal';
import ClientForm from './ClientForm';

export default function ClientManager() {
  const [clients, setClients]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [showForm, setShowForm]     = useState(false);
  const [editing, setEditing]       = useState(null);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'clients'), snap => {
      setClients(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, []);

  const handleEdit = async (client) => {
    const cfgSnap = await getDoc(doc(db, 'clients', client.id, 'config', 'settings'));
    setEditing({ ...client, clientId: client.id, config: cfgSnap.data() ?? {} });
    setShowForm(true);
  };

  const handleSaved = () => {
    setShowForm(false);
    setEditing(null);
  };

  if (loading) return <p className="text-sm text-gray-600">Loading clients…</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-700">{clients.length} client{clients.length !== 1 ? 's' : ''} registered</p>
        <button
          onClick={() => { setEditing(null); setShowForm(true); }}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700"
        >
          <Plus size={15} aria-hidden="true" /> Add client
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {clients.length === 0 ? (
          <div className="p-8 text-center text-gray-600 text-sm">No clients yet. Add your first client above.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th scope="col" className="text-left px-4 py-3 font-medium text-gray-600">Client name</th>
                <th scope="col" className="text-left px-4 py-3 font-medium text-gray-600">Client ID</th>
                <th scope="col" className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th scope="col" className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {clients.map((client, i) => (
                <tr key={client.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-4 py-3 font-medium text-gray-800">{client.name}</td>
                  <td className="px-4 py-3 text-gray-700 font-mono text-xs">{client.id}</td>
                  <td className="px-4 py-3">
                    {client.active !== false ? (
                      <span className="flex items-center gap-1 text-green-600 text-xs"><CheckCircle size={13} aria-hidden="true" /> Active</span>
                    ) : (
                      <span className="flex items-center gap-1 text-red-500 text-xs"><XCircle size={13} aria-hidden="true" /> Inactive</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => handleEdit(client)} className="text-blue-600 hover:text-blue-800">
                      <Edit2 size={15} aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <Modal title={editing ? `Edit — ${editing.name}` : 'Add new client'} onClose={() => { setShowForm(false); setEditing(null); }} wide>
          <ClientForm existing={editing} onSaved={handleSaved} onCancel={() => { setShowForm(false); setEditing(null); }} />
        </Modal>
      )}
    </div>
  );
}
