import React, { useState } from 'react';
import {
  ArrowLeft, Edit2, CheckCircle, XCircle, Ban, Send,
  Plane, Hotel, Car, ParkingSquare, ArrowLeftRight, UtensilsCrossed, MoreHorizontal,
  Lock,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import { StatusBadge } from './TripList';

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
    if (sector.type === 'accommodation' && sector.checkIn && sector.checkOut) {
      const nights = Math.max(0, Math.round((new Date(sector.checkOut) - new Date(sector.checkIn)) / 86400000));
      return `A$${c.toFixed(2)} / night · A$${(c * nights).toFixed(2)} total`;
    }
    return `A$${c.toFixed(2)}`;
  })();

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-200">
        <span className="text-xs text-gray-400 w-5">{index + 1}</span>
        <Icon size={14} className="text-gray-400" />
        <span className="text-xs font-semibold text-gray-700">{label}</span>
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

export default function TripDetail({ trip, onBack, onEdit, onStatusChange }) {
  const { userProfile } = useAuth();
  const { isSTX, clientConfig } = useTenant();
  const [acting, setActing] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [showDeclineInput, setShowDeclineInput] = useState(false);

  const role = userProfile?.role;
  const isApprover = ['stx_admin', 'stx_ops', 'client_approver'].includes(role);
  const canEdit = ['stx_admin', 'stx_ops', 'client_ops', 'client_traveller'].includes(role);

  const act = async (newStatus, extra = {}) => {
    setActing(true);
    try {
      await onStatusChange(trip, newStatus, extra);
    } finally {
      setActing(false);
      setShowDeclineInput(false);
      setDeclineReason('');
    }
  };

  const totalCost = (trip.sectors || []).reduce((sum, s) => {
    const c = parseFloat(s.cost) || 0;
    if (s.type === 'accommodation' && s.checkIn && s.checkOut) {
      const nights = Math.max(0, Math.round((new Date(s.checkOut) - new Date(s.checkIn)) / 86400000));
      return sum + c * nights;
    }
    return sum + c;
  }, 0);

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
          {/* Edit — only on draft or declined */}
          {canEdit && ['draft', 'declined'].includes(trip.status) && (
            <button
              onClick={() => onEdit(trip)}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-sm rounded-lg hover:bg-gray-50"
            >
              <Edit2 size={13} /> Edit
            </button>
          )}

          {/* Submit — draft only, by creator/ops */}
          {canEdit && trip.status === 'draft' && (
            <button
              onClick={() => act(
                clientConfig?.workflow?.requiresApproval !== false ? 'pending_approval' : 'approved'
              )}
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

          {/* Cancel — approved only, STX */}
          {isSTX && trip.status === 'approved' && (
            <button
              onClick={() => act('cancelled')}
              disabled={acting}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-sm rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              <Ban size={13} /> Cancel trip
            </button>
          )}
        </div>
      </div>

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

      {/* Trip header card */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">{trip.title || '—'}</h2>
            {trip.declineReason && trip.status === 'declined' && (
              <p className="text-sm text-red-600 mt-1">Declined: {trip.declineReason}</p>
            )}
          </div>
          <StatusBadge status={trip.status} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Traveller</p>
            <p className="text-gray-800">{fmt(trip.travellerName)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Trip type</p>
            <p className="text-gray-800">{fmt(trip.tripType)}</p>
          </div>
          {trip.costCentre && (
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Cost centre</p>
              <p className="text-gray-800">{trip.costCentre}</p>
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
          {totalCost > 0 && (
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Estimated total</p>
              <p className="text-gray-800 font-medium">A${totalCost.toFixed(2)}</p>
            </div>
          )}
        </div>

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

      {/* Meta */}
      <div className="text-xs text-gray-400 space-y-0.5">
        {trip.createdAt?.toDate && (
          <p>Created {trip.createdAt.toDate().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
        )}
        {isSTX && trip.clientId && <p>Client: {trip.clientId}</p>}
      </div>
    </div>
  );
}
