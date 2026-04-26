import React, { useState } from 'react';
import {
  Plus, Trash2, ChevronDown, ChevronUp,
  Plane, Hotel, Car, ParkingSquare, ArrowLeftRight, UtensilsCrossed, MoreHorizontal,
} from 'lucide-react';
import { useTenant } from '../../contexts/TenantContext';

const SECTOR_TYPES = {
  flight:        { label: 'Flight',        Icon: Plane },
  accommodation: { label: 'Accommodation', Icon: Hotel },
  'car-hire':    { label: 'Car Hire',       Icon: Car },
  parking:       { label: 'Parking',        Icon: ParkingSquare },
  transfers:     { label: 'Transfers',      Icon: ArrowLeftRight },
  meals:         { label: 'Meals',          Icon: UtensilsCrossed },
  other:         { label: 'Other',          Icon: MoreHorizontal },
};

const CABIN_CLASSES   = ['Economy', 'Premium Economy', 'Business', 'First'];
const TRANSFER_TYPES  = ['Taxi', 'Ride Share', 'Private Car', 'Shuttle', 'Accessible Vehicle', 'Other'];
const MEAL_TYPES      = ['Breakfast', 'Morning Tea', 'Lunch', 'Afternoon Tea', 'Dinner', 'Event Catering'];

const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
const lbl = 'block text-xs font-medium text-gray-500 mb-1';

function F({ label, children, span2 }) {
  return (
    <div className={span2 ? 'col-span-2' : ''}>
      <label className={lbl}>{label}</label>
      {children}
    </div>
  );
}

// ── Sector field components ───────────────────────────────────────────────────

function FlightFields({ s, upd }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <F label="From (airport / city)">
        <input className={inp} value={s.from || ''} onChange={e => upd('from', e.target.value)} placeholder="SYD" />
      </F>
      <F label="To (airport / city)">
        <input className={inp} value={s.to || ''} onChange={e => upd('to', e.target.value)} placeholder="MEL" />
      </F>
      <F label="Date">
        <input type="date" className={inp} value={s.date || ''} onChange={e => upd('date', e.target.value)} />
      </F>
      <F label="Airline">
        <input className={inp} value={s.airline || ''} onChange={e => upd('airline', e.target.value)} placeholder="Qantas" />
      </F>
      <F label="Flight number">
        <input className={inp} value={s.flightNumber || ''} onChange={e => upd('flightNumber', e.target.value)} placeholder="QF403" />
      </F>
      <F label="Booking reference">
        <input className={inp} value={s.bookingRef || ''} onChange={e => upd('bookingRef', e.target.value)} placeholder="ABC123" />
      </F>
      <F label="Departure time">
        <input type="time" className={inp} value={s.departureTime || ''} onChange={e => upd('departureTime', e.target.value)} />
      </F>
      <F label="Arrival time">
        <input type="time" className={inp} value={s.arrivalTime || ''} onChange={e => upd('arrivalTime', e.target.value)} />
      </F>
      <F label="Cabin class">
        <select className={inp} value={s.cabinClass || 'Economy'} onChange={e => upd('cabinClass', e.target.value)}>
          {CABIN_CLASSES.map(c => <option key={c}>{c}</option>)}
        </select>
      </F>
      <F label="Cost (AUD)">
        <input type="number" min="0" step="0.01" className={inp} value={s.cost || ''} onChange={e => upd('cost', e.target.value)} placeholder="0.00" />
      </F>
      <F label="Notes / special requirements" span2>
        <textarea className={inp} rows={2} value={s.notes || ''} onChange={e => upd('notes', e.target.value)} placeholder="e.g. wheelchair assistance, aisle seat required" />
      </F>
    </div>
  );
}

