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

export function tripDateForMode(trip, mode) {
  if (mode === 'travel') return trip.startDate || '';
  const d = toDate(trip.createdAt);
  return d ? toISO(d) : '';
}

export const DEFAULT_ACCOMMODATION_RATES = {
  'Adelaide':158,'Brisbane':181,'Canberra':178,'Darwin':220,'Hobart':176,
  'Melbourne':173,'Perth':180,'Sydney':223,'Other country centres':141,
  'Albany':193,'Albury':207,'Alice Springs':206,'Ararat':159,'Armidale':166,
  'Ayr':207,'Bairnsdale':176,'Ballarat':187,'Bathurst':207,'Bega':207,
  'Benalla':168,'Bendigo':170,'Bordertown':164,'Bourke':184,'Bright':180,
  'Broken Hill':162,'Broome':255,'Bunbury':178,'Bundaberg':184,'Burnie':178,
  'Cairns':175,'Carnarvon':174,'Castlemaine':162,'Ceduna':156,
  'Charters Towers':168,'Chinchilla':207,'Christmas Island':218,'Cobar':207,
  'Cocos (Keeling) Islands':331,'Coffs Harbour':207,'Colac':207,'Cooma':207,
  'Cowra':207,'Dalby':201,'Dampier':199,'Derby':192,'Devonport':162,
  'Dubbo':170,'Echuca':207,'Emerald':179,'Esperance':180,'Exmouth':235,
  'Geelong':175,'Geraldton':190,'Gladstone':171,'Gold Coast':225,
  'Goulburn':165,'Gosford':161,'Grafton':172,'Griffith':160,'Gunnedah':180,
  'Halls Creek':204,'Hamilton':170,'Hervey Bay':175,'Horn Island':345,
  'Horsham':166,'Innisfail':207,'Inverell':207,'Jabiru':216,'Kadina':207,
  'Kalgoorlie':193,'Karratha':288,'Katherine':228,'Kingaroy':180,
  'Kununurra':222,'Launceston':174,'Lismore':183,'Mackay':166,'Maitland':187,
  'Maryborough':207,'Mildura':170,'Mount Gambier':164,'Mount Isa':185,
  'Mudgee':206,'Muswellbrook':160,'Nambour':163,'Naracoorte':207,
  'Narrabri':207,'Newcastle':195,'Newman':271,'Nhulunbuy':264,
  'Norfolk Island':256,'Northam':220,'Nowra':168,'Orange':215,
  'Port Augusta':207,'Port Hedland':266,'Port Lincoln':170,'Port Macquarie':190,
  'Port Pirie':207,'Portland':163,'Queanbeyan':207,'Queenstown':207,
  'Renmark':207,'Rockhampton':174,'Roma':182,'Sale':207,'Seymour':164,
  'Shepparton':167,'Swan Hill':181,'Tamworth':207,'Taree':207,
  'Tennant Creek':207,'Thursday Island':323,'Toowoomba':161,'Townsville':174,
  'Tumut':207,'Wagga Wagga':177,'Wangaratta':186,'Warrnambool':175,
  'Weipa':238,'Whyalla':167,'Wilpena-Pound':272,'Wodonga':207,
  'Wollongong':182,'Wonthaggi':188,'Yulara':570,
};
