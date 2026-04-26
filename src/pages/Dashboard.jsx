import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import { useTrips } from '../hooks/useTrips';
import { STATUS_CONFIG, StatusBadge, getDisplayStatus } from '../components/trips/TripList';

// ── helpers ────────────────────────────────────────────────────────────────────

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtDate(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-');
  return `${d}-${MONTHS[parseInt(m, 10) - 1]}-${y.slice(2)}`;
}

function fmtAUD(n) {
  return `A$${Math.round(n).toLocaleString()}`;
}

function fmtAUDShort(n) {
  if (n >= 1000) return `A$${(n / 1000).toFixed(1)}k`;
  return `A$${Math.round(n)}`;
}

function calcTripCost(trip) {
  return (trip.sectors || []).reduce((sum, s) => {
    const c = parseFloat(s.cost) || 0;
    if (s.type === 'accommodation' && s.checkIn && s.checkOut) {
      const nights = Math.max(0, Math.round((new Date(s.checkOut) - new Date(s.checkIn)) / 86400000));
      return sum + c * nights;
    }
    return sum + c;
  }, 0);
}

// Australian financial year starts 1 July
function getFYStartYear(offsetYears = 0) {
  const now = new Date();
  const base = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return base - offsetYears;
}

// Returns 0-11 (Jul=0 … Jun=11) for dates within the FY starting fyStartYear, else -1
function fyMonthIndex(dateStr, fyStartYear) {
  if (!dateStr) return -1;
  const [y, m] = dateStr.split('-').map(Number);
  if (m >= 7 && y === fyStartYear)     return m - 7;   // Jul-Dec → 0-5
  if (m < 7  && y === fyStartYear + 1) return m + 5;   // Jan-Jun → 6-11
  return -1;
}

const FY_MONTH_LABELS = ['Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May','Jun'];
const SPEND_STATUSES  = new Set(['approved','booked','travelling','completed']);

// ── chart tooltip ──────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 shadow text-xs">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>{p.name}: {fmtAUD(p.value)}</p>
      ))}
    </div>
  );
}

const STAT_ORDER = ['draft','pending_approval','approved','booked','travelling','completed','declined','cancelled'];

