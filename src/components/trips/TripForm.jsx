import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Plus, Trash2, ChevronDown, ChevronUp, AlertTriangle, CheckCircle,
  Plane, Hotel, Car, ParkingSquare, ArrowLeftRight, UtensilsCrossed, MoreHorizontal, ExternalLink,
} from 'lucide-react';
import { collection, onSnapshot, query, where, orderBy, getDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useTenant } from '../../contexts/TenantContext';
import { useAuth } from '../../contexts/AuthContext';
import { CITIES } from '../../data/cities';

const SECTOR_TYPES = {
  flight:        { label: 'Flight',        Icon: Plane },
  accommodation: { label: 'Accommodation', Icon: Hotel },
  'car-hire':    { label: 'Car Hire',       Icon: Car },
  parking:       { label: 'Parking',        Icon: ParkingSquare },
  transfers:     { label: 'Transfers',      Icon: ArrowLeftRight },
  meals:         { label: 'Meals',          Icon: UtensilsCrossed },
  other:         { label: 'Other',          Icon: MoreHorizontal },
};

const DEFAULT_TRIP_TYPES = ['Self-Managed', 'STX-Managed', 'Group Event'];
const CABIN_CLASSES  = ['Economy', 'Premium Economy', 'Business', 'First'];
const TRANSFER_TYPES = ['Taxi', 'Ride Share', 'Private Car', 'Shuttle', 'Accessible Vehicle', 'Other'];
const MEAL_TYPES     = ['Breakfast', 'Morning Tea', 'Lunch', 'Afternoon Tea', 'Dinner', 'Event Catering'];

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
      <F label="Baggage allowance">
        <input className={inp} value={s.baggageAllowance || ''} onChange={e => upd('baggageAllowance', e.target.value)} placeholder="e.g. 23kg / 1 piece" />
      </F>
      <F label="Cost incl. GST (AUD)">
        <input type="number" min="0" step="0.01" className={inp} value={s.cost || ''} onChange={e => upd('cost', e.target.value)} placeholder="0.00" />
      </F>
      <F label="Notes / special requirements" span2>
        <textarea className={inp} rows={2} value={s.notes || ''} onChange={e => upd('notes', e.target.value)} placeholder="e.g. wheelchair assistance, aisle seat required" />
      </F>
    </div>
  );
}