function AccommodationFields({ s, upd }) {
  const nights = s.checkIn && s.checkOut
    ? Math.max(0, Math.round((new Date(s.checkOut) - new Date(s.checkIn)) / 86400000))
    : null;
  return (
    <div className="grid grid-cols-2 gap-3">
      <F label="Property name" span2>
        <input className={inp} value={s.propertyName || ''} onChange={e => upd('propertyName', e.target.value)} placeholder="Novotel Sydney Central" />
      </F>
      <F label="Check-in date">
        <input type="date" className={inp} value={s.checkIn || ''} onChange={e => upd('checkIn', e.target.value)} />
      </F>
      <F label="Check-out date">
        <input type="date" className={inp} value={s.checkOut || ''} onChange={e => upd('checkOut', e.target.value)} />
      </F>
      <F label="Room type">
        <input className={inp} value={s.roomType || ''} onChange={e => upd('roomType', e.target.value)} placeholder="Accessible King Room" />
      </F>
      <F label={`Cost per night (AUD)${nights != null ? ` · ${nights} night${nights !== 1 ? 's' : ''}` : ''}`}>
        <input type="number" min="0" step="0.01" className={inp} value={s.cost || ''} onChange={e => upd('cost', e.target.value)} placeholder="0.00" />
      </F>
      <F label="Booking reference" span2>
        <input className={inp} value={s.bookingRef || ''} onChange={e => upd('bookingRef', e.target.value)} placeholder="BK12345" />
      </F>
      <F label="Notes / special requirements" span2>
        <textarea className={inp} rows={2} value={s.notes || ''} onChange={e => upd('notes', e.target.value)} placeholder="e.g. roll-in shower, ground floor, carer room required" />
      </F>
    </div>
  );
}

function CarHireFields({ s, upd }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <F label="Company" span2>
        <input className={inp} value={s.company || ''} onChange={e => upd('company', e.target.value)} placeholder="Hertz" />
      </F>
      <F label="Pickup location">
        <input className={inp} value={s.pickupLocation || ''} onChange={e => upd('pickupLocation', e.target.value)} placeholder="Sydney Airport" />
      </F>
      <F label="Drop-off location">
        <input className={inp} value={s.dropOffLocation || ''} onChange={e => upd('dropOffLocation', e.target.value)} placeholder="Melbourne CBD" />
      </F>
      <F label="Pickup date">
        <input type="date" className={inp} value={s.pickupDate || ''} onChange={e => upd('pickupDate', e.target.value)} />
      </F>
      <F label="Drop-off date">
        <input type="date" className={inp} value={s.dropOffDate || ''} onChange={e => upd('dropOffDate', e.target.value)} />
      </F>
      <F label="Vehicle type">
        <input className={inp} value={s.vehicleType || ''} onChange={e => upd('vehicleType', e.target.value)} placeholder="Accessible Sedan" />
      </F>
      <F label="Booking reference">
        <input className={inp} value={s.bookingRef || ''} onChange={e => upd('bookingRef', e.target.value)} />
      </F>
      <F label="Cost (AUD)">
        <input type="number" min="0" step="0.01" className={inp} value={s.cost || ''} onChange={e => upd('cost', e.target.value)} placeholder="0.00" />
      </F>
      <F label="Notes / special requirements" span2>
        <textarea className={inp} rows={2} value={s.notes || ''} onChange={e => upd('notes', e.target.value)} />
      </F>
    </div>
  );
}

function ParkingFields({ s, upd }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <F label="Facility" span2>
        <input className={inp} value={s.facility || ''} onChange={e => upd('facility', e.target.value)} placeholder="Wilson Parking — Central Station" />
      </F>
      <F label="Entry date">
        <input type="date" className={inp} value={s.entryDate || ''} onChange={e => upd('entryDate', e.target.value)} />
      </F>
      <F label="Exit date">
        <input type="date" className={inp} value={s.exitDate || ''} onChange={e => upd('exitDate', e.target.value)} />
      </F>
      <F label="Booking reference">
        <input className={inp} value={s.bookingRef || ''} onChange={e => upd('bookingRef', e.target.value)} />
      </F>
      <F label="Cost (AUD)">
        <input type="number" min="0" step="0.01" className={inp} value={s.cost || ''} onChange={e => upd('cost', e.target.value)} placeholder="0.00" />
      </F>
      <F label="Notes" span2>
        <textarea className={inp} rows={2} value={s.notes || ''} onChange={e => upd('notes', e.target.value)} />
      </F>
    </div>
  );
}

