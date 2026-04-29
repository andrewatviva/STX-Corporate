import { useState, useMemo } from 'react';

const TRIP_TYPES = ['Self-Managed', 'STX-Managed', 'Group Event'];

const calculateExGst = (amount) => (amount ? amount / 1.1 : 0);

const calculateTripExGst = (sectors, fallbackCost = 0) => {
  if (!sectors || sectors.length === 0) return calculateExGst(fallbackCost);
  const isTripInternational = sectors.some(s => s.region === 'International');
  return sectors.reduce((sum, sector) => {
    const cost = parseFloat(sector.cost) || 0;
    const refund = parseFloat(sector.refund) || 0;
    const netCost = cost - refund;
    let isInternational = sector.region === 'International';
    if (isTripInternational && (sector.details === 'STX Booking Fee' || sector.details === 'Amendment Fee')) {
      isInternational = true;
    }
    return sum + (isInternational ? netCost : netCost / 1.1);
  }, 0);
};

export default function SpendByDepartureCityReport({ trips }) {
  const _now = new Date();
  const _fyYear = _now.getMonth() >= 6 ? _now.getFullYear() : _now.getFullYear() - 1;
  const [startDate,     setStartDate]     = useState(`${_fyYear}-07-01`);
  const [endDate,       setEndDate]       = useState(`${_fyYear + 1}-06-30`);
  const [selectedTypes, setSelectedTypes] = useState([...TRIP_TYPES]);
  const [excludeIntl,   setExcludeIntl]   = useState(false);
  const [hasGenerated,  setHasGenerated]  = useState(false);
  const [reportData,    setReportData]    = useState([]);
  const [sortField,     setSortField]     = useState('tripCount');
  const [sortDir,       setSortDir]       = useState('desc');

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

  const toggleType = (type) =>
    setSelectedTypes(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]);

  const handleGenerate = () => {
    const validStatuses = ['Approved', 'Booked', 'Completed'];
    let filtered = trips.filter(t =>
      validStatuses.includes(t.status) && selectedTypes.includes(t.type)
    );
    if (startDate) filtered = filtered.filter(t => t.startDate >= startDate);
    if (endDate)   filtered = filtered.filter(t => t.startDate <= endDate);
    if (excludeIntl) {
      filtered = filtered.filter(t => !(t.sectors || []).some(s => s.region === 'International'));
    }

    const cityGroups = {};
    filtered.forEach(trip => {
      const city = (trip.departureCity || 'Unknown').trim();
      if (!cityGroups[city]) cityGroups[city] = [];
      cityGroups[city].push(trip);
    });

    const data = Object.entries(cityGroups).map(([city, cityTrips]) => {
      const tripCount = cityTrips.length;
      const totalInc  = cityTrips.reduce((s, t) => s + (parseFloat(t.cost) || 0), 0);
      const totalEx   = cityTrips.reduce((s, t) => s + calculateTripExGst(t.sectors, t.cost), 0);
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
      totalSpendInc: reportData.reduce((s, d) => s + d.totalInc, 0),
      totalSpendEx:  reportData.reduce((s, d) => s + d.totalEx,  0),
    };
  }, [reportData]);

  const handleExportCSV = () => {
    const headers = ['Departure City', 'Total Trips', 'Total Spend (Inc GST)', 'Total Spend (Ex GST)', 'Avg Spend (Inc GST)', 'Avg Spend (Ex GST)'];
    const rows = sortedData.map(row => [
      row.city, row.tripCount,
      row.totalInc.toFixed(2), row.totalEx.toFixed(2),
      row.avgTotalInc.toFixed(2), row.avgTotalEx.toFixed(2),
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `spend_by_departure_city_${startDate || 'all'}_to_${endDate || 'all'}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div style={{ fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif", background: "#f8fafc", minHeight: "100vh", padding: "24px" }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <span style={{ fontSize: 22, lineHeight: 1 }}>✈️</span>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#0f172a" }}>Spend by Departure City</h1>
        </div>
        <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>Total and average spend per departure city for approved / booked / completed trips</p>
      </div>

      {/* Filters Card */}
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: "18px 20px", marginBottom: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>

        {/* Date range */}
        <div style={{ marginBottom: 16 }}>
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

        {/* Booking type */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Booking Type</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {TRIP_TYPES.map(type => (
              <button key={type} type="button" onClick={() => toggleType(type)}
                style={{ ...presetBtnStyle, background: selectedTypes.includes(type) ? "#0d9488" : "#f1f5f9", color: selectedTypes.includes(type) ? "#fff" : "#475569", borderColor: selectedTypes.includes(type) ? "#0d9488" : "#e2e8f0", fontWeight: selectedTypes.includes(type) ? 700 : 500 }}>
                {selectedTypes.includes(type) ? "✓ " : ""}{type}
              </button>
            ))}
            {selectedTypes.length < TRIP_TYPES.length && (
              <button type="button" onClick={() => setSelectedTypes([...TRIP_TYPES])} style={presetBtnStyle}>Select All</button>
            )}
          </div>
          {selectedTypes.length === 0 && <p style={{ color: "#ef4444", fontSize: 10, margin: "4px 0 0" }}>Please select at least one booking type</p>}
        </div>

        {/* Exclude international */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Options</label>
          <button type="button" onClick={() => setExcludeIntl(v => !v)}
            style={{ ...presetBtnStyle, background: excludeIntl ? "#f59e0b" : "#f1f5f9", color: excludeIntl ? "#fff" : "#475569", borderColor: excludeIntl ? "#f59e0b" : "#e2e8f0", fontWeight: excludeIntl ? 700 : 500 }}>
            {excludeIntl ? "✓ " : ""}Exclude International Trips
          </button>
        </div>

        <button onClick={handleGenerate} disabled={selectedTypes.length === 0}
          style={{ padding: "8px 20px", background: selectedTypes.length === 0 ? "#94a3b8" : "#0f172a", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: selectedTypes.length === 0 ? "not-allowed" : "pointer" }}>
          ↻ Generate Report
        </button>
      </div>

      {/* Results */}
      {hasGenerated && (
        <div>
          {/* Summary stat cards */}
          {summaryStats && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
              {[
                { label: 'Departure Cities', value: summaryStats.cityCount },
                { label: 'Total Trips',      value: summaryStats.totalTrips },
                { label: 'Total Spend (Inc)', value: `$${summaryStats.totalSpendInc.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, sub: 'inc GST' },
                { label: 'Total Spend (Ex)',  value: `$${summaryStats.totalSpendEx.toLocaleString(undefined,  { maximumFractionDigits: 0 })}`, sub: 'ex GST' },
              ].map(card => (
                <div key={card.label} style={{ background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0", padding: "14px 18px", textAlign: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{card.label}</div>
                  <div style={{ fontSize: 26, fontWeight: 800, color: "#0f172a", lineHeight: 1.2 }}>{card.value}</div>
                  {card.sub && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{card.sub}</div>}
                </div>
              ))}
            </div>
          )}

          {/* Sort + export bar */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Sort:</span>
              {[['city','City'],['tripCount','Trips'],['totalInc','Total (Inc)'],['totalEx','Total (Ex)'],['avgTotalInc','Avg (Inc)'],['avgTotalEx','Avg (Ex)']].map(([field, label]) => (
                <button key={field} type="button" onClick={() => handleSort(field)}
                  style={{ ...presetBtnStyle, color: sortField === field ? "#0d9488" : "#94a3b8", borderColor: sortField === field ? "#0d9488" : "#e2e8f0", fontWeight: 700 }}>
                  {label} {sortField === field ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                </button>
              ))}
            </div>
            <button onClick={handleExportCSV}
              style={{ padding: "7px 16px", background: "#0d9488", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              ↓ Export CSV
            </button>
          </div>

          {/* City table */}
          {sortedData.length === 0 ? (
            <div style={{ textAlign: "center", padding: 60, color: "#94a3b8" }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>🔍</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: "#64748b" }}>No trips match the selected criteria</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>Try adjusting your date range or booking type filters</div>
            </div>
          ) : (
            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
              {/* Table header */}
              <div style={{ display: "grid", gridTemplateColumns: "2fr 80px 1fr 1fr 1fr", gap: 0, padding: "10px 18px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                {['Departure City', 'Trips', 'Total (Inc GST)', 'Total (Ex GST)', 'Avg (Inc / Ex GST)'].map((h, i) => (
                  <div key={h} style={{ ...colHeaderStyle, textAlign: i === 0 ? "left" : "right" }}>{h}</div>
                ))}
              </div>
              {sortedData.map((row, idx) => (
                <div key={row.city}
                  style={{ display: "grid", gridTemplateColumns: "2fr 80px 1fr 1fr 1fr", gap: 0, padding: "12px 18px", alignItems: "center", background: idx % 2 === 0 ? "#fff" : "#fafafa", borderBottom: idx < sortedData.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: "#1e293b" }}>{row.city}</div>
                  <div style={{ textAlign: "right", fontSize: 14, color: "#475569" }}>{row.tripCount}</div>
                  <div style={{ textAlign: "right", fontFamily: "monospace", fontSize: 13, color: "#1e293b" }}>
                    ${row.totalInc.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </div>
                  <div style={{ textAlign: "right", fontFamily: "monospace", fontSize: 13, color: "#0d9488" }}>
                    ${row.totalEx.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </div>
                  <div style={{ textAlign: "right", fontFamily: "monospace", fontSize: 13 }}>
                    <span style={{ color: "#1e293b" }}>${row.avgTotalInc.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                    <span style={{ color: "#94a3b8", margin: "0 4px" }}>/</span>
                    <span style={{ color: "#0d9488" }}>${row.avgTotalEx.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
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
