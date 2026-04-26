import React, { useState } from 'react';
import { Plus, Search, Eye, Edit2, Trash2, Paperclip } from 'lucide-react';
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

// Derives the display status from stored status + trip dates.
// Travelling and Completed are computed — only Booked is stored in Firestore.
export function getDisplayStatus(trip) {
  if (trip.status !== 'booked') return trip.status;
  const today = new Date().toISOString().slice(0, 10);
  if (trip.endDate && today > trip.endDate)     return 'completed';
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

export default function TripList({ trips, loading, onNew, onView, onEdit, onDelete, canCreate, initialStatusFilter = '' }) {
  const { userProfile } = useAuth();
  const { isSTX } = useTenant();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(initialStatusFilter);

  const isAdmin = userProfile?.role === 'stx_admin';
  const canEditTrip = ['stx_admin', 'stx_ops', 'client_ops', 'client_traveller'].includes(userProfile?.role);

  const filtered = trips.filter(t => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      t.title?.toLowerCase().includes(q) ||
      t.travellerName?.toLowerCase().includes(q) ||
      t.tripType?.toLowerCase().includes(q) ||
      t.costCentre?.toLowerCase().includes(q);
    const matchStatus = !statusFilter || getDisplayStatus(t) === statusFilter;
    return matchSearch && matchStatus;
  });

  if (loading) {
    return <p className="text-sm text-gray-400 py-8 text-center">Loading trips…</p>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search trips…"
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All statuses</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        {canCreate && (
          <button
            onClick={onNew}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 ml-auto"
          >
            <Plus size={15} /> New trip
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">
            {trips.length === 0
              ? 'No trips yet. Click "New trip" to create one.'
              : 'No trips match your search.'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Trip</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Traveller</th>
                {isSTX && <th className="text-left px-4 py-3 font-medium text-gray-600">Client</th>}
                <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
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
                      <button
                        onClick={() => onView(trip)}
                        className="text-blue-600 hover:text-blue-800 p-1 rounded"
                        title="View trip"
                      >
                        <Eye size={14} />
                      </button>
                      {canEditTrip && trip.status !== 'cancelled' && (
                        <button
                          onClick={() => onEdit(trip)}
                          className="text-gray-400 hover:text-gray-700 p-1 rounded"
                          title="Edit trip"
                        >
                          <Edit2 size={14} />
                        </button>
                      )}
                      {isAdmin && (
                        <button
                          onClick={() => onDelete(trip)}
                          className="text-gray-400 hover:text-red-600 p-1 rounded"
                          title="Delete trip"
                        >
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
        {filtered.length} trip{filtered.length !== 1 ? 's' : ''}
        {statusFilter && ` · filtered by "${STATUS_CONFIG[statusFilter]?.label}"`}
      </p>
    </div>
  );
}