function TransfersFields({ s, upd }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <F label="From">
        <input className={inp} value={s.from || ''} onChange={e => upd('from', e.target.value)} placeholder="Airport" />
      </F>
      <F label="To">
        <input className={inp} value={s.to || ''} onChange={e => upd('to', e.target.value)} placeholder="Hotel" />
      </F>
      <F label="Date">
        <input type="date" className={inp} value={s.date || ''} onChange={e => upd('date', e.target.value)} />
      </F>
      <F label="Pickup time">
        <input type="time" className={inp} value={s.pickupTime || ''} onChange={e => upd('pickupTime', e.target.value)} />
      </F>
      <F label="Transfer type">
        <select className={inp} value={s.transferType || ''} onChange={e => upd('transferType', e.target.value)}>
          <option value="">Select…</option>
          {TRANSFER_TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
      </F>
      <F label="Provider">
        <input className={inp} value={s.provider || ''} onChange={e => upd('provider', e.target.value)} placeholder="Silver Service" />
      </F>
      <F label="Cost (AUD)">
        <input type="number" min="0" step="0.01" className={inp} value={s.cost || ''} onChange={e => upd('cost', e.target.value)} placeholder="0.00" />
      </F>
      <F label="Notes / special requirements" span2>
        <textarea className={inp} rows={2} value={s.notes || ''} onChange={e => upd('notes', e.target.value)} placeholder="e.g. wheelchair accessible vehicle required" />
      </F>
    </div>
  );
}

function MealsFields({ s, upd }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <F label="Venue" span2>
        <input className={inp} value={s.venue || ''} onChange={e => upd('venue', e.target.value)} placeholder="Restaurant / event name" />
      </F>
      <F label="Date">
        <input type="date" className={inp} value={s.date || ''} onChange={e => upd('date', e.target.value)} />
      </F>
      <F label="Meal type">
        <select className={inp} value={s.mealType || ''} onChange={e => upd('mealType', e.target.value)}>
          <option value="">Select…</option>
          {MEAL_TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
      </F>
      <F label="Number of people">
        <input type="number" min="1" className={inp} value={s.numberOfPeople || ''} onChange={e => upd('numberOfPeople', e.target.value)} placeholder="1" />
      </F>
      <F label="Cost (AUD)">
        <input type="number" min="0" step="0.01" className={inp} value={s.cost || ''} onChange={e => upd('cost', e.target.value)} placeholder="0.00" />
      </F>
      <F label="Notes / dietary requirements" span2>
        <textarea className={inp} rows={2} value={s.notes || ''} onChange={e => upd('notes', e.target.value)} />
      </F>
    </div>
  );
}

function OtherFields({ s, upd }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <F label="Description" span2>
        <input className={inp} value={s.description || ''} onChange={e => upd('description', e.target.value)} placeholder="e.g. Travel insurance, visa fees, equipment hire" />
      </F>
      <F label="Provider">
        <input className={inp} value={s.provider || ''} onChange={e => upd('provider', e.target.value)} />
      </F>
      <F label="Date">
        <input type="date" className={inp} value={s.date || ''} onChange={e => upd('date', e.target.value)} />
      </F>
      <F label="Cost (AUD)">
        <input type="number" min="0" step="0.01" className={inp} value={s.cost || ''} onChange={e => upd('cost', e.target.value)} placeholder="0.00" />
      </F>
      <F label="Notes" span2>
        <textarea className={inp} rows={2} value={s.notes || ''} onChange={e => upd('notes', e.target.value)} />
      </F>
    </div>
  );
}

// ── Sector summary (collapsed view) ──────────────────────────────────────────

function sectorSummary(s) {
  if (s.type === 'flight')        return [s.from, s.to].filter(Boolean).join(' → ') || 'Flight';
  if (s.type === 'accommodation') return s.propertyName || 'Accommodation';
  if (s.type === 'car-hire')      return [s.company, s.pickupLocation].filter(Boolean).join(' · ') || 'Car Hire';
  if (s.type === 'parking')       return s.facility || 'Parking';
  if (s.type === 'transfers')     return [s.from, s.to].filter(Boolean).join(' → ') || 'Transfer';
  if (s.type === 'meals')         return s.venue || s.mealType || 'Meal';
  return s.description || 'Other';
}

