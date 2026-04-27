import { useState, useMemo } from 'react';
import {
  QUICK_PERIODS, getQuickRange, BILLABLE_STATUSES,
  getDisplayStatus, sectorExGST, exportCSV, tripDateForMode,
} from '../../utils/reportHelpers';

const TRIP_TYPES    = ['Self-Managed', 'STX-Managed', 'Group Event'];
const SECTOR_TYPES  = ['flight', 'accommodation', 'car-hire', 'parking', 'transfers', 'meals', 'other'];
const SECTOR_LABELS = {
  'flight':'Flight','accommodation':'Accommodation','car-hire':'Car Hire',
  'parking':'Parking','transfers':'Transfers','meals':'Meals','other':'Other',
};

export default function AvgSpendByDestination({ trips }) {
  const now = new Date();
  const fy  = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  const [periodKey,      setPeriodKey]      = useState('thisFY');
  const [from,           setFrom]           = useState(`${fy}-07-01`);
  const [to,             setTo]             = useState(`${fy + 1}-06-30`);
  const [selectedTypes,  setSelectedTypes]  = useState([...TRIP_TYPES]);
  const [hasGenerated,   setHasGenerated]   = useState(false);
  const [reportData,     setReportData]     = useState([]);
  const [expandedDests,  setExpandedDests]  = useState(new Set());
  const [sortField,      setSortField]      = useState('tripCount');
  const [sortDir,        setSortDir]        = useState('desc');
  const [dateMode,       setDateMode]       = useState('booking');

  const applyPreset = (key) => {
    setPeriodKey(key);
    if (key === 'custom') return;
    const r = getQuickRange(key);
    setFrom(r.from); setTo(r.to);
  };

  const toggleType = (t) =>
    setSelectedTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);

  const handleGenerate = () => {
    const filtered = trips.filter(t => {
      const ds = getDisplayStatus(t);
      if (!BILLABLE_STATUSES.has(ds)) return false;
      if (!selectedTypes.includes(t.tripType)) return false;
      const tDate = tripDateForMode(t, dateMode);
      if (from && tDate < from) return false;
      if (to   && tDate > to)   return false;
      return true;
    });

    const groups = {};
    filtered.forEach(trip => {
      const dest = (trip.destinationCity || 'Unknown').trim();
      if (!groups[dest]) groups[dest] = [];
      groups[dest].push(trip);
    });

    const data = Object.entries(groups).map(([destination, dTrips]) => {
      const tripCount = dTrips.length;
      const totalInc  = dTrips.reduce((s, t) => s + (t.sectors||[]).reduce((ss, sec) => ss + (parseFloat(sec.cost)||0), 0), 0);
      const totalEx   = dTrips.reduce((s, t) => s + (t.sectors||[]).reduce((ss, sec) => ss + sectorExGST(sec), 0), 0);

      const sectorData = {};
      SECTOR_TYPES.forEach(type => {
        const withSector = dTrips.filter(t => (t.sectors||[]).some(s => s.type === type));
        const totInc = withSector.reduce((s, t) =>
          s + (t.sectors||[]).filter(sec => sec.type === type).reduce((ss, sec) => ss + (parseFloat(sec.cost)||0), 0), 0);
        const totEx  = withSector.reduce((s, t) =>
          s + (t.sectors||[]).filter(sec => sec.type === type).reduce((ss, sec) => ss + sectorExGST(sec), 0), 0);

        let totalNights = 0;
        if (type === 'accommodation') {
          totalNights = withSector.reduce((s, t) =>
            s + (t.sectors||[]).filter(sec => sec.type === 'accommodation').reduce((ss, sec) => {
              if (sec.checkIn && sec.checkOut) {
                return ss + Math.max(0, Math.round((new Date(sec.checkOut) - new Date(sec.checkIn)) / 86400000));
              }
              return ss;
            }, 0), 0);
        }

        sectorData[type] = {
          count: withSector.length,
          avgInc: withSector.length ? totInc / withSector.length : 0,
          avgEx:  withSector.length ? totEx  / withSector.length : 0,
          totalInc: totInc,
          totalEx:  totEx,
          ...(type === 'accommodation' && {
            totalNights,
            avgPerNightInc: totalNights > 0 ? totInc / totalNights : 0,
            avgPerNightEx:  totalNights > 0 ? totEx  / totalNights : 0,
          }),
        };
      });

      return { destination, tripCount, totalInc, totalEx,
               avgTotalInc: tripCount ? totalInc / tripCount : 0,
               avgTotalEx:  tripCount ? totalEx  / tripCount : 0,
               sectorData };
    });

    setReportData(data);
    setHasGenerated(true);
    setExpandedDests(new Set());
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
      if (sortField === 'destination')
        return sortDir === 'asc' ? a.destination.localeCompare(b.destination) : b.destination.localeCompare(a.destination);
      return sortDir === 'asc' ? a[sortField] - b[sortField] : b[sortField] - a[sortField];
    });
  }, [reportData, sortField, sortDir]);

  const summaryStats = useMemo(() => {
    if (!reportData.length) return null;
    return {
      destCount:     reportData.length,
      totalTrips:    reportData.reduce((s, d) => s + d.tripCount, 0),
      totalSpendInc: reportData.reduce((s, d) => s + d.totalInc,  0),
      totalSpendEx:  reportData.reduce((s, d) => s + d.totalEx,   0),
    };
  }, [reportData]);

  const handleExportCSV = () => {
    const headers = ['Destination','Bookings','Avg Total (Inc GST)','Avg Total (Ex GST)',
      ...SECTOR_TYPES.flatMap(t => [`Avg ${SECTOR_LABELS[t]} (Inc)`,`Avg ${SECTOR_LABELS[t]} (Ex)`,`# w/ ${SECTOR_LABELS[t]}`])
    ];
    const rows = sortedData.map(row => [
      row.destination, row.tripCount,
      row.avgTotalInc.toFixed(2), row.avgTotalEx.toFixed(2),
      ...SECTOR_TYPES.flatMap(t => [
        (row.sectorData[t]?.avgInc || 0).toFixed(2),
        (row.sectorData[t]?.avgEx  || 0).toFixed(2),
        row.sectorData[t]?.count || 0,
      ]),
    ]);
    exportCSV([headers, ...rows], `avg_spend_destination_${from}_to_${to}.csv`);
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
                { label:'Destinations',     value: summaryStats.destCount },
                { label:'Total Bookings',   value: summaryStats.totalTrips },
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
              {[['destination','Destination'],['tripCount','Bookings'],['avgTotalInc','Avg (Inc)'],['avgTotalEx','Avg (Ex)']].map(([f,label]) => (
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
          ) : sortedData.map(row => {
            const isExp    = expandedDests.has(row.destination);
            const actSects = SECTOR_TYPES.filter(t => row.sectorData[t]?.count > 0);
            const toggle   = () => setExpandedDests(prev => {
              const next = new Set(prev);
              next.has(row.destination) ? next.delete(row.destination) : next.add(row.destination);
              return next;
            });
            return (
              <div key={row.destination} style={{ background:'#fff', borderRadius:12, border:'1px solid #e2e8f0', marginBottom:12, overflow:'hidden', boxShadow:'0 1px 3px rgba(0,0,0,0.04)' }}>
                <div onClick={toggle}
                  style={{ display:'flex', alignItems:'center', padding:'14px 18px', cursor:'pointer', gap:12, background: isExp ? '#f0fdfa' : '#fff', borderBottom: isExp ? '1px solid #e2e8f0' : 'none' }}>
                  <span style={{ fontSize:18, width:28, textAlign:'center' }}>📍</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:700, fontSize:15, color:'#0f172a' }}>{row.destination}</div>
                    <div style={{ fontSize:12, color:'#64748b', marginTop:1 }}>
                      {row.tripCount} booking{row.tripCount !== 1 ? 's' : ''}
                      {actSects.length > 0 && <> · {actSects.map(t => SECTOR_LABELS[t]).join(', ')}</>}
                    </div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontSize:10, color:'#64748b', fontWeight:600, marginBottom:2 }}>Avg Inc / Ex GST</div>
                    <div style={{ fontSize:15, fontWeight:700, color:'#0f172a' }}>
                      ${row.avgTotalInc.toLocaleString(undefined,{maximumFractionDigits:0})}
                      <span style={{ color:'#94a3b8', margin:'0 4px', fontWeight:400 }}>/</span>
                      <span style={{ color:'#0d9488' }}>${row.avgTotalEx.toLocaleString(undefined,{maximumFractionDigits:0})}</span>
                    </div>
                  </div>
                  <span style={{ fontSize:18, color:'#94a3b8', transform: isExp ? 'rotate(90deg)' : 'none', transition:'transform 0.2s' }}>›</span>
                </div>

                {isExp && (
                  <div style={{ padding:'16px 18px' }}>
                    <div style={{ fontSize:10, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:12 }}>
                      Sector Breakdown — {row.tripCount} booking{row.tripCount !== 1 ? 's' : ''} to {row.destination}
                    </div>
                    {actSects.length === 0 ? (
                      <p style={{ fontSize:12, color:'#94a3b8', fontStyle:'italic', margin:0 }}>No sector detail for this destination.</p>
                    ) : (
                      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(190px,1fr))', gap:10 }}>
                        {actSects.map(type => {
                          const sd  = row.sectorData[type];
                          const pct = Math.round((sd.count / row.tripCount) * 100);
                          return (
                            <div key={type} style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:10, padding:'12px 14px' }}>
                              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                                <span style={{ fontWeight:700, fontSize:13, color:'#1e293b' }}>{SECTOR_LABELS[type]}</span>
                                <span style={{ fontSize:10, background:'#e2e8f0', color:'#64748b', padding:'2px 8px', borderRadius:20, fontWeight:600 }}>
                                  {sd.count}/{row.tripCount} ({pct}%)
                                </span>
                              </div>
                              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
                                <div>
                                  <div style={chdr}>Avg (Inc GST)</div>
                                  <div style={{ fontSize:13, fontWeight:700, color:'#1e293b' }}>${sd.avgInc.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
                                </div>
                                <div>
                                  <div style={{ ...chdr, color:'#0d9488' }}>Avg (Ex GST)</div>
                                  <div style={{ fontSize:13, fontWeight:700, color:'#0d9488' }}>${sd.avgEx.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
                                </div>
                              </div>
                              <div style={{ background:'#e2e8f0', borderRadius:4, height:6, overflow:'hidden' }}>
                                <div style={{ height:'100%', width:`${pct}%`, background:'#0d9488', borderRadius:4, minWidth:3 }} />
                              </div>
                              {type === 'accommodation' && sd.totalNights > 0 && (
                                <div style={{ marginTop:10, paddingTop:10, borderTop:'1px solid #e2e8f0' }}>
                                  <div style={{ ...chdr, marginBottom:6 }}>Avg per night — {sd.totalNights} night{sd.totalNights !== 1 ? 's' : ''}</div>
                                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                                    <div>
                                      <div style={chdr}>Per Night (Inc)</div>
                                      <div style={{ fontSize:13, fontWeight:700, color:'#1e293b' }}>${sd.avgPerNightInc.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
                                    </div>
                                    <div>
                                      <div style={{ ...chdr, color:'#0d9488' }}>Per Night (Ex)</div>
                                      <div style={{ fontSize:13, fontWeight:700, color:'#0d9488' }}>${sd.avgPerNightEx.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <div style={{ marginTop:14, paddingTop:12, borderTop:'1px solid #e2e8f0', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8, fontSize:12, color:'#64748b' }}>
                      <span>Total spend to <strong style={{ color:'#1e293b' }}>{row.destination}</strong>:</span>
                      <div style={{ display:'flex', gap:16, fontFamily:'monospace' }}>
                        <span>${row.totalInc.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})} <span style={{ fontFamily:'sans-serif', color:'#94a3b8' }}>inc GST</span></span>
                        <span style={{ color:'#0d9488' }}>${row.totalEx.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})} <span style={{ fontFamily:'sans-serif', opacity:0.7 }}>ex GST</span></span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const card = { background:'#fff', borderRadius:12, border:'1px solid #e2e8f0', padding:'18px 20px', marginBottom:20, boxShadow:'0 1px 3px rgba(0,0,0,0.05)' };
const lbl  = { display:'block', fontSize:10, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 };
const inp  = { padding:'7px 10px', border:'1px solid #cbd5e1', borderRadius:8, fontSize:13, color:'#1e293b', outline:'none', background:'#fff' };
const pill = { padding:'5px 10px', border:'1px solid #e2e8f0', borderRadius:6, background:'#f1f5f9', color:'#475569', fontSize:12, fontWeight:500, cursor:'pointer' };
const chdr = { fontSize:9, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:2 };
