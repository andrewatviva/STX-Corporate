import { useState, useMemo } from 'react';
import {
  QUICK_PERIODS, getQuickRange, BILLABLE_STATUSES,
  getDisplayStatus, tripInclGST, tripExGST, exportCSV, tripDateForMode,
} from '../../utils/reportHelpers';

const TRIP_TYPES = ['Self-Managed', 'STX-Managed', 'Group Event'];

export default function SpendByDepartureCity({ trips }) {
  const now = new Date();
  const fy  = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  const [periodKey,     setPeriodKey]     = useState('thisFY');
  const [from,          setFrom]          = useState(`${fy}-07-01`);
  const [to,            setTo]            = useState(`${fy + 1}-06-30`);
  const [selectedTypes, setSelectedTypes] = useState([...TRIP_TYPES]);
  const [excludeIntl,   setExcludeIntl]   = useState(false);
  const [hasGenerated,  setHasGenerated]  = useState(false);
  const [reportData,    setReportData]    = useState([]);
  const [sortField,     setSortField]     = useState('tripCount');
  const [sortDir,       setSortDir]       = useState('desc');
  const [dateMode,      setDateMode]      = useState('booking');

  const applyPreset = (key) => {
    setPeriodKey(key);
    if (key === 'custom') return;
    const r = getQuickRange(key);
    setFrom(r.from); setTo(r.to);
  };

  const toggleType = (t) =>
    setSelectedTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);

  const handleGenerate = () => {
    let filtered = trips.filter(t => {
      const ds = getDisplayStatus(t);
      if (!BILLABLE_STATUSES.has(ds)) return false;
      if (!selectedTypes.includes(t.tripType)) return false;
      const tDate = tripDateForMode(t, dateMode);
      if (from && tDate < from) return false;
      if (to   && tDate > to)   return false;
      if (excludeIntl && (t.sectors || []).some(s => s.international)) return false;
      return true;
    });

    const groups = {};
    filtered.forEach(trip => {
      const city = (trip.originCity || 'Unknown').trim();
      if (!groups[city]) groups[city] = [];
      groups[city].push(trip);
    });

    const data = Object.entries(groups).map(([city, cityTrips]) => {
      const tripCount = cityTrips.length;
      const totalInc  = cityTrips.reduce((s, t) => s + tripInclGST(t), 0);
      const totalEx   = cityTrips.reduce((s, t) => s + tripExGST(t), 0);
      return { city, tripCount, totalInc, totalEx,
               avgTotalInc: tripCount ? totalInc / tripCount : 0,
               avgTotalEx:  tripCount ? totalEx  / tripCount : 0 };
    });

    setReportData(data);
    setHasGenerated(true);
    setSortField('tripCount');
    setSortDir('desc');
  };

  const handleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const sortedData = useMemo(() => {
    if (!reportData.length) return [];
    return [...reportData].sort((a, b) => {
      if (sortField === 'city')
        return sortDir === 'asc' ? a.city.localeCompare(b.city) : b.city.localeCompare(a.city);
      return sortDir === 'asc' ? a[sortField] - b[sortField] : b[sortField] - a[sortField];
    });
  }, [reportData, sortField, sortDir]);

  const summaryStats = useMemo(() => {
    if (!reportData.length) return null;
    return {
      cityCount:     reportData.length,
      totalTrips:    reportData.reduce((s, d) => s + d.tripCount, 0),
      totalSpendInc: reportData.reduce((s, d) => s + d.totalInc,  0),
      totalSpendEx:  reportData.reduce((s, d) => s + d.totalEx,   0),
    };
  }, [reportData]);

  const handleExportCSV = () => {
    const headers = ['Departure City','Total Trips','Total Spend (Inc GST)','Total Spend (Ex GST)','Avg Spend (Inc GST)','Avg Spend (Ex GST)'];
    const rows = sortedData.map(row => [
      row.city, row.tripCount,
      row.totalInc.toFixed(2), row.totalEx.toFixed(2),
      row.avgTotalInc.toFixed(2), row.avgTotalEx.toFixed(2),
    ]);
    exportCSV([headers, ...rows], `spend_by_departure_city_${from}_to_${to}.csv`);
  };

  const sa = (f) => sortField === f ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕';

  return (
    <div style={{ fontFamily:"'DM Sans','Helvetica Neue',sans-serif" }}>

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
        <div style={{ marginBottom:14 }}>
          <label style={lbl}>Period</label>
          <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:8 }}>
            {QUICK_PERIODS.map(p => (
              <button key={p.key} onClick={() => applyPreset(p.key)}
                style={{ ...pill, background: periodKey === p.key ? '#0d9488' : '#f1f5f9', color: periodKey === p.key ? '#fff' : '#475569', borderColor: periodKey === p.key ? '#0d9488' : '#e2e8f0' }}>
                {p.label}
              </button>
            ))}
          </div>
          <div style={{ display:'flex', gap:10 }}>
            <div><label style={lbl}>From</label><input type="date" value={from} onChange={e => { setFrom(e.target.value); setPeriodKey('custom'); }} style={inp} /></div>
            <div><label style={lbl}>To</label><input type="date" value={to} onChange={e => { setTo(e.target.value); setPeriodKey('custom'); }} style={inp} /></div>
          </div>
        </div>

        <div style={{ marginBottom:14 }}>
          <label style={lbl}>Trip Type</label>
          <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
            {TRIP_TYPES.map(t => (
              <button key={t} onClick={() => toggleType(t)}
                style={{ ...pill, background: selectedTypes.includes(t) ? '#0d9488' : '#f1f5f9', color: selectedTypes.includes(t) ? '#fff' : '#475569', borderColor: selectedTypes.includes(t) ? '#0d9488' : '#e2e8f0', fontWeight: selectedTypes.includes(t) ? 700 : 500 }}>
                {selectedTypes.includes(t) ? '✓ ' : ''}{t}
              </button>
            ))}
            {selectedTypes.length < TRIP_TYPES.length && (
              <button onClick={() => setSelectedTypes([...TRIP_TYPES])} style={pill}>Select All</button>
            )}
          </div>
          {selectedTypes.length === 0 && <p style={{ color:'#ef4444', fontSize:11, margin:'4px 0 0' }}>Select at least one trip type</p>}
        </div>

        <div style={{ marginBottom:14 }}>
          <label style={lbl}>Options</label>
          <button onClick={() => setExcludeIntl(v => !v)}
            style={{ ...pill, background: excludeIntl ? '#f59e0b' : '#f1f5f9', color: excludeIntl ? '#fff' : '#475569', borderColor: excludeIntl ? '#f59e0b' : '#e2e8f0', fontWeight: excludeIntl ? 700 : 500 }}>
            {excludeIntl ? '✓ ' : ''}Exclude International Trips
          </button>
        </div>

        <button onClick={handleGenerate} disabled={selectedTypes.length === 0}
          style={{ padding:'8px 20px', background: selectedTypes.length === 0 ? '#94a3b8' : '#0f172a', color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:700, cursor: selectedTypes.length === 0 ? 'not-allowed' : 'pointer' }}>
          ↻ Generate Report
        </button>
      </div>

      {hasGenerated && (
        <div>
          {summaryStats && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
              {[
                { label:'Departure Cities', value: summaryStats.cityCount },
                { label:'Total Trips',      value: summaryStats.totalTrips },
                { label:'Total (Inc GST)',  value: `$${summaryStats.totalSpendInc.toLocaleString(undefined,{maximumFractionDigits:0})}` },
                { label:'Total (Ex GST)',   value: `$${summaryStats.totalSpendEx.toLocaleString(undefined,{maximumFractionDigits:0})}` },
              ].map(c => (
                <div key={c.label} style={{ background:'#fff', borderRadius:10, border:'1px solid #e2e8f0', padding:'14px 18px', textAlign:'center', boxShadow:'0 1px 3px rgba(0,0,0,0.04)' }}>
                  <div style={{ fontSize:10, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 }}>{c.label}</div>
                  <div style={{ fontSize:24, fontWeight:800, color:'#0f172a', lineHeight:1.2 }}>{c.value}</div>
                </div>
              ))}
            </div>
          )}

          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12, flexWrap:'wrap', gap:8 }}>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ fontSize:11, color:'#64748b', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em' }}>Sort:</span>
              {[['city','City'],['tripCount','Trips'],['totalInc','Total (Inc)'],['totalEx','Total (Ex)'],['avgTotalInc','Avg (Inc)'],['avgTotalEx','Avg (Ex)']].map(([f,label]) => (
                <button key={f} onClick={() => handleSort(f)}
                  style={{ ...pill, color: sortField === f ? '#0d9488' : '#94a3b8', borderColor: sortField === f ? '#0d9488' : '#e2e8f0', fontWeight:700 }}>
                  {label}{sa(f)}
                </button>
              ))}
            </div>
            <button onClick={handleExportCSV}
              style={{ padding:'7px 16px', background:'#0d9488', color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:700, cursor:'pointer' }}>
              ↓ Export CSV
            </button>
          </div>

          {sortedData.length === 0 ? (
            <div style={{ textAlign:'center', padding:60, color:'#94a3b8' }}>
              <div style={{ fontSize:36, marginBottom:10 }}>🔍</div>
              <div style={{ fontSize:15, fontWeight:600, color:'#64748b' }}>No trips match the selected criteria</div>
            </div>
          ) : (
            <div style={{ background:'#fff', borderRadius:12, border:'1px solid #e2e8f0', overflow:'hidden', boxShadow:'0 1px 3px rgba(0,0,0,0.04)' }}>
              <div style={{ display:'grid', gridTemplateColumns:'2fr 80px 1fr 1fr 1fr', padding:'10px 18px', background:'#f8fafc', borderBottom:'1px solid #e2e8f0' }}>
                {[['city','Departure City','left'],['tripCount','Trips','right'],['totalInc','Total (Inc GST)','right'],['totalEx','Total (Ex GST)','right'],['avgTotalInc','Avg (Inc / Ex GST)','right']].map(([f,label,align]) => (
                  <div key={f} onClick={() => handleSort(f)} style={{ fontSize:10, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.05em', textAlign:align, cursor:'pointer', userSelect:'none' }}>
                    {label}{sa(f)}
                  </div>
                ))}
              </div>
              {sortedData.map((row, idx) => (
                <div key={row.city}
                  style={{ display:'grid', gridTemplateColumns:'2fr 80px 1fr 1fr 1fr', padding:'12px 18px', alignItems:'center', background: idx % 2 === 0 ? '#fff' : '#fafafa', borderBottom: idx < sortedData.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                  <div style={{ fontWeight:600, fontSize:14, color:'#1e293b' }}>{row.city}</div>
                  <div style={{ textAlign:'right', fontSize:14, color:'#475569' }}>{row.tripCount}</div>
                  <div style={{ textAlign:'right', fontFamily:'monospace', fontSize:13, color:'#1e293b' }}>
                    ${row.totalInc.toLocaleString(undefined,{maximumFractionDigits:0})}
                  </div>
                  <div style={{ textAlign:'right', fontFamily:'monospace', fontSize:13, color:'#0d9488' }}>
                    ${row.totalEx.toLocaleString(undefined,{maximumFractionDigits:0})}
                  </div>
                  <div style={{ textAlign:'right', fontFamily:'monospace', fontSize:13 }}>
                    <span style={{ color:'#1e293b' }}>${row.avgTotalInc.toLocaleString(undefined,{maximumFractionDigits:0})}</span>
                    <span style={{ color:'#94a3b8', margin:'0 4px' }}>/</span>
                    <span style={{ color:'#0d9488' }}>${row.avgTotalEx.toLocaleString(undefined,{maximumFractionDigits:0})}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const card = { background:'#fff', borderRadius:12, border:'1px solid #e2e8f0', padding:'18px 20px', marginBottom:20, boxShadow:'0 1px 3px rgba(0,0,0,0.05)' };
const lbl  = { display:'block', fontSize:10, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 };
const inp  = { padding:'7px 10px', border:'1px solid #cbd5e1', borderRadius:8, fontSize:13, color:'#1e293b', outline:'none', background:'#fff' };
const pill = { padding:'5px 10px', border:'1px solid #e2e8f0', borderRadius:6, background:'#f1f5f9', color:'#475569', fontSize:12, fontWeight:500, cursor:'pointer' };
