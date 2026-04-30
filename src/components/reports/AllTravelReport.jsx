import { useState, useMemo } from 'react';
import {
  QUICK_PERIODS, getQuickRange, BILLABLE_STATUSES,
  getDisplayStatus, tripInclGST, tripExGST, toDate, exportCSV, tripDateForMode,
} from '../../utils/reportHelpers';

const TRIP_TYPES = ['Self-Managed', 'STX-Managed', 'Group Event'];

const ALL_STATUSES = ['approved', 'booked', 'travelling', 'completed', 'pending_approval', 'draft', 'declined', 'cancelled'];

const STATUS_LABEL = {
  approved:         'Approved',
  booked:           'Booked',
  travelling:       'Travelling',
  completed:        'Completed',
  pending_approval: 'Pending Approval',
  draft:            'Draft',
  declined:         'Declined',
  cancelled:        'Cancelled',
};

const STATUS_COLOR = {
  approved:         { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
  booked:           { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' },
  travelling:       { bg: '#f0fdfa', color: '#0d9488', border: '#99f6e4' },
  completed:        { bg: '#f8fafc', color: '#475569', border: '#e2e8f0' },
  pending_approval: { bg: '#fffbeb', color: '#d97706', border: '#fde68a' },
  draft:            { bg: '#fafafa', color: '#94a3b8', border: '#e2e8f0' },
  declined:         { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
  cancelled:        { bg: '#fdf4ff', color: '#9333ea', border: '#e9d5ff' },
};

function bookingWindow(trip) {
  if (!trip.createdAt || !trip.startDate) return null;
  const created = toDate(trip.createdAt);
  if (!created) return null;
  const start = new Date(trip.startDate + 'T00:00:00');
  const days = Math.round((start - created) / 86400000);
  return days >= 0 ? days : null;
}

export default function AllTravelReport({ trips }) {
  const now = new Date();
  const fy  = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  const [periodKey,      setPeriodKey]      = useState('thisFY');
  const [from,           setFrom]           = useState(`${fy}-07-01`);
  const [to,             setTo]             = useState(`${fy + 1}-06-30`);
  const [statusFilter,   setStatusFilter]   = useState([...BILLABLE_STATUSES]);
  const [typeFilter,     setTypeFilter]     = useState([...TRIP_TYPES]);
  const [costCentreFilter, setCostCentreFilter] = useState('');
  const [search,         setSearch]         = useState('');
  const [sortField,      setSortField]      = useState('startDate');
  const [sortDir,        setSortDir]        = useState('desc');
  const [dateMode,       setDateMode]       = useState('booking');

  const applyPreset = (key) => {
    setPeriodKey(key);
    if (key === 'custom') return;
    const r = getQuickRange(key);
    setFrom(r.from);
    setTo(r.to);
  };

  const costCentres = useMemo(() => {
    const s = new Set(trips.map(t => t.costCentre).filter(Boolean));
    return [...s].sort();
  }, [trips]);

  const filtered = useMemo(() => {
    return trips.filter(t => {
      const ds = getDisplayStatus(t);
      if (!statusFilter.includes(ds)) return false;
      if (typeFilter.length && !typeFilter.includes(t.tripType)) return false;
      if (costCentreFilter && t.costCentre !== costCentreFilter) return false;
      const tDate = tripDateForMode(t, dateMode);
      if (from && tDate < from) return false;
      if (to   && tDate > to)   return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (
          !t.travellerName?.toLowerCase().includes(q) &&
          !t.tripRef?.toLowerCase().includes(q) &&
          !t.destinationCity?.toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [trips, statusFilter, typeFilter, costCentreFilter, from, to, search, dateMode]);

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sortField) {
        case 'travellerName':
        case 'destinationCity':
        case 'originCity':
        case 'tripType':
        case 'costCentre':
        case 'startDate':
        case 'tripRef':
          return dir * ((a[sortField] || '').localeCompare(b[sortField] || ''));
        case 'status':
          return dir * (getDisplayStatus(a) || '').localeCompare(getDisplayStatus(b) || '');
        case 'window':
          return dir * ((bookingWindow(a) ?? -1) - (bookingWindow(b) ?? -1));
        case 'totalInc':
          return dir * (tripInclGST(a) - tripInclGST(b));
        case 'totalEx':
          return dir * (tripExGST(a) - tripExGST(b));
        default:
          return 0;
      }
    });
  }, [filtered, sortField, sortDir]);

  const summary = useMemo(() => ({
    trips:    sorted.length,
    totalInc: sorted.reduce((s, t) => s + tripInclGST(t), 0),
    totalEx:  sorted.reduce((s, t) => s + tripExGST(t), 0),
    avgWindow: (() => {
      const ws = sorted.map(bookingWindow).filter(w => w !== null);
      return ws.length ? Math.round(ws.reduce((s, w) => s + w, 0) / ws.length) : null;
    })(),
  }), [sorted]);

  const handleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir(field === 'startDate' ? 'desc' : 'asc'); }
  };

  const toggleStatus = (s) =>
    setStatusFilter(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  const toggleType = (t) =>
    setTypeFilter(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);

  const handleExport = () => {
    const headers = ['Trip Ref','Traveller','Trip Type','Cost Centre','Origin','Destination',
      'Start Date','Status','Booking Window (days)','Total (Inc GST)','Total (Ex GST)'];
    const rows = sorted.map(t => [
      t.tripRef || t.id,
      t.travellerName || '',
      t.tripType || '',
      t.costCentre || '',
      t.originCity || '',
      t.destinationCity || '',
      t.startDate || '',
      STATUS_LABEL[getDisplayStatus(t)] || getDisplayStatus(t),
      bookingWindow(t) ?? '',
      tripInclGST(t).toFixed(2),
      tripExGST(t).toFixed(2),
    ]);
    exportCSV([headers, ...rows], `all_travel_${from}_to_${to}.csv`);
  };

  const sortArrow = (f) => sortField === f ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

  return (
    <div style={{ fontFamily: "'DM Sans','Helvetica Neue',sans-serif" }}>

      {/* Filters */}
      <div style={card}>
        <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:14 }}>
          <span style={{ ...lbl, marginBottom:0 }}>Date basis</span>
          {[['booking','Booking Date'],['travel','Travel Date']].map(([val,label]) => (
            <button key={val} onClick={() => setDateMode(val)}
              style={{ ...pill, background: dateMode === val ? '#0d9488' : '#f1f5f9', color: dateMode === val ? '#fff' : '#475569', borderColor: dateMode === val ? '#0d9488' : '#e2e8f0', fontWeight: dateMode === val ? 700 : 500 }}>
              {label}
            </button>
          ))}
        </div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:12, marginBottom:14 }}>
          <div>
            <label style={lbl}>Period</label>
            <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
              {QUICK_PERIODS.map(p => (
                <button key={p.key} onClick={() => applyPreset(p.key)}
                  style={{ ...pill, background: periodKey === p.key ? '#0d9488' : '#f1f5f9', color: periodKey === p.key ? '#fff' : '#475569', borderColor: periodKey === p.key ? '#0d9488' : '#e2e8f0' }}>
                  {p.label}
                </button>
              ))}
              <button onClick={() => applyPreset('custom')}
                style={{ ...pill, background: periodKey === 'custom' ? '#0d9488' : '#f1f5f9', color: periodKey === 'custom' ? '#fff' : '#475569', borderColor: periodKey === 'custom' ? '#0d9488' : '#e2e8f0' }}>
                Custom
              </button>
            </div>
            <div style={{ display:'flex', gap:10, marginTop:8 }}>
              <div>
                <label style={lbl}>From</label>
                <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPeriodKey('custom'); }} style={inp} />
              </div>
              <div>
                <label style={lbl}>To</label>
                <input type="date" value={to} onChange={e => { setTo(e.target.value); setPeriodKey('custom'); }} style={inp} />
              </div>
            </div>
          </div>

          <div style={{ flex:1, minWidth:220 }}>
            <label style={lbl}>Search</label>
            <input type="text" placeholder="Traveller, trip ref, destination…"
              value={search} onChange={e => setSearch(e.target.value)}
              style={{ ...inp, width:'100%', boxSizing:'border-box' }} />
          </div>

          {costCentres.length > 0 && (
            <div>
              <label style={lbl}>Cost Centre</label>
              <select value={costCentreFilter} onChange={e => setCostCentreFilter(e.target.value)} style={inp}>
                <option value="">All</option>
                {costCentres.map(cc => <option key={cc} value={cc}>{cc}</option>)}
              </select>
            </div>
          )}
        </div>

        <div style={{ display:'flex', flexWrap:'wrap', gap:16, marginBottom:14 }}>
          <div>
            <label style={lbl}>Status</label>
            <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
              {ALL_STATUSES.map(s => (
                <button key={s} onClick={() => toggleStatus(s)}
                  style={{ ...pill, background: statusFilter.includes(s) ? (STATUS_COLOR[s]?.bg || '#f0fdfa') : '#f8fafc', color: statusFilter.includes(s) ? (STATUS_COLOR[s]?.color || '#0d9488') : '#94a3b8', borderColor: statusFilter.includes(s) ? (STATUS_COLOR[s]?.border || '#99f6e4') : '#e2e8f0', fontWeight: statusFilter.includes(s) ? 700 : 400 }}>
                  {STATUS_LABEL[s] || s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={lbl}>Trip Type</label>
            <div style={{ display:'flex', gap:5 }}>
              {TRIP_TYPES.map(t => (
                <button key={t} onClick={() => toggleType(t)}
                  style={{ ...pill, background: typeFilter.includes(t) ? '#0d9488' : '#f1f5f9', color: typeFilter.includes(t) ? '#fff' : '#475569', borderColor: typeFilter.includes(t) ? '#0d9488' : '#e2e8f0', fontWeight: typeFilter.includes(t) ? 700 : 500 }}>
                  {typeFilter.includes(t) ? '✓ ' : ''}{t}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
        {[
          { label:'Trips',              value: summary.trips },
          { label:'Total (Inc GST)',    value: `$${summary.totalInc.toLocaleString(undefined,{maximumFractionDigits:0})}` },
          { label:'Total (Ex GST)',     value: `$${summary.totalEx.toLocaleString(undefined,{maximumFractionDigits:0})}` },
          { label:'Avg Booking Window', value: summary.avgWindow !== null ? `${summary.avgWindow} days` : '—' },
        ].map(c => (
          <div key={c.label} style={{ background:'#fff', borderRadius:10, border:'1px solid #e2e8f0', padding:'14px 18px', boxShadow:'0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize:10, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 }}>{c.label}</div>
            <div style={{ fontSize:22, fontWeight:800, color:'#0f172a', lineHeight:1.2 }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Sort + export bar */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10, flexWrap:'wrap', gap:8 }}>
        <span style={{ fontSize:12, color:'#64748b' }}>{sorted.length} trip{sorted.length !== 1 ? 's' : ''}</span>
        <button onClick={handleExport}
          style={{ padding:'7px 16px', background:'#0d9488', color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:700, cursor:'pointer' }}>
          ↓ Export CSV
        </button>
      </div>

      {/* Table */}
      {sorted.length === 0 ? (
        <div style={{ textAlign:'center', padding:60, color:'#94a3b8' }}>
          <div style={{ fontSize:36, marginBottom:10 }}>🔍</div>
          <div style={{ fontSize:15, fontWeight:600, color:'#64748b' }}>No trips match the selected filters</div>
        </div>
      ) : (
        <div style={{ background:'#fff', borderRadius:12, border:'1px solid #e2e8f0', overflow:'hidden', boxShadow:'0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr style={{ background:'#f8fafc', borderBottom:'1px solid #e2e8f0' }}>
                  {[
                    ['tripRef',        'Ref'],
                    ['travellerName',  'Traveller'],
                    ['tripType',       'Type'],
                    ['costCentre',     'Cost Centre'],
                    ['originCity',     'Origin'],
                    ['destinationCity','Destination'],
                    ['startDate',      'Start'],
                    ['status',         'Status'],
                    ['window',         'Booking Window'],
                    ['totalInc',       'Inc GST'],
                    ['totalEx',        'Ex GST'],
                  ].map(([f, label]) => (
                    <th scope="col" key={f} onClick={() => handleSort(f)}
                      style={{ padding:'10px 12px', textAlign: ['totalInc','totalEx','window'].includes(f) ? 'right' : 'left', fontSize:10, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.05em', cursor:'pointer', whiteSpace:'nowrap', userSelect:'none' }}>
                      {label}{sortArrow(f)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((t, idx) => {
                  const ds  = getDisplayStatus(t);
                  const sc  = STATUS_COLOR[ds] || {};
                  const inc = tripInclGST(t);
                  const ex  = tripExGST(t);
                  const win = bookingWindow(t);
                  return (
                    <tr key={t.id} style={{ background: idx % 2 === 0 ? '#fff' : '#fafafa', borderBottom:'1px solid #f1f5f9' }}>
                      <td style={{ padding:'10px 12px', fontFamily:'monospace', fontSize:12, color:'#475569', whiteSpace:'nowrap' }}>{t.tripRef || '—'}</td>
                      <td style={{ padding:'10px 12px', fontWeight:500, color:'#1e293b', whiteSpace:'nowrap' }}>{t.travellerName || '—'}</td>
                      <td style={{ padding:'10px 12px', color:'#64748b', whiteSpace:'nowrap' }}>{t.tripType || '—'}</td>
                      <td style={{ padding:'10px 12px', color:'#64748b' }}>{t.costCentre || '—'}</td>
                      <td style={{ padding:'10px 12px', color:'#64748b', whiteSpace:'nowrap' }}>{t.originCity || '—'}</td>
                      <td style={{ padding:'10px 12px', color:'#1e293b', whiteSpace:'nowrap' }}>{t.destinationCity || '—'}</td>
                      <td style={{ padding:'10px 12px', color:'#64748b', whiteSpace:'nowrap' }}>{t.startDate || '—'}</td>
                      <td style={{ padding:'10px 12px' }}>
                        <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:20, background: sc.bg || '#f8fafc', color: sc.color || '#64748b', border:`1px solid ${sc.border || '#e2e8f0'}`, whiteSpace:'nowrap' }}>
                          {STATUS_LABEL[ds] || ds}
                        </span>
                      </td>
                      <td style={{ padding:'10px 12px', textAlign:'right', color: win !== null && win <= 7 ? '#dc2626' : win !== null && win <= 21 ? '#d97706' : '#475569', fontWeight: win !== null && win <= 7 ? 700 : 400 }}>
                        {win !== null ? `${win}d` : '—'}
                      </td>
                      <td style={{ padding:'10px 12px', textAlign:'right', fontFamily:'monospace', color:'#1e293b', whiteSpace:'nowrap' }}>
                        ${inc.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}
                      </td>
                      <td style={{ padding:'10px 12px', textAlign:'right', fontFamily:'monospace', color:'#0d9488', whiteSpace:'nowrap' }}>
                        ${ex.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p style={{ fontSize:11, color:'#94a3b8', marginTop:14, textAlign:'center' }}>
        Filtered by trip start date · Booking window = days from creation to start date (red ≤ 7 days, amber ≤ 21 days)
      </p>
    </div>
  );
}

const card = { background:'#fff', borderRadius:12, border:'1px solid #e2e8f0', padding:'18px 20px', marginBottom:20, boxShadow:'0 1px 3px rgba(0,0,0,0.05)' };
const lbl  = { display:'block', fontSize:10, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 };
const inp  = { padding:'7px 10px', border:'1px solid #cbd5e1', borderRadius:8, fontSize:13, color:'#1e293b', outline:'none', background:'#fff' };
const pill = { padding:'5px 10px', border:'1px solid #e2e8f0', borderRadius:6, fontSize:12, fontWeight:500, cursor:'pointer' };
