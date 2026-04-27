import { useState, useMemo } from 'react';
import {
  QUICK_PERIODS, getQuickRange, BILLABLE_STATUSES,
  getDisplayStatus, accomCity, nightsBetween, exportCSV, tripDateForMode,
} from '../../utils/reportHelpers';

export default function HotelPopularity({ trips }) {
  const now = new Date();
  const fy  = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  const [periodKey, setPeriodKey] = useState('thisFY');
  const [from,      setFrom]      = useState(`${fy}-07-01`);
  const [to,        setTo]        = useState(`${fy + 1}-06-30`);
  const [sortBy,    setSortBy]    = useState('bookings');
  const [search,    setSearch]    = useState('');
  const [expanded,  setExpanded]  = useState(new Set());
  const [dateMode,  setDateMode]  = useState('booking');

  const applyPreset = (key) => {
    setPeriodKey(key);
    if (key === 'custom') return;
    const r = getQuickRange(key);
    setFrom(r.from); setTo(r.to);
  };

  const reportData = useMemo(() => {
    const filtered = trips.filter(t => {
      const ds = getDisplayStatus(t);
      if (!BILLABLE_STATUSES.has(ds)) return false;
      const tDate = tripDateForMode(t, dateMode);
      if (from && tDate < from) return false;
      if (to   && tDate > to)   return false;
      return true;
    });

    const destMap = {};

    filtered.forEach(trip => {
      const accomSectors = (trip.sectors || []).filter(s =>
        s.type === 'accommodation' && s.propertyName?.trim()
      );
      accomSectors.forEach(sector => {
        const city  = accomCity(sector, trip);
        const hotel = sector.propertyName.trim();
        if (!destMap[city]) destMap[city] = {};
        if (!destMap[city][hotel]) destMap[city][hotel] = { count:0, totalCostInc:0, totalCostEx:0, totalNights:0 };

        destMap[city][hotel].count++;

        const cost = parseFloat(sector.cost) || 0;
        const costEx = sector.international ? cost : cost / 1.1;
        const nights = nightsBetween(sector.checkIn, sector.checkOut);
        if (nights > 0) {
          destMap[city][hotel].totalCostInc += cost;
          destMap[city][hotel].totalCostEx  += costEx;
          destMap[city][hotel].totalNights  += nights;
        }
      });
    });

    let rows = Object.entries(destMap).map(([destination, hotels]) => {
      const hotelList = Object.entries(hotels)
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
      return { destination, hotels: hotelList, totalBookings: hotelList.reduce((s, h) => s + h.count, 0) };
    });

    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.map(r => ({
        ...r,
        hotels: r.hotels.filter(h => h.name.toLowerCase().includes(q) || r.destination.toLowerCase().includes(q)),
      })).filter(r => r.hotels.length > 0);
    }

    if (sortBy === 'bookings')    rows.sort((a, b) => b.totalBookings - a.totalBookings);
    if (sortBy === 'destination') rows.sort((a, b) => a.destination.localeCompare(b.destination));

    return rows;
  }, [trips, from, to, sortBy, search, dateMode]);

  const totalHotelBookings = reportData.reduce((s, r) => s + r.totalBookings, 0);
  const totalDestinations  = reportData.length;
  const totalUniqueHotels  = reportData.reduce((s, r) => s + r.hotels.length, 0);

  const toggleExpand = (dest) => {
    setExpanded(prev => {
      const n = new Set(prev);
      n.has(dest) ? n.delete(dest) : n.add(dest);
      return n;
    });
  };
  const expandAll   = () => setExpanded(new Set(reportData.map(r => r.destination)));
  const collapseAll = () => setExpanded(new Set());

  const handleExport = () => {
    const headers = ['Destination','Hotel Name','Bookings','Total Nights','Avg/Night (Inc GST)','Avg/Night (Ex GST)'];
    const rows = [];
    reportData.forEach(r => {
      r.hotels.forEach(h => {
        rows.push([
          r.destination, h.name, h.count, h.totalNights,
          h.totalNights > 0 ? (h.totalCostInc / h.totalNights).toFixed(2) : '',
          h.totalNights > 0 ? (h.totalCostEx  / h.totalNights).toFixed(2) : '',
        ]);
      });
    });
    exportCSV([headers, ...rows], `hotel_popularity_${from}_to_${to}.csv`);
  };

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
        <div style={{ display:'flex', flexWrap:'wrap', gap:12, alignItems:'flex-end' }}>
          <div>
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
          <div style={{ flex:1, minWidth:200 }}>
            <label style={lbl}>Search Hotel / Destination</label>
            <input type="text" placeholder="e.g. Hilton or Sydney…"
              value={search} onChange={e => setSearch(e.target.value)}
              style={{ ...inp, width:'100%', boxSizing:'border-box' }} />
          </div>
        </div>

        <div style={{ marginTop:12, display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:12, color:'#64748b', fontWeight:600 }}>Sort Destinations By:</span>
          {[['bookings','Most Booked'],['destination','A–Z Name']].map(([val, label]) => (
            <button key={val} onClick={() => setSortBy(val)}
              style={{ ...pill, background: sortBy === val ? '#0d9488' : '#f1f5f9', color: sortBy === val ? '#fff' : '#475569', borderColor: sortBy === val ? '#0d9488' : '#e2e8f0', fontWeight: sortBy === val ? 700 : 500 }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:20 }}>
        {[
          { label:'Hotel Bookings', value: totalHotelBookings },
          { label:'Destinations',   value: totalDestinations },
          { label:'Unique Hotels',  value: totalUniqueHotels },
        ].map(s => (
          <div key={s.label} style={{ background:'#fff', borderRadius:10, border:'1px solid #e2e8f0', padding:'14px 18px', boxShadow:'0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize:24, fontWeight:800, color:'#0f172a', lineHeight:1.2 }}>{s.value}</div>
            <div style={{ fontSize:12, color:'#64748b', marginTop:2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {reportData.length > 0 && (
        <div style={{ display:'flex', gap:8, marginBottom:12, justifyContent:'flex-end' }}>
          <button onClick={expandAll}   style={pill}>Expand All</button>
          <button onClick={collapseAll} style={pill}>Collapse All</button>
          <button onClick={handleExport}
            style={{ padding:'5px 14px', background:'#0d9488', color:'#fff', border:'none', borderRadius:6, fontSize:12, fontWeight:700, cursor:'pointer' }}>
            ↓ Export CSV
          </button>
        </div>
      )}

      {reportData.length === 0 ? (
        <div style={{ textAlign:'center', padding:60, color:'#94a3b8' }}>
          <div style={{ fontSize:36, marginBottom:10 }}>🔍</div>
          <div style={{ fontSize:15, fontWeight:600, color:'#64748b' }}>No accommodation bookings found</div>
          <div style={{ fontSize:13, marginTop:4 }}>Try adjusting the date range or check that trips have Accommodation sectors with property names entered.</div>
        </div>
      ) : reportData.map((row) => {
        const isOpen   = expanded.has(row.destination);
        const topHotel = row.hotels[0];
        return (
          <div key={row.destination} style={{ background:'#fff', borderRadius:12, border:'1px solid #e2e8f0', marginBottom:12, overflow:'hidden', boxShadow:'0 1px 3px rgba(0,0,0,0.04)' }}>
            <div onClick={() => toggleExpand(row.destination)}
              style={{ display:'flex', alignItems:'center', padding:'14px 18px', cursor:'pointer', gap:12, background: isOpen ? '#f0fdfa' : '#fff', borderBottom: isOpen ? '1px solid #e2e8f0' : 'none' }}>
              <span style={{ fontSize:18, width:28, textAlign:'center' }}>📍</span>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700, fontSize:15, color:'#0f172a' }}>{row.destination}</div>
                <div style={{ fontSize:12, color:'#64748b', marginTop:1 }}>
                  {row.hotels.length} hotel{row.hotels.length !== 1 ? 's' : ''} · {row.totalBookings} booking{row.totalBookings !== 1 ? 's' : ''}
                  {topHotel && <> · Top: <span style={{ color:'#0d9488', fontWeight:600 }}>{topHotel.name}</span> ({topHotel.count}×)</>}
                </div>
              </div>
              <div style={{ display:'flex', alignItems:'flex-end', gap:3, height:28 }}>
                {row.hotels.slice(0, 6).map((h, i) => (
                  <div key={i} title={`${h.name}: ${h.count}`} style={{
                    width:10, height: Math.max(4, (h.count / topHotel.count) * 28),
                    background: i === 0 ? '#0d9488' : `hsl(175,${60-i*8}%,${45+i*5}%)`,
                    borderRadius:2,
                  }} />
                ))}
              </div>
              <span style={{ fontSize:18, color:'#94a3b8', transform: isOpen ? 'rotate(90deg)' : 'none', transition:'transform 0.2s' }}>›</span>
            </div>

            {isOpen && (
              <div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 80px 40px 80px', padding:'8px 18px', background:'#f8fafc', borderBottom:'1px solid #f1f5f9' }}>
                  {['Hotel Name','Bookings','Share','Bar'].map((h, i) => (
                    <span key={h} style={{ fontSize:10, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.05em', textAlign: i === 0 ? 'left' : 'center' }}>{h}</span>
                  ))}
                </div>
                {row.hotels.map((hotel, hi) => {
                  const pct = Math.round((hotel.count / row.totalBookings) * 100);
                  return (
                    <div key={hotel.name} style={{ display:'grid', gridTemplateColumns:'1fr 80px 40px 80px', padding:'10px 18px', borderBottom: hi < row.hotels.length - 1 ? '1px solid #f1f5f9' : 'none', alignItems:'center', background: hi % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <div style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
                        <span style={{
                          background: hi === 0 ? '#0d9488' : hi === 1 ? '#64748b' : hi === 2 ? '#b45309' : '#e2e8f0',
                          color:      hi <= 2 ? '#fff' : '#94a3b8',
                          borderRadius:4, fontSize:10, fontWeight:700, width:20, height:20,
                          display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:2,
                        }}>#{hi+1}</span>
                        <div>
                          <div style={{ fontSize:14, color:'#1e293b', fontWeight: hi === 0 ? 600 : 400 }}>{hotel.name}</div>
                          {hotel.totalNights > 0 ? (
                            <div style={{ fontSize:11, color:'#64748b', marginTop:2 }}>
                              Avg/night:&nbsp;
                              <span style={{ color:'#0d9488', fontWeight:600 }}>${(hotel.totalCostInc / hotel.totalNights).toLocaleString(undefined,{maximumFractionDigits:0})} inc</span>
                              &nbsp;·&nbsp;
                              <span style={{ color:'#475569' }}>${(hotel.totalCostEx / hotel.totalNights).toLocaleString(undefined,{maximumFractionDigits:0})} ex GST</span>
                              <span style={{ color:'#94a3b8', marginLeft:4 }}>({hotel.totalNights} night{hotel.totalNights !== 1 ? 's' : ''})</span>
                            </div>
                          ) : (
                            <div style={{ fontSize:11, color:'#94a3b8', marginTop:2 }}>No nightly rate data</div>
                          )}
                        </div>
                      </div>
                      <div style={{ textAlign:'center' }}>
                        <span style={{ background: hi === 0 ? '#f0fdfa' : '#f8fafc', color: hi === 0 ? '#0d9488' : '#475569', fontWeight:700, fontSize:14, padding:'2px 10px', borderRadius:20, border:`1px solid ${hi === 0 ? '#99f6e4' : '#e2e8f0'}` }}>
                          {hotel.count}
                        </span>
                      </div>
                      <div style={{ textAlign:'center', fontSize:12, color:'#94a3b8' }}>{pct}%</div>
                      <div style={{ paddingRight:4 }}>
                        <div style={{ background:'#f1f5f9', borderRadius:4, height:8, overflow:'hidden' }}>
                          <div style={{ height:'100%', width:`${pct}%`, background: hi === 0 ? '#0d9488' : '#94a3b8', borderRadius:4, minWidth:4 }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {reportData.length > 0 && (
        <p style={{ fontSize:11, color:'#94a3b8', textAlign:'center', marginTop:20 }}>
          Approved, Booked, Travelling &amp; Completed trips only · Filtered by trip start date · Only accommodation sectors with property names included
        </p>
      )}
    </div>
  );
}

const card = { background:'#fff', borderRadius:12, border:'1px solid #e2e8f0', padding:'18px 20px', marginBottom:20, boxShadow:'0 1px 3px rgba(0,0,0,0.05)' };
const lbl  = { display:'block', fontSize:10, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 };
const inp  = { padding:'7px 10px', border:'1px solid #cbd5e1', borderRadius:8, fontSize:13, color:'#1e293b', outline:'none', background:'#fff' };
const pill = { padding:'5px 10px', border:'1px solid #e2e8f0', borderRadius:6, background:'#f1f5f9', color:'#475569', fontSize:12, fontWeight:500, cursor:'pointer' };
