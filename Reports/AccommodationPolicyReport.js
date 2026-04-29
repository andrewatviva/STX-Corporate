import { useState, useEffect, useMemo } from 'react';
import { db } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const APP_ID = (typeof window !== 'undefined' && window.__app_id) ? window.__app_id : 'stx-portal-v1';

// Seeded from TD 2025/4 via DANA Travel Procedure March 2026
const DEFAULT_RATES = {
  'Adelaide': 158,
  'Brisbane': 181,
  'Canberra': 178,
  'Darwin': 220,
  'Hobart': 176,
  'Melbourne': 173,
  'Perth': 180,
  'Sydney': 223,
  'Other country centres': 141,
  'Albany': 193,
  'Albury': 207,
  'Alice Springs': 206,
  'Ararat': 159,
  'Armidale': 166,
  'Ayr': 207,
  'Bairnsdale': 176,
  'Ballarat': 187,
  'Bathurst': 207,
  'Bega': 207,
  'Benalla': 168,
  'Bendigo': 170,
  'Bordertown': 164,
  'Bourke': 184,
  'Bright': 180,
  'Broken Hill': 162,
  'Broome': 255,
  'Bunbury': 178,
  'Bundaberg': 184,
  'Burnie': 178,
  'Cairns': 175,
  'Carnarvon': 174,
  'Castlemaine': 162,
  'Ceduna': 156,
  'Charters Towers': 168,
  'Chinchilla': 207,
  'Christmas Island': 218,
  'Cobar': 207,
  'Cocos (Keeling) Islands': 331,
  'Coffs Harbour': 207,
  'Colac': 207,
  'Cooma': 207,
  'Cowra': 207,
  'Dalby': 201,
  'Dampier': 199,
  'Derby': 192,
  'Devonport': 162,
  'Dubbo': 170,
  'Echuca': 207,
  'Emerald': 179,
  'Esperance': 180,
  'Exmouth': 235,
  'Geelong': 175,
  'Geraldton': 190,
  'Gladstone': 171,
  'Gold Coast': 225,
  'Goulburn': 165,
  'Gosford': 161,
  'Grafton': 172,
  'Griffith': 160,
  'Gunnedah': 180,
  'Halls Creek': 204,
  'Hamilton': 170,
  'Hervey Bay': 175,
  'Horn Island': 345,
  'Horsham': 166,
  'Innisfail': 207,
  'Inverell': 207,
  'Jabiru': 216,
  'Kadina': 207,
  'Kalgoorlie': 193,
  'Karratha': 288,
  'Katherine': 228,
  'Kingaroy': 180,
  'Kununurra': 222,
  'Launceston': 174,
  'Lismore': 183,
  'Mackay': 166,
  'Maitland': 187,
  'Maryborough': 207,
  'Mildura': 170,
  'Mount Gambier': 164,
  'Mount Isa': 185,
  'Mudgee': 206,
  'Muswellbrook': 160,
  'Nambour': 163,
  'Naracoorte': 207,
  'Narrabri': 207,
  'Newcastle': 195,
  'Newman': 271,
  'Nhulunbuy': 264,
  'Norfolk Island': 256,
  'Northam': 220,
  'Nowra': 168,
  'Orange': 215,
  'Port Augusta': 207,
  'Port Hedland': 266,
  'Port Lincoln': 170,
  'Port Macquarie': 190,
  'Port Pirie': 207,
  'Portland': 163,
  'Queanbeyan': 207,
  'Queenstown': 207,
  'Renmark': 207,
  'Rockhampton': 174,
  'Roma': 182,
  'Sale': 207,
  'Seymour': 164,
  'Shepparton': 167,
  'Swan Hill': 181,
  'Tamworth': 207,
  'Taree': 207,
  'Tennant Creek': 207,
  'Thursday Island': 323,
  'Toowoomba': 161,
  'Townsville': 174,
  'Tumut': 207,
  'Wagga Wagga': 177,
  'Wangaratta': 186,
  'Warrnambool': 175,
  'Weipa': 238,
  'Whyalla': 167,
  'Wilpena-Pound': 272,
  'Wodonga': 207,
  'Wollongong': 182,
  'Wonthaggi': 188,
  'Yulara': 570,
};

