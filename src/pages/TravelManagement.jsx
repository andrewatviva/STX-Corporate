import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import { useTrips } from '../hooks/useTrips';
import TripList from '../components/trips/TripList';
import TripForm from '../components/trips/TripForm';
import TripDetail from '../components/trips/TripDetail';
import Modal from '../components/shared/Modal';

export default function TravelManagement() {
  const { userProfile } = useAuth();
  const { clientId, isSTX } = useTenant();

  const { trips, loading, addTrip, updateTrip, deleteTrip } = useTrips(clientId, isSTX);

  const [view, setView]             = useState('list');   // 'list' | 'detail'
  const [selectedTrip, setSelected] = useState(null);
  const [formTrip, setFormTrip]     = useState(null);     // null = no modal, undefined = new, obj = edit
  const [deleteTarget, setDelete]   = useState(null);

  const role = userProfile?.role;
  const canCreate = ['stx_admin', 'stx_ops', 'client_ops'].includes(role);

  // Resolve the clientId to write to (STX creates trips under the correct tenant)
  const resolveClientId = (trip) => trip?.clientId || clientId || '';

  const handleSave = async (data) => {
    const cid = resolveClientId(formTrip);
    if (!cid) throw new Error('No client ID — cannot save trip.');
    if (formTrip?.id) {
      await updateTrip(cid, formTrip.id, data);
    } else {
      await addTrip(cid, { ...data, createdBy: userProfile?.uid || '' });
    }
    setFormTrip(null);
  };

  const handleStatusChange = async (trip, newStatus, extra = {}) => {
    const cid = resolveClientId(trip);
    await updateTrip(cid, trip.id, { status: newStatus, ...extra });
    // Refresh the selected trip in the detail view
    setSelected(prev => prev?.id === trip.id ? { ...prev, status: newStatus, ...extra } : prev);
  };

  const handleDelete = async (trip) => {
    const cid = resolveClientId(trip);
    await deleteTrip(cid, trip.id);
    setDelete(null);
    if (selectedTrip?.id === trip.id) {
      setSelected(null);
      setView('list');
    }
  };

  const openDetail = (trip) => {
    setSelected(trip);
    setView('detail');
  };

  const openEdit = (trip) => {
    setFormTrip(trip);
  };

  const openNew = () => {
    if (!clientId && !isSTX) return;
    setFormTrip(undefined);  // undefined = new trip
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Travel Management</h1>

      {view === 'list' && (
        <TripList
          trips={trips}
          loading={loading}
          canCreate={canCreate}
          onNew={openNew}
          onView={openDetail}
          onEdit={openEdit}
          onDelete={setDelete}
        />
      )}

      {view === 'detail' && selectedTrip && (
        <TripDetail
          trip={selectedTrip}
          onBack={() => { setView('list'); setSelected(null); }}
          onEdit={openEdit}
          onStatusChange={handleStatusChange}
        />
      )}

      {/* Create / Edit modal */}
      {formTrip !== null && (
        <Modal
          title={formTrip?.id ? `Edit — ${formTrip.title || 'trip'}` : 'New trip'}
          onClose={() => setFormTrip(null)}
          wide
        >
          <TripForm
            trip={formTrip?.id ? formTrip : null}
            clientId={resolveClientId(formTrip)}
            onSave={handleSave}
            onCancel={() => setFormTrip(null)}
          />
        </Modal>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <Modal title="Delete trip" onClose={() => setDelete(null)}>
          <div className="space-y-4">
            <p className="text-sm text-gray-700">
              Permanently delete <strong>{deleteTarget.title || 'this trip'}</strong>?
            </p>
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
              This cannot be undone. All sector data will be lost.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDelete(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteTarget)}
                className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700"
              >
                Yes, delete permanently
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
