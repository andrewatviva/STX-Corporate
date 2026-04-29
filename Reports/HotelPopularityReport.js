import { useState, useMemo } from "react";

// ── Helpers ──
const today      = new Date().toISOString().slice(0, 10);
const fyStart    = () => { const n = new Date(); return new Date(n.getMonth() >= 6 ? n.getFullYear() : n.getFullYear() - 1, 6, 1).toISOString().slice(0, 10); };
const fyEnd      = () => { const n = new Date(); return new Date(n.getMonth() >= 6 ? n.getFullYear() + 1 : n.getFullYear(), 5, 30).toISOString().slice(0, 10); };
const calYear    = (y) => `${y}-01-01`;
const calYearEnd = (y) => `${y}-12-31`;

const VALID_STATUSES = ["Approved", "Booked", "Completed"];

export default function HotelPopularityReport({ trips = [] }) {
  const [startDate,  setStartDate]  = useState(fyStart());
  const [endDate,    setEndDate]    = useState(fyEnd());
  const [sortBy,     setSortBy]     = useState("bookings");
  const [search,     setSearch]     = useState("");
  const [expanded,   setExpanded]   = useState(new Set());

  // ── Preset date buttons ──
  const applyPreset = (preset) => {
    const n  = new Date();
    const yr = n.getFullYear();
    if (preset === "thisMonth")  { setStartDate(`${yr}-${String(n.getMonth()+1).padStart(2,"0")}-01`); setEndDate(today); }
    if (preset === "lastMonth")  { const d = new Date(yr, n.getMonth()-1, 1); const e = new Date(yr, n.getMonth(), 0); setStartDate(d.toISOString().slice(0,10)); setEndDate(e.toISOString().slice(0,10)); }
    if (preset === "thisFY")     { setStartDate(fyStart()); setEndDate(fyEnd()); }
    if (preset === "thisYear")   { setStartDate(calYear(yr)); setEndDate(calYearEnd(yr)); }
    if (preset === "lastYear")   { setStartDate(calYear(yr-1)); setEndDate(calYearEnd(yr-1)); }
    if (preset === "allTime")    { setStartDate("2000-01-01"); setEndDate("2099-12-31"); }
  };

  // ── Crunch the numbers ──
  const reportData = useMemo(() => {
    const filtered = trips.filter(t => {
      if (!VALID_STATUSES.includes(t.status)) return false;
      const d = t.startDate || "";
      if (startDate && d < startDate) return false;
      if (endDate   && d > endDate)   return false;
      return true;
    });

    // Build: { destination -> { hotelName -> { count, trips[] } } }
    const destMap = {};

    filtered.forEach(trip => {
      const dest = (trip.destination || "Unknown").trim();
      const accomSectors = (trip.sectors || []).filter(s => s.type === "Accommodation" && s.details?.trim());

      accomSectors.forEach(sector => {
        const hotel = sector.details.trim();
        if (!destMap[dest]) destMap[dest] = {};
        if (!destMap[dest][hotel]) destMap[dest][hotel] = { count: 0, trips: [], totalCostInc: 0, totalCostEx: 0, totalNights: 0 };
        destMap[dest][hotel].count++;
        destMap[dest][hotel].trips.push({
          id:         trip.id,
          identifier: trip.tripIdentifier || trip.id,
          traveller:  trip.traveller || trip.traveler || "Unknown",
          date:       trip.startDate,
          status:     trip.status,
        });

        // Accumulate cost and nights for avg nightly rate
        const net = Math.max(0, (parseFloat(sector.cost) || 0) - (parseFloat(sector.refund) || 0));
        const netEx = sector.region === "International" ? net : net / 1.1;
        if (sector.date && sector.endDate) {
          const nights = Math.max(0, Math.round((new Date(sector.endDate) - new Date(sector.date)) / 86400000));
          if (nights > 0) {
            destMap[dest][hotel].totalCostInc += net;
            destMap[dest][hotel].totalCostEx  += netEx;
            destMap[dest][hotel].totalNights  += nights;
          }
        }
      });
    });

    // Convert to sorted array
    let rows = Object.entries(destMap).map(([destination, hotels]) => {
      const hotelList = Object.entries(hotels)
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
      const totalBookings = hotelList.reduce((s, h) => s + h.count, 0);
      return { destination, hotels: hotelList, totalBookings };
    });

    // Apply search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.map(r => ({
        ...r,
        hotels: r.hotels.filter(h => h.name.toLowerCase().includes(q) || r.destination.toLowerCase().includes(q)),
      })).filter(r => r.hotels.length > 0 || r.destination.toLowerCase().includes(q));
    }

    // Sort destinations
    if (sortBy === "bookings")     rows.sort((a, b) => b.totalBookings - a.totalBookings);
    if (sortBy === "destination")  rows.sort((a, b) => a.destination.localeCompare(b.destination));

    return rows;
  }, [trips, startDate, endDate, sortBy, search]);

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

  // ── Render ──
  return (
    <div style={{ fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif", background: "#f8fafc", minHeight: "100vh", padding: "24px" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <span style={{ fontSize: 22, lineHeight: 1 }}>🏨</span>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#0f172a" }}>Hotel Popularity Report</h1>
        </div>
        <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>Most booked hotels by destination — based on Accommodation sectors in trip records</p>
      </div>

      {/* Filters Card */}
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: "18px 20px", marginBottom: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>

          {/* Date Range */}
          <div>
            <label style={labelStyle}>From Date</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>To Date</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={inputStyle} />
          </div>

          {/* Presets */}
          <div>
            <label style={labelStyle}>Quick Select</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {[
                ["thisMonth", "This Month"],
                ["lastMonth", "Last Month"],
                ["thisYear",  "This Cal Year"],
                ["thisFY",    "This FY"],
                ["lastYear",  "Last Cal Year"],
                ["allTime",   "All Time"],
              ].map(([key, label]) => (
                <button key={key} onClick={() => applyPreset(key)} style={presetBtnStyle}>{label}</button>
              ))}
            </div>
          </div>

          {/* Search */}
          <div style={{ marginLeft: "auto" }}>
            <label style={labelStyle}>Search Hotel / Destination</label>
            <input
              type="text"
              placeholder="e.g. Hilton or Sydney…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ ...inputStyle, width: 220 }}
            />
          </div>
        </div>

        {/* Sort */}
        <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>Sort Destinations By:</span>
          {[["bookings","Most Booked"],["destination","A–Z Name"]].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setSortBy(val)}
              style={{
                ...presetBtnStyle,
                background: sortBy === val ? "#0d9488" : "#f1f5f9",
                color:      sortBy === val ? "#fff"     : "#475569",
                borderColor: sortBy === val ? "#0d9488" : "#e2e8f0",
                fontWeight:  sortBy === val ? 700 : 500,
              }}
            >{label}</button>
          ))}
        </div>
      </div>

      {/* Summary Stats */}
      {(
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
          {[
            { label: "Hotel Bookings", value: totalHotelBookings, icon: "🛏️" },
            { label: "Destinations",   value: totalDestinations,  icon: "📍" },
            { label: "Unique Hotels",  value: totalUniqueHotels,  icon: "🏩" },
          ].map(s => (
            <div key={s.label} style={{ background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0", padding: "14px 18px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
              <div style={{ fontSize: 20 }}>{s.icon}</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: "#0f172a", lineHeight: 1.2, marginTop: 4 }}>{s.value}</div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Expand/Collapse all */}
      {reportData.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 12, justifyContent: "flex-end" }}>
          <button onClick={expandAll}   style={presetBtnStyle}>Expand All</button>
          <button onClick={collapseAll} style={presetBtnStyle}>Collapse All</button>
        </div>
      )}

      {/* Empty state */}
      {reportData.length === 0 && (
        <div style={{ textAlign: "center", padding: 60, color: "#94a3b8" }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🔍</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#64748b" }}>No accommodation bookings found</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>Try adjusting the date range or check that trips have Accommodation sectors with hotel names entered.</div>
        </div>
      )}

      {/* Report Table */}
      {reportData.map((row, ri) => {
        const isOpen = expanded.has(row.destination);
        const topHotel = row.hotels[0];
        return (
          <div key={row.destination} style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", marginBottom: 12, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>

            {/* Destination Header — clickable */}
            <div
              onClick={() => toggleExpand(row.destination)}
              style={{ display: "flex", alignItems: "center", padding: "14px 18px", cursor: "pointer", gap: 12, background: isOpen ? "#f0fdfa" : "#fff", borderBottom: isOpen ? "1px solid #e2e8f0" : "none", transition: "background 0.15s" }}
            >
              <span style={{ fontSize: 18, width: 28, textAlign: "center" }}>📍</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: "#0f172a" }}>{row.destination}</div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 1 }}>
                  {row.hotels.length} hotel{row.hotels.length !== 1 ? "s" : ""} · {row.totalBookings} booking{row.totalBookings !== 1 ? "s" : ""}
                  {topHotel && <> · Top: <span style={{ color: "#0d9488", fontWeight: 600 }}>{topHotel.name}</span> ({topHotel.count}×)</>}
                </div>
              </div>
              {/* Mini bar chart preview */}
              <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 28 }}>
                {row.hotels.slice(0, 6).map((h, i) => (
                  <div key={i} title={`${h.name}: ${h.count}`} style={{
                    width: 10,
                    height: Math.max(4, (h.count / topHotel.count) * 28),
                    background: i === 0 ? "#0d9488" : `hsl(175,${60-i*8}%,${45+i*5}%)`,
                    borderRadius: 2,
                  }} />
                ))}
              </div>
              <span style={{ fontSize: 18, color: "#94a3b8", transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 0.2s" }}>›</span>
            </div>

            {/* Hotels List */}
            {isOpen && (
              <div>
                {/* Column headers */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 40px 80px", gap: 0, padding: "8px 18px", background: "#f8fafc", borderBottom: "1px solid #f1f5f9" }}>
                  <span style={colHeaderStyle}>Hotel Name</span>
                  <span style={{ ...colHeaderStyle, textAlign: "center" }}>Bookings</span>
                  <span style={{ ...colHeaderStyle, textAlign: "center" }}>Share</span>
                  <span style={{ ...colHeaderStyle, textAlign: "center" }}>Bar</span>
                </div>

                {row.hotels.map((hotel, hi) => {
                  const pct = Math.round((hotel.count / row.totalBookings) * 100);
                  return (
                    <div key={hotel.name} style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 80px 40px 80px",
                      gap: 0,
                      padding: "10px 18px",
                      borderBottom: hi < row.hotels.length - 1 ? "1px solid #f1f5f9" : "none",
                      alignItems: "center",
                      background: hi % 2 === 0 ? "#fff" : "#fafafa",
                    }}>
                      {/* Hotel name + rank badge */}
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                        <span style={{
                          background: hi === 0 ? "#0d9488" : hi === 1 ? "#64748b" : hi === 2 ? "#b45309" : "#e2e8f0",
                          color:      hi <= 2   ? "#fff" : "#94a3b8",
                          borderRadius: 4,
                          fontSize: 10,
                          fontWeight: 700,
                          width: 20,
                          height: 20,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          marginTop: 2,
                        }}>#{hi + 1}</span>
                        <div>
                          <div style={{ fontSize: 14, color: "#1e293b", fontWeight: hi === 0 ? 600 : 400 }}>{hotel.name}</div>
                          {hotel.totalNights > 0 ? (
                            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                              Avg/night:&nbsp;
                              <span style={{ color: "#0d9488", fontWeight: 600 }}>${(hotel.totalCostInc / hotel.totalNights).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} inc</span>
                              &nbsp;·&nbsp;
                              <span style={{ color: "#475569" }}>${(hotel.totalCostEx / hotel.totalNights).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ex GST</span>
                              <span style={{ color: "#94a3b8", marginLeft: 4 }}>({hotel.totalNights} night{hotel.totalNights !== 1 ? "s" : ""})</span>
                            </div>
                          ) : (
                            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>No nightly rate data</div>
                          )}
                        </div>
                      </div>

                      {/* Count */}
                      <div style={{ textAlign: "center" }}>
                        <span style={{
                          background: hi === 0 ? "#f0fdfa" : "#f8fafc",
                          color:      hi === 0 ? "#0d9488" : "#475569",
                          fontWeight: 700,
                          fontSize:   14,
                          padding:    "2px 10px",
                          borderRadius: 20,
                          border:     `1px solid ${hi === 0 ? "#99f6e4" : "#e2e8f0"}`,
                        }}>{hotel.count}</span>
                      </div>

                      {/* Percentage */}
                      <div style={{ textAlign: "center", fontSize: 12, color: "#94a3b8" }}>{pct}%</div>

                      {/* Bar */}
                      <div style={{ paddingRight: 4 }}>
                        <div style={{ background: "#f1f5f9", borderRadius: 4, height: 8, overflow: "hidden" }}>
                          <div style={{
                            height: "100%",
                            width: `${pct}%`,
                            background: hi === 0 ? "#0d9488" : "#94a3b8",
                            borderRadius: 4,
                            minWidth: 4,
                          }} />
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

      {/* Footer note */}
      {reportData.length > 0 && (
        <p style={{ fontSize: 11, color: "#94a3b8", textAlign: "center", marginTop: 20 }}>
          Showing trips with status: Approved, Booked, Completed · Filtered by trip start date · Only trips with Accommodation sectors included
        </p>
      )}
    </div>
  );
}

// ── Styles ──
const labelStyle = {
  display:     "block",
  fontSize:    10,
  fontWeight:  700,
  color:       "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: 4,
};

const inputStyle = {
  padding:      "7px 10px",
  border:       "1px solid #cbd5e1",
  borderRadius: 8,
  fontSize:     13,
  color:        "#1e293b",
  outline:      "none",
  background:   "#fff",
};

const presetBtnStyle = {
  padding:      "5px 10px",
  border:       "1px solid #e2e8f0",
  borderRadius: 6,
  background:   "#f1f5f9",
  color:        "#475569",
  fontSize:     12,
  fontWeight:   500,
  cursor:       "pointer",
};

const colHeaderStyle = {
  fontSize:   10,
  fontWeight: 700,
  color:      "#94a3b8",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};