function findPolicyRate(destination, rates) {
  if (!rates) return null;
  if (rates[destination] !== undefined) return rates[destination];
  const lower = destination.toLowerCase();
  for (const [city, rate] of Object.entries(rates)) {
    if (city.toLowerCase() === lower) return rate;
  }
  for (const [city, rate] of Object.entries(rates)) {
    if (lower.includes(city.toLowerCase()) || city.toLowerCase().includes(lower)) return rate;
  }
  return null;
}

export default function AccommodationPolicyReport({ trips, currentUser }) {
  const _now = new Date();
  const _fyYear = _now.getMonth() >= 6 ? _now.getFullYear() : _now.getFullYear() - 1;
  const [startDate,       setStartDate]       = useState(`${_fyYear}-07-01`);
  const [endDate,         setEndDate]         = useState(`${_fyYear + 1}-06-30`);
  const [hasGenerated,    setHasGenerated]    = useState(false);
  const [reportData,      setReportData]      = useState([]);
  const [rates,           setRates]           = useState(null);
  const [ratesLoading,    setRatesLoading]    = useState(true);
  const [showEditor,      setShowEditor]      = useState(false);
  const [editRates,       setEditRates]       = useState({});
  const [newCity,         setNewCity]         = useState('');
  const [newRate,         setNewRate]         = useState('');
  const [saving,          setSaving]          = useState(false);
  const [saveMsg,         setSaveMsg]         = useState('');
  const [sortField,       setSortField]       = useState('variance');
  const [sortDir,         setSortDir]         = useState('desc');
  const [cityFilter,      setCityFilter]      = useState('');

  const canEdit = currentUser?.role === 'ops' || currentUser?.role === 'stx';

  // ── Load policy rates from Firestore ──
  useEffect(() => {
    const load = async () => {
      try {
        const ref = doc(db, 'artifacts', APP_ID, 'public', 'data', 'travelPolicy', 'accommodation');
        const snap = await getDoc(ref);
        if (snap.exists()) {
          setRates(snap.data().rates || DEFAULT_RATES);
        } else {
          await setDoc(ref, { rates: DEFAULT_RATES });
          setRates(DEFAULT_RATES);
        }
      } catch (e) {
        console.error('Error loading policy rates', e);
        setRates(DEFAULT_RATES);
      }
      setRatesLoading(false);
    };
    load();
  }, []);

  const toStr = (d) => {
    const offset = d.getTimezoneOffset();
    return new Date(d.getTime() - offset * 60000).toISOString().split('T')[0];
  };

  const handleDatePreset = (preset) => {
    if (!preset) return;
    const now = new Date();
    let start = new Date(), end = new Date();
    if (preset === 'currentMonth')   { start = new Date(now.getFullYear(), now.getMonth(), 1);       end = new Date(now.getFullYear(), now.getMonth() + 1, 0); }
    if (preset === 'lastMonth')      { start = new Date(now.getFullYear(), now.getMonth() - 1, 1);   end = new Date(now.getFullYear(), now.getMonth(), 0); }
    if (preset === 'currentQuarter') { const q = Math.floor(now.getMonth() / 3) * 3; start = new Date(now.getFullYear(), q, 1); end = new Date(now.getFullYear(), q + 3, 0); }
    if (preset === 'lastQuarter')    { const q = Math.floor(now.getMonth() / 3) * 3 - 3; start = new Date(now.getFullYear(), q, 1); end = new Date(now.getFullYear(), q + 3, 0); }
    if (preset === 'currentFY')      { const sy = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1; start = new Date(sy, 6, 1); end = new Date(sy + 1, 5, 30); }
    if (preset === 'lastFY')         { const sy = (now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1) - 1; start = new Date(sy, 6, 1); end = new Date(sy + 1, 5, 30); }
    if (preset === 'currentYear')    { start = new Date(now.getFullYear(), 0, 1); end = new Date(now.getFullYear(), 11, 31); }
    if (preset === 'lastYear')       { start = new Date(now.getFullYear() - 1, 0, 1); end = new Date(now.getFullYear() - 1, 11, 31); }
    setStartDate(toStr(start));
    setEndDate(toStr(end));
  };

  // ── Generate report ──
  const handleGenerate = () => {
    const validStatuses = ['Approved', 'Booked', 'Completed'];
    let filtered = trips.filter(t => validStatuses.includes(t.status));
    if (startDate) filtered = filtered.filter(t => t.startDate >= startDate);
    if (endDate)   filtered = filtered.filter(t => t.startDate <= endDate);

    const destMap = {};
    filtered.forEach(trip => {
      const tripDest = (trip.destination || 'Unknown').trim();
      const accomSectors = (trip.sectors || []).filter(s =>
        s.type === 'Accommodation' && s.date && s.endDate
      );
      if (accomSectors.length === 0) return;

      accomSectors.forEach(sector => {
        // Use sector-level policy city override if set, otherwise fall back to trip destination
        const dest = (sector.policyCity || tripDest).trim();
        const nights = Math.max(0, Math.round((new Date(sector.endDate) - new Date(sector.date)) / 86400000));
        if (nights === 0) return;
        const net   = Math.max(0, (parseFloat(sector.cost) || 0) - (parseFloat(sector.refund) || 0));
        const netEx = sector.region === 'International' ? net : net / 1.1;
        // Room-nights: use per-night array if set, otherwise 1 room per night
        const roomsByNight = sector.roomsByNight;
        const roomNightsForSector = roomsByNight?.length === nights
          ? roomsByNight.reduce((s, r) => s + (r || 1), 0)
          : nights; // fallback: 1 room per night
        const hasRoomData = roomsByNight?.length > 0;

        if (!destMap[dest]) destMap[dest] = { stays: 0, nights: 0, roomNights: 0, totalCostInc: 0, totalCostEx: 0, hasGroupBooking: false };
        destMap[dest].stays++;
        destMap[dest].nights       += nights;
        destMap[dest].roomNights   += roomNightsForSector;
        destMap[dest].totalCostInc += net;
        destMap[dest].totalCostEx  += netEx;
        if (hasRoomData) destMap[dest].hasGroupBooking = true;
      });
    });

    const data = Object.entries(destMap)
      .filter(([, d]) => d.nights > 0)
      .map(([destination, d]) => {
        const avgPerNightInc = d.totalCostInc / d.roomNights;
        const avgPerNightEx  = d.totalCostEx  / d.roomNights;
        const policyRate     = findPolicyRate(destination, rates);
        const variance       = policyRate !== null ? avgPerNightInc - policyRate : null;
        const variancePct    = policyRate !== null ? ((avgPerNightInc - policyRate) / policyRate) * 100 : null;
        return { destination, ...d, avgPerNightInc, avgPerNightEx, policyRate, variance, variancePct, roomNights: d.roomNights, hasGroupBooking: d.hasGroupBooking };
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
    const withRate = reportData.filter(r => r.policyRate !== null);
    const over     = withRate.filter(r => r.variance > 0);
    const under    = withRate.filter(r => r.variance <= 0);
    const hasAnyGroup = reportData.some(r => r.hasGroupBooking);
    return {
      destinations: reportData.length,
      totalNights:  reportData.reduce((s, r) => s + r.roomNights, 0),
      hasAnyGroup,
      overCount:    over.length,
      underCount:   under.length,
      noRateCount:  reportData.filter(r => r.policyRate === null).length,
    };
  }, [reportData]);

  // ── Policy editor ──
  const openEditor = () => {
    setEditRates({ ...rates });
    setNewCity('');
    setNewRate('');
    setSaveMsg('');
    setShowEditor(true);
  };

  const handleRateChange = (city, val) => {
    setEditRates(prev => ({ ...prev, [city]: val === '' ? '' : parseFloat(val) || '' }));
  };

  const handleAddCity = () => {
    const trimmed = newCity.trim();
    const parsed  = parseFloat(newRate);
    if (!trimmed || isNaN(parsed) || parsed <= 0) return;
    setEditRates(prev => ({ ...prev, [trimmed]: parsed }));
    setNewCity('');
    setNewRate('');
  };

  const handleDeleteCity = (city) => {
    setEditRates(prev => {
      const next = { ...prev };
      delete next[city];
      return next;
    });
  };

  const handleSavePolicy = async () => {
    const cleaned = {};
    for (const [city, val] of Object.entries(editRates)) {
      const n = parseFloat(val);
      if (city.trim() && !isNaN(n) && n > 0) cleaned[city.trim()] = n;
    }
    setSaving(true);
    try {
      const ref = doc(db, 'artifacts', APP_ID, 'public', 'data', 'travelPolicy', 'accommodation');
      await setDoc(ref, { rates: cleaned });
      setRates(cleaned);
      setSaveMsg('Policy saved successfully.');
      setTimeout(() => setSaveMsg(''), 3000);
    } catch (e) {
      console.error('Error saving policy', e);
      setSaveMsg('Error saving — check console.');
    }
    setSaving(false);
  };

  const filteredEditCities = useMemo(() => {
    const q = cityFilter.toLowerCase();
    return Object.keys(editRates).filter(c => c.toLowerCase().includes(q)).sort();
  }, [editRates, cityFilter]);

  // ── Render ──
  return (
    <div style={{ fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif", background: "#f8fafc", minHeight: "100vh", padding: "24px" }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 22, lineHeight: 1 }}>🏨</span>
            <div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#0f172a" }}>Accommodation Policy Compliance</h1>
              <p style={{ margin: "2px 0 0", color: "#64748b", fontSize: 13 }}>Compare actual average nightly accommodation spend against DANA travel policy allowances (TD 2025/4)</p>
            </div>
          </div>
          {canEdit && (
            <button onClick={showEditor ? () => setShowEditor(false) : openEditor}
              style={{ padding: "8px 16px", background: showEditor ? "#e2e8f0" : "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              {showEditor ? "✕ Close Policy Editor" : "⚙ Manage Policy Rates"}
            </button>
          )}
        </div>
      </div>

      {/* ── Policy Editor (ops/stx only) ── */}
      {showEditor && canEdit && (
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: "20px", marginBottom: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#0f172a" }}>Policy Rate Editor</h2>
              <p style={{ margin: "3px 0 0", fontSize: 12, color: "#64748b" }}>Maximum allowable nightly accommodation spend per city (inc GST), sourced from TD 2025/4. Edit values and click Save.</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {saveMsg && <span style={{ fontSize: 12, color: saveMsg.startsWith('Error') ? "#ef4444" : "#16a34a", fontWeight: 600 }}>{saveMsg}</span>}
              <button onClick={handleSavePolicy} disabled={saving}
                style={{ padding: "8px 18px", background: saving ? "#94a3b8" : "#0d9488", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer" }}>
                {saving ? "Saving…" : "💾 Save Changes"}
              </button>
            </div>
          </div>

          {/* Search filter for editor */}
          <div style={{ marginBottom: 12 }}>
            <input
              type="text"
              placeholder="Search city…"
              value={cityFilter}
              onChange={e => setCityFilter(e.target.value)}
              style={{ ...inputStyle, width: 220 }}
            />
            <span style={{ marginLeft: 10, fontSize: 12, color: "#94a3b8" }}>{filteredEditCities.length} cities</span>
          </div>

          {/* City rates table */}
          <div style={{ maxHeight: 360, overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: 8 }}>
            {/* Header */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 48px", gap: 0, padding: "8px 14px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", position: "sticky", top: 0 }}>
              <div style={colHeaderStyle}>City</div>
              <div style={{ ...colHeaderStyle, textAlign: "right" }}>Max/Night ($ inc GST)</div>
              <div />
            </div>
            {filteredEditCities.map((city, idx) => (
              <div key={city} style={{ display: "grid", gridTemplateColumns: "1fr 140px 48px", gap: 0, padding: "6px 14px", alignItems: "center", background: idx % 2 === 0 ? "#fff" : "#fafafa", borderBottom: "1px solid #f1f5f9" }}>
                <div style={{ fontSize: 13, color: "#1e293b" }}>{city}</div>
                <div style={{ textAlign: "right" }}>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={editRates[city] ?? ''}
                    onChange={e => handleRateChange(city, e.target.value)}
                    style={{ ...inputStyle, width: 90, textAlign: "right", padding: "4px 8px", fontSize: 13 }}
                  />
                </div>
                <div style={{ textAlign: "center" }}>
                  <button onClick={() => handleDeleteCity(city)}
                    title="Remove this city"
                    style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "2px 6px" }}>
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Add new city */}
          <div style={{ display: "flex", gap: 8, marginTop: 14, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <label style={labelStyle}>Add City</label>
              <input
                type="text"
                placeholder="City name"
                value={newCity}
                onChange={e => setNewCity(e.target.value)}
                style={{ ...inputStyle, width: 180 }}
              />
            </div>
            <div>
              <label style={labelStyle}>Max/Night ($)</label>
              <input
                type="number"
                min="0"
                step="1"
                placeholder="e.g. 195"
                value={newRate}
                onChange={e => setNewRate(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddCity()}
                style={{ ...inputStyle, width: 110 }}
              />
            </div>
            <button onClick={handleAddCity} disabled={!newCity.trim() || !newRate}
              style={{ alignSelf: "flex-end", padding: "7px 14px", background: !newCity.trim() || !newRate ? "#e2e8f0" : "#0f172a", color: !newCity.trim() || !newRate ? "#94a3b8" : "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: !newCity.trim() || !newRate ? "not-allowed" : "pointer" }}>
              + Add
            </button>
          </div>
        </div>
      )}

      {/* ── Filters Card ── */}
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: "18px 20px", marginBottom: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Date Range (Trip Start Date)</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 10 }}>
            <div>
              <label style={labelStyle}>From Date</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>To Date</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={inputStyle} />
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {[['currentMonth','This Month'],['lastMonth','Last Month'],['currentFY','This FY'],['lastFY','Last FY'],['currentYear','This Cal Year'],['lastYear','Last Cal Year']].map(([key, label]) => (
              <button key={key} type="button" onClick={() => handleDatePreset(key)} style={presetBtnStyle}>{label}</button>
            ))}
          </div>
        </div>
        {ratesLoading ? (
          <button disabled style={{ padding: "8px 20px", background: "#e2e8f0", color: "#94a3b8", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "not-allowed" }}>
            Loading policy rates…
          </button>
        ) : (
          <button onClick={handleGenerate}
            style={{ padding: "8px 20px", background: "#0f172a", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            ↻ Generate Report
          </button>
        )}
      </div>

      {/* ── Results ── */}
      {hasGenerated && (
        <div>
          {/* Summary cards */}
          {summaryStats && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 20 }}>
              {[
                { label: 'Destinations',  value: summaryStats.destinations, icon: '📍', color: "#0f172a" },
                { label: summaryStats.hasAnyGroup ? 'Room-Nights' : 'Total Nights', value: summaryStats.totalNights, icon: '🌙', color: "#0f172a" },
                { label: 'Over Policy',   value: summaryStats.overCount,    icon: '🔴', color: "#dc2626" },
                { label: 'Under Policy',  value: summaryStats.underCount,   icon: '🟢', color: "#16a34a" },
                { label: 'No Rate Set',   value: summaryStats.noRateCount,  icon: '⚪', color: "#94a3b8" },
              ].map(card => (
                <div key={card.label} style={{ background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0", padding: "14px 18px", textAlign: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
                  <div style={{ fontSize: 18, marginBottom: 4 }}>{card.icon}</div>
                  <div style={{ fontSize: 26, fontWeight: 800, color: card.color, lineHeight: 1.2 }}>{card.value}</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 3 }}>{card.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Sort bar */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Sort:</span>
              {[['destination','City'],['nights','Nights'],['avgPerNightInc','Avg/Night'],['policyRate','Policy Rate'],['variance','Variance $'],['variancePct','Variance %']].map(([field, label]) => (
                <button key={field} type="button" onClick={() => handleSort(field)}
                  style={{ ...presetBtnStyle, color: sortField === field ? "#0d9488" : "#94a3b8", borderColor: sortField === field ? "#0d9488" : "#e2e8f0", fontWeight: 700 }}>
                  {label} {sortField === field ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <span style={{ fontSize: 11, padding: "3px 10px", background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: 20, fontWeight: 700 }}>🔴 Over policy</span>
              <span style={{ fontSize: 11, padding: "3px 10px", background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0", borderRadius: 20, fontWeight: 700 }}>🟢 Under policy</span>
              <span style={{ fontSize: 11, padding: "3px 10px", background: "#f8fafc", color: "#94a3b8", border: "1px solid #e2e8f0", borderRadius: 20, fontWeight: 700 }}>⚪ No rate</span>
            </div>
          </div>

          {/* Table */}
          {sortedData.length === 0 ? (
            <div style={{ textAlign: "center", padding: 60, color: "#94a3b8" }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>🔍</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: "#64748b" }}>No accommodation data found for the selected period</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>Only trips with Accommodation sectors that include check-in and check-out dates are included.</div>
            </div>
          ) : (
            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
              {/* Column headers */}
              <div style={{ display: "grid", gridTemplateColumns: "2fr 60px 70px 110px 110px 100px 90px 90px", gap: 0, padding: "10px 18px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                {[
                  ['destination', 'Destination', 'left'],
                  ['stays',        'Stays',       'right'],
                  ['roomNights',   'Nights',      'right'],
                  ['avgPerNightInc','Avg/Night (Inc)', 'right'],
                  ['avgPerNightEx', 'Avg/Night (Ex)',  'right'],
                  ['policyRate',   'Policy Rate',     'right'],
                  ['variance',     'Variance $',      'right'],
                  ['variancePct',  'Variance %',      'right'],
                ].map(([field, label, align]) => (
                  <div key={field} style={{ ...colHeaderStyle, textAlign: align, cursor: 'pointer' }}
                    onClick={() => handleSort(field)}>
                    {label} {sortField === field ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                  </div>
                ))}
              </div>

              {sortedData.map((row, idx) => {
                const isOver    = row.variance !== null && row.variance > 0;
                const isUnder   = row.variance !== null && row.variance <= 0;
                const hasRate   = row.policyRate !== null;
                const rowBg     = isOver  ? (idx % 2 === 0 ? "#fff5f5" : "#fff0f0")
                                : isUnder ? (idx % 2 === 0 ? "#f0fdf4" : "#ebfdf0")
                                : (idx % 2 === 0 ? "#fff" : "#fafafa");
                const statusBadge = isOver
                  ? { text: "OVER",     bg: "#fef2f2", color: "#dc2626", border: "#fecaca" }
                  : isUnder
                  ? { text: "UNDER",    bg: "#f0fdf4", color: "#16a34a", border: "#bbf7d0" }
                  : { text: "NO RATE",  bg: "#f8fafc", color: "#94a3b8", border: "#e2e8f0" };

                return (
                  <div key={row.destination}
                    style={{ display: "grid", gridTemplateColumns: "2fr 60px 70px 110px 110px 100px 90px 90px", gap: 0, padding: "12px 18px", alignItems: "center", background: rowBg, borderBottom: idx < sortedData.length - 1 ? "1px solid #f1f5f9" : "none" }}>

                    {/* Destination + badge */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: "#1e293b" }}>{row.destination}</div>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 20, background: statusBadge.bg, color: statusBadge.color, border: `1px solid ${statusBadge.border}` }}>
                        {statusBadge.text}
                      </span>
                    </div>

                    <div style={{ textAlign: "right", fontSize: 13, color: "#475569" }}>{row.stays}</div>
                    <div style={{ textAlign: "right", fontSize: 13, color: "#475569" }}>
                      {row.hasGroupBooking ? (
                        <span title={`${row.nights} calendar nights · ${row.roomNights} room-nights total`}>
                          {row.roomNights} <span style={{ fontSize: 10, color: "#94a3b8" }}>rm-nts</span>
                        </span>
                      ) : row.nights}
                    </div>

                    <div style={{ textAlign: "right", fontFamily: "monospace", fontSize: 13, fontWeight: 600, color: "#1e293b" }}>
                      ${row.avgPerNightInc.toFixed(0)}
                    </div>
                    <div style={{ textAlign: "right", fontFamily: "monospace", fontSize: 13, color: "#64748b" }}>
                      ${row.avgPerNightEx.toFixed(0)}
                    </div>

                    <div style={{ textAlign: "right", fontFamily: "monospace", fontSize: 13, color: hasRate ? "#475569" : "#cbd5e1" }}>
                      {hasRate ? `$${row.policyRate}` : '—'}
                    </div>

                    <div style={{ textAlign: "right", fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: !hasRate ? "#cbd5e1" : isOver ? "#dc2626" : "#16a34a" }}>
                      {hasRate ? `${row.variance >= 0 ? '+' : ''}$${row.variance.toFixed(0)}` : '—'}
                    </div>

                    <div style={{ textAlign: "right", fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: !hasRate ? "#cbd5e1" : isOver ? "#dc2626" : "#16a34a" }}>
                      {hasRate ? `${row.variancePct >= 0 ? '+' : ''}${row.variancePct.toFixed(1)}%` : '—'}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Footer note */}
          {sortedData.length > 0 && (
            <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 16, textAlign: "center" }}>
              Avg/Night (Inc GST) compared against TD 2025/4 policy rates · Only accommodation sectors with check-in and check-out dates are included · Approved, Booked &amp; Completed trips only
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Styles ──
const labelStyle = {
  display: "block",
  fontSize: 10,
  fontWeight: 700,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: 4,
};

const inputStyle = {
  padding: "7px 10px",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  fontSize: 13,
  color: "#1e293b",
  outline: "none",
  background: "#fff",
};

const presetBtnStyle = {
  padding: "5px 10px",
  border: "1px solid #e2e8f0",
  borderRadius: 6,
  background: "#f1f5f9",
  color: "#475569",
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
};

const colHeaderStyle = {
  fontSize: 10,
  fontWeight: 700,
  color: "#94a3b8",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};