function AccommodationFields({ s, upd, tripDestinationCity, onOpenHotelBooking, hotelBookingLocked }) {
  const nights = s.checkIn && s.checkOut
    ? Math.max(0, Math.round((new Date(s.checkOut) - new Date(s.checkIn)) / 86400000))
    : null;
  const hasOverride = !!s.reportingCity;
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
      <F label={`Total cost of stay incl. GST (AUD)${nights != null ? ` · ${nights} night${nights !== 1 ? 's' : ''}` : ''}`}>
        <input type="number" min="0" step="0.01" className={inp} value={s.cost || ''} onChange={e => upd('cost', e.target.value)} placeholder="0.00" />
      </F>
      <F label="Booking reference" span2>
        <input className={inp} value={s.bookingRef || ''} onChange={e => upd('bookingRef', e.target.value)} placeholder="BK12345" />
      </F>
      <F label="Inclusions" span2>
        <input className={inp} value={s.inclusions || ''} onChange={e => upd('inclusions', e.target.value)} placeholder="e.g. Breakfast, parking, Wi-Fi" />
      </F>
      <F label="Notes / special requirements" span2>
        <textarea className={inp} rows={2} value={s.notes || ''} onChange={e => upd('notes', e.target.value)} placeholder="e.g. roll-in shower, ground floor, carer room required" />
      </F>

      {/* Nuitee hotel booking launcher */}
      {(onOpenHotelBooking || hotelBookingLocked) && (
        <div className="col-span-2">
          {onOpenHotelBooking ? (
            <>
              <button
                type="button"
                onClick={onOpenHotelBooking}
                className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-xs font-bold rounded-lg hover:bg-teal-700 transition-colors"
              >
                <Hotel size={13} />
                Search &amp; Book via Nuitee
                <ExternalLink size={11} className="opacity-70" />
              </button>
              <p className="text-[10px] text-gray-400 mt-1">Opens hotel search in a new tab — booking details will auto-fill here.</p>
            </>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-400 cursor-not-allowed">
              <Hotel size={13} />
              Search &amp; Book via Nuitee — available once trip is approved
            </div>
          )}
        </div>
      )}

      {/* Reporting city — defaults to trip destination, override per-sector for multi-city trips */}
      <div className="col-span-2">
        <div className="flex items-center justify-between mb-1">
          <label className={lbl}>Reporting city (hotel spend)</label>
          {hasOverride ? (
            <button
              type="button"
              onClick={() => upd('reportingCity', '')}
              className="text-xs text-gray-400 hover:text-gray-700"
            >
              Use trip destination
            </button>
          ) : (
            <button
              type="button"
              onClick={() => upd('reportingCity', tripDestinationCity || '')}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              Override
            </button>
          )}
        </div>
        {hasOverride ? (
          <input
            className={inp}
            list="trip-form-cities"
            value={s.reportingCity}
            onChange={e => upd('reportingCity', e.target.value)}
            placeholder="e.g. Canberra"
            autoComplete="off"
          />
        ) : (
          <p className="text-xs text-gray-500 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
            {tripDestinationCity
              ? <>Using trip destination: <strong>{tripDestinationCity}</strong></>
              : <span className="text-gray-400">No trip destination set — add one above or override here.</span>}
          </p>
        )}
      </div>
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
      <F label="Cost incl. GST (AUD)">
        <input type="number" min="0" step="0.01" className={inp} value={s.cost || ''} onChange={e => upd('cost', e.target.value)} placeholder="0.00" />
      </F>
      <F label="Inclusions" span2>
        <input className={inp} value={s.inclusions || ''} onChange={e => upd('inclusions', e.target.value)} placeholder="e.g. Unlimited km, insurance, GPS" />
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
      <F label="Cost incl. GST (AUD)">
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
      <F label="Cost incl. GST (AUD)">
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
      <F label="Cost incl. GST (AUD)">
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
      <F label="Cost incl. GST (AUD)">
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

function SectorCard({ sector, index, onChange, onRemove, tripDestinationCity, onOpenHotelBooking, hotelBookingLocked }) {
  const [expanded, setExpanded] = useState(!sector.type);
  const cfg = SECTOR_TYPES[sector.type];
  const Icon = cfg?.Icon;

  const upd = (k, v) => onChange({ ...sector, [k]: v });

  const fields = {
    flight:        <FlightFields s={sector} upd={upd} />,
    accommodation: <AccommodationFields s={sector} upd={upd} tripDestinationCity={tripDestinationCity} onOpenHotelBooking={onOpenHotelBooking} hotelBookingLocked={hotelBookingLocked} />,
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
        <div className="px-4 py-4 border-t border-gray-100 space-y-4">
          {fields}
          <div className="pt-2 border-t border-gray-100">
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                checked={sector.international || false}
                onChange={e => onChange({ ...sector, international: e.target.checked })}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-gray-700 font-medium">International sector</span>
              <span className="text-xs text-gray-400">(GST-free — no GST applied on invoice)</span>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Additional passenger card ─────────────────────────────────────────────────

function AdditionalPassengerCard({ pax, index, sectors, passengers, teamMembers, costCentres, autoAllocated, onChange, onRemove }) {
  return (
    <div className="border border-gray-200 rounded-lg p-3 bg-gray-50 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Passenger {index + 2}</span>
        <button type="button" onClick={onRemove} className="p-1 text-gray-400 hover:text-red-500 rounded">
          <Trash2 size={14} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Name *</label>
          <input
            className={inp}
            value={pax.name}
            onChange={e => {
              const name  = e.target.value;
              const lower = name.toLowerCase();
              const paxMatch = passengers.find(p =>
                [p.preferredName || p.firstName, p.lastName].filter(Boolean).join(' ').toLowerCase() === lower ||
                [p.firstName, p.lastName].filter(Boolean).join(' ').toLowerCase() === lower
              );
              if (paxMatch) {
                const linkedUser = paxMatch.userId ? teamMembers.find(m => m.id === paxMatch.userId) : null;
                onChange({ ...pax, name, passengerId: paxMatch.id, costCentre: linkedUser?.costCentre || pax.costCentre });
              } else {
                const memMatch = teamMembers.find(m =>
                  [m.firstName, m.lastName].filter(Boolean).join(' ').toLowerCase() === lower
                );
                onChange({ ...pax, name, passengerId: memMatch ? memMatch.id : '' });
              }
            }}
            placeholder="Type name…"
            list={`travellers-add-${pax._key}`}
            autoComplete="off"
          />
          <datalist id={`travellers-add-${pax._key}`}>
            {passengers.map(p => (
              <option key={p.id} value={[p.preferredName || p.firstName, p.lastName].filter(Boolean).join(' ')} />
            ))}
            {teamMembers.filter(m => !passengers.some(p => p.userId === m.id)).map(m => (
              <option key={m.id} value={[m.firstName, m.lastName].filter(Boolean).join(' ')} />
            ))}
          </datalist>
        </div>

        {costCentres.length > 0 ? (
          <div>
            <label className={lbl}>Cost centre</label>
            <select className={inp} value={pax.costCentre || ''} onChange={e => onChange({ ...pax, costCentre: e.target.value })}>
              <option value="">Select…</option>
              {costCentres.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
        ) : (
          <div>
            <label className={lbl}>Cost centre</label>
            <input className={inp} value={pax.costCentre || ''} onChange={e => onChange({ ...pax, costCentre: e.target.value })} placeholder="Optional" />
          </div>
        )}
      </div>

      {sectors.some(s => s.type) && (
        <div>
          <label className={lbl}>Sectors this passenger is on</label>
          <div className="flex flex-wrap gap-2 mt-1">
            {sectors.map(s => {
              if (!s.type) return null;
              const sLabel = SECTOR_TYPES[s.type]?.label || s.type;
              const cost   = parseFloat(s.cost) || 0;
              const checked = (pax.sectorKeys || []).includes(s._key);
              return (
                <label
                  key={s._key}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs cursor-pointer select-none transition-colors ${
                    checked ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={e => {
                      const newKeys = e.target.checked
                        ? [...(pax.sectorKeys || []), s._key]
                        : (pax.sectorKeys || []).filter(k => k !== s._key);
                      onChange({ ...pax, sectorKeys: newKeys, allocatedCostOverride: false });
                    }}
                    className="w-3 h-3 accent-blue-600"
                  />
                  {sLabel}{cost > 0 ? ` ($${cost.toFixed(0)})` : ''}
                </label>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <label className={lbl}>Allocated cost incl. GST (A$)</label>
        <div className="flex items-center gap-2">
          <input
            type="number" min="0" step="0.01"
            className={`${inp} w-36`}
            value={pax.allocatedCostOverride ? (pax.allocatedCost ?? '') : autoAllocated.toFixed(2)}
            onChange={e => onChange({ ...pax, allocatedCost: e.target.value, allocatedCostOverride: true })}
          />
          {pax.allocatedCostOverride ? (
            <button
              type="button"
              onClick={() => onChange({ ...pax, allocatedCostOverride: false, allocatedCost: '' })}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              Reset to auto
            </button>
          ) : (
            <span className="text-xs text-gray-400">Auto from sector shares</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main TripForm ─────────────────────────────────────────────────────────────

const EMPTY = {
  clientId: '', title: '', travellerName: '', travellerId: '', tripType: '', costCentre: '',
  originCity: '', destinationCity: '',
  purpose: '', startDate: '', endDate: '', internalNotes: '', sectors: [],
  costCentreChangeReason: '', vtoTripId: '', digitalItineraryLink: '',
  additionalPassengers: [],
  primaryAllocatedCost: '', primaryAllocatedCostOverride: false,
};

const MANAGER_ROLES = ['stx_admin', 'stx_ops', 'client_ops', 'client_approver'];

export default function TripForm({ trip, clientId: clientIdProp, onSave, onCancel }) {
  const { userProfile } = useAuth();
  const { clientConfig: tenantClientConfig, isSTX } = useTenant();

  // STX users have no own tenant config — load whichever client is selected in the form
  const [stxClientConfig, setStxClientConfig] = useState(null);
  const clientConfig = isSTX ? stxClientConfig : tenantClientConfig;
  const originalCostCentre = trip?.costCentre || '';
  const [clients, setClients]         = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [passengers, setPassengers]   = useState([]);

  // Load client list for STX users
  useEffect(() => {
    if (!isSTX) return;
    const unsub = onSnapshot(collection(db, 'clients'), snap => {
      setClients(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || '').localeCompare(b.name || '')));
    });
    return unsub;
  }, [isSTX]);

  const [form, setForm] = useState(() => {
    // Auto-fill travellerName + travellerId + costCentre for non-manager users creating their own trip
    let autoName = '';
    let autoId   = '';
    let autoCostCentre = '';
    if (!trip && userProfile && !MANAGER_ROLES.includes(userProfile.role)) {
      autoName       = [userProfile.firstName, userProfile.lastName].filter(Boolean).join(' ');
      autoId         = userProfile.uid || '';
      autoCostCentre = userProfile.costCentre || '';
    }
    if (!trip) return { ...EMPTY, clientId: clientIdProp || '', travellerName: autoName, travellerId: autoId, costCentre: autoCostCentre };
    const sectorList = (trip.sectors || []).map(s => ({ ...s, _key: Math.random().toString(36).slice(2) }));
    return {
      clientId:        trip.clientId        || clientIdProp || '',
      title:           trip.title           || '',
      travellerName:   trip.travellerName   || '',
      travellerId:     trip.travellerId     || '',
      tripType:        trip.tripType        || '',
      costCentre:      trip.costCentre      || '',
      originCity:      trip.originCity      || '',
      destinationCity: trip.destinationCity || '',
      purpose:         trip.purpose         || '',
      startDate:       trip.startDate       || '',
      endDate:         trip.endDate         || '',
      internalNotes:         trip.internalNotes         || '',
      vtoTripId:             trip.vtoTripId             || '',
      digitalItineraryLink:  trip.digitalItineraryLink  || '',
      sectors: sectorList,
      additionalPassengers: (trip.additionalPassengers || []).map(p => ({
        ...p,
        _key: Math.random().toString(36).slice(2),
        sectorKeys: (p.sectorIndices || []).map(i => sectorList[i]?._key).filter(Boolean),
      })),
      primaryAllocatedCost:         trip.primaryAllocatedCost != null ? String(trip.primaryAllocatedCost) : '',
      primaryAllocatedCostOverride: trip.primaryAllocatedCost != null,
    };
  });

  // Load selected client's config for STX users (clientConfig from useTenant is always null for STX)
  useEffect(() => {
    if (!isSTX || !form.clientId) { setStxClientConfig(null); return; }
    getDoc(doc(db, 'clients', form.clientId, 'config', 'settings')).then(snap => {
      setStxClientConfig(snap.exists() ? snap.data() : {});
    }).catch(() => setStxClientConfig({}));
  }, [isSTX, form.clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load team members and passenger profiles for traveller autocomplete
  useEffect(() => {
    const cid = form.clientId || clientIdProp;
    if (!cid) return;
    const qUsers = query(collection(db, 'users'), where('clientId', '==', cid));
    const qPax   = query(collection(db, 'clients', cid, 'passengers'), orderBy('lastName'));
    const u1 = onSnapshot(qUsers, snap =>
      setTeamMembers(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(m => m.active !== false))
    );
    const u2 = onSnapshot(qPax, snap =>
      setPassengers(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    return () => { u1(); u2(); };
  }, [form.clientId, clientIdProp]); // eslint-disable-line react-hooks/exhaustive-deps

  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const matchedPassenger = useMemo(() => {
    if (!passengers.length) return null;
    if (form.travellerId) return passengers.find(p => p.userId === form.travellerId) || null;
    if (!form.travellerName) return null;
    const lower = form.travellerName.toLowerCase();
    return passengers.find(p =>
      [p.preferredName || p.firstName, p.lastName].filter(Boolean).join(' ').toLowerCase() === lower ||
      [p.firstName, p.lastName].filter(Boolean).join(' ').toLowerCase() === lower
    ) || null;
  }, [passengers, form.travellerId, form.travellerName]);

  const tripTypes   = clientConfig?.dropdowns?.tripTypes?.length
    ? clientConfig.dropdowns.tripTypes
    : DEFAULT_TRIP_TYPES;
  const costCentres = clientConfig?.dropdowns?.costCentres || [];

  const updateSector = (i, updated) =>
    setForm(p => { const s = [...p.sectors]; s[i] = updated; return { ...p, sectors: s }; });

  const removeSector = (i) => {
    const removedKey = form.sectors[i]?._key;
    setForm(p => ({
      ...p,
      sectors: p.sectors.filter((_, j) => j !== i),
      additionalPassengers: p.additionalPassengers.map(pax => ({
        ...pax,
        sectorKeys: (pax.sectorKeys || []).filter(k => k !== removedKey),
      })),
    }));
  };

  const addSector = () =>
    setForm(p => ({ ...p, sectors: [...p.sectors, { _key: Math.random().toString(36).slice(2), type: '' }] }));

  // ── Hotel booking via Nuitee (new tab + postMessage) ──────────────────────
  const hotelWindowRef = useRef(null);
  const [nuiteeBooked, setNuiteeBooked] = useState(false);

  useEffect(() => {
    const handleMessage = (e) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type !== 'HOTEL_BOOKED') return;
      const { sectorIndex, bookingData } = e.data;
      if (typeof sectorIndex !== 'number' || !bookingData) return;
      setForm(prev => {
        const sectors = [...prev.sectors];
        const sector = sectors[sectorIndex];
        if (!sector) return prev;
        sectors[sectorIndex] = {
          ...sector,
          propertyName: bookingData.propertyName || sector.propertyName || '',
          bookingRef:   bookingData.bookingRef   || sector.bookingRef   || '',
          checkIn:      bookingData.checkIn      || sector.checkIn      || '',
          checkOut:     bookingData.checkOut     || sector.checkOut     || '',
          cost:         bookingData.cost         || sector.cost         || '',
          roomType:     bookingData.roomType     || sector.roomType     || '',
          inclusions:   bookingData.inclusions   || sector.inclusions   || '',
          notes:        bookingData.notes        || sector.notes        || '',
          international: bookingData.international ?? sector.international ?? false,
          reportingCity: bookingData.hotelCity   || sector.reportingCity || '',
        };
        return { ...prev, sectors };
      });
      setNuiteeBooked(true);
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const openHotelBooking = (sectorIndex) => {
    const cid = form.clientId || clientIdProp || '';
    const params = new URLSearchParams({
      tripId:          trip?.id || '',
      sectorIndex:     String(sectorIndex),
      tripType:        form.tripType || '',
      clientId:        cid,
      checkin:         form.sectors[sectorIndex]?.checkIn  || form.startDate || '',
      checkout:        form.sectors[sectorIndex]?.checkOut || form.endDate   || '',
      travellerName:   form.travellerName || '',
      destinationCity: form.destinationCity || '',
      email:           matchedPassenger?.email || '',
    });
    const url = `/hotel-booking?${params.toString()}`;
    if (hotelWindowRef.current && !hotelWindowRef.current.closed) {
      hotelWindowRef.current.focus();
    } else {
      hotelWindowRef.current = window.open(url, '_blank', 'width=1200,height=800');
    }
  };

  const totalCost = form.sectors.reduce((sum, s) => sum + (parseFloat(s.cost) || 0), 0);

  // Equal-split allocation across all passengers
  const allocation = useMemo(() => {
    const numPax = 1 + (form.additionalPassengers || []).length;
    const autoPerPax = numPax > 1 ? totalCost / numPax : totalCost;

    const primaryDisplayed = form.primaryAllocatedCostOverride
      ? (parseFloat(form.primaryAllocatedCost) || 0)
      : autoPerPax;

    const addPaxDisplayed = (form.additionalPassengers || []).map(p =>
      p.allocatedCostOverride ? (parseFloat(p.allocatedCost) || 0) : autoPerPax
    );

    const allocatedTotal = primaryDisplayed + addPaxDisplayed.reduce((s, v) => s + v, 0);
    const isBalanced = numPax <= 1 || Math.abs(allocatedTotal - totalCost) < 0.005;

    return { autoPerPax, primaryDisplayed, addPaxDisplayed, allocatedTotal, isBalanced };
  }, [totalCost, form.primaryAllocatedCost, form.primaryAllocatedCostOverride, form.additionalPassengers]);

  const addAdditionalPassenger = () =>
    setForm(p => ({
      ...p,
      additionalPassengers: [
        ...p.additionalPassengers,
        { _key: Math.random().toString(36).slice(2), name: '', passengerId: '', costCentre: '', sectorKeys: [], allocatedCost: '', allocatedCostOverride: false },
      ],
    }));

  const updateAdditionalPassenger = (i, updated) =>
    setForm(p => {
      const list = [...p.additionalPassengers];
      list[i] = updated;
      return { ...p, additionalPassengers: list };
    });

  const removeAdditionalPassenger = (i) =>
    setForm(p => ({ ...p, additionalPassengers: p.additionalPassengers.filter((_, j) => j !== i) }));

  const handleSave = async (submitForApproval = false) => {
    setError('');
    if (isSTX && !form.clientId) return setError('Please select a client for this trip.');
    if (!form.title.trim())         return setError('Trip title is required.');
    if (!form.travellerName.trim()) return setError('Traveller name is required.');
    if (trip && form.costCentre !== originalCostCentre && !form.costCentreChangeReason.trim()) {
      return setError('Please provide a reason for changing the cost centre.');
    }

    const namedAddPax = form.additionalPassengers.filter(p => p.name?.trim());
    if (namedAddPax.length > 0 && !allocation.isBalanced) {
      return setError(
        `Passenger cost allocations (A$${allocation.allocatedTotal.toFixed(2)}) must equal the trip total ` +
        `(A$${totalCost.toFixed(2)}). Adjust the amounts or click "Reset to auto" to re-split evenly.`
      );
    }

    setSaving(true);
    try {
      const typedSectors = form.sectors.filter(s => s.type);
      const keyToIdx = {};
      typedSectors.forEach((s, i) => { keyToIdx[s._key] = i; });

      const sectors = typedSectors.map(({ _key, ...rest }) => rest);

      const additionalPassengers = form.additionalPassengers
        .map(({ _key, sectorKeys, allocatedCostOverride, ...rest }, origIdx) => ({
          ...rest,
          sectorIndices: (sectorKeys || []).map(k => keyToIdx[k]).filter(i => i !== undefined),
          allocatedCost: Math.round((allocation.addPaxDisplayed[origIdx] ?? 0) * 100) / 100,
        }))
        .filter(p => p.name?.trim());

      const primaryAllocatedCost = namedAddPax.length > 0
        ? Math.round(allocation.primaryDisplayed * 100) / 100
        : null;

      let status = trip?.status || 'draft';
      if (nuiteeBooked) {
        status = 'booked';
      } else if (submitForApproval) {
        const byType = clientConfig?.workflow?.approvalByTripType;
        const needsApproval = (byType && form.tripType in byType)
          ? byType[form.tripType]
          : clientConfig?.workflow?.requiresApproval !== false;
        status = needsApproval ? 'pending_approval' : 'approved';
      } else if (status === 'declined') {
        status = 'draft';
      }

      await onSave({ ...form, sectors, additionalPassengers, primaryAllocatedCost, status, totalCost });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const isDraftOrDeclined = !trip || ['draft', 'declined'].includes(trip.status);

  // Approval required for this trip type?
  const tripNeedsApproval = (() => {
    const byType = clientConfig?.workflow?.approvalByTripType;
    return (byType && form.tripType in byType)
      ? byType[form.tripType]
      : clientConfig?.workflow?.requiresApproval !== false;
  })();

  // Hotel booking unlocked when: already approved/booked, OR no approval required (even before first save)
  const tripIsBookable = ['approved', 'booked'].includes(trip?.status) || !tripNeedsApproval;

  // Cost centre editable by STX or client approvers/ops only on existing trips
  const canEditCostCentre = !trip || isSTX || ['client_approver', 'client_ops'].includes(userProfile?.role);

  // Hotel booking feature gate — respects per-trip-type self-managed override
  const selfManagedHotelEnabled = clientConfig?.hotelBooking?.selfManagedHotelBooking !== false;
  const hotelBookingAllowedForTripType =
    clientConfig?.features?.hotelBooking !== false &&
    (form.tripType !== 'Self-Managed' || selfManagedHotelEnabled);

  return (
    <div className="space-y-5">
      {/* Nuitee booking confirmed banner */}
      {nuiteeBooked && (
        <div className="p-3 bg-teal-50 border border-teal-300 rounded-lg flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-teal-800">
            <CheckCircle size={15} className="text-teal-600 flex-shrink-0" />
            <span><strong>Hotel booked via Nuitee.</strong> Save the trip below — status will update to <strong>Booked</strong> automatically.</span>
          </div>
        </div>
      )}

      {/* Client selector — STX users only */}
      {isSTX && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <label className={lbl}>Client *</label>
          <select
            className={inp}
            value={form.clientId}
            onChange={e => set('clientId', e.target.value)}
          >
            <option value="">Select client…</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}

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
          <input
            className={inp}
            value={form.travellerName}
            onChange={e => {
              const name  = e.target.value;
              const lower = name.toLowerCase();
              // Match against passenger profiles first (preferred), then team members
              const paxMatch = passengers.find(p =>
                [p.preferredName || p.firstName, p.lastName].filter(Boolean).join(' ').toLowerCase() === lower ||
                [p.firstName, p.lastName].filter(Boolean).join(' ').toLowerCase() === lower
              );
              if (paxMatch) {
                const linkedUser = paxMatch.userId ? teamMembers.find(m => m.id === paxMatch.userId) : null;
                setForm(p => ({
                  ...p,
                  travellerName: name,
                  travellerId:   paxMatch.userId || '',
                  ...(linkedUser?.costCentre ? { costCentre: linkedUser.costCentre } : {}),
                }));
              } else {
                const memberMatch = teamMembers.find(m =>
                  [m.firstName, m.lastName].filter(Boolean).join(' ').toLowerCase() === lower
                );
                setForm(p => ({
                  ...p,
                  travellerName: name,
                  travellerId:   memberMatch ? memberMatch.id : '',
                  ...(memberMatch?.costCentre ? { costCentre: memberMatch.costCentre } : {}),
                }));
              }
            }}
            placeholder="Type name or select from passenger profiles"
            list="trip-form-travellers"
            autoComplete="off"
          />
          <datalist id="trip-form-travellers">
            {passengers.map(p => (
              <option
                key={`pax-${p.id}`}
                value={[p.preferredName || p.firstName, p.lastName].filter(Boolean).join(' ')}
              />
            ))}
            {teamMembers
              .filter(m => !passengers.some(p => p.userId === m.id))
              .map(m => (
                <option key={`mem-${m.id}`} value={[m.firstName, m.lastName].filter(Boolean).join(' ')} />
              ))}
          </datalist>
          {matchedPassenger?.preferredName && matchedPassenger.preferredName !== matchedPassenger.firstName && (
            <div className="mt-1.5 flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertTriangle size={13} className="text-amber-600 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-amber-800">
                <span className="font-semibold">Name mismatch:</span> Known as{' '}
                <span className="font-semibold">{matchedPassenger.preferredName}</span> but legal name is{' '}
                <span className="font-semibold">{matchedPassenger.firstName} {matchedPassenger.lastName}</span>.
                {' '}Ensure flight tickets are booked using the legal name.
              </p>
            </div>
          )}
        </div>

        <div>
          <label className={lbl}>Trip type</label>
          <select className={inp} value={form.tripType} onChange={e => set('tripType', e.target.value)}>
            <option value="">Select…</option>
            {tripTypes.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>

        <div>
          <label className={lbl}>Start date</label>
          <input type="date" className={inp} value={form.startDate} onChange={e => set('startDate', e.target.value)} />
        </div>

        <div>
          <label className={lbl}>End date</label>
          <input type="date" className={inp} value={form.endDate} onChange={e => set('endDate', e.target.value)} />
        </div>

        <div>
          <label className={lbl}>Origin city</label>
          <input
            className={inp}
            list="trip-form-cities"
            value={form.originCity}
            onChange={e => set('originCity', e.target.value)}
            placeholder="e.g. Brisbane"
            autoComplete="off"
          />
        </div>

        <div>
          <label className={lbl}>Destination city</label>
          <input
            className={inp}
            list="trip-form-cities"
            value={form.destinationCity}
            onChange={e => set('destinationCity', e.target.value)}
            placeholder="e.g. Sydney"
            autoComplete="off"
          />
        </div>

        <datalist id="trip-form-cities">
          {CITIES.map(c => <option key={c} value={c} />)}
        </datalist>

        {/* Cost centre — editable by STX/approvers only on existing trips */}
        {costCentres.length > 0 && canEditCostCentre && (
          <div>
            <label className={lbl}>Cost centre</label>
            <select className={inp} value={form.costCentre} onChange={e => set('costCentre', e.target.value)}>
              <option value="">Select…</option>
              {costCentres.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
        )}
        {costCentres.length > 0 && !canEditCostCentre && form.costCentre && (
          <div>
            <label className={lbl}>Cost centre</label>
            <p className={`${inp} bg-gray-50 text-gray-600 cursor-default`}>{form.costCentre}</p>
          </div>
        )}

        {/* Reason required when STX/approver changes cost centre on an existing trip */}
        {trip && canEditCostCentre && form.costCentre !== originalCostCentre && (
          <div className="col-span-2">
            <label className={`${lbl} text-amber-600`}>Reason for cost centre change *</label>
            <textarea
              className={`${inp} border-amber-300 focus:ring-amber-500`}
              rows={2}
              value={form.costCentreChangeReason}
              onChange={e => set('costCentreChangeReason', e.target.value)}
              placeholder="Explain why the cost centre is being changed for this trip…"
            />
          </div>
        )}

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

        {isSTX && (
          <div>
            <label className={lbl}>VTO Trip ID (STX internal — not visible to client)</label>
            <input
              className={inp}
              value={form.vtoTripId}
              onChange={e => set('vtoTripId', e.target.value)}
              placeholder="e.g. VTO-12345"
            />
          </div>
        )}

        {isSTX && form.tripType && form.tripType !== 'Self-Managed' && (
          <div>
            <label className={lbl}>Digital Itinerary link</label>
            <input
              type="url"
              className={inp}
              value={form.digitalItineraryLink}
              onChange={e => set('digitalItineraryLink', e.target.value)}
              placeholder="https://…"
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
              tripDestinationCity={form.destinationCity}
              onOpenHotelBooking={
                s.type === 'accommodation' && hotelBookingAllowedForTripType && tripIsBookable
                  ? () => openHotelBooking(i)
                  : undefined
              }
              hotelBookingLocked={
                s.type === 'accommodation' && hotelBookingAllowedForTripType && !!trip && !tripIsBookable
              }
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

      {/* Additional Passengers */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-700">Additional Passengers</h3>
            {form.additionalPassengers.length === 0 && (
              <p className="text-xs text-gray-400 mt-0.5">Add passengers travelling on this trip (each can be assigned to specific sectors and cost centres)</p>
            )}
          </div>
          <button
            type="button"
            onClick={addAdditionalPassenger}
            className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800"
          >
            <Plus size={14} /> Add passenger
          </button>
        </div>

        {form.additionalPassengers.length > 0 && (
          <div className="space-y-3">
            {/* Primary traveller cost row */}
            <div className="border border-blue-200 rounded-lg p-3 bg-blue-50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Passenger 1 — Primary</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium text-gray-800 flex-1">{form.travellerName || '—'}</span>
                {form.costCentre && <span className="text-xs text-gray-400">{form.costCentre}</span>}
              </div>
              <div>
                <label className={lbl}>Allocated cost incl. GST (A$)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number" min="0" step="0.01"
                    className={`${inp} w-36`}
                    value={form.primaryAllocatedCostOverride
                      ? (form.primaryAllocatedCost ?? '')
                      : allocation.autoPerPax.toFixed(2)}
                    onChange={e => setForm(p => ({ ...p, primaryAllocatedCost: e.target.value, primaryAllocatedCostOverride: true }))}
                  />
                  {form.primaryAllocatedCostOverride ? (
                    <button
                      type="button"
                      onClick={() => setForm(p => ({ ...p, primaryAllocatedCostOverride: false, primaryAllocatedCost: '' }))}
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      Reset to auto
                    </button>
                  ) : (
                    <span className="text-xs text-gray-400">
                      Auto-split ({1 + form.additionalPassengers.length} passengers)
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Additional passenger cards */}
            {form.additionalPassengers.map((pax, i) => (
              <AdditionalPassengerCard
                key={pax._key}
                pax={pax}
                index={i}
                sectors={form.sectors}
                passengers={passengers}
                teamMembers={teamMembers}
                costCentres={costCentres}
                autoAllocated={allocation.autoPerPax}
                onChange={updated => updateAdditionalPassenger(i, updated)}
                onRemove={() => removeAdditionalPassenger(i)}
              />
            ))}

            {/* Balance indicator */}
            <div className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm border ${
              allocation.isBalanced
                ? 'bg-green-50 border-green-200'
                : 'bg-red-50 border-red-200'
            }`}>
              <span className={`font-medium ${allocation.isBalanced ? 'text-green-700' : 'text-red-700'}`}>
                {allocation.isBalanced ? '✓ Allocations balanced' : '⚠ Allocations unbalanced — cannot save'}
              </span>
              <span className={`text-xs tabular-nums ${allocation.isBalanced ? 'text-green-600' : 'text-red-600'}`}>
                A${allocation.allocatedTotal.toFixed(2)} allocated / A${totalCost.toFixed(2)} total
                {!allocation.isBalanced && (
                  <span className="ml-1 font-semibold">
                    ({allocation.allocatedTotal > totalCost ? '+' : ''}{(allocation.allocatedTotal - totalCost).toFixed(2)})
                  </span>
                )}
              </span>
            </div>
          </div>
        )}
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
        {isDraftOrDeclined ? (
          <>
            <button
              type="button"
              onClick={() => handleSave(false)}
              disabled={saving}
              className="px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save draft'}
            </button>
            <button
              type="button"
              onClick={() => handleSave(true)}
              disabled={saving}
              className="px-5 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Submitting…' : 'Submit for approval'}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => handleSave(false)}
            disabled={saving}
            className="px-5 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        )}
      </div>
    </div>
  );
}
