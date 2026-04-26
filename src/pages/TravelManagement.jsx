import React, { useState, useEffect } from 'react';
import { arrayUnion } from 'firebase/firestore';
import { useSearchParams } from 'react-router-dom';
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

  const [searchParams] = useSearchParams();
  const [view, setView]             = useState('list');   // 'list' | 'detail'
  const [selectedTrip, setSelected] = useState(null);
  const [formTrip, setFormTrip]     = useState(null);     // null = no modal, undefined = new, obj = edit
  const [deleteTarget, setDelete]   = useState(null);
  const [isAmending, setIsAmending]         = useState(false);
  const [pendingAmendFee, setPendingAmendFee] = useState(null); // { apply, amount } | null

  const role = userProfile?.role;
  const canCreate = ['stx_admin', 'stx_ops', 'client_ops', 'client_traveller'].includes(role);

  // Keep selectedTrip in sync with live Firestore data
  useEffect(() => {
    if (!selectedTrip) return;
    const live = trips.find(t => t.id === selectedTrip.id);
    if (live) setSelected(live);
  }, [trips]); // eslint-disable-line react-hooks/exhaustive-deps

  const resolveClientId = (trip) => trip?.clientId || clientId || '';

  const makeAmendment = (type, extra = {}) => ({
    at: new Date().toISOString(),
    by: userProfile?.uid || '',
    byName: [userProfile?.firstName, userProfile?.lastName].filter(Boolean).join(' ') || userProfile?.email || '',
    type,
    ...extra,
  });

  const handleSave = async (data) => {
    const cid = data.clientId || resolveClientId(formTrip);
    if (!cid) throw new Error('No client ID — cannot save trip.');
    if (formTrip?.id) {
      const amendExtra = isAmending
        ? { note: 'Trip amended', ...(pendingAmendFee?.apply ? { amendmentFee: pendingAmendFee.amount } : {}) }
        : { note: 'Trip details updated' };
      const amendment = makeAmendment(isAmending ? 'amendment' : 'edit', amendExtra);
      await updateTrip(cid, formTrip.id, { ...data, amendments: arrayUnion(amendment) });
      setIsAmending(false);
      setPendingAmendFee(null);
    } else {
      await addTrip(cid, { ...data, createdBy: userProfile?.uid || '' });
    }
    setFormTrip(null);
  };

  const handleStatusChange = async (trip, newStatus, extra = {}) => {
    const cid = resolveClientId(trip);
    const amendment = makeAmendment('status_change', {
      from: trip.status,
      to: newStatus,
      ...(extra.declineReason ? { note: extra.declineReason } : {}),
    });
    await updateTrip(cid, trip.id, { status: newStatus, ...extra, amendments: arrayUnion(amendment) });
  };

  const handleUpdate = async (data) => {
    if (!selectedTrip) return;
    const cid = resolveClientId(selectedTrip);
    await updateTrip(cid, selectedTrip.id, data);
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
    setIsAmending(false);
    setPendingAmendFee(null);
    setFormTrip(trip);
  };

  // Called from TripDetail after the amendment fee prompt
  const openAmend = (trip, feeDecision) => {
    setIsAmending(true);
    setPendingAmendFee(feeDecision); // null = no fee applicable, { apply, amount } = fee decision made
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
          initialStatusFilter={searchParams.get('status') || ''}
        />
      )}

      {view === 'detail' && selectedTrip && (
        <TripDetail
          trip={selectedTrip}
          clientId={resolveClientId(selectedTrip)}
          onBack={() => { setView('list'); setSelected(null); }}
          onEdit={openEdit}
          onAmend={openAmend}
          onStatusChange={handleStatusChange}
          onUpdate={handleUpdate}
        />
      )}

      {/* Create / Edit / Amend modal */}
      {formTrip !== null && (
        <Modal
          title={formTrip?.id
            ? (isAmending ? `Amend — ${formTrip.title || 'trip'}` : `Edit — ${formTrip.title || 'trip'}`)
            : 'New trip'
          }
          onClose={() => { setFormTrip(null); setIsAmending(false); setPendingAmendFee(null); }}
          wide
        >
          <TripForm
            trip={formTrip?.id ? formTrip : null}
            clientId={resolveClientId(formTrip)}
            onSave={handleSave}
            onCancel={() => { setFormTrip(null); setIsAmending(false); setPendingAmendFee(null); }}
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