// ── Sector card ───────────────────────────────────────────────────────────────

function SectorCard({ sector, index, onChange, onRemove }) {
  const [expanded, setExpanded] = useState(!sector.type);
  const cfg = SECTOR_TYPES[sector.type];
  const Icon = cfg?.Icon;

  const upd = (k, v) => onChange({ ...sector, [k]: v });

  const fields = {
    flight:        <FlightFields s={sector} upd={upd} />,
    accommodation: <AccommodationFields s={sector} upd={upd} />,
    'car-hire':    <CarHireFields s={sector} upd={upd} />,
    parking:       <ParkingFields s={sector} upd={upd} />,
    transfers:     <TransfersFields s={sector} upd={upd} />,
    meals:         <MealsFields s={sector} upd={upd} />,
    other:         <OtherFields s={sector} upd={upd} />,
  }[sector.type];

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 bg-gray-50">
        <span className="text-xs font-medium text-gray-400 w-5 shrink-0">{index + 1}</span>

        {!sector.type ? (
          <select
            className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value=""
            onChange={e => { onChange({ ...sector, type: e.target.value }); setExpanded(true); }}
          >
            <option value="" disabled>Select sector type…</option>
            {Object.entries(SECTOR_TYPES).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        ) : (
          <>
            {Icon && <Icon size={14} className="text-gray-400 shrink-0" />}
            <span className="text-xs font-semibold text-gray-700 shrink-0 w-24">{cfg.label}</span>
            <span className="flex-1 text-xs text-gray-500 truncate">{sectorSummary(sector)}</span>
            {sector.cost && (
              <span className="text-xs text-gray-500 shrink-0 mr-1">
                A${parseFloat(sector.cost || 0).toFixed(2)}
              </span>
            )}
          </>
        )}

        <div className="flex items-center gap-0.5 shrink-0">
          {sector.type && (
            <button
              type="button"
              onClick={() => setExpanded(v => !v)}
              className="p-1 text-gray-400 hover:text-gray-600 rounded"
            >
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          )}
          <button
            type="button"
            onClick={onRemove}
            className="p-1 text-gray-400 hover:text-red-500 rounded"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {expanded && sector.type && (
        <div className="px-4 py-4 border-t border-gray-100">
          {fields}
        </div>
      )}
    </div>
  );
}

// ── Main TripForm ─────────────────────────────────────────────────────────────

const EMPTY = {
  title: '', travellerName: '', tripType: '', costCentre: '',
  purpose: '', startDate: '', endDate: '', internalNotes: '', sectors: [],
};

