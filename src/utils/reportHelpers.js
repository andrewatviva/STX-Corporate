export function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export function getQuickRange(key) {
  const now = new Date(), y = now.getFullYear(), m = now.getMonth();
  switch (key) {
    case 'thisMonth':   return { from: toISO(new Date(y,m,1)),   to: toISO(new Date(y,m+1,0)) };
    case 'lastMonth':   return { from: toISO(new Date(y,m-1,1)), to: toISO(new Date(y,m,0)) };
    case 'thisQuarter': { const q=Math.floor(m/3); return { from: toISO(new Date(y,q*3,1)), to: toISO(new Date(y,q*3+3,0)) }; }
    case 'lastQuarter': { const q=Math.floor(m/3)-1; const py=q<0?y-1:y; const pq=q<0?3:q; return { from: toISO(new Date(py,pq*3,1)), to: toISO(new Date(py,pq*3+3,0)) }; }
    case 'thisFY':      { const fy=m>=6?y:y-1; return { from:`${fy}-07-01`, to:`${fy+1}-06-30` }; }
    case 'lastFY':      { const fy=(m>=6?y:y-1)-1; return { from:`${fy}-07-01`, to:`${fy+1}-06-30` }; }
    case 'allTime':     return { from:'2000-01-01', to:'2099-12-31' };
    default:            return { from:'', to:'' };
  }
}

export const QUICK_PERIODS = [
  { key:'thisMonth',   label:'This month' },
  { key:'lastMonth',   label:'Last month' },
  { key:'thisQuarter', label:'This quarter' },
  { key:'lastQuarter', label:'Last quarter' },
  { key:'thisFY',      label:'This FY' },
  { key:'lastFY',      label:'Last FY' },
  { key:'allTime',     label:'All time' },
];

export const BILLABLE_STATUSES = new Set(['approved','booked','travelling','completed']);

export function getDisplayStatus(trip) {
  if (trip.status !== 'booked') return trip.status;
  const today = new Date().toISOString().slice(0,10);
  if (trip.startDate && trip.endDate) {
    if (today >= trip.startDate && today <= trip.endDate) return 'travelling';
    if (today > trip.endDate) return 'completed';
  }
  return 'booked';
}

export function sectorExGST(sector) {
  const cost = parseFloat(sector.cost) || 0;
  return sector.international ? cost : cost / 1.1;
}

export function tripInclGST(trip) {
  return (trip.sectors||[]).reduce((s,sec) => s + (parseFloat(sec.cost)||0), 0);
}

export function tripExGST(trip) {
  return (trip.sectors||[]).reduce((s,sec) => s + sectorExGST(sec), 0);
}

export function accomCity(sector, trip) {
  return (sector.reportingCity || trip.destinationCity || '').trim() || 'Unknown';
}

export function toDate(val) {
  if (!val) return null;
  if (typeof val.toDate === 'function') return val.toDate();
  if (val._seconds != null) return new Date(val._seconds * 1000);
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

export function exportCSV(rows, filename) {
  const csv = rows.map(r => r.map(v => `"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\r\n');
  const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href:url, download:filename });
  a.click();
  URL.revokeObjectURL(url);
}

export function nightsBetween(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 0;
  return Math.max(0, Math.round((new Date(checkOut) - new Date(checkIn)) / 86400000));
}
