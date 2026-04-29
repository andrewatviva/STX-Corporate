import React, { useState, useEffect, useMemo } from 'react';
import { arrayUnion, doc, getDoc, addDoc, collection } from 'firebase/firestore';
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

function sectorGross(s) {
  return parseFloat(s.cost) || 0;
}

function calcSectorCost(sectors) {
  return (sectors || []).reduce((sum, s) => sum + sectorGross(s), 0);
}

function str(v) { return (v || '').toString().trim(); }
function fmtChange(label, o, n) {
  if (!o) return `${label} set to "${n}"`;
  if (!n) return `${label} cleared`;
  return `${label}: "${o}" → "${n}"`;
}

function diffTrip(oldTrip, newData) {
  const changes = [];

  // ── Top-level fields ──────────────────────────────────────────────────────
  const topFields = [
    ['title',           'Title'],
    ['tripType',        'Trip type'],
    ['travellerName',   'Traveller'],
    ['startDate',       'Start date'],
    ['endDate',         'End date'],
    ['costCentre',      'Cost centre'],
    ['originCity',      'Origin city'],
    ['destinationCity', 'Destination city'],
  ];
  for (const [field, label] of topFields) {
    const o = str(oldTrip[field]);
    const n = str(newData[field]);
    if (o !== n) changes.push(fmtChange(label, o, n));
  }
  if (str(oldTrip.purpose)       !== str(newData.purpose))       changes.push('Purpose / notes updated');
  if (str(oldTrip.internalNotes) !== str(newData.internalNotes)) changes.push('Internal notes updated');

  // ── Sector count changes ──────────────────────────────────────────────────
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

  // ── Field-level changes within existing sectors (index-matched) ───────────
  const oldS = oldTrip.sectors || [];
  const newS = newData.sectors || [];
  const minLen = Math.min(oldS.length, newS.length);

  for (let i = 0; i < minLen; i++) {
    const o = oldS[i];
    const n = newS[i];
    if (o.type !== n.type) continue; // type swap is captured as add/remove above

    const lbl = SECTOR_LABELS[o.type] || o.type;

    // Cost change for this sector
    const oCost = sectorGross(o);
    const nCost = sectorGross(n);
    if (Math.abs(oCost - nCost) > 0.005) {
      changes.push(`${lbl} cost: A$${oCost.toFixed(2)} → A$${nCost.toFixed(2)}`);
    }

    if (o.type === 'flight') {
      const oRoute = `${str(o.from)} → ${str(o.to)}`;
      const nRoute = `${str(n.from)} → ${str(n.to)}`;
      if (oRoute !== nRoute)                           changes.push(`Flight route: ${oRoute} → ${nRoute}`);
      if (str(o.date)         !== str(n.date))         changes.push(`Flight date: ${str(o.date) || '—'} → ${str(n.date) || '—'}`);
      if (str(o.airline)      !== str(n.airline))      changes.push(fmtChange('Airline',       str(o.airline),      str(n.airline)));
      if (str(o.flightNumber) !== str(n.flightNumber)) changes.push(fmtChange('Flight number', str(o.flightNumber), str(n.flightNumber)));
      if (str(o.cabinClass)   !== str(n.cabinClass))   changes.push(fmtChange('Cabin class',   str(o.cabinClass),   str(n.cabinClass)));
    }

    if (o.type === 'accommodation') {
      if (str(o.propertyName) !== str(n.propertyName)) changes.push(fmtChange('Property',    str(o.propertyName), str(n.propertyName)));
      if (str(o.checkIn)      !== str(n.checkIn))      changes.push(`Check-in: ${str(o.checkIn) || '—'} → ${str(n.checkIn) || '—'}`);
      if (str(o.checkOut)     !== str(n.checkOut))      changes.push(`Check-out: ${str(o.checkOut) || '—'} → ${str(n.checkOut) || '—'}`);
      const oCity = str(o.reportingCity) || '(trip destination)';
      const nCity = str(n.reportingCity) || '(trip destination)';
      if (oCity !== nCity) changes.push(`Accommodation reporting city: ${oCity} → ${nCity}`);
    }

    if (o.type === 'car-hire') {
      const oRoute = `${str(o.pickupLocation)} → ${str(o.dropOffLocation)}`;
      const nRoute = `${str(n.pickupLocation)} → ${str(n.dropOffLocation)}`;
      if (oRoute !== nRoute) changes.push(`Car hire route: ${oRoute} → ${nRoute}`);
      if (str(o.vehicleType) !== str(n.vehicleType)) changes.push(fmtChange('Vehicle type', str(o.vehicleType), str(n.vehicleType)));
    }

    if (o.type === 'parking') {
      if (str(o.facility) !== str(n.facility)) changes.push(fmtChange('Parking facility', str(o.facility), str(n.facility)));
    }

    if (o.type === 'transfers') {
      if (str(o.transferType) !== str(n.transferType)) changes.push(fmtChange('Transfer type', str(o.transferType), str(n.transferType)));
    }
  }

  // ── Overall cost summary (only when no per-sector cost change was logged) ──
  const oldTotal = calcSectorCost(oldTrip.sectors);
  const newTotal = calcSectorCost(newData.sectors);
  if (Math.abs(oldTotal - newTotal) > 0.005 && !changes.some(c => c.includes(' cost:'))) {
    changes.push(`Est. cost: A$${oldTotal.toFixed(2)} → A$${newTotal.toFixed(2)}`);
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
      const { costCentreChangeReason, ...tripData } = data;
      const changes = diffTrip(formTrip, tripData);

      // Collect fees to add in one arrayUnion call
      const feesToAdd = [];

      // Amendment fee (if STX confirmed it)
      if (isAmending && pendingAmendFee?.apply) {
        feesToAdd.push({
          type: 'amendment',
          label: 'Amendment Fee',
          amount: pendingAmendFee.amount,
          gstRate: pendingAmendFee.gstRate || 0.1,
          appliedAt: new Date().toISOString(),
          appliedBy: userProfile?.uid || '',
          appliedByName: [userProfile?.firstName, userProfile?.lastName].filter(Boolean).join(' ') || userProfile?.email || '',
        });
      }

      // Auto-apply management fee when trip type changes to one that qualifies
      let autoFeeNote = '';
      const oldType = (formTrip.tripType || '').toString();
      const newType = (tripData.tripType || '').toString();
      if (oldType !== newType) {
        const feeConfig = await getClientFeeConfig(cid);
        if (feeConfig.managementFeeEnabled && (feeConfig.managementFeeAmount || 0) > 0) {
          const appliesTo = feeConfig.managementFeeAppliesTo || [];
          const newQualifies = appliesTo.length === 0 || appliesTo.includes(newType);
          const alreadyHasMgmtFee = (formTrip.fees || []).some(f => f.type === 'management' && !f.waived);
          if (newQualifies && !alreadyHasMgmtFee) {
            feesToAdd.push({
              type: 'management',
              label: feeConfig.managementFeeLabel || 'Management Fee',
              amount: feeConfig.managementFeeAmount,
              gstRate: feeConfig.gstRate || 0.1,
              appliedAt: new Date().toISOString(),
              appliedBy: 'system',
              appliedByName: 'Auto-applied (trip type change)',
            });
            autoFeeNote = 'Management fee auto-applied';
          }
        }
      }

      // Build amendment note
      const noteParts = [isAmending ? 'Trip amended' : 'Trip details updated'];
      if (costCentreChangeReason?.trim()) noteParts.push(`Cost centre change reason: ${costCentreChangeReason.trim()}`);
      if (autoFeeNote) noteParts.push(autoFeeNote);
      const note = noteParts.join(' · ');

      const amendExtra = isAmending
        ? { note, changes, ...(pendingAmendFee?.apply ? { amendmentFee: pendingAmendFee.amount } : {}) }
        : { note, changes };
      const amendment = makeAmendment(isAmending ? 'amendment' : 'edit', amendExtra);
      const updateData = { ...tripData, amendments: arrayUnion(amendment) };

      if (feesToAdd.length > 0) {
        updateData.fees = arrayUnion(...feesToAdd);
      }

      await updateTrip(cid, formTrip.id, updateData);

      // Email travellers when digital itinerary link is first added
      const oldLink = (formTrip.digitalItineraryLink || '').trim();
      const newLink = (tripData.digitalItineraryLink || '').trim();
      if (!oldLink && newLink) {
        const now = new Date().toISOString();
        const travellers = [
          { name: tripData.travellerName, uid: tripData.travellerId },
          ...(tripData.additionalPassengers || []).map(p => ({ name: p.name, uid: p.passengerId })),
        ].filter(t => t.uid);
        await Promise.all(travellers.map(t =>
          addDoc(collection(db, 'emailQueue'), {
            status: 'pending', createdAt: now, scheduledFor: now,
            type: 'trip_itinerary_added',
            clientId: cid, tripId: formTrip.id, tripTitle: tripData.title || formTrip.title,
            recipientId: t.uid,
            travellerName: t.name,
            digitalItineraryLink: newLink,
          })
        ));
      }

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
      const { costCentreChangeReason: _ignored, ...newTripData } = data;
      await addTrip(cid, {
        ...newTripData,
        createdBy: userProfile?.uid || '',
        ...(tripFees.length > 0 ? { fees: tripFees } : {}),
      });
    }
    setFormTrip(null);
  };

  const handleStatusChange = async (trip, newStatus, extra = {}) => {
    const cid = resolveClientId(trip);
    const note = extra.declineReason || extra.cancellationReason || undefined;
    const amendment = makeAmendment('status_change', {
      from: trip.status,
      to: newStatus,
      ...(note ? { note } : {}),
    });
    const updateFields = { status: newStatus, ...extra, amendments: arrayUnion(amendment) };
    if (newStatus === 'cancelled') updateFields.cancelledAt = new Date().toISOString();
    await updateTrip(cid, trip.id, updateFields);
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
