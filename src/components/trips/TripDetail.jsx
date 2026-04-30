import React, { useState, useEffect } from 'react';
import {
  ArrowLeft, Edit2, CheckCircle, XCircle, Ban, Send,
  Plane, Hotel, Car, ParkingSquare, ArrowLeftRight, UtensilsCrossed, MoreHorizontal,
  Lock, Clock, Trash2, Receipt, Star, AlertTriangle,
} from 'lucide-react';
import { doc, getDoc, arrayRemove, arrayUnion, collection, addDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import { StatusBadge, getDisplayStatus, leadTimeDays, LeadTimeBadge } from './TripList';
import Attachments from './Attachments';
import TripRatingModal from './TripRatingModal';

const SECTOR_ICONS = {
  flight:        Plane,
  accommodation: Hotel,
  'car-hire':    Car,
  parking:       ParkingSquare,
  transfers:     ArrowLeftRight,
  meals:         UtensilsCrossed,
  other:         MoreHorizontal,
};

const SECTOR_LABELS = {
  flight:        'Flight',
  accommodation: 'Accommodation',
  'car-hire':    'Car Hire',
  parking:       'Parking',
  transfers:     'Transfers',
  meals:         'Meals',
  other:         'Other',
};

function fmt(val) {
  return val || '—';
}

function fmtStatus(s) {
  return (s || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function Row({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex gap-2">
      <span className="text-xs text-gray-400 w-32 shrink-0">{label}</span>
      <span className="text-xs text-gray-700">{value}</span>
    </div>
  );
}

function SectorCard({ sector, index }) {
  const Icon = SECTOR_ICONS[sector.type] || MoreHorizontal;
  const label = SECTOR_LABELS[sector.type] || sector.type;

  const rows = [];

  if (sector.type === 'flight') {
    rows.push(
      <Row key="route" label="Route" value={[sector.from, sector.to].filter(Boolean).join(' → ') || null} />,
      <Row key="date" label="Date" value={sector.date} />,
      <Row key="dep" label="Departure" value={sector.departureTime} />,
      <Row key="arr" label="Arrival" value={sector.arrivalTime} />,
      <Row key="airline" label="Airline" value={sector.airline} />,
      <Row key="flt" label="Flight" value={sector.flightNumber} />,
      <Row key="ref" label="Booking ref" value={sector.bookingRef} />,
      <Row key="class" label="Class" value={sector.cabinClass} />,
    );
  } else if (sector.type === 'accommodation') {
    const nights = sector.checkIn && sector.checkOut
      ? Math.max(0, Math.round((new Date(sector.checkOut) - new Date(sector.checkIn)) / 86400000))
      : null;
    rows.push(
      <Row key="name" label="Property" value={sector.propertyName} />,
      <Row key="in" label="Check-in" value={sector.checkIn} />,
      <Row key="out" label="Check-out" value={sector.checkOut} />,
      nights != null && <Row key="nights" label="Nights" value={String(nights)} />,
      <Row key="room" label="Room type" value={sector.roomType} />,
      <Row key="ref" label="Booking ref" value={sector.bookingRef} />,
      sector.reportingCity && <Row key="rcity" label="Reporting city" value={`${sector.reportingCity} (override)`} />,
    );
  } else if (sector.type === 'car-hire') {
    rows.push(
      <Row key="co" label="Company" value={sector.company} />,
      <Row key="pu" label="Pickup" value={`${sector.pickupLocation || ''}${sector.pickupDate ? ` · ${sector.pickupDate}` : ''}`} />,
      <Row key="do" label="Drop-off" value={`${sector.dropOffLocation || ''}${sector.dropOffDate ? ` · ${sector.dropOffDate}` : ''}`} />,
      <Row key="veh" label="Vehicle" value={sector.vehicleType} />,
      <Row key="ref" label="Booking ref" value={sector.bookingRef} />,
    );
  } else if (sector.type === 'parking') {
    rows.push(
      <Row key="fac" label="Facility" value={sector.facility} />,
      <Row key="entry" label="Entry" value={sector.entryDate} />,
      <Row key="exit" label="Exit" value={sector.exitDate} />,
      <Row key="ref" label="Booking ref" value={sector.bookingRef} />,
    );
  } else if (sector.type === 'transfers') {
    rows.push(
      <Row key="route" label="Route" value={[sector.from, sector.to].filter(Boolean).join(' → ') || null} />,
      <Row key="date" label="Date" value={sector.date} />,
      <Row key="time" label="Pickup time" value={sector.pickupTime} />,
      <Row key="type" label="Transfer type" value={sector.transferType} />,
      <Row key="prov" label="Provider" value={sector.provider} />,
    );
  } else if (sector.type === 'meals') {
    rows.push(
      <Row key="venue" label="Venue" value={sector.venue} />,
      <Row key="date" label="Date" value={sector.date} />,
      <Row key="meal" label="Meal type" value={sector.mealType} />,
      <Row key="pax" label="People" value={sector.numberOfPeople ? String(sector.numberOfPeople) : null} />,
    );
  } else {
    rows.push(
      <Row key="desc" label="Description" value={sector.description} />,
      <Row key="prov" label="Provider" value={sector.provider} />,
      <Row key="date" label="Date" value={sector.date} />,
    );
  }

  const cost = (() => {
    const c = parseFloat(sector.cost) || 0;
    if (!c) return null;
    return `A$${c.toFixed(2)}`;
  })();

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-200">
        <span className="text-xs text-gray-400 w-5">{index + 1}</span>
        <Icon size={14} className="text-gray-400" />
        <span className="text-xs font-semibold text-gray-700">{label}</span>
        {sector.international && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-sky-100 text-sky-700">
            International · GST-free
          </span>
        )}
        {cost && <span className="ml-auto text-xs text-gray-500">{cost}</span>}
      </div>
      <div className="px-4 py-3 space-y-1.5">
        {rows.filter(Boolean)}
        {sector.notes && (
          <div className="flex gap-2 pt-1">
            <span className="text-xs text-gray-400 w-32 shrink-0">Notes</span>
            <span className="text-xs text-gray-600 italic">{sector.notes}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function TripDetail({ trip, clientId, onBack, onEdit, onAmend, onStatusChange, onUpdate }) {
  const { userProfile } = useAuth();
  const { isSTX, clientConfig } = useTenant();
  const [acting, setActing] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [showDeclineInput, setShowDeclineInput] = useState(false);
  const [showAmendPrompt, setShowAmendPrompt] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelBillableSectors, setCancelBillableSectors] = useState(new Set());
  // For STX users: load the trip's client config (fees + cost centres)
  const [tripClientFees, setTripClientFees]               = useState(null);
  const [tripClientCostCentres, setTripClientCostCentres] = useState([]);
  const [feeConfigLoading, setFeeConfigLoading]           = useState(isSTX && !!clientId);
  useEffect(() => {
    if (!isSTX || !clientId) return;
    setFeeConfigLoading(true);
    getDoc(doc(db, 'clients', clientId, 'config', 'settings'))
      .then(snap => {
        const data = snap.exists() ? snap.data() : null;
        setTripClientFees(data?.fees ?? null);
        setTripClientCostCentres(data?.dropdowns?.costCentres || []);
      })
      .catch(() => {})
      .finally(() => setFeeConfigLoading(false));
  }, [isSTX, clientId]);

  const costCentres = isSTX ? tripClientCostCentres : (clientConfig?.dropdowns?.costCentres || []);

  // Inline cost centre edit state
  const [showCCEdit, setShowCCEdit] = useState(false);
  const [newCC, setNewCC]           = useState('');
  const [ccReason, setCCReason]     = useState('');
  const [ccSaving, setCCSaving]     = useState(false);

  const handleCostCentreChange = async () => {
    if (!ccReason.trim()) return;
    setCCSaving(true);
    try {
      await onUpdate({
        costCentre: newCC,
        amendments: arrayUnion({
          at:     new Date().toISOString(),
          by:     userProfile?.uid || '',
          byName: [userProfile?.firstName, userProfile?.lastName].filter(Boolean).join(' ') || userProfile?.email || '',
          type:   'edit',
          note:   `Cost centre change reason: ${ccReason.trim()}`,
          changes: [`Cost centre: "${trip.costCentre || '(none)'}" → "${newCC || '(none)'}"` ],
        }),
      });
      setShowCCEdit(false);
      setCCReason('');
    } finally {
      setCCSaving(false);
    }
  };

  // Provider rating state
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [existingRating, setExistingRating]   = useState(null);
  const [ratingLoaded, setRatingLoaded]       = useState(false);

  useEffect(() => {
    if (!userProfile?.uid || !trip?.id) return;
    const docId = `${trip.id}_${userProfile.uid}`;
    getDoc(doc(db, 'tripFeedback', docId))
      .then(snap => setExistingRating(snap.exists() ? snap.data() : null))
      .catch(() => {})
      .finally(() => setRatingLoaded(true));
  }, [trip?.id, userProfile?.uid]);

  const role = userProfile?.role;
  const canEdit = ['stx_admin', 'stx_ops', 'client_ops', 'client_traveller'].includes(role);
  const canEditCostCentre = ['stx_admin', 'stx_ops', 'client_ops'].includes(role);

  // Determine if this user can approve THIS specific trip.
  // client_approver respects their approveFor list (empty = all).
  const isApprover = (() => {
    if (['stx_admin', 'stx_ops'].includes(role)) return true;
    if (role !== 'client_approver') return false;
    const approveFor = userProfile?.approveFor || [];
    if (approveFor.length === 0) return true;
    // Check by travellerId (preferred) then by travellerName
    if (trip.travellerId) return approveFor.includes(trip.travellerId);
    return false; // can't determine without travellerId — don't show button
  })();
  // client_ops and client_approver can book self-managed trips on behalf of travellers
  const canBook = ['stx_admin', 'stx_ops', 'client_ops', 'client_approver', 'client_traveller'].includes(role);

  // Amendment fee: STX users use the trip's client config, client users use their own
  const isDraftOrDeclined = ['draft', 'declined'].includes(trip.status);
  const feeConfig = isSTX ? tripClientFees : clientConfig?.fees;
  const amendFeeAmount  = feeConfig?.amendmentFeeAmount || 0;
  const amendFeeGST     = parseFloat((amendFeeAmount * (1 + (feeConfig?.gstRate ?? 0.1))).toFixed(2));
  const amendFeeAppliesTo = feeConfig?.amendmentFeeAppliesTo || [];
  const amendmentFeeApplies = !isDraftOrDeclined
    && feeConfig?.amendmentFeeEnabled
    && amendFeeAmount > 0
    && (amendFeeAppliesTo.length === 0 || amendFeeAppliesTo.includes(trip.tripType));

  const act = async (newStatus, extra = {}) => {
    setActing(true);
    try {
      await onStatusChange(trip, newStatus, extra);

      const now       = new Date().toISOString();
      const tripId    = trip.id;
      const tripTitle = trip.title || '';
      const cid       = clientId || '';

      const queue = (doc) => addDoc(collection(db, 'emailQueue'), {
        status: 'pending', createdAt: now, clientId: cid, tripId, tripTitle, ...doc,
      });

      if (newStatus === 'pending_approval') {
        // Notify all approvers for this traveller
        await queue({
          type:          'trip_submitted',
          travellerId:   trip.travellerId || '',
          travellerName: trip.travellerName || '',
          scheduledFor:  now,
        });
      }

      if (newStatus === 'approved') {
        // Notify creator (if not STX) + traveller
        await queue({
          type:          'trip_approved',
          recipientId:   trip.createdBy   || '',
          travellerId:   trip.travellerId || '',
          scheduledFor:  now,
        });
      }

      if (newStatus === 'declined') {
        // Notify creator (if not STX) + traveller, with decline reason
        await queue({
          type:          'trip_declined',
          recipientId:   trip.createdBy   || '',
          travellerId:   trip.travellerId || '',
          declineReason: extra.declineReason || '',
          scheduledFor:  now,
        });
      }

      if (newStatus === 'cancelled' && !isSTX) {
        await queue({
          type:             'trip_cancelled_by_client',
          cancellationReason: extra.cancellationReason || '',
          cancelledByName:  [userProfile?.firstName, userProfile?.lastName].filter(Boolean).join(' ') || userProfile?.email || '',
          scheduledFor:     now,
        });
      }

      if (newStatus === 'booked') {
        const travellers = [
          { name: trip.travellerName, uid: trip.travellerId },
          ...(trip.additionalPassengers || []).map(p => ({ name: p.name, uid: p.passengerId })),
        ].filter(t => t.uid);

        // Booking confirmation to each traveller
        await Promise.all(travellers.map(t => queue({
          type:          'trip_booked',
          recipientId:   t.uid,
          travellerName: t.name,
          scheduledFor:  now,
        })));

        // Also notify the trip creator if they're not one of the travellers
        // (Cloud Function skips STX staff automatically)
        const travellerUids = new Set(travellers.map(t => t.uid));
        if (trip.createdBy && !travellerUids.has(trip.createdBy)) {
          await queue({
            type:          'trip_booked',
            recipientId:   trip.createdBy,
            travellerName: trip.travellerName || '',
            scheduledFor:  now,
          });
        }

        // Pre-departure reminder 3 days before start date
        if (trip.startDate) {
          const preDeparture = new Date(trip.startDate);
          preDeparture.setDate(preDeparture.getDate() - 3);
          await Promise.all(travellers.map(t => queue({
            type:                  'trip_pre_departure',
            recipientId:           t.uid,
            travellerName:         t.name,
            digitalItineraryLink:  trip.digitalItineraryLink || '',
            scheduledFor:          preDeparture.toISOString(),
          })));
        }

        // Rating request emails 2 days after trip end date
        if (trip.endDate) {
          const ratingDate = new Date(trip.endDate);
          ratingDate.setDate(ratingDate.getDate() + 2);
          await Promise.all(travellers.map(t => queue({
            type:          'trip_rating_request',
            travellerId:   t.uid,
            travellerName: t.name,
            scheduledFor:  ratingDate.toISOString(),
          })));
        }
      }
    } finally {
      setActing(false);
      setShowDeclineInput(false);
      setDeclineReason('');
    }
  };

  const sectorCostInclGST = (trip.sectors || []).reduce((sum, s) => sum + (parseFloat(s.cost) || 0), 0);
  const feesInclGST = (trip.fees || []).reduce((sum, f) => sum + (parseFloat(f.amount) || 0) * (1 + (f.gstRate ?? 0.1)), 0);
  const totalCost = sectorCostInclGST + feesInclGST;

  const sectorCostExGST = (trip.sectors || []).reduce((sum, s) => {
    const c = parseFloat(s.cost) || 0;
    return sum + (s.international ? c : c / 1.1);
  }, 0);
  const feesExGST = (trip.fees || []).reduce((sum, f) => sum + (parseFloat(f.amount) || 0), 0);
  const totalExGST = sectorCostExGST + feesExGST;

  const handleDeleteFee = async (fee) => {
    const feeLabel = fee.label || (fee.type === 'amendment' ? 'Amendment fee' : 'Management fee');
    await onUpdate({
      fees: arrayRemove(fee),
      amendments: arrayUnion({
        at: new Date().toISOString(),
        by: userProfile?.uid || '',
        byName: [userProfile?.firstName, userProfile?.lastName].filter(Boolean).join(' ') || userProfile?.email || '',
        type: 'fee_removed',
        note: 'Fee removed',
        changes: [`${feeLabel} removed (A$${(fee.amount || 0).toFixed(2)} ex-GST)`],
      }),
    });
  };

  return (
    <div>
      {/* Back + actions header */}
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft size={15} /> Back to trips
        </button>
        <div className="ml-auto flex items-center gap-2">
          {/* Rate providers — booked trips, any traveller */}
          {trip.status === 'booked' && ratingLoaded && (
            <button
              onClick={() => setShowRatingModal(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                existingRating
                  ? 'border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100'
                  : 'border-teal-300 text-teal-700 bg-teal-50 hover:bg-teal-100'
              }`}
            >
              <Star size={13} fill={existingRating ? 'currentColor' : 'none'} />
              {existingRating ? 'Update rating' : 'Rate providers'}
            </button>
          )}

          {/* Draft/Declined → plain Edit; submitted/approved/booked → Amend (with fee prompt) */}
          {canEdit && trip.status !== 'cancelled' && isDraftOrDeclined && (
            <button
              onClick={() => onEdit(trip)}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-sm rounded-lg hover:bg-gray-50"
            >
              <Edit2 size={13} /> Edit
            </button>
          )}
          {canEdit && trip.status !== 'cancelled' && !isDraftOrDeclined && (
            <button
              onClick={() => setShowAmendPrompt(true)}
              disabled={feeConfigLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              <Edit2 size={13} /> Amend
            </button>
          )}

          {/* Submit — draft only, by creator/ops */}
          {canEdit && trip.status === 'draft' && (
            <button
              onClick={() => {
                const byType = clientConfig?.workflow?.approvalByTripType;
                const needsApproval = (byType && trip.tripType in byType)
                  ? byType[trip.tripType]
                  : clientConfig?.workflow?.requiresApproval !== false;
                act(needsApproval ? 'pending_approval' : 'approved');
              }}
              disabled={acting}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <Send size={13} /> Submit for approval
            </button>
          )}

          {/* Approve + Decline — pending_approval */}
          {isApprover && trip.status === 'pending_approval' && !showDeclineInput && (
            <>
              <button
                onClick={() => act('approved')}
                disabled={acting}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                <CheckCircle size={13} /> Approve
              </button>
              <button
                onClick={() => setShowDeclineInput(true)}
                disabled={acting}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                <XCircle size={13} /> Decline
              </button>
            </>
          )}

          {/* Mark as Booked — approved trips only.
              STX can always book any trip type.
              client_ops, client_approver, client_traveller can book self-managed trips only. */}
          {trip.status === 'approved' && (isSTX || (canBook && trip.tripType?.toLowerCase() === 'self-managed')) && (
            <button
              onClick={() => act('booked')}
              disabled={acting}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              <CheckCircle size={13} /> Mark as booked
            </button>
          )}

          {/* Cancel — STX always, client_ops for their client's trips */}
          {['approved', 'booked'].includes(trip.status) && (isSTX || role === 'client_ops') && !showCancelModal && (
            <button
              onClick={() => { setCancelReason(''); setCancelBillableSectors(new Set()); setShowCancelModal(true); }}
              disabled={acting}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-sm rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              <Ban size={13} /> Cancel trip
            </button>
          )}
        </div>
      </div>

      {/* Policy variance breach notice */}
      {trip.policyVarianceBreached && (trip.varianceBreaches || []).length > 0 && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={15} className="text-red-600 shrink-0" />
            <p className="text-sm font-semibold text-red-800">Policy variance exceeded</p>
          </div>
          <div className="space-y-1 mb-2">
            {(trip.varianceBreaches || []).map((b, i) => (
              <p key={i} className="text-xs text-gray-700 pl-5">
                <span className="font-medium">{b.label}</span>
                {b.city && ` (${b.city})`}:
                {' '}A${(b.cost || 0).toFixed(2)} {b.unit} vs policy A${(b.policyRate || 0).toFixed(2)}
                {' '}— <span className="font-medium">{(b.excessPct || 0) > 0 ? '+' : ''}{(b.excessPct || 0).toFixed(1)}% over policy</span>
                {' '}(threshold A${(b.threshold || 0).toFixed(2)})
              </p>
            ))}
          </div>
          {trip.status === 'pending_approval' && (
            <p className="text-xs text-red-700 pl-5 font-medium">
              This trip requires explicit approval to proceed due to the policy variance above.
            </p>
          )}
        </div>
      )}

      {/* Amend prompt — fee decision before opening form */}
      {showAmendPrompt && (
        <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm font-medium text-amber-800 mb-2">Amend trip</p>
          {amendmentFeeApplies ? (
            <p className="text-sm text-amber-700 mb-3">
              An amendment fee of <strong>A${amendFeeAmount.toFixed(2)} ex-GST</strong> (A${amendFeeGST.toFixed(2)} inc. GST)
              applies to <strong>{trip.tripType}</strong> trips. Would you like to include it?
            </p>
          ) : (
            <p className="text-sm text-amber-700 mb-3">
              This will open the trip for editing. The change will be recorded in the trip history.
            </p>
          )}
          <div className="flex gap-2 flex-wrap">
            {amendmentFeeApplies ? (
              <>
                <button
                  onClick={() => { setShowAmendPrompt(false); onAmend(trip, { apply: true, amount: amendFeeAmount, gstRate: feeConfig?.gstRate ?? 0.1 }); }}
                  className="px-3 py-1.5 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700"
                >
                  Include fee (A${amendFeeAmount.toFixed(2)})
                </button>
                <button
                  onClick={() => { setShowAmendPrompt(false); onAmend(trip, { apply: false, amount: amendFeeAmount, gstRate: feeConfig?.gstRate ?? 0.1 }); }}
                  className="px-3 py-1.5 border border-amber-400 text-amber-800 text-sm rounded-lg hover:bg-amber-100"
                >
                  Waive fee
                </button>
              </>
            ) : (
              <button
                onClick={() => { setShowAmendPrompt(false); onAmend(trip, null); }}
                className="px-3 py-1.5 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700"
              >
                Continue
              </button>
            )}
            <button
              onClick={() => setShowAmendPrompt(false)}
              className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Decline reason input */}
      {showDeclineInput && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm font-medium text-red-700 mb-2">Decline reason</p>
          <textarea
            className="w-full border border-red-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
            rows={2}
            value={declineReason}
            onChange={e => setDeclineReason(e.target.value)}
            placeholder="Reason for declining (optional but recommended)"
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => act('declined', { declineReason })}
              disabled={acting}
              className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              Confirm decline
            </button>
            <button
              onClick={() => { setShowDeclineInput(false); setDeclineReason(''); }}
              className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Cancel modal */}
      {showCancelModal && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm font-medium text-red-800 mb-1">Cancel trip</p>
          <p className="text-sm text-red-700 mb-3">
            {isSTX
              ? 'Provide a reason and select any non-refundable items that still need to be invoiced.'
              : 'Provide a reason for cancellation. STX will be notified to review for any invoicing.'}
          </p>
          <textarea
            className="w-full border border-red-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 mb-3"
            rows={2}
            value={cancelReason}
            onChange={e => setCancelReason(e.target.value)}
            placeholder="Reason for cancellation (required)"
          />

          {/* STX only: sector billability checklist */}
          {isSTX && (trip.sectors || []).some(s => parseFloat(s.cost) > 0) && (
            <div className="mb-3">
              <p className="text-xs font-semibold text-red-700 mb-2 uppercase tracking-wide">
                Non-refundable items to invoice:
              </p>
              <div className="space-y-2">
                {(trip.sectors || []).map((s, i) => {
                  const cost = parseFloat(s.cost);
                  if (!cost) return null;
                  const label = SECTOR_LABELS[s.type] || s.type;
                  const summary = s.type === 'flight'
                    ? [s.from, s.to].filter(Boolean).join(' → ')
                    : s.type === 'accommodation'
                    ? s.propertyName || ''
                    : s.type === 'car-hire'
                    ? [s.pickupLocation, s.dropOffLocation].filter(Boolean).join(' → ')
                    : '';
                  return (
                    <label key={i} className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={cancelBillableSectors.has(i)}
                        onChange={e => {
                          const next = new Set(cancelBillableSectors);
                          if (e.target.checked) next.add(i); else next.delete(i);
                          setCancelBillableSectors(next);
                        }}
                        className="mt-0.5 accent-red-600"
                      />
                      <span className="text-sm text-gray-700">
                        <span className="font-medium">{label}</span>
                        {summary && <span className="text-gray-500"> — {summary}</span>}
                        <span className="text-gray-500 ml-1">A${cost.toFixed(2)}</span>
                      </span>
                    </label>
                  );
                }).filter(Boolean)}
              </div>
              {cancelBillableSectors.size > 0 && (
                <p className="text-xs text-gray-500 mt-2">
                  {cancelBillableSectors.size} item{cancelBillableSectors.size !== 1 ? 's' : ''} will be flagged for invoicing.
                </p>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={async () => {
                await act('cancelled', {
                  cancellationReason: cancelReason.trim(),
                  ...(isSTX && cancelBillableSectors.size > 0
                    ? { billableSectorIndices: [...cancelBillableSectors].sort((a, b) => a - b) }
                    : {}),
                });
                setShowCancelModal(false);
              }}
              disabled={!cancelReason.trim() || acting}
              className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {acting ? 'Cancelling…' : 'Confirm cancellation'}
            </button>
            <button
              onClick={() => setShowCancelModal(false)}
              className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
            >
              Keep trip
            </button>
          </div>
        </div>
      )}

      {/* Trip header card */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">{trip.title || '—'}</h2>
            {trip.declineReason && trip.status === 'declined' && (
              <p className="text-sm text-red-600 mt-1">Declined: {trip.declineReason}</p>
            )}
            {trip.cancellationReason && trip.status === 'cancelled' && (
              <p className="text-sm text-gray-500 mt-1">Cancelled: {trip.cancellationReason}</p>
            )}
          </div>
          <StatusBadge status={getDisplayStatus(trip)} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
          {trip.tripRef && (
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Reference</p>
              <p className="text-gray-800 font-mono text-sm">{trip.tripRef}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Traveller</p>
            <p className="text-gray-800">{fmt(trip.travellerName)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Trip type</p>
            <p className="text-gray-800">{fmt(trip.tripType)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Cost centre</p>
            {showCCEdit ? (
              <div className="space-y-2 mt-1 col-span-2">
                <select
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={newCC}
                  onChange={e => setNewCC(e.target.value)}
                >
                  <option value="">Not set</option>
                  {costCentres.map(c => <option key={c}>{c}</option>)}
                </select>
                <textarea
                  rows={2}
                  className="w-full border border-amber-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="Reason for change (required)…"
                  value={ccReason}
                  onChange={e => setCCReason(e.target.value)}
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleCostCentreChange}
                    disabled={ccSaving || !ccReason.trim()}
                    className="px-3 py-1 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {ccSaving ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    onClick={() => { setShowCCEdit(false); setCCReason(''); }}
                    className="px-3 py-1 text-xs text-gray-500 hover:text-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <p className="text-gray-800">
                  {trip.costCentre || <span className="text-gray-400 italic">Not set</span>}
                </p>
                {canEditCostCentre && costCentres.length > 0 && trip.status !== 'cancelled' && (
                  <button
                    onClick={() => { setNewCC(trip.costCentre || ''); setShowCCEdit(true); }}
                    className="p-0.5 text-gray-400 hover:text-blue-600 rounded"
                    title="Change cost centre"
                  >
                    <Edit2 size={11} />
                  </button>
                )}
              </div>
            )}
          </div>
          {(trip.originCity || trip.destinationCity) && (
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Route</p>
              <p className="text-gray-800">
                {trip.originCity && trip.destinationCity
                  ? `${trip.originCity} → ${trip.destinationCity}`
                  : trip.originCity || trip.destinationCity}
              </p>
            </div>
          )}
          {trip.startDate && (
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Dates</p>
              <p className="text-gray-800">
                {trip.startDate}
                {trip.endDate && trip.endDate !== trip.startDate ? ` → ${trip.endDate}` : ''}
              </p>
            </div>
          )}
          {(() => {
            const days = leadTimeDays(trip);
            if (days === null) return null;
            return (
              <div>
                <p className="text-xs text-gray-400 mb-1">Lead time</p>
                <LeadTimeBadge days={days} />
                <p className="text-xs text-gray-400 mt-1">{days} day{days !== 1 ? 's' : ''} before travel</p>
              </div>
            );
          })()}
          {totalCost > 0 && (
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Estimated total (incl. GST)</p>
              <p className="text-gray-800 font-medium">A${totalCost.toFixed(2)}</p>
              <p className="text-xs text-gray-400 mt-0.5">A${totalExGST.toFixed(2)} ex-GST</p>
            </div>
          )}
        </div>

        {trip.additionalPassengers?.length > 0 && (() => {
          const numPax = 1 + trip.additionalPassengers.length;
          const primaryCost = trip.primaryAllocatedCost != null
            ? trip.primaryAllocatedCost
            : (totalCost / numPax);
          return (
            <div className="mt-4 pt-4 border-t border-gray-100 col-span-3">
              <p className="text-xs text-gray-400 mb-2">All passengers</p>
              <div className="space-y-2">
                {/* Primary traveller */}
                <div className="flex items-center gap-3 text-sm p-2 bg-blue-50 rounded-lg">
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{trip.travellerName}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Primary traveller{trip.costCentre ? ` · ${trip.costCentre}` : ''}
                    </p>
                  </div>
                  <span className="text-xs font-medium text-gray-700 shrink-0">A${primaryCost.toFixed(2)}</span>
                </div>
                {/* Additional passengers */}
                {trip.additionalPassengers.map((p, i) => {
                  const sectorLabels = (p.sectorIndices || [])
                    .map(idx => { const s = trip.sectors?.[idx]; return s ? (SECTOR_LABELS[s.type] || s.type) : null; })
                    .filter(Boolean);
                  return (
                    <div key={i} className="flex items-center gap-3 text-sm p-2 bg-gray-50 rounded-lg">
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{p.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {p.costCentre && <span>{p.costCentre} · </span>}
                          {sectorLabels.length > 0 ? sectorLabels.join(', ') : 'All sectors'}
                        </p>
                      </div>
                      <span className="text-xs font-medium text-gray-700 shrink-0">
                        A${(p.allocatedCost ?? 0).toFixed(2)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {trip.purpose && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-400 mb-1">Purpose / notes</p>
            <p className="text-sm text-gray-700 whitespace-pre-line">{trip.purpose}</p>
          </div>
        )}

        {isSTX && trip.internalNotes && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-400 mb-1 flex items-center gap-1">
              <Lock size={11} /> STX internal notes
            </p>
            <p className="text-sm text-gray-700 whitespace-pre-line">{trip.internalNotes}</p>
          </div>
        )}

        {isSTX && trip.status === 'cancelled' && (trip.billableSectorIndices?.length > 0) && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-400 mb-1 flex items-center gap-1">
              <Receipt size={11} /> Non-refundable items flagged for invoicing
            </p>
            <ul className="space-y-0.5">
              {trip.billableSectorIndices.map(i => {
                const s = trip.sectors?.[i];
                if (!s) return null;
                const label = SECTOR_LABELS[s.type] || s.type;
                return (
                  <li key={i} className="text-xs text-gray-700">
                    · {label}{parseFloat(s.cost) ? ` — A$${parseFloat(s.cost).toFixed(2)}` : ''}
                  </li>
                );
              }).filter(Boolean)}
            </ul>
          </div>
        )}

        {isSTX && trip.vtoTripId && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-400 mb-1 flex items-center gap-1">
              <Lock size={11} /> VTO Trip ID
            </p>
            <p className="text-sm text-gray-700 font-mono">{trip.vtoTripId}</p>
          </div>
        )}

        {trip.tripType !== 'Self-Managed' && trip.digitalItineraryLink && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-400 mb-1">Digital Itinerary</p>
            <a
              href={/^https?:\/\//i.test(trip.digitalItineraryLink) ? trip.digitalItineraryLink : `https://${trip.digitalItineraryLink}`}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-blue-600 hover:text-blue-800 underline break-all"
            >
              {trip.digitalItineraryLink}
            </a>
          </div>
        )}
      </div>

      {/* Sectors */}
      {(trip.sectors || []).length > 0 && (
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            Sectors ({trip.sectors.length})
          </h3>
          <div className="space-y-3">
            {trip.sectors.map((s, i) => (
              <SectorCard key={i} sector={s} index={i} />
            ))}
          </div>
        </div>
      )}

      {/* Fees */}
      {(trip.fees || []).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5 mb-3">
            <Receipt size={13} className="text-gray-400" />
            Fees
          </h3>
          <div className="space-y-2">
            {trip.fees.map((fee, i) => {
              const incGST = parseFloat((fee.amount * (1 + (fee.gstRate || 0.1))).toFixed(2));
              const label = fee.type === 'management' ? 'Management Fee' : fee.type === 'amendment' ? 'Amendment Fee' : fee.label || 'Fee';
              return (
                <div key={i} className="flex items-center gap-3 px-3 py-2.5 border border-gray-200 rounded-lg bg-gray-50">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 font-medium">{fee.label || label}</p>
                    <p className="text-xs text-gray-400">
                      A${fee.amount?.toFixed(2)} ex-GST · A${incGST.toFixed(2)} inc. GST
                      {fee.appliedByName && ` · ${fee.appliedByName}`}
                      {fee.appliedAt && ` · ${new Date(fee.appliedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: '2-digit' })}`}
                    </p>
                  </div>
                  {role === 'stx_admin' && (
                    <button
                      type="button"
                      onClick={() => handleDeleteFee(fee)}
                      className="p-1.5 text-gray-400 hover:text-red-600 rounded transition-colors"
                      title="Remove fee"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Attachments */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
        <Attachments
          trip={trip}
          clientId={clientId}
          onUpdate={onUpdate}
          canEdit={canEdit && trip.status !== 'cancelled'}
        />
      </div>

      {/* Amendment history */}
      {(trip.amendments || []).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5 mb-3">
            <Clock size={13} className="text-gray-400" />
            History
          </h3>
          <div className="space-y-3">
            {[...(trip.amendments || [])].reverse().map((a, i) => (
              <div key={i} className="flex gap-3 text-xs">
                <span className="text-gray-400 shrink-0 w-20 pt-0.5">
                  {a.at ? new Date(a.at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: '2-digit' }) : '—'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-gray-600 leading-relaxed">
                    {a.type === 'status_change' ? (
                      <>Status changed to <strong>{fmtStatus(a.to)}</strong>{a.note ? ` — ${a.note}` : ''}</>
                    ) : (
                      a.note || 'Updated'
                    )}
                    {a.byName && <span className="text-gray-400"> · {a.byName}</span>}
                  </p>
                  {(a.changes || []).length > 0 && (
                    <ul className="mt-1.5 space-y-1 text-gray-500">
                      {a.changes.map((c, j) => {
                        const label = typeof c === 'string' ? c
                          : c?.field ? `${c.field}: "${c.from}" → "${c.to}"` : JSON.stringify(c);
                        return (
                        <li key={j} className="flex gap-1.5">
                          <span className="text-gray-300 shrink-0 select-none">·</span>
                          <span>{label}</span>
                        </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Meta */}
      <div className="text-xs text-gray-400 space-y-0.5">
        {trip.createdAt?.toDate && (
          <p>Created {trip.createdAt.toDate().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
        )}
        {isSTX && trip.clientId && <p>Client: {trip.clientId}</p>}
      </div>

      {showRatingModal && (
        <TripRatingModal
          trip={trip}
          onClose={submitted => {
            setShowRatingModal(false);
            if (submitted) {
              // Reload the existing rating
              const docId = `${trip.id}_${userProfile.uid}`;
              getDoc(doc(db, 'tripFeedback', docId))
                .then(snap => setExistingRating(snap.exists() ? snap.data() : null))
                .catch(() => {});
            }
          }}
          existingRating={existingRating}
        />
      )}
    </div>
  );
}
