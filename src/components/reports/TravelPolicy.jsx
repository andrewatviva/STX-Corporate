import { useState, useEffect, useMemo } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import {
  QUICK_PERIODS, getQuickRange, BILLABLE_STATUSES,
  getDisplayStatus, accomCity, nightsBetween, tripDateForMode,
  DEFAULT_ACCOMMODATION_RATES,
} from '../../utils/reportHelpers';

function findPolicyRate(destination, rates) {
  if (!rates) return null;
  if (rates[destination] !== undefined) return rates[destination];
  const lower = destination.toLowerCase();
  for (const [city, rate] of Object.entries(rates)) {
    if (city === 'All Cities') continue;
    if (city.toLowerCase() === lower) return rate;
  }
  for (const [city, rate] of Object.entries(rates)) {
    if (city === 'All Cities') continue;
    if (lower.includes(city.toLowerCase()) || city.toLowerCase().includes(lower)) return rate;
  }
  // Fall back to blanket 'All Cities' rate
  return rates['All Cities'] !== undefined ? rates['All Cities'] : null;
}

export default function TravelPolicy({ trips, clientId, isSTX, clientConfig }) {
  const showAccom   = clientConfig?.features?.accommodationPolicy !== false;
  const showFlights = clientConfig?.features?.flightPolicy === true;

  const now = new Date();
  const fy  = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  const [activeView,    setActiveView]    = useState(() => showAccom ? 'accommodation' : 'flights');
  const [periodKey,     setPeriodKey]     = useState('thisFY');
  const [from,          setFrom]          = useState(`${fy}-07-01`);
  const [to,            setTo]            = useState(`${fy + 1}-06-30`);
  const [dateMode,      setDateMode]      = useState('booking');
  // Accommodation state
  const [hasGenerated,  setHasGenerated]  = useState(false);
  const [reportData,    setReportData]    = useState([]);
  const [rates,         setRates]         = useState(null);
  const [ratesLoading,  setRatesLoading]  = useState(true);
  const [showEditor,    setShowEditor]    = useState(false);
  const [editRates,     setEditRates]     = useState({});
  const [newCity,       setNewCity]       = useState('');
  const [newRate,       setNewRate]       = useState('');
  const [saving,        setSaving]        = useState(false);
  const [saveMsg,       setSaveMsg]       = useState('');
  const [sortField,     setSortField]     = useState('variance');
  const [sortDir,       setSortDir]       = useState('desc');
  const [cityFilter,    setCityFilter]    = useState('');
  // Flights state
  const [flightGenerated,   setFlightGenerated]   = useState(false);
  const [flightData,        setFlightData]         = useState([]);
  const [flightRates,       setFlightRates]        = useState(null);
  const [showFlightEditor,  setShowFlightEditor]   = useState(false);
  const [editFlightRates,   setEditFlightRates]    = useState({});
  const [newFlightCity,     setNewFlightCity]      = useState('');
  const [newFlightRate,     setNewFlightRate]      = useState('');
  const [flightSaving,      setFlightSaving]       = useState(false);
  const [flightSaveMsg,     setFlightSaveMsg]      = useState('');
  const [flightSortField,   setFlightSortField]    = useState('variance');
  const [flightSortDir,     setFlightSortDir]      = useState('desc');
  const [flightCityFilter,  setFlightCityFilter]   = useState('');

  const canEdit = isSTX;

  useEffect(() => {
    if (!clientId) { setRatesLoading(false); return; }
    const load = async () => {
      try {
        const ref  = doc(db, 'clients', clientId, 'config', 'travelPolicy');
        const snap = await getDoc(ref);
        if (snap.exists()) {
          setRates(snap.data().rates || DEFAULT_ACCOMMODATION_RATES);
          setFlightRates(snap.data().flightRates || {});
        } else {
          await setDoc(ref, { rates: DEFAULT_ACCOMMODATION_RATES, flightRates: {} });
          setRates(DEFAULT_ACCOMMODATION_RATES);
          setFlightRates({});
        }
      } catch (e) {
        console.error('Error loading policy rates', e);
        setRates(DEFAULT_ACCOMMODATION_RATES);
        setFlightRates({});
      }
      setRatesLoading(false);
    };
    load();
  }, [clientId]);

  const applyPreset = (key) => {
    setPeriodKey(key);
    if (key === 'custom') return;
    const r = getQuickRange(key);
    setFrom(r.from); setTo(r.to);
  };

  const handleGenerate = () => {
    const filtered = trips.filter(t => {
      const ds    = getDisplayStatus(t);
      if (!BILLABLE_STATUSES.has(ds)) return false;
      const tDate = tripDateForMode(t, dateMode);
      if (from && tDate < from) return false;
      if (to   && tDate > to)   return false;
      return true;
    });

    const destMap = {};
    filtered.forEach(trip => {
      const accomSectors = (trip.sectors || []).filter(s =>
        s.type === 'accommodation' && s.checkIn && s.checkOut
      );
      accomSectors.forEach(sector => {
        const dest   = accomCity(sector, trip);
        const nights = nightsBetween(sector.checkIn, sector.checkOut);
        if (nights === 0) return;

        const cost   = parseFloat(sector.cost) || 0;
        const costEx = sector.international ? cost : cost / 1.1;

        const roomsByNight        = sector.roomsByNight;
        const roomNightsForSector = roomsByNight?.length === nights
          ? roomsByNight.reduce((s, r) => s + (r || 1), 0)
          : nights;
        const hasRoomData = roomsByNight?.length > 0;

        if (!destMap[dest]) destMap[dest] = { stays:0, nights:0, roomNights:0, totalCostInc:0, totalCostEx:0, hasGroupBooking:false };
        destMap[dest].stays++;
        destMap[dest].nights       += nights;
        destMap[dest].roomNights   += roomNightsForSector;
        destMap[dest].totalCostInc += cost;
        destMap[dest].totalCostEx  += costEx;
        if (hasRoomData) destMap[dest].hasGroupBooking = true;
      });
    });

    const data = Object.entries(destMap)
      .filter(([, d]) => d.nights > 0)
      .map(([destination, d]) => {
        const avgPerNightEx  = d.totalCostEx  / d.roomNights;
        const policyRate     = findPolicyRate(destination, rates);
        const policyRateEx   = policyRate !== null ? policyRate / 1.1 : null;
        const variance       = policyRateEx !== null ? avgPerNightEx - policyRateEx : null;
        const variancePct    = policyRateEx !== null ? ((avgPerNightEx - policyRateEx) / policyRateEx) * 100 : null;
        return { destination, ...d, avgPerNightEx, policyRate, policyRateEx, variance, variancePct };
      });

    setReportData(data);
    setHasGenerated(true);
    setSortField('variance');
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
      const aVal = a[sortField] ?? (sortDir === 'asc' ? Infinity : -Infinity);
      const bVal = b[sortField] ?? (sortDir === 'asc' ? Infinity : -Infinity);
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [reportData, sortField, sortDir]);

  const summaryStats = useMemo(() => {
    if (!reportData.length) return null;
    const withRate    = reportData.filter(r => r.policyRate !== null);
    const hasAnyGroup = reportData.some(r => r.hasGroupBooking);
    return {
      destinations: reportData.length,
      totalNights:  reportData.reduce((s, r) => s + r.roomNights, 0),
      hasAnyGroup,
      overCount:    withRate.filter(r => r.variance > 0).length,
      underCount:   withRate.filter(r => r.variance <= 0).length,
      noRateCount:  reportData.filter(r => r.policyRate === null).length,
    };
  }, [reportData]);

  // Policy editor
  const openEditor = () => { setEditRates({ ...rates }); setNewCity(''); setNewRate(''); setSaveMsg(''); setShowEditor(true); };
  const handleRateChange  = (city, val) => setEditRates(prev => ({ ...prev, [city]: val === '' ? '' : parseFloat(val) || '' }));
  const handleAddCity     = () => {
    const trimmed = newCity.trim(); const parsed = parseFloat(newRate);
    if (!trimmed || isNaN(parsed) || parsed <= 0) return;
    setEditRates(prev => ({ ...prev, [trimmed]: parsed }));
    setNewCity(''); setNewRate('');
  };
  const handleDeleteCity  = (city) => setEditRates(prev => { const n = { ...prev }; delete n[city]; return n; });
  const handleSavePolicy  = async () => {
    const cleaned = {};
    for (const [city, val] of Object.entries(editRates)) {
      const n = parseFloat(val);
      if (city.trim() && !isNaN(n) && n > 0) cleaned[city.trim()] = n;
    }
    setSaving(true);
    try {
      await setDoc(doc(db, 'clients', clientId, 'config', 'travelPolicy'), { rates: cleaned, flightRates: flightRates || {} }, { merge: true });
      setRates(cleaned);
      setSaveMsg('Policy saved.');
      setTimeout(() => setSaveMsg(''), 3000);
    } catch (e) {
      console.error('Error saving policy', e);
      setSaveMsg('Error saving.');
    }
    setSaving(false);
  };

  const filteredEditCities = useMemo(() => {
    const q = cityFilter.toLowerCase();
    return Object.keys(editRates).filter(c => c !== 'All Cities' && c.toLowerCase().includes(q)).sort();
  }, [editRates, cityFilter]);

  const sa = (f) => sortField === f ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕';

  // ── Flight logic ──────────────────────────────────────────────────────────────

  const handleFlightGenerate = () => {
    const filtered = trips.filter(t => {
      const ds    = getDisplayStatus(t);
      if (!BILLABLE_STATUSES.has(ds)) return false;
      const tDate = tripDateForMode(t, dateMode);
      if (from && tDate < from) return false;
      if (to   && tDate > to)   return false;
      return true;
    });

    const destMap = {};
    filtered.forEach(trip => {
      const dest = trip.destinationCity;
      if (!dest) return;
      const flightSectors = (trip.sectors || []).filter(s => s.type === 'flight');
      if (flightSectors.length === 0) return;
      const tripFlightEx = flightSectors.reduce((sum, s) => {
        const c = parseFloat(s.cost) || 0;
        return sum + (s.international ? c : c / 1.1);
      }, 0);
      if (!destMap[dest]) destMap[dest] = { trips: 0, totalCostEx: 0 };
      destMap[dest].trips++;
      destMap[dest].totalCostEx += tripFlightEx;
    });

    const data = Object.entries(destMap).map(([destination, d]) => {
      const avgCostEx    = d.totalCostEx / d.trips;
      const policyRate   = flightRates?.[destination] ?? null;
      const policyRateEx = policyRate !== null ? policyRate / 1.1 : null;
      const variance     = policyRateEx !== null ? avgCostEx - policyRateEx : null;
      const variancePct  = policyRateEx !== null ? ((avgCostEx - policyRateEx) / policyRateEx) * 100 : null;
      return { destination, ...d, avgCostEx, policyRate, policyRateEx, variance, variancePct };
    });

    setFlightData(data);
    setFlightGenerated(true);
    setFlightSortField('variance');
    setFlightSortDir('desc');
  };

  const handleFlightSort = (f) => {
    if (flightSortField === f) setFlightSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setFlightSortField(f); setFlightSortDir('desc'); }
  };

  const sortedFlightData = useMemo(() => {
    if (!flightData.length) return [];
    return [...flightData].sort((a, b) => {
      if (flightSortField === 'destination')
        return flightSortDir === 'asc' ? a.destination.localeCompare(b.destination) : b.destination.localeCompare(a.destination);
      const aVal = a[flightSortField] ?? (flightSortDir === 'asc' ? Infinity : -Infinity);
      const bVal = b[flightSortField] ?? (flightSortDir === 'asc' ? Infinity : -Infinity);
      return flightSortDir === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [flightData, flightSortField, flightSortDir]);

  const flightSummary = useMemo(() => {
    if (!flightData.length) return null;
    const withRate = flightData.filter(r => r.policyRateEx !== null);
    return {
      destinations: flightData.length,
      totalTrips:   flightData.reduce((s, r) => s + r.trips, 0),
      overCount:    withRate.filter(r => r.variance > 0).length,
      underCount:   withRate.filter(r => r.variance <= 0).length,
      noRateCount:  flightData.filter(r => r.policyRateEx === null).length,
    };
  }, [flightData]);

  const openFlightEditor = () => { setEditFlightRates({ ...(flightRates || {}) }); setNewFlightCity(''); setNewFlightRate(''); setFlightSaveMsg(''); setShowFlightEditor(true); };
  const handleFlightRateChange = (city, val) => setEditFlightRates(prev => ({ ...prev, [city]: val === '' ? '' : parseFloat(val) || '' }));
  const handleAddFlightCity    = () => {
    const trimmed = newFlightCity.trim(); const parsed = parseFloat(newFlightRate);
    if (!trimmed || isNaN(parsed) || parsed <= 0) return;
    setEditFlightRates(prev => ({ ...prev, [trimmed]: parsed }));
    setNewFlightCity(''); setNewFlightRate('');
  };
  const handleDeleteFlightCity = (city) => setEditFlightRates(prev => { const n = { ...prev }; delete n[city]; return n; });
  const handleSaveFlightPolicy = async () => {
    const cleaned = {};
    for (const [city, val] of Object.entries(editFlightRates)) {
      const n = parseFloat(val); if (city.trim() && !isNaN(n) && n > 0) cleaned[city.trim()] = n;
    }
    setFlightSaving(true);
    try {
      await setDoc(doc(db, 'clients', clientId, 'config', 'travelPolicy'), { rates: rates || {}, flightRates: cleaned }, { merge: true });
      setFlightRates(cleaned);
      setFlightSaveMsg('Saved.');
      setTimeout(() => setFlightSaveMsg(''), 3000);
    } catch (e) { setFlightSaveMsg('Error saving.'); }
    setFlightSaving(false);
  };

  const filteredFlightCities = useMemo(() => {
    const q = flightCityFilter.toLowerCase();
    return Object.keys(editFlightRates).filter(c => c.toLowerCase().includes(q)).sort();
  }, [editFlightRates, flightCityFilter]);

  const sf = (f) => flightSortField === f ? (flightSortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕';

  return (
    <div style={{ fontFamily:"'DM Sans','Helvetica Neue',sans-serif" }}>

      {/* View toggle — only show tabs when both policies are enabled */}
      {showAccom && showFlights && (
        <div style={{ display:'flex', gap:8, marginBottom:18 }}>
          {[['accommodation','🏨 Accommodation'],['flights','✈️ Flights']].map(([v,label]) => (
            <button key={v} onClick={() => setActiveView(v)}
              style={{ padding:'8px 18px', background: activeView === v ? '#0d9488' : '#f1f5f9', color: activeView === v ? '#fff' : '#475569', border:`1px solid ${activeView === v ? '#0d9488' : '#e2e8f0'}`, borderRadius:8, fontSize:13, fontWeight:700, cursor:'pointer' }}>
              {label}
            </button>
          ))}
        </div>
      )}

      {!showAccom && !showFlights && (
        <div style={{ textAlign:'center', padding:60, color:'#94a3b8' }}>
          <div style={{ fontSize:15, fontWeight:600, color:'#64748b' }}>Travel Policy reporting is not enabled for this client</div>
          <div style={{ fontSize:13, marginTop:4 }}>Enable Accommodation Policy or Flight Cost Policy in the client settings.</div>
        </div>
      )}

      {showFlights && activeView === 'flights' ? (
        <FlightsView
          canEdit={canEdit}
          showFlightEditor={showFlightEditor} setShowFlightEditor={setShowFlightEditor}
          openFlightEditor={openFlightEditor}
          editFlightRates={editFlightRates}
          handleFlightRateChange={handleFlightRateChange}
          handleAddFlightCity={handleAddFlightCity}
          handleDeleteFlightCity={handleDeleteFlightCity}
          handleSaveFlightPolicy={handleSaveFlightPolicy}
          filteredFlightCities={filteredFlightCities}
          flightSaving={flightSaving} flightSaveMsg={flightSaveMsg}
          newFlightCity={newFlightCity} setNewFlightCity={setNewFlightCity}
          newFlightRate={newFlightRate} setNewFlightRate={setNewFlightRate}
          flightCityFilter={flightCityFilter} setFlightCityFilter={setFlightCityFilter}
          dateMode={dateMode} setDateMode={setDateMode}
          periodKey={periodKey} from={from} to={to}
          applyPreset={applyPreset} setFrom={setFrom} setTo={setTo} setPeriodKey={setPeriodKey}
          ratesLoading={ratesLoading}
          handleFlightGenerate={handleFlightGenerate}
          flightGenerated={flightGenerated}
          flightSummary={flightSummary}
          sortedFlightData={sortedFlightData}
          handleFlightSort={handleFlightSort}
          flightSortField={flightSortField}
          sf={sf}
        />
      ) : null}

      {showAccom && activeView === 'accommodation' && (
        <>
      {/* Policy editor (STX only) */}
      {canEdit && (
        <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:12 }}>
          <button onClick={showEditor ? () => setShowEditor(false) : openEditor}
            style={{ padding:'7px 14px', background: showEditor ? '#e2e8f0' : '#f1f5f9', color:'#475569', border:'1px solid #e2e8f0', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer' }}>
            {showEditor ? '✕ Close Policy Editor' : '⚙ Manage Policy Rates'}
          </button>
        </div>
      )}

      {showEditor && canEdit && (
        <div style={{ ...card, marginBottom:16 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14, flexWrap:'wrap', gap:10 }}>
            <div>
              <div style={{ fontSize:15, fontWeight:700, color:'#0f172a' }}>Policy Rate Editor</div>
              <div style={{ fontSize:12, color:'#64748b', marginTop:2 }}>Enter max allowable nightly accommodation spend per city <strong>incl. GST</strong> (as per TD rates). The report compares on an ex-GST basis. Add <strong>All Cities</strong> to set a blanket rate for any destination without a specific entry.</div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              {saveMsg && <span style={{ fontSize:12, color: saveMsg.startsWith('Error') ? '#ef4444' : '#16a34a', fontWeight:600 }}>{saveMsg}</span>}
              <button onClick={handleSavePolicy} disabled={saving}
                style={{ padding:'7px 16px', background: saving ? '#94a3b8' : '#0d9488', color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:700, cursor: saving ? 'not-allowed' : 'pointer' }}>
                {saving ? 'Saving…' : '💾 Save Changes'}
              </button>
            </div>
          </div>

          {/* All Cities blanket rate checkbox */}
          <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', background:'#f0fdfa', border:'1px solid #99f6e4', borderRadius:8, marginBottom:10, flexWrap:'wrap' }}>
            <input
              type="checkbox" id="all-cities-chk"
              checked={'All Cities' in editRates}
              onChange={e => {
                if (e.target.checked) setEditRates(prev => ({ ...prev, 'All Cities': prev['All Cities'] || '' }));
                else handleDeleteCity('All Cities');
              }}
              style={{ width:15, height:15, cursor:'pointer', accentColor:'#0d9488' }}
            />
            <label htmlFor="all-cities-chk" style={{ fontSize:13, fontWeight:600, color:'#0d9488', cursor:'pointer', whiteSpace:'nowrap' }}>
              Blanket rate for all cities
            </label>
            {'All Cities' in editRates && (
              <>
                <input type="number" min="0" step="1" placeholder="e.g. 200"
                  value={editRates['All Cities'] ?? ''}
                  onChange={e => handleRateChange('All Cities', e.target.value)}
                  style={{ ...inp, width:90, padding:'4px 8px', fontSize:13 }}
                />
                <span style={{ fontSize:12, color:'#64748b' }}>/night (incl. GST) — applies to destinations not listed below; report compares ex-GST</span>
              </>
            )}
          </div>

          <div style={{ marginBottom:10 }}>
            <input type="text" placeholder="Search city…" value={cityFilter} onChange={e => setCityFilter(e.target.value)} style={{ ...inp, width:220 }} />
            <span style={{ marginLeft:10, fontSize:12, color:'#94a3b8' }}>{filteredEditCities.length} cities</span>
          </div>

          <div style={{ maxHeight:320, overflowY:'auto', border:'1px solid #e2e8f0', borderRadius:8 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 140px 48px', padding:'8px 14px', background:'#f8fafc', borderBottom:'1px solid #e2e8f0', position:'sticky', top:0 }}>
              <span style={chdr}>City</span>
              <span style={{ ...chdr, textAlign:'right' }}>Max/Night (incl. GST)</span>
              <span />
            </div>
            {filteredEditCities.map((city, idx) => (
              <div key={city} style={{ display:'grid', gridTemplateColumns:'1fr 140px 48px', padding:'6px 14px', alignItems:'center', background: idx % 2 === 0 ? '#fff' : '#fafafa', borderBottom:'1px solid #f1f5f9' }}>
                <span style={{ fontSize:13, color:'#1e293b' }}>{city}</span>
                <div style={{ textAlign:'right' }}>
                  <input type="number" min="0" step="1" value={editRates[city] ?? ''} onChange={e => handleRateChange(city, e.target.value)}
                    style={{ ...inp, width:80, textAlign:'right', padding:'4px 8px', fontSize:13 }} />
                </div>
                <div style={{ textAlign:'center' }}>
                  <button onClick={() => handleDeleteCity(city)} style={{ background:'none', border:'none', color:'#94a3b8', cursor:'pointer', fontSize:16, lineHeight:1, padding:'2px 6px' }}>×</button>
                </div>
              </div>
            ))}
          </div>

          <div style={{ display:'flex', gap:8, marginTop:12, alignItems:'center', flexWrap:'wrap' }}>
            <div>
              <label style={lbl}>Add City</label>
              <input type="text" placeholder="City name" value={newCity} onChange={e => setNewCity(e.target.value)} style={{ ...inp, width:180 }} />
            </div>
            <div>
              <label style={lbl}>Max/Night (incl. GST)</label>
              <input type="number" min="0" step="1" placeholder="e.g. 195" value={newRate}
                onChange={e => setNewRate(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddCity()}
                style={{ ...inp, width:100 }} />
            </div>
            <button onClick={handleAddCity} disabled={!newCity.trim() || !newRate}
              style={{ alignSelf:'flex-end', padding:'7px 14px', background: !newCity.trim() || !newRate ? '#e2e8f0' : '#0f172a', color: !newCity.trim() || !newRate ? '#94a3b8' : '#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:700, cursor: !newCity.trim() || !newRate ? 'not-allowed' : 'pointer' }}>
              + Add
            </button>
          </div>
        </div>
      )}

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
        {ratesLoading ? (
          <button disabled style={{ padding:'8px 20px', background:'#e2e8f0', color:'#94a3b8', border:'none', borderRadius:8, fontSize:13, fontWeight:700, cursor:'not-allowed' }}>Loading policy rates…</button>
        ) : (
          <button onClick={handleGenerate}
            style={{ padding:'8px 20px', background:'#0f172a', color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:700, cursor:'pointer' }}>
            ↻ Generate Report
          </button>
        )}
      </div>

      {hasGenerated && (
        <div>
          {summaryStats && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:12, marginBottom:20 }}>
              {[
                { label:'Destinations',  value: summaryStats.destinations },
                { label: summaryStats.hasAnyGroup ? 'Room-Nights' : 'Total Nights', value: summaryStats.totalNights },
                { label:'Over Policy',   value: summaryStats.overCount,   color:'#dc2626' },
                { label:'Under Policy',  value: summaryStats.underCount,  color:'#16a34a' },
                { label:'No Rate Set',   value: summaryStats.noRateCount, color:'#94a3b8' },
              ].map(c => (
                <div key={c.label} style={{ background:'#fff', borderRadius:10, border:'1px solid #e2e8f0', padding:'14px 18px', textAlign:'center', boxShadow:'0 1px 3px rgba(0,0,0,0.04)' }}>
                  <div style={{ fontSize:24, fontWeight:800, color: c.color || '#0f172a', lineHeight:1.2 }}>{c.value}</div>
                  <div style={{ fontSize:10, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.05em', marginTop:3 }}>{c.label}</div>
                </div>
              ))}
            </div>
          )}

          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12, flexWrap:'wrap', gap:8 }}>
            <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
              <span style={{ fontSize:11, color:'#64748b', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em' }}>Sort:</span>
              {[['destination','City'],['nights','Nights'],['avgPerNightEx','Avg/Night (Ex GST)'],['policyRateEx','Policy Rate (Ex GST)'],['variance','Variance $'],['variancePct','Variance %']].map(([f,label]) => (
                <button key={f} onClick={() => handleSort(f)}
                  style={{ ...pill, color: sortField === f ? '#0d9488' : '#94a3b8', borderColor: sortField === f ? '#0d9488' : '#e2e8f0', fontWeight:700 }}>
                  {label}{sa(f)}
                </button>
              ))}
            </div>
            <div style={{ display:'flex', gap:6 }}>
              <span style={{ fontSize:11, padding:'3px 10px', background:'#fef2f2', color:'#dc2626', border:'1px solid #fecaca', borderRadius:20, fontWeight:700 }}>Over policy</span>
              <span style={{ fontSize:11, padding:'3px 10px', background:'#f0fdf4', color:'#16a34a', border:'1px solid #bbf7d0', borderRadius:20, fontWeight:700 }}>Under policy</span>
              <span style={{ fontSize:11, padding:'3px 10px', background:'#f8fafc', color:'#94a3b8', border:'1px solid #e2e8f0', borderRadius:20, fontWeight:700 }}>No rate</span>
            </div>
          </div>

          {sortedData.length === 0 ? (
            <div style={{ textAlign:'center', padding:60, color:'#94a3b8' }}>
              <div style={{ fontSize:36, marginBottom:10 }}>🔍</div>
              <div style={{ fontSize:15, fontWeight:600, color:'#64748b' }}>No accommodation data for the selected period</div>
              <div style={{ fontSize:13, marginTop:4 }}>Only accommodation sectors with check-in and check-out dates are included.</div>
            </div>
          ) : (
            <div style={{ background:'#fff', borderRadius:12, border:'1px solid #e2e8f0', overflow:'hidden', boxShadow:'0 1px 3px rgba(0,0,0,0.04)' }}>
              <div style={{ display:'grid', gridTemplateColumns:'2fr 60px 70px 120px 110px 90px 90px', padding:'10px 18px', background:'#f8fafc', borderBottom:'1px solid #e2e8f0' }}>
                {[['destination','Destination','left'],['stays','Stays','right'],['roomNights','Nights','right'],['avgPerNightEx','Avg/Night (Ex GST)','right'],['policyRateEx','Policy Rate (Ex GST)','right'],['variance','Variance $','right'],['variancePct','Variance %','right']].map(([f,label,align]) => (
                  <div key={f} onClick={() => handleSort(f)} style={{ fontSize:10, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.05em', textAlign:align, cursor:'pointer', userSelect:'none' }}>
                    {label}{sa(f)}
                  </div>
                ))}
              </div>
              {sortedData.map((row, idx) => {
                const isOver  = row.variance !== null && row.variance > 0;
                const isUnder = row.variance !== null && row.variance <= 0;
                const hasRate = row.policyRateEx !== null;
                const rowBg   = isOver  ? (idx%2===0?'#fff5f5':'#fff0f0') : isUnder ? (idx%2===0?'#f0fdf4':'#ebfdf0') : (idx%2===0?'#fff':'#fafafa');
                const badge   = isOver  ? { text:'OVER',    bg:'#fef2f2', color:'#dc2626', border:'#fecaca' }
                              : isUnder ? { text:'UNDER',   bg:'#f0fdf4', color:'#16a34a', border:'#bbf7d0' }
                              :           { text:'NO RATE', bg:'#f8fafc', color:'#94a3b8', border:'#e2e8f0' };
                return (
                  <div key={row.destination}
                    style={{ display:'grid', gridTemplateColumns:'2fr 60px 70px 120px 110px 90px 90px', padding:'12px 18px', alignItems:'center', background:rowBg, borderBottom: idx < sortedData.length-1 ? '1px solid #f1f5f9' : 'none' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ fontWeight:600, fontSize:14, color:'#1e293b' }}>{row.destination}</span>
                      <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:20, background:badge.bg, color:badge.color, border:`1px solid ${badge.border}` }}>{badge.text}</span>
                    </div>
                    <div style={{ textAlign:'right', fontSize:13, color:'#475569' }}>{row.stays}</div>
                    <div style={{ textAlign:'right', fontSize:13, color:'#475569' }}>
                      {row.hasGroupBooking
                        ? <span title={`${row.nights} calendar nights · ${row.roomNights} room-nights`}>{row.roomNights} <span style={{ fontSize:10, color:'#94a3b8' }}>rm-nts</span></span>
                        : row.nights}
                    </div>
                    <div style={{ textAlign:'right', fontFamily:'monospace', fontSize:13, fontWeight:600, color:'#1e293b' }}>${row.avgPerNightEx.toFixed(0)}</div>
                    <div style={{ textAlign:'right', fontFamily:'monospace', fontSize:13, color: hasRate ? '#475569' : '#cbd5e1' }}>
                      {hasRate ? `$${row.policyRateEx.toFixed(0)}` : '—'}
                    </div>
                    <div style={{ textAlign:'right', fontFamily:'monospace', fontSize:13, fontWeight:700, color: !hasRate ? '#cbd5e1' : isOver ? '#dc2626' : '#16a34a' }}>
                      {hasRate ? `${row.variance >= 0 ? '+' : ''}$${row.variance.toFixed(0)}` : '—'}
                    </div>
                    <div style={{ textAlign:'right', fontFamily:'monospace', fontSize:13, fontWeight:700, color: !hasRate ? '#cbd5e1' : isOver ? '#dc2626' : '#16a34a' }}>
                      {hasRate ? `${row.variancePct >= 0 ? '+' : ''}${row.variancePct.toFixed(1)}%` : '—'}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {sortedData.length > 0 && (
            <p style={{ fontSize:11, color:'#94a3b8', marginTop:14, textAlign:'center' }}>
              All figures ex-GST · Policy rates entered incl. GST (TD 2025/4) and converted for comparison · Only accommodation sectors with check-in &amp; check-out dates included · Approved, Booked, Travelling &amp; Completed trips only
            </p>
          )}
        </div>
      )}
        </>
      )}
    </div>
  );
}

// ── Flights sub-view ──────────────────────────────────────────────────────────

function FlightsView({
  canEdit, showFlightEditor, setShowFlightEditor, openFlightEditor,
  editFlightRates, handleFlightRateChange, handleAddFlightCity, handleDeleteFlightCity,
  handleSaveFlightPolicy, filteredFlightCities, flightSaving, flightSaveMsg,
  newFlightCity, setNewFlightCity, newFlightRate, setNewFlightRate,
  flightCityFilter, setFlightCityFilter,
  dateMode, setDateMode, periodKey, from, to, applyPreset, setFrom, setTo, setPeriodKey,
  ratesLoading, handleFlightGenerate, flightGenerated, flightSummary, sortedFlightData,
  handleFlightSort, flightSortField, sf,
}) {
  return (
    <div>
      {canEdit && (
        <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:12 }}>
          <button onClick={showFlightEditor ? () => setShowFlightEditor(false) : openFlightEditor}
            style={{ padding:'7px 14px', background: showFlightEditor ? '#e2e8f0' : '#f1f5f9', color:'#475569', border:'1px solid #e2e8f0', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer' }}>
            {showFlightEditor ? '✕ Close Editor' : '⚙ Manage Flight Policy Rates'}
          </button>
        </div>
      )}

      {showFlightEditor && canEdit && (
        <div style={{ ...card, marginBottom:16 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14, flexWrap:'wrap', gap:10 }}>
            <div>
              <div style={{ fontSize:15, fontWeight:700, color:'#0f172a' }}>Flight Policy Rate Editor</div>
              <div style={{ fontSize:12, color:'#64748b', marginTop:2 }}>Max allowable total flight cost per trip by destination city, entered <strong>incl. GST</strong>. Report compares ex-GST.</div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              {flightSaveMsg && <span style={{ fontSize:12, color: flightSaveMsg.startsWith('Error') ? '#ef4444' : '#16a34a', fontWeight:600 }}>{flightSaveMsg}</span>}
              <button onClick={handleSaveFlightPolicy} disabled={flightSaving}
                style={{ padding:'7px 16px', background: flightSaving ? '#94a3b8' : '#0d9488', color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:700, cursor: flightSaving ? 'not-allowed' : 'pointer' }}>
                {flightSaving ? 'Saving…' : '💾 Save Changes'}
              </button>
            </div>
          </div>
          <div style={{ marginBottom:10 }}>
            <input type="text" placeholder="Search city…" value={flightCityFilter} onChange={e => setFlightCityFilter(e.target.value)} style={{ ...inp, width:220 }} />
            <span style={{ marginLeft:10, fontSize:12, color:'#94a3b8' }}>{filteredFlightCities.length} cities</span>
          </div>
          <div style={{ maxHeight:280, overflowY:'auto', border:'1px solid #e2e8f0', borderRadius:8 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 160px 48px', padding:'8px 14px', background:'#f8fafc', borderBottom:'1px solid #e2e8f0', position:'sticky', top:0 }}>
              <span style={chdr}>City</span>
              <span style={{ ...chdr, textAlign:'right' }}>Max/Trip (incl. GST)</span>
              <span />
            </div>
            {filteredFlightCities.length === 0 && (
              <div style={{ padding:'16px 14px', fontSize:13, color:'#94a3b8', textAlign:'center' }}>No cities added yet. Add cities below.</div>
            )}
            {filteredFlightCities.map((city, idx) => (
              <div key={city} style={{ display:'grid', gridTemplateColumns:'1fr 160px 48px', padding:'6px 14px', alignItems:'center', background: idx % 2 === 0 ? '#fff' : '#fafafa', borderBottom:'1px solid #f1f5f9' }}>
                <span style={{ fontSize:13, color:'#1e293b' }}>{city}</span>
                <div style={{ textAlign:'right' }}>
                  <input type="number" min="0" step="1" value={editFlightRates[city] ?? ''} onChange={e => handleFlightRateChange(city, e.target.value)}
                    style={{ ...inp, width:80, textAlign:'right', padding:'4px 8px', fontSize:13 }} />
                </div>
                <div style={{ textAlign:'center' }}>
                  <button onClick={() => handleDeleteFlightCity(city)} style={{ background:'none', border:'none', color:'#94a3b8', cursor:'pointer', fontSize:16, lineHeight:1, padding:'2px 6px' }}>×</button>
                </div>
              </div>
            ))}
          </div>
          <div style={{ display:'flex', gap:8, marginTop:12, alignItems:'center', flexWrap:'wrap' }}>
            <div><label style={lbl}>Add City</label><input type="text" placeholder="City name" value={newFlightCity} onChange={e => setNewFlightCity(e.target.value)} style={{ ...inp, width:180 }} /></div>
            <div><label style={lbl}>Max/Trip ($)</label><input type="number" min="0" step="1" placeholder="e.g. 500" value={newFlightRate} onChange={e => setNewFlightRate(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddFlightCity()} style={{ ...inp, width:100 }} /></div>
            <button onClick={handleAddFlightCity} disabled={!newFlightCity.trim() || !newFlightRate}
              style={{ alignSelf:'flex-end', padding:'7px 14px', background: !newFlightCity.trim() || !newFlightRate ? '#e2e8f0' : '#0f172a', color: !newFlightCity.trim() || !newFlightRate ? '#94a3b8' : '#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:700, cursor: !newFlightCity.trim() || !newFlightRate ? 'not-allowed' : 'pointer' }}>+ Add</button>
          </div>
        </div>
      )}

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
        {ratesLoading ? (
          <button disabled style={{ padding:'8px 20px', background:'#e2e8f0', color:'#94a3b8', border:'none', borderRadius:8, fontSize:13, fontWeight:700, cursor:'not-allowed' }}>Loading…</button>
        ) : (
          <button onClick={handleFlightGenerate}
            style={{ padding:'8px 20px', background:'#0f172a', color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:700, cursor:'pointer' }}>
            ↻ Generate Report
          </button>
        )}
      </div>

      {flightGenerated && (
        <div>
          {flightSummary && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:12, marginBottom:20 }}>
              {[
                { label:'Destinations',  value: flightSummary.destinations },
                { label:'Total Trips',   value: flightSummary.totalTrips },
                { label:'Over Policy',   value: flightSummary.overCount,  color:'#dc2626' },
                { label:'Under Policy',  value: flightSummary.underCount, color:'#16a34a' },
                { label:'No Rate Set',   value: flightSummary.noRateCount, color:'#94a3b8' },
              ].map(c => (
                <div key={c.label} style={{ background:'#fff', borderRadius:10, border:'1px solid #e2e8f0', padding:'14px 18px', textAlign:'center', boxShadow:'0 1px 3px rgba(0,0,0,0.04)' }}>
                  <div style={{ fontSize:24, fontWeight:800, color: c.color || '#0f172a', lineHeight:1.2 }}>{c.value}</div>
                  <div style={{ fontSize:10, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.05em', marginTop:3 }}>{c.label}</div>
                </div>
              ))}
            </div>
          )}

          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:12, flexWrap:'wrap' }}>
            <span style={{ fontSize:11, color:'#64748b', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em' }}>Sort:</span>
            {[['destination','City'],['trips','Trips'],['avgCostEx','Avg Cost (Ex GST)'],['policyRateEx','Policy Rate'],['variance','Variance $'],['variancePct','Variance %']].map(([f,label]) => (
              <button key={f} onClick={() => handleFlightSort(f)}
                style={{ ...pill, color: flightSortField === f ? '#0d9488' : '#94a3b8', borderColor: flightSortField === f ? '#0d9488' : '#e2e8f0', fontWeight:700 }}>
                {label}{sf(f)}
              </button>
            ))}
          </div>

          {sortedFlightData.length === 0 ? (
            <div style={{ textAlign:'center', padding:60, color:'#94a3b8' }}>
              <div style={{ fontSize:36, marginBottom:10 }}>✈️</div>
              <div style={{ fontSize:15, fontWeight:600, color:'#64748b' }}>No flight data for the selected period</div>
              <div style={{ fontSize:13, marginTop:4 }}>Only trips with a destination city and at least one flight sector are included.</div>
            </div>
          ) : (
            <div style={{ background:'#fff', borderRadius:12, border:'1px solid #e2e8f0', overflow:'hidden', boxShadow:'0 1px 3px rgba(0,0,0,0.04)' }}>
              <div style={{ display:'grid', gridTemplateColumns:'2fr 70px 130px 120px 90px 90px', padding:'10px 18px', background:'#f8fafc', borderBottom:'1px solid #e2e8f0' }}>
                {[['destination','Destination','left'],['trips','Trips','right'],['avgCostEx','Avg Cost (Ex GST)','right'],['policyRateEx','Policy Rate (Ex GST)','right'],['variance','Variance $','right'],['variancePct','Variance %','right']].map(([f,label,align]) => (
                  <div key={f} onClick={() => handleFlightSort(f)} style={{ fontSize:10, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.05em', textAlign:align, cursor:'pointer', userSelect:'none' }}>
                    {label}{sf(f)}
                  </div>
                ))}
              </div>
              {sortedFlightData.map((row, idx) => {
                const isOver  = row.variance !== null && row.variance > 0;
                const isUnder = row.variance !== null && row.variance <= 0;
                const hasRate = row.policyRateEx !== null;
                const rowBg   = isOver ? (idx%2===0?'#fff5f5':'#fff0f0') : isUnder ? (idx%2===0?'#f0fdf4':'#ebfdf0') : (idx%2===0?'#fff':'#fafafa');
                const badge   = isOver  ? { text:'OVER',    bg:'#fef2f2', color:'#dc2626', border:'#fecaca' }
                              : isUnder ? { text:'UNDER',   bg:'#f0fdf4', color:'#16a34a', border:'#bbf7d0' }
                              :           { text:'NO RATE', bg:'#f8fafc', color:'#94a3b8', border:'#e2e8f0' };
                return (
                  <div key={row.destination}
                    style={{ display:'grid', gridTemplateColumns:'2fr 70px 130px 120px 90px 90px', padding:'12px 18px', alignItems:'center', background:rowBg, borderBottom: idx < sortedFlightData.length-1 ? '1px solid #f1f5f9' : 'none' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ fontWeight:600, fontSize:14, color:'#1e293b' }}>{row.destination}</span>
                      <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:20, background:badge.bg, color:badge.color, border:`1px solid ${badge.border}` }}>{badge.text}</span>
                    </div>
                    <div style={{ textAlign:'right', fontSize:13, color:'#475569' }}>{row.trips}</div>
                    <div style={{ textAlign:'right', fontFamily:'monospace', fontSize:13, fontWeight:600, color:'#1e293b' }}>${row.avgCostEx.toFixed(0)}</div>
                    <div style={{ textAlign:'right', fontFamily:'monospace', fontSize:13, color: hasRate ? '#475569' : '#cbd5e1' }}>
                      {hasRate ? `$${row.policyRateEx.toFixed(0)}` : '—'}
                    </div>
                    <div style={{ textAlign:'right', fontFamily:'monospace', fontSize:13, fontWeight:700, color: !hasRate ? '#cbd5e1' : isOver ? '#dc2626' : '#16a34a' }}>
                      {hasRate ? `${row.variance >= 0 ? '+' : ''}$${row.variance.toFixed(0)}` : '—'}
                    </div>
                    <div style={{ textAlign:'right', fontFamily:'monospace', fontSize:13, fontWeight:700, color: !hasRate ? '#cbd5e1' : isOver ? '#dc2626' : '#16a34a' }}>
                      {hasRate ? `${row.variancePct >= 0 ? '+' : ''}${row.variancePct.toFixed(1)}%` : '—'}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {sortedFlightData.length > 0 && (
            <p style={{ fontSize:11, color:'#94a3b8', marginTop:14, textAlign:'center' }}>
              All figures ex-GST · Total flight cost per trip grouped by destination city · Policy rates entered incl. GST and converted for comparison · Approved, Booked, Travelling &amp; Completed trips only
            </p>
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
const chdr = { fontSize:10, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.05em' };
