import React, { useState, useEffect, useMemo } from 'react';
import { arrayUnion, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import { useTrips } from '../hooks/useTrips';
import TripList from '../components/trips/TripList';
import TripForm from '../components/trips/TripForm';
import TripDetail from '../components/trips/TripDetail';
import Modal from '../components/shared/Modal';
import { useTeamScope, filterTripsByScope } from '../hooks/useTeamScope';

// ── trip diff helpers (module level — no closure dependencies) ───────────────
const SECTOR_LABELS = {
  flight: 'Flight', accommodation: 'Accommodation', 'car-hire': 'Car hire',
  parking: 'Parking', transfers: 'Transfers', meals: 'Meals', other: 'Other',
};

function calcSectorCost(sectors) {
  return (sectors || []).reduce((sum, s) => {
    const c = parseFloat(s.cost) || 0;
    if (s.type === 'accommodation' && s.checkIn && s.checkOut) {
      const nights = Math.max(0, Math.round((new Date(s.checkOut) - new Date(s.checkIn)) / 86400000));
      return sum + c * nights;
    }
    return sum + c;
  }, 0);
}

function diffTrip(oldTrip, newData) {
  const changes = [];

  const fields = [
    ['title', 'Title'], ['tripType', 'Trip type'], ['travellerName', 'Traveller'],
    ['startDate', 'Start date'], ['endDate', 'End date'], ['costCentre', 'Cost centre'],
  ];
  for (const [field, label] of fields) {
    const o = (oldTrip[field] || '').toString().trim();
    const n = (newData[field] || '').toString().trim();
    if (o !== n) {
      if (!o)      changes.push(`${label} set to "${n}"`);
      else if (!n) changes.push(`${label} cleared`);
      else         changes.push(`${label}: "${o}" → "${n}"`);
    }
  }

  if ((oldTrip.purpose || '') !== (newData.purpose || '')) changes.push('Purpose / notes updated');
  if ((oldTrip.internalNotes || '') !== (newData.internalNotes || '')) changes.push('Internal notes updated');

  const countBy = arr => (arr || []).reduce((m, s) => {
    const t = SECTOR_LABELS[s.type] || s.type;
    m[t] = (m[t] || 0) + 1; return m;
  }, {});
  const oldCounts = countBy(oldTrip.sectors);
  const newCounts = countBy(newData.sectors);
  for (const t of new Set([...Object.keys(oldCounts), ...Object.keys(newCounts)])) {
    const diff = (newCounts[t] || 0) - (oldCounts[t] || 0);
    if (diff > 0) changes.push(`${t} sector added${diff > 1 ? ` (×${diff})` : ''}`);
    if (diff < 0) changes.push(`${t} sector removed${Math.abs(diff) > 1 ? ` (×${Math.abs(diff)})` : ''}`);
  }

  const oldCost = calcSectorCost(oldTrip.sectors);
  const newCost = calcSectorCost(newData.sectors);
  if (Math.abs(oldCost - newCost) > 0.005) {
    changes.push(`Est. cost: A$${oldCost.toFixed(2)} → A$${newCost.toFixed(2)}`);
  }

  return changes;
}

export default function TravelManagement() {
  const { userProfile } = useAuth();
  const { clientId, isSTX, clientConfig, activeClientId, activeClientConfig } = useTenant();

  const { trips: allTrips, loading, addTrip, updateTrip, deleteTrip } = useTrips(clientId, isSTX, activeClientId);

  const effectiveClientId = activeClientId || clientId;
  const scope = useTeamScope(userProfile, effectiveClientId);
  const trips = useMemo(() => filterTripsByScope(allTrips, scope, userProfile), [allTrips, scope, userProfile]);

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

  // For STX users with an active client selected, prefer activeClientId for new trips
  const resolveClientId = (trip) => trip?.clientId || activeClientId || clientId || '';

  // Load the fee config for a given client
  const getClientFeeConfig = async (cid) => {
    if (!isSTX) return clientConfig?.fees || {};
    // Use already-loaded active client config if available
    if (activeClientConfig) return activeClientConfig.fees || {};
    try {
      const snap = await getDoc(doc(db, 'clients', cid, 'config', 'settings'));
      return snap.exists() ? (snap.data()?.fees || {}) : {};
    } catch {
      return {};
    }
  };

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
      // Editing or amending an existing trip
      const changes = diffTrip(formTrip, data);
      const amendExtra = isAmending
        ? { note: 'Trip amended', changes, ...(pendingAmendFee?.apply ? { amendmentFee: pendingAmendFee.amount } : {}) }
        : { note: 'Trip details updated', changes };
      const amendment = makeAmendment(isAmending ? 'amendment' : 'edit', amendExtra);
      const updateData = { ...data, amendments: arrayUnion(amendment) };

      // If the user confirmed the amendment fee, add it to trip.fees[]
      if (isAmending && pendingAmendFee?.apply) {
        updateData.fees = arrayUnion({
          type: 'amendment',
          label: 'Amendment Fee',
          amount: pendingAmendFee.amount,
          gstRate: pendingAmendFee.gstRate || 0.1,
          appliedAt: new Date().toISOString(),
          appliedBy: userProfile?.uid || '',
          appliedByName: [userProfile?.firstName, userProfile?.lastName].filter(Boolean).join(' ') || userProfile?.email || '',
        });
      }

      await updateTrip(cid, formTrip.id, updateData);
      setIsAmending(false);
      setPendingAmendFee(null);
    } else {
      // Creating a new trip — auto-apply management fee if configured
      const feeConfig = await getClientFeeConfig(cid);
      const tripFees = [];
      if (feeConfig.managementFeeEnabled && (feeConfig.managementFeeAmount || 0) > 0) {
        const appliesTo = feeConfig.managementFeeAppliesTo || [];
        if (appliesTo.length === 0 || appliesTo.includes(data.tripType)) {
          tripFees.push({
            type: 'management',
            label: feeConfig.managementFeeLabel || 'Management Fee',
            amount: feeConfig.managementFeeAmount,
            gstRate: feeConfig.gstRate || 0.1,
            appliedAt: new Date().toISOString(),
            appliedBy: 'system',
            appliedByName: 'Auto-applied',
          });
        }
      }
      await addTrip(cid, {
        ...data,
        createdBy: userProfile?.uid || '',
        ...(tripFees.length > 0 ? { fees: tripFees } : {}),
      });
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
