export const formatDateDisplay = (dateString) => {
  if (!dateString) return '';
  const [year, month, day] = dateString.split('-');
  return `${day}-${month}-${year}`;
};

export const formatCurrency = (amount) => {
  if (amount == null) return '$0.00';
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
  }).format(amount);
};

export const formatDateTime = (timestamp) => {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleString('en-AU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

export const generateICS = (trip) => {
  const toICSDate = (str) => (str || '').replace(/-/g, '');

  const start = toICSDate(trip.startDate);

  const end = (() => {
    const base = trip.endDate || trip.startDate;
    if (!base) return start;
    const d = new Date(base);
    d.setDate(d.getDate() + 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}${m}${day}`;
  })();

  const esc = (str) => (str || '').replace(/[\\;,]/g, ch => `\\${ch}`).replace(/\n/g, '\\n');

  const location = [trip.originCity, trip.destinationCity].filter(Boolean).join(' to ');
  const description = [
    trip.travellerName && `Traveller: ${trip.travellerName}`,
    trip.tripType       && `Type: ${trip.tripType}`,
    trip.costCentre     && `Cost centre: ${trip.costCentre}`,
  ].filter(Boolean).join('\\n');

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//STX Corporate//STX Connect//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${trip.id || ''}@stx-connect`,
    `DTSTART;VALUE=DATE:${start}`,
    `DTEND;VALUE=DATE:${end}`,
    `SUMMARY:${esc(trip.title || 'Business Trip')}`,
    description && `DESCRIPTION:${description}`,
    location    && `LOCATION:${esc(location)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
};
