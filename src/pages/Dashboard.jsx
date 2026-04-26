import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import { useTrips } from '../hooks/useTrips';
import { STATUS_CONFIG, StatusBadge, getDisplayStatus } from '../components/trips/TripList';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtDate(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-');
  return `${d}-${MONTHS[parseInt(m, 10) - 1]}-${y.slice(2)}`;
}

const STAT_ORDER = ['draft','pending_approval','approved','booked','travelling','completed','declined','cancelled'];

export default function Dashboard() {
  const { userProfile } = useAuth();
  const { clientConfig, isSTX, clientId } = useTenant();
  const { trips, loading } = useTrips(clientId, isSTX);

  const title = isSTX
    ? 'STX Global Dashboard'
    : clientConfig?.branding?.portalTitle ?? 'Dashboard';

  // Status counts using computed display status
  const counts = Object.fromEntries(STAT_ORDER.map(k => [k, 0]));
  trips.forEach(t => {
    const ds = getDisplayStatus(t);
    if (ds in counts) counts[ds]++;
  });

  const today = new Date().toISOString().slice(0, 10);
  const in60  = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);

  const upcoming = trips
    .filter(t => t.startDate >= today && t.startDate <= in60 && ['approved', 'booked'].includes(t.status))
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .slice(0, 6);

  const recent = trips.slice(0, 8);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-1">{title}</h1>
      <p className="text-gray-500 text-sm mb-6">
        Welcome back, {userProfile?.displayName || userProfile?.email}
      </p>

      {loading ? (
        <div className="text-center text-gray-400 py-12 text-sm">Loading…</div>
      ) : (
        <>
          {/* Status stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {STAT_ORDER.map(status => {
              const cfg = STATUS_CONFIG[status];
              return (
                <div key={status} className="bg-white border border-gray-200 rounded-xl p-4">
                  <p className="text-2xl font-bold text-gray-800">{counts[status]}</p>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium mt-1.5 ${cfg.cls}`}>
                    {cfg.label}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Upcoming trips */}
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Upcoming trips (next 60 days)</h2>
              {upcoming.length === 0 ? (
                <p className="text-xs text-gray-400">No upcoming approved or booked trips.</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {upcoming.map(t => (
                    <div key={t.id} className="flex items-center gap-3 py-2">
                      <span className="text-xs text-gray-400 w-20 shrink-0">{fmtDate(t.startDate)}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 truncate">{t.title || '—'}</p>
                        {t.travellerName && <p className="text-xs text-gray-400 truncate">{t.travellerName}</p>}
                      </div>
                      <StatusBadge status={getDisplayStatus(t)} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent trips */}
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Recent trips</h2>
              {recent.length === 0 ? (
                <p className="text-xs text-gray-400">No trips yet.</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {recent.map(t => (
                    <div key={t.id} className="flex items-center gap-3 py-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 truncate">{t.title || '—'}</p>
                        <p className="text-xs text-gray-400 truncate">
                          {t.travellerName || ''}
                          {isSTX && t.clientId ? ` · ${t.clientId}` : ''}
                          {t.startDate ? ` · ${fmtDate(t.startDate)}` : ''}
                        </p>
                      </div>
                      <StatusBadge status={getDisplayStatus(t)} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
