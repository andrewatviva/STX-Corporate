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

const ALL_SECTOR_TYPES = ['Flight', 'Accommodation', 'Car Hire', 'Parking', 'Transfers', 'Meals', 'Other'];

export default function AvgSpendByDestinationReport({ trips }) {
  const _now = new Date();
  const _fyYear = _now.getMonth() >= 6 ? _now.getFullYear() : _now.getFullYear() - 1;
  const [startDate,     setStartDate]     = useState(`${_fyYear}-07-01`);
  const [endDate,       setEndDate]       = useState(`${_fyYear + 1}-06-30`);
  const [selectedTypes, setSelectedTypes] = useState([...TRIP_TYPES]);
  const [hasGenerated,  setHasGenerated]  = useState(false);
  const [reportData,    setReportData]    = useState([]);
  const [expandedDests, setExpandedDests] = useState(new Set());
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

    const destGroups = {};
    filtered.forEach(trip => {
      const dest = (trip.destination || 'Unknown').trim();
      if (!destGroups[dest]) destGroups[dest] = [];
      destGroups[dest].push(trip);
    });

    const data = Object.entries(destGroups).map(([destination, destTrips]) => {
      const tripCount = destTrips.length;
      const totalInc  = destTrips.reduce((s, t) => s + (parseFloat(t.cost) || 0), 0);
      const totalEx   = destTrips.reduce((s, t) => s + calculateTripExGst(t.sectors, t.cost), 0);

      const sectorData = {};
      ALL_SECTOR_TYPES.forEach(type => {
        const tripsWithSector = destTrips.filter(t => (t.sectors || []).some(s => s.type === type));
        const sectorTotalInc = tripsWithSector.reduce((sum, t) =>
          sum + (t.sectors || []).filter(s => s.type === type).reduce((s, sector) =>
            s + Math.max(0, (parseFloat(sector.cost) || 0) - (parseFloat(sector.refund) || 0)), 0), 0);
        const sectorTotalEx = tripsWithSector.reduce((sum, t) =>
          sum + (t.sectors || []).filter(s => s.type === type).reduce((s, sector) => {
            const net = Math.max(0, (parseFloat(sector.cost) || 0) - (parseFloat(sector.refund) || 0));
            return s + (sector.region === 'International' ? net : net / 1.1);
          }, 0), 0);

        let totalNights = 0;
        if (type === 'Accommodation') {
          totalNights = tripsWithSector.reduce((sum, t) =>
            sum + (t.sectors || []).filter(s => s.type === 'Accommodation').reduce((s, sector) => {
              if (sector.date && sector.endDate) {
                const nights = Math.max(0, Math.round((new Date(sector.endDate) - new Date(sector.date)) / 86400000));
                return s + nights;
              }
              return s;
            }, 0), 0);
        }

        sectorData[type] = {
          count:    tripsWithSector.length,
          avgInc:   tripsWithSector.length ? sectorTotalInc / tripsWithSector.length : 0,
          avgEx:    tripsWithSector.length ? sectorTotalEx  / tripsWithSector.length : 0,
          totalInc: sectorTotalInc,
          totalEx:  sectorTotalEx,
          ...(type === 'Accommodation' && {
            totalNights,
            avgPerNightInc: totalNights > 0 ? sectorTotalInc / totalNights : 0,
            avgPerNightEx:  totalNights > 0 ? sectorTotalEx  / totalNights : 0,
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
      totalSpendInc: reportData.reduce((s, d) => s + d.totalInc, 0),
      totalSpendEx:  reportData.reduce((s, d) => s + d.totalEx,  0),
    };
  }, [reportData]);

  const handleExportCSV = () => {
    const headers = ['Destination', 'Bookings', 'Avg Total (Inc GST)', 'Avg Total (Ex GST)',
      ...ALL_SECTOR_TYPES.flatMap(t => [`Avg ${t} (Inc GST)`, `Avg ${t} (Ex GST)`, `# w/ ${t}`])
    ];
    const rows = sortedData.map(row => [
      row.destination, row.tripCount,
      row.avgTotalInc.toFixed(2), row.avgTotalEx.toFixed(2),
      ...ALL_SECTOR_TYPES.flatMap(t => [
        (row.sectorData[t]?.avgInc || 0).toFixed(2),
        (row.sectorData[t]?.avgEx  || 0).toFixed(2),
        row.sectorData[t]?.count || 0,
      ])
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `avg_spend_destination_${startDate || 'all'}_to_${endDate || 'all'}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div style={{ fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif", background: "#f8fafc", minHeight: "100vh", padding: "24px" }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <span style={{ fontSize: 22, lineHeight: 1 }}>📊</span>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#0f172a" }}>Average Spend by Destination</h1>
        </div>
        <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>Average cost per booking by destination and sector, for approved / booked / completed trips</p>
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
                { label: 'Destinations',      value: summaryStats.destCount },
                { label: 'Total Bookings',    value: summaryStats.totalTrips },
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
              {[['destination','Destination'],['tripCount','Bookings'],['avgTotalInc','Avg (Inc)'],['avgTotalEx','Avg (Ex)']].map(([field, label]) => (
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

          {/* Destination rows */}
          {sortedData.length === 0 ? (
            <div style={{ textAlign: "center", padding: 60, color: "#94a3b8" }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>🔍</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: "#64748b" }}>No trips match the selected criteria</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>Try adjusting your date range or booking type filters</div>
            </div>
          ) : (
            sortedData.map(row => {
              const isExpanded    = expandedDests.has(row.destination);
              const activeSectors = ALL_SECTOR_TYPES.filter(t => row.sectorData[t]?.count > 0);
              const toggleDest    = () => setExpandedDests(prev => {
                const next = new Set(prev);
                next.has(row.destination) ? next.delete(row.destination) : next.add(row.destination);
                return next;
              });
              return (
                <div key={row.destination} style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", marginBottom: 12, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>

                  {/* Summary row — click to expand */}
                  <div onClick={toggleDest}
                    style={{ display: "flex", alignItems: "center", padding: "14px 18px", cursor: "pointer", gap: 12, background: isExpanded ? "#f0fdfa" : "#fff", borderBottom: isExpanded ? "1px solid #e2e8f0" : "none", transition: "background 0.15s" }}>
                    <span style={{ fontSize: 18, width: 28, textAlign: "center" }}>📍</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, color: "#0f172a" }}>{row.destination}</div>
                      <div style={{ fontSize: 12, color: "#64748b", marginTop: 1 }}>
                        {row.tripCount} booking{row.tripCount !== 1 ? 's' : ''}
                        {activeSectors.length > 0 && <> · {activeSectors.join(', ')}</>}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, marginBottom: 2 }}>Avg Inc / Ex GST</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>
                        ${row.avgTotalInc.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        <span style={{ color: "#94a3b8", margin: "0 4px", fontWeight: 400 }}>/</span>
                        <span style={{ color: "#0d9488" }}>${row.avgTotalEx.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                      </div>
                    </div>
                    <span style={{ fontSize: 18, color: "#94a3b8", transform: isExpanded ? "rotate(90deg)" : "none", transition: "transform 0.2s" }}>›</span>
                  </div>

                  {/* Expanded sector breakdown */}
                  {isExpanded && (
                    <div style={{ padding: "16px 18px" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>
                        Sector Breakdown — {row.tripCount} booking{row.tripCount !== 1 ? 's' : ''} to {row.destination}
                      </div>

                      {activeSectors.length === 0 ? (
                        <p style={{ fontSize: 12, color: "#94a3b8", fontStyle: "italic", margin: 0 }}>No sector detail recorded for this destination.</p>
                      ) : (
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 10 }}>
                          {activeSectors.map(type => {
                            const sd  = row.sectorData[type];
                            const pct = Math.round((sd.count / row.tripCount) * 100);
                            return (
                              <div key={type} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "12px 14px" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                                  <span style={{ fontWeight: 700, fontSize: 13, color: "#1e293b" }}>{type}</span>
                                  <span style={{ fontSize: 10, background: "#e2e8f0", color: "#64748b", padding: "2px 8px", borderRadius: 20, fontWeight: 600 }}>
                                    {sd.count}/{row.tripCount} ({pct}%)
                                  </span>
                                </div>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                                  <div>
                                    <div style={colHeaderStyle}>Avg (Inc GST)</div>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>${sd.avgInc.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                  </div>
                                  <div>
                                    <div style={{ ...colHeaderStyle, color: "#0d9488" }}>Avg (Ex GST)</div>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: "#0d9488" }}>${sd.avgEx.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                  </div>
                                </div>
                                <div style={{ background: "#e2e8f0", borderRadius: 4, height: 6, overflow: "hidden" }}>
                                  <div style={{ height: "100%", width: `${pct}%`, background: "#0d9488", borderRadius: 4, minWidth: 3 }} />
                                </div>
                                {type === 'Accommodation' && sd.totalNights > 0 && (
                                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #e2e8f0" }}>
                                    <div style={{ ...colHeaderStyle, marginBottom: 6 }}>
                                      Avg per night — {sd.totalNights} night{sd.totalNights !== 1 ? 's' : ''} total
                                    </div>
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                                      <div>
                                        <div style={colHeaderStyle}>Per Night (Inc)</div>
                                        <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>${sd.avgPerNightInc.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                      </div>
                                      <div>
                                        <div style={{ ...colHeaderStyle, color: "#0d9488" }}>Per Night (Ex)</div>
                                        <div style={{ fontSize: 13, fontWeight: 700, color: "#0d9488" }}>${sd.avgPerNightEx.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Destination total */}
                      <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, fontSize: 12, color: "#64748b" }}>
                        <span>Total spend for all trips to <strong style={{ color: "#1e293b" }}>{row.destination}</strong>:</span>
                        <div style={{ display: "flex", gap: 16, fontFamily: "monospace" }}>
                          <span>${row.totalInc.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span style={{ fontFamily: "sans-serif", color: "#94a3b8" }}>inc GST</span></span>
                          <span style={{ color: "#0d9488" }}>${row.totalEx.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span style={{ fontFamily: "sans-serif", opacity: 0.7 }}>ex GST</span></span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
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
  fontSize: 9,
  fontWeight: 700,
  color: "#94a3b8",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: 2,
};
