import React, { useState, useMemo } from 'react';
import { Plus, Search, Eye, Edit2, Trash2, Paperclip, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';

// Returns the GST-exclusive total cost for a trip (sector costs back-calculated + fees already ex-GST)
export function calcTripExGST(trip, gstRate = 0.1) {
  const sectors = (trip.sectors || []).reduce((sum, s) => {
    const c = parseFloat(s.cost) || 0;
    let gross = c;
    if (s.type === 'accommodation' && s.checkIn && s.checkOut) {
      const nights = Math.max(0, Math.round((new Date(s.checkOut) - new Date(s.checkIn)) / 86400000));
      gross = c * nights;
    }
    return sum + (s.international ? gross : gross / (1 + gstRate));
  }, 0);
  const fees = (trip.fees || []).reduce((sum, f) => sum + (parseFloat(f.amount) || 0), 0);
  return sectors + fees;
}

export const STATUS_CONFIG = {
  draft:            { label: 'Draft',           cls: 'bg-gray-100 text-gray-600' },
  pending_approval: { label: 'Pending Approval', cls: 'bg-amber-100 text-amber-700' },
  approved:         { label: 'Approved',         cls: 'bg-green-100 text-green-700' },
  declined:         { label: 'Declined',         cls: 'bg-red-100 text-red-700' },
  booked:           { label: 'Booked',           cls: 'bg-indigo-100 text-indigo-700' },
  travelling:       { label: 'Travelling',       cls: 'bg-purple-100 text-purple-700' },
  completed:        { label: 'Completed',        cls: 'bg-teal-100 text-teal-700' },
  cancelled:        { label: 'Cancelled',        cls: 'bg-gray-200 text-gray-500' },
};

export function getDisplayStatus(trip) {
  if (trip.status !== 'booked') return trip.status;
  const today = new Date().toISOString().slice(0, 10);
  if (trip.endDate && today > trip.endDate)      return 'completed';
  if (trip.startDate && today >= trip.startDate) return 'travelling';
  return 'booked';
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtDate(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-');
  return `${d}-${MONTHS[parseInt(m, 10) - 1]}-${y.slice(2)}`;
}

export function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || { label: status, cls: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

// ── Date range helpers ────────────────────────────────────────────────────────

function pad(n) { return String(n).padStart(2, '0'); }
function isoDate(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

function getQuickRange(key) {
  const now  = new Date();
  const y    = now.getFullYear();
  const m    = now.getMonth(); // 0-based
  if (key === 'thisMonth') {
    return { from: `${y}-${pad(m + 1)}-01`, to: isoDate(new Date(y, m + 1, 0)) };
  }
  if (key === 'lastMonth') {
    const last = new Date(y, m, 0);
    return { from: `${last.getFullYear()}-${pad(last.getMonth() + 1)}-01`, to: isoDate(last) };
  }
  if (key === 'thisQuarter') {
    const q = Math.floor(m / 3);
    return { from: isoDate(new Date(y, q * 3, 1)), to: isoDate(new Date(y, q * 3 + 3, 0)) };
  }
  if (key === 'lastQuarter') {
    const q = Math.floor(m / 3);
    const s = q === 0 ? new Date(y - 1, 9, 1) : new Date(y, (q - 1) * 3, 1);
    const e = q === 0 ? new Date(y - 1, 12, 0) : new Date(y, q * 3, 0);
    return { from: isoDate(s), to: isoDate(e) };
  }
  if (key === 'thisFY') {
    const fyStart = m >= 6 ? y : y - 1;
    return { from: `${fyStart}-07-01`, to: `${fyStart + 1}-06-30` };
  }
  if (key === 'lastFY') {
    const fyStart = (m >= 6 ? y : y - 1) - 1;
    return { from: `${fyStart}-07-01`, to: `${fyStart + 1}-06-30` };
  }
  return { from: '', to: '' };
}

const QUICK_OPTIONS = [
  { key: 'thisMonth',    label: 'This month' },
  { key: 'lastMonth',    label: 'Last month' },
  { key: 'thisQuarter',  label: 'This quarter' },
  { key: 'lastQuarter',  label: 'Last quarter' },
  { key: 'thisFY',       label: 'This FY' },
  { key: 'lastFY',       label: 'Last FY' },
];

const sel = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white';

export default function TripList({ trips, loading, onNew, onView, onEdit, onDelete, canCreate, initialStatusFilter = '' }) {
  const { userProfile } = useAuth();
  const { isSTX } = useTenant();

  const [search,          setSearch]          = useState('');
  const [statusFilter,    setStatusFilter]    = useState(initialStatusFilter);
  const [tripTypeFilter,  setTripTypeFilter]  = useState('');
  const [costCentreFilter,setCostCentreFilter]= useState('');
  const [destCityFilter,  setDestCityFilter]  = useState('');
  const [dateFrom,        setDateFrom]        = useState('');
  const [dateTo,          setDateTo]          = useState('');
  const [quickDate,       setQuickDate]       = useState('');

  const isAdmin    = userProfile?.role === 'stx_admin';
  const canEditTrip= ['stx_admin', 'stx_ops', 'client_ops', 'client_traveller'].includes(userProfile?.role);

  // Derive unique values for filter dropdowns from the full (unfiltered) trips list
  const allTripTypes   = useMemo(() => [...new Set(trips.map(t => t.tripType).filter(Boolean))].sort(), [trips]);
  const allCostCentres = useMemo(() => [...new Set(trips.map(t => t.costCentre).filter(Boolean))].sort(), [trips]);
  const allDestCities  = useMemo(() => [...new Set(trips.map(t => t.destinationCity).filter(Boolean))].sort(), [trips]);

  const applyQuick = (key) => {
    const { from, to } = getQuickRange(key);
    setDateFrom(from);
    setDateTo(to);
    setQuickDate(key);
  };

  const clearDateFilters = () => { setDateFrom(''); setDateTo(''); setQuickDate(''); };

  const hasFilters = !!(statusFilter || tripTypeFilter || costCentreFilter || destCityFilter || dateFrom || dateTo);
  const clearAll   = () => {
    setStatusFilter(''); setTripTypeFilter(''); setCostCentreFilter('');
    setDestCityFilter(''); clearDateFilters();
  };

  const filtered = useMemo(() => {
    return trips.filter(t => {
      const q = search.toLowerCase();
      if (q && !t.title?.toLowerCase().includes(q) && !t.travellerName?.toLowerCase().includes(q) &&
          !t.destinationCity?.toLowerCase().includes(q) && !t.originCity?.toLowerCase().includes(q)) return false;
      if (statusFilter    && getDisplayStatus(t) !== statusFilter)  return false;
      if (tripTypeFilter  && t.tripType   !== tripTypeFilter)        return false;
      if (costCentreFilter&& t.costCentre !== costCentreFilter)      return false;
      if (destCityFilter  && t.destinationCity !== destCityFilter)   return false;
      if (dateFrom        && (t.startDate || '') < dateFrom)         return false;
      if (dateTo          && (t.startDate || '') > dateTo)           return false;
      return true;
    });
  }, [trips, search, statusFilter, tripTypeFilter, costCentreFilter, destCityFilter, dateFrom, dateTo]);

  if (loading) {
    return <p className="text-sm text-gray-400 py-8 text-center">Loading trips…</p>;
  }

  return (
    <div>
      {/* ── Row 1: Search + New trip ── */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search trips…"
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {canCreate && (
          <button
            onClick={onNew}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 ml-auto"
          >
            <Plus size={15} /> New trip
          </button>
        )}
      </div>

      {/* ── Row 2: Dropdown filters ── */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select value={statusFilter}     onChange={e => setStatusFilter(e.target.value)}     className={sel}>
          <option value="">All statuses</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>

        {allTripTypes.length > 0 && (
          <select value={tripTypeFilter} onChange={e => setTripTypeFilter(e.target.value)} className={sel}>
            <option value="">All trip types</option>
            {allTripTypes.map(t => <option key={t}>{t}</option>)}
          </select>
        )}

        {allCostCentres.length > 0 && (
          <select value={costCentreFilter} onChange={e => setCostCentreFilter(e.target.value)} className={sel}>
            <option value="">All cost centres</option>
            {allCostCentres.map(c => <option key={c}>{c}</option>)}
          </select>
        )}

        {allDestCities.length > 0 && (
          <select value={destCityFilter} onChange={e => setDestCityFilter(e.target.value)} className={sel}>
            <option value="">All destinations</option>
            {allDestCities.map(c => <option key={c}>{c}</option>)}
          </select>
        )}

        {hasFilters && (
          <button
            onClick={clearAll}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 px-2 py-1 rounded hover:bg-gray-100 ml-auto"
          >
            <X size={12} /> Clear filters
          </button>
        )}
      </div>

      {/* ── Row 3: Date filter ── */}
      <div className="flex flex-wrap items-center gap-2 mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
        <span className="text-xs font-medium text-gray-500 shrink-0">Travel dates:</span>
        <div className="flex flex-wrap gap-1">
          {QUICK_OPTIONS.map(o => (
            <button
              key={o.key}
              onClick={() => quickDate === o.key ? clearDateFilters() : applyQuick(o.key)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                quickDate === o.key
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 border border-gray-300 hover:border-blue-400 hover:text-blue-600'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          <input
            type="date"
            value={dateFrom}
            onChange={e => { setDateFrom(e.target.value); setQuickDate(''); }}
            className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-gray-400 text-xs">→</span>
          <input
            type="date"
            value={dateTo}
            onChange={e => { setDateTo(e.target.value); setQuickDate(''); }}
            className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {(dateFrom || dateTo) && (
            <button onClick={clearDateFilters} className="text-gray-400 hover:text-gray-700 p-0.5 rounded">
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* ── Trip table ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">
            {trips.length === 0
              ? 'No trips yet. Click "New trip" to create one.'
              : 'No trips match your filters.'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">Ref</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Trip</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Traveller</th>
                {isSTX && <th className="text-left px-4 py-3 font-medium text-gray-600">Client</th>}
                <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Destination</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Dates</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Ex-GST</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((trip, i) => (
                <tr
                  key={trip.id}
                  className={`border-b border-gray-100 last:border-0 hover:bg-blue-50 cursor-pointer transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
                  onClick={() => onView(trip)}
                >
                  <td className="px-4 py-3 text-xs text-gray-400 font-mono hidden sm:table-cell whitespace-nowrap">
                    {trip.tripRef || '—'}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-800">
                    <span className="flex items-center gap-1.5">
                      {trip.title || '—'}
                      {(trip.attachments?.length ?? 0) > 0 && (
                        <Paperclip size={11} className="text-gray-400 shrink-0" title={`${trip.attachments.length} attachment${trip.attachments.length !== 1 ? 's' : ''}`} />
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{trip.travellerName || '—'}</td>
                  {isSTX && <td className="px-4 py-3 text-gray-500 text-xs">{trip.clientId || '—'}</td>}
                  <td className="px-4 py-3 text-gray-500">{trip.tripType || '—'}</td>
                  <td className="px-4 py-3 text-gray-500 hidden md:table-cell">
                    {trip.originCity && trip.destinationCity
                      ? <span className="text-xs">{trip.originCity} → {trip.destinationCity}</span>
                      : trip.destinationCity
                        ? <span className="text-xs">{trip.destinationCity}</span>
                        : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                    {trip.startDate
                      ? `${fmtDate(trip.startDate)}${trip.endDate && trip.endDate !== trip.startDate ? ` → ${fmtDate(trip.endDate)}` : ''}`
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 text-xs tabular-nums whitespace-nowrap">
                    {(() => { const v = calcTripExGST(trip); return v > 0 ? `A$${v.toFixed(2)}` : '—'; })()}
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={getDisplayStatus(trip)} /></td>
                  <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => onView(trip)} className="text-blue-600 hover:text-blue-800 p-1 rounded" title="View trip">
                        <Eye size={14} />
                      </button>
                      {canEditTrip && trip.status !== 'cancelled' && (
                        <button onClick={() => onEdit(trip)} className="text-gray-400 hover:text-gray-700 p-1 rounded" title="Edit trip">
                          <Edit2 size={14} />
                        </button>
                      )}
                      {isAdmin && (
                        <button onClick={() => onDelete(trip)} className="text-gray-400 hover:text-red-600 p-1 rounded" title="Delete trip">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-xs text-gray-400 mt-2">
        {filtered.length} of {trips.length} trip{trips.length !== 1 ? 's' : ''}
        {hasFilters && ' · filters active'}
      </p>
    </div>
  );
}