export default function TripForm({ trip, clientId, onSave, onCancel }) {
  const { clientConfig, isSTX } = useTenant();

  const [form, setForm] = useState(() => {
    if (!trip) return EMPTY;
    return {
      title:         trip.title         || '',
      travellerName: trip.travellerName || '',
      tripType:      trip.tripType      || '',
      costCentre:    trip.costCentre    || '',
      purpose:       trip.purpose       || '',
      startDate:     trip.startDate     || '',
      endDate:       trip.endDate       || '',
      internalNotes: trip.internalNotes || '',
      sectors: (trip.sectors || []).map(s => ({ ...s, _key: Math.random().toString(36).slice(2) })),
    };
  });

  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const tripTypes   = clientConfig?.dropdowns?.tripTypes   || [];
  const costCentres = clientConfig?.dropdowns?.costCentres || [];

  const updateSector = (i, updated) =>
    setForm(p => { const s = [...p.sectors]; s[i] = updated; return { ...p, sectors: s }; });

  const removeSector = (i) =>
    setForm(p => ({ ...p, sectors: p.sectors.filter((_, j) => j !== i) }));

  const addSector = () =>
    setForm(p => ({ ...p, sectors: [...p.sectors, { _key: Math.random().toString(36).slice(2), type: '' }] }));

  const totalCost = form.sectors.reduce((sum, s) => {
    const c = parseFloat(s.cost) || 0;
    if (s.type === 'accommodation' && s.checkIn && s.checkOut) {
      const nights = Math.max(0, Math.round((new Date(s.checkOut) - new Date(s.checkIn)) / 86400000));
      return sum + c * nights;
    }
    return sum + c;
  }, 0);

  const handleSave = async (submitForApproval = false) => {
    setError('');
    if (!form.title.trim())         return setError('Trip title is required.');
    if (!form.travellerName.trim()) return setError('Traveller name is required.');

    setSaving(true);
    try {
      const sectors = form.sectors
        .filter(s => s.type)
        .map(({ _key, ...rest }) => rest);

      let status = trip?.status || 'draft';
      if (submitForApproval) {
        status = clientConfig?.workflow?.requiresApproval !== false
          ? 'pending_approval'
          : 'approved';
      } else if (status === 'declined') {
        status = 'draft';
      }

      await onSave({ ...form, sectors, clientId, status, totalCost });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const isDraftOrDeclined = !trip || ['draft', 'declined'].includes(trip.status);

  return (
    <div className="space-y-5">
      {/* Common fields */}
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className={lbl}>Trip title *</label>
          <input
            className={inp}
            value={form.title}
            onChange={e => set('title', e.target.value)}
            placeholder="e.g. Jane Smith — NDIS Conference Melbourne"
          />
        </div>

        <div>
          <label className={lbl}>Traveller name *</label>
          <input className={inp} value={form.travellerName} onChange={e => set('travellerName', e.target.value)} placeholder="Full name" />
        </div>

        <div>
          <label className={lbl}>Trip type</label>
          <select className={inp} value={form.tripType} onChange={e => set('tripType', e.target.value)}>
            <option value="">Select…</option>
            {tripTypes.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>

        {costCentres.length > 0 && (
          <div>
            <label className={lbl}>Cost centre</label>
            <select className={inp} value={form.costCentre} onChange={e => set('costCentre', e.target.value)}>
              <option value="">Select…</option>
              {costCentres.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
        )}

        <div>
          <label className={lbl}>Start date</label>
          <input type="date" className={inp} value={form.startDate} onChange={e => set('startDate', e.target.value)} />
        </div>

        <div>
          <label className={lbl}>End date</label>
          <input type="date" className={inp} value={form.endDate} onChange={e => set('endDate', e.target.value)} />
        </div>

        <div className="col-span-2">
          <label className={lbl}>Purpose / notes</label>
          <textarea
            className={inp}
            rows={2}
            value={form.purpose}
            onChange={e => set('purpose', e.target.value)}
            placeholder="Reason for travel, event details, accessibility context…"
          />
        </div>

        {isSTX && (
          <div className="col-span-2">
            <label className={lbl}>STX internal notes (not visible to client)</label>
            <textarea
              className={inp}
              rows={2}
              value={form.internalNotes}
              onChange={e => set('internalNotes', e.target.value)}
            />
          </div>
        )}
      </div>

      {/* Sectors */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">Sectors</h3>
          {totalCost > 0 && (
            <span className="text-sm text-gray-500">
              Est. total: <strong className="text-gray-800">A${totalCost.toFixed(2)}</strong>
            </span>
          )}
        </div>

        <div className="space-y-2">
          {form.sectors.map((s, i) => (
            <SectorCard
              key={s._key}
              sector={s}
              index={i}
              onChange={updated => updateSector(i, updated)}
              onRemove={() => removeSector(i)}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={addSector}
          className="mt-3 flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 py-1"
        >
          <Plus size={14} /> Add sector
        </button>
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => handleSave(false)}
          disabled={saving}
          className="px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save draft'}
        </button>
        {isDraftOrDeclined && (
          <button
            type="button"
            onClick={() => handleSave(true)}
            disabled={saving}
            className="px-5 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Submitting…' : 'Submit for approval'}
          </button>
        )}
      </div>
    </div>
  );
}
