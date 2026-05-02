import React, { useMemo, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, getDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import { useTrips } from '../hooks/useTrips';
import { useTeamScope, filterTripsByScope } from '../hooks/useTeamScope';
import { STATUS_CONFIG, StatusBadge, getDisplayStatus, calcTripExGST } from '../components/trips/TripList';

// ── helpers ────────────────────────────────────────────────────────────────────

// Convert Firestore Timestamp or ISO string → YYYY-MM-DD
function toDateStr(value) {
  if (!value) return null;
  try {
    if (typeof value.toDate === 'function') return value.toDate().toISOString().slice(0, 10);
    if (typeof value === 'string') return value.slice(0, 10);
  } catch {}
  return null;
}

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
  const sectors = (trip.sectors || []).reduce((sum, s) => sum + (parseFloat(s.cost) || 0), 0);
  const fees    = (trip.fees    || []).reduce((sum, f) => sum + (parseFloat(f.amount) || 0) * (1 + (f.gstRate ?? 0.1)), 0);
  return sectors + fees;
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
  const { clientConfig, isSTX, clientId, activeClientId, clientsList } = useTenant();
  const navigate = useNavigate();

  const { trips: allTrips, loading } = useTrips(clientId, isSTX, activeClientId);

  const role = userProfile?.role;
  const isApprover = ['stx_admin', 'stx_ops', 'client_approver'].includes(role);

  const effectiveClientId = activeClientId || clientId;
  const scope = useTeamScope(userProfile, effectiveClientId);
  const trips = useMemo(() => filterTripsByScope(allTrips, scope, userProfile), [allTrips, scope, userProfile]);

  const activeClient = clientsList?.find(c => c.id === activeClientId);
  const title = isSTX
    ? (activeClient ? `${activeClient.name} — Dashboard` : 'STX Global Dashboard')
    : clientConfig?.branding?.portalTitle ?? 'Dashboard';

  useEffect(() => {
    document.title = `Dashboard — STX Connect`;
  }, []);

  // B3: Budget data
  const [budgets, setBudgets] = useState(null);
  useEffect(() => {
    const cid = effectiveClientId;
    if (!cid) { setBudgets(null); return; }
    getDoc(doc(db, 'clients', cid, 'config', 'settings'))
      .then(snap => setBudgets(snap.exists() ? (snap.data()?.budgets || null) : null))
      .catch(() => setBudgets(null));
  }, [effectiveClientId]);

  // B4: Document expiry — STX only, passengers expiring within 90 days
  const [expiringDocs, setExpiringDocs] = useState([]);
  useEffect(() => {
    if (!isSTX) return;
    const cid = effectiveClientId;
    if (!cid) { setExpiringDocs([]); return; }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in90 = new Date(today);
    in90.setDate(in90.getDate() + 90);
    const todayStr = today.toISOString().slice(0, 10);
    const in90Str  = in90.toISOString().slice(0, 10);
    getDocs(collection(db, 'clients', cid, 'passengers'))
      .then(snap => {
        const expiring = [];
        snap.docs.forEach(d => {
          const p = d.data();
          const name = [p.preferredName || p.firstName, p.lastName].filter(Boolean).join(' ');
          (p.identityDocuments || []).forEach(doc => {
            if (doc.expiry && doc.expiry >= todayStr && doc.expiry <= in90Str) {
              expiring.push({ passengerId: d.id, name, docType: doc.type, expiry: doc.expiry });
            }
          });
        });
        expiring.sort((a, b) => a.expiry.localeCompare(b.expiry));
        setExpiringDocs(expiring.slice(0, 10));
      })
      .catch(() => setExpiringDocs([]));
  }, [isSTX, effectiveClientId]);

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

  const { monthlyData, costCentreData, currentFYTotal, prevFYTotal, gstFreeTotal, exGSTTotal, hasPrevData } = useMemo(() => {
    const curMonths  = Array(12).fill(0);
    const prevMonths = Array(12).fill(0);
    const centres    = {};
    let curTotal = 0, prevTotal = 0, gstFree = 0, exGST = 0;

    trips.forEach(t => {
      if (!SPEND_STATUSES.has(getDisplayStatus(t))) return;
      const cost = calcTripCost(t);
      if (!cost) return;

      // Use createdAt (when expense is incurred) for FY grouping
      const dateStr = toDateStr(t.createdAt);
      if (!dateStr) return;

      const ci = fyMonthIndex(dateStr, currentFY);
      if (ci >= 0) {
        curMonths[ci] += cost;
        curTotal += cost;
        exGST += calcTripExGST(t);

        // Cost centre breakdown (current FY only)
        const cc = t.costCentre || 'Unallocated';
        centres[cc] = (centres[cc] || 0) + cost;

        // GST-free component: sum of international sector costs
        (t.sectors || []).forEach(s => {
          if (s.international) gstFree += parseFloat(s.cost) || 0;
        });
      }

      const pi = fyMonthIndex(dateStr, prevFY);
      if (pi >= 0) { prevMonths[pi] += cost; prevTotal += cost; }
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
      gstFreeTotal: gstFree,
      exGSTTotal: exGST,
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
      <p className="text-gray-700 text-sm mb-6">
        Welcome back, {userProfile?.displayName || userProfile?.email}
      </p>

      {loading ? (
        <div className="text-center text-gray-600 py-12 text-sm">Loading…</div>
      ) : (
        <>
          {/* Status stat cards — all clickable, navigate to filtered trip list */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {STAT_ORDER.map(status => {
              const cfg = STATUS_CONFIG[status];
              const isPending = status === 'pending_approval' && counts[status] > 0 && isApprover;
              return (
                <div
                  key={status}
                  className={`bg-white border rounded-xl p-4 transition-colors cursor-pointer
                    ${isPending ? 'border-amber-300 hover:bg-amber-50' : 'border-gray-200 hover:bg-gray-50'}`}
                  onClick={() => navigate(`/travel?status=${status}`)}
                  title={`View ${cfg.label} trips`}
                >
                  <p className="text-2xl font-bold text-gray-800">{counts[status]}</p>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium mt-1.5 ${cfg.cls}`}>
                    {cfg.label}
                  </span>
                  {isPending && (
                    <p className="text-xs text-amber-600 mt-1">Needs review →</p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Expenditure section */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
            {/* FY summary header */}
            <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2 mb-4">
              <h2 className="text-sm font-semibold text-gray-700 w-full sm:w-auto">Expenditure — {currentFYLabel}</h2>
              <div>
                <p className="text-xs text-gray-600 leading-tight">Incl. GST</p>
                <span className="text-xl font-bold text-gray-900">{fmtAUD(currentFYTotal)}</span>
              </div>
              {exGSTTotal > 0 && (
                <div>
                  <p className="text-xs text-gray-600 leading-tight">Ex-GST (incl. fees)</p>
                  <span className="text-xl font-bold text-indigo-700">{fmtAUD(exGSTTotal)}</span>
                </div>
              )}
              {gstFreeTotal > 0 && (
                <span className="text-xs px-2 py-0.5 bg-sky-50 text-sky-700 rounded-full border border-sky-200 self-center">
                  {fmtAUD(gstFreeTotal)} GST-free (international)
                </span>
              )}
              {hasPrevData && (
                <span className="text-sm text-gray-600 self-center">
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
              <p className="text-xs text-gray-600 py-8 text-center">No approved spend recorded yet for this financial year.</p>
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
                <p className="text-xs text-gray-600">No cost centre data for this financial year.</p>
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
                <p className="text-xs text-gray-600">No upcoming approved or booked trips.</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {upcoming.map(t => (
                    <div key={t.id} className="flex items-center gap-3 py-2">
                      <span className="text-xs text-gray-600 w-20 shrink-0">{fmtDate(t.startDate)}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 truncate">{t.title || '—'}</p>
                        {t.travellerName && <p className="text-xs text-gray-600 truncate">{t.travellerName}</p>}
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
              <p className="text-xs text-gray-600">No trips yet.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {recent.map(t => (
                  <div key={t.id} className="flex items-center gap-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 truncate">{t.title || '—'}</p>
                      <p className="text-xs text-gray-600 truncate">
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

          {/* B3: Budget vs actual widget */}
          {budgets && (budgets.overall > 0 || Object.keys(budgets.byCostCentre || {}).length > 0) && (
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">
                Budget vs Actual — FY{budgets.fiscalYear}/{String((budgets.fiscalYear || currentFY) + 1).slice(2)}
              </h2>
              {budgets.overall > 0 && (
                <div className="mb-4">
                  <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                    <span>Overall</span>
                    <span>{fmtAUD(currentFYTotal)} of {fmtAUD(budgets.overall)}</span>
                  </div>
                  <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        currentFYTotal / budgets.overall >= 1 ? 'bg-red-500'
                        : currentFYTotal / budgets.overall >= (budgets.alertThreshold || 80) / 100 ? 'bg-amber-400'
                        : 'bg-blue-500'
                      }`}
                      style={{ width: `${Math.min(100, (currentFYTotal / budgets.overall) * 100).toFixed(1)}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-600 mt-1">
                    {((currentFYTotal / budgets.overall) * 100).toFixed(0)}% used
                    {currentFYTotal / budgets.overall >= (budgets.alertThreshold || 80) / 100 && (
                      <span className="ml-2 text-amber-600 font-medium">Alert threshold reached</span>
                    )}
                  </p>
                </div>
              )}
              {Object.entries(budgets.byCostCentre || {}).filter(([, v]) => v > 0).map(([cc, budget]) => {
                const spent = costCentreData.find(d => d.centre === cc)?.amount || 0;
                const pct = Math.min(100, (spent / budget) * 100);
                return (
                  <div key={cc} className="mb-3">
                    <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                      <span className="truncate">{cc}</span>
                      <span className="shrink-0 ml-2">{fmtAUDShort(spent)} / {fmtAUDShort(budget)}</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${pct >= 100 ? 'bg-red-500' : pct >= (budgets.alertThreshold || 80) ? 'bg-amber-400' : 'bg-indigo-400'}`}
                        style={{ width: `${pct.toFixed(1)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* B4: Documents expiring soon — STX only */}
          {isSTX && expiringDocs.length > 0 && (
            <div className="bg-white border border-amber-200 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-amber-700 mb-3">
                Documents expiring within 90 days ({expiringDocs.length})
              </h2>
              <div className="divide-y divide-gray-100">
                {expiringDocs.map((item, i) => {
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const exp = new Date(item.expiry);
                  exp.setHours(0, 0, 0, 0);
                  const daysUntil = Math.round((exp - today) / 86400000);
                  return (
                    <div key={i} className="flex items-center gap-3 py-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 truncate">{item.name}</p>
                        <p className="text-xs text-gray-600">{item.docType}</p>
                      </div>
                      <span className={`text-xs font-medium shrink-0 ${daysUntil <= 30 ? 'text-red-600' : 'text-amber-600'}`}>
                        {daysUntil <= 0 ? 'Expired' : `${daysUntil}d`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