// ── component ──────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { userProfile } = useAuth();
  const { clientConfig, isSTX, clientId } = useTenant();
  const navigate = useNavigate();

  const { trips, loading } = useTrips(clientId, isSTX);

  const role = userProfile?.role;
  const isApprover = ['stx_admin', 'stx_ops', 'client_approver'].includes(role);

  const title = isSTX
    ? 'STX Global Dashboard'
    : clientConfig?.branding?.portalTitle ?? 'Dashboard';

  // ── status counts ────────────────────────────────────────────────────────────
  const counts = useMemo(() => {
    const c = Object.fromEntries(STAT_ORDER.map(k => [k, 0]));
    trips.forEach(t => {
      const ds = getDisplayStatus(t);
      if (ds in c) c[ds]++;
    });
    return c;
  }, [trips]);

  // ── expenditure data ─────────────────────────────────────────────────────────
  const currentFY = getFYStartYear(0);
  const prevFY    = getFYStartYear(1);
  const currentFYLabel = `FY${currentFY}/${String(currentFY + 1).slice(2)}`;
  const prevFYLabel    = `FY${prevFY}/${String(prevFY + 1).slice(2)}`;

  const { monthlyData, costCentreData, currentFYTotal, prevFYTotal, hasPrevData } = useMemo(() => {
    const curMonths  = Array(12).fill(0);
    const prevMonths = Array(12).fill(0);
    const centres    = {};
    let curTotal = 0, prevTotal = 0;

    trips.forEach(t => {
      if (!SPEND_STATUSES.has(getDisplayStatus(t))) return;
      const cost = calcTripCost(t);
      if (!cost || !t.startDate) return;

      const ci = fyMonthIndex(t.startDate, currentFY);
      if (ci >= 0) { curMonths[ci] += cost; curTotal += cost; }

      const pi = fyMonthIndex(t.startDate, prevFY);
      if (pi >= 0) { prevMonths[pi] += cost; prevTotal += cost; }

      // cost centre — only current FY
      if (ci >= 0) {
        const cc = t.costCentre || 'Unallocated';
        centres[cc] = (centres[cc] || 0) + cost;
      }
    });

    const monthlyData = FY_MONTH_LABELS.map((month, i) => ({
      month,
      [currentFYLabel]: Math.round(curMonths[i]),
      [prevFYLabel]:    Math.round(prevMonths[i]),
    }));

    const costCentreData = Object.entries(centres)
      .map(([centre, amount]) => ({ centre, amount: Math.round(amount) }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8);

    return {
      monthlyData,
      costCentreData,
      currentFYTotal: curTotal,
      prevFYTotal: prevTotal,
      hasPrevData: prevTotal > 0,
    };
  }, [trips, currentFY, prevFY, currentFYLabel, prevFYLabel]);

  const fyChange = prevFYTotal > 0
    ? Math.round(((currentFYTotal - prevFYTotal) / prevFYTotal) * 100)
    : null;

  // ── upcoming + recent trips ──────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const in60  = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);

  const upcoming = trips
    .filter(t => t.startDate >= today && t.startDate <= in60 && ['approved', 'booked'].includes(t.status))
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .slice(0, 6);

  const recent = trips.slice(0, 8);

  // ── render ───────────────────────────────────────────────────────────────────
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
              const isPending = status === 'pending_approval';
              const clickable = isPending && counts[status] > 0 && isApprover;
              return (
                <div
                  key={status}
                  className={`bg-white border rounded-xl p-4 transition-colors
                    ${clickable
                      ? 'border-amber-300 cursor-pointer hover:bg-amber-50'
                      : 'border-gray-200'}`}
                  onClick={clickable ? () => navigate('/travel?status=pending_approval') : undefined}
                  title={clickable ? 'Click to view trips awaiting approval' : undefined}
                >
                  <p className="text-2xl font-bold text-gray-800">{counts[status]}</p>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium mt-1.5 ${cfg.cls}`}>
                    {cfg.label}
                  </span>
                  {clickable && (
                    <p className="text-xs text-amber-600 mt-1">Needs review →</p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Expenditure section */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
            {/* FY summary header */}
            <div className="flex flex-wrap items-baseline gap-4 mb-4">
              <h2 className="text-sm font-semibold text-gray-700">Expenditure — {currentFYLabel}</h2>
              <span className="text-xl font-bold text-gray-900">{fmtAUD(currentFYTotal)}</span>
              {hasPrevData && (
                <span className="text-sm text-gray-400">
                  vs {fmtAUD(prevFYTotal)} ({prevFYLabel})
                  {fyChange !== null && (
                    <span className={`ml-1 font-medium ${fyChange >= 0 ? 'text-red-500' : 'text-green-600'}`}>
                      {fyChange >= 0 ? `+${fyChange}%` : `${fyChange}%`}
                    </span>
                  )}
                </span>
              )}
            </div>

            {/* Monthly bar chart */}
            {currentFYTotal === 0 && !hasPrevData ? (
              <p className="text-xs text-gray-400 py-8 text-center">No approved spend recorded yet for this financial year.</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={monthlyData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={fmtAUDShort} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={56} />
                  <Tooltip content={<ChartTooltip />} />
                  {hasPrevData && (
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  )}
                  <Bar dataKey={currentFYLabel} fill="#3b82f6" radius={[3, 3, 0, 0]} maxBarSize={32} />
                  {hasPrevData && (
                    <Bar dataKey={prevFYLabel} fill="#d1d5db" radius={[3, 3, 0, 0]} maxBarSize={32} />
                  )}
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Cost centre + Upcoming */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            {/* Cost centre breakdown */}
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">
                Spend by cost centre — {currentFYLabel}
              </h2>
              {costCentreData.length === 0 ? (
                <p className="text-xs text-gray-400">No cost centre data for this financial year.</p>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(120, costCentreData.length * 36)}>
                  <BarChart
                    layout="vertical"
                    data={costCentreData}
                    margin={{ top: 0, right: 48, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                    <XAxis type="number" tickFormatter={fmtAUDShort} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="centre" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={90} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="amount" name="Spend" fill="#6366f1" radius={[0, 3, 3, 0]} maxBarSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

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
        </>
      )}
    </div>
  );
}
