import React from 'react';
import HotelBookingFlow from '../components/hotels/HotelBookingFlow';

export default function HotelBookingPage() {
  const params = new URLSearchParams(window.location.search);
  const tripId       = params.get('tripId') || '';
  const sectorIndex  = params.get('sectorIndex') !== null ? Number(params.get('sectorIndex')) : null;
  const tripType     = params.get('tripType') || '';
  const clientId     = params.get('clientId') || '';
  const checkinPre   = params.get('checkin') || '';
  const checkoutPre  = params.get('checkout') || '';

  const handleBooked = (bookingData) => {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({ type: 'HOTEL_BOOKED', tripId, sectorIndex, bookingData }, window.location.origin);
    }
    window.close();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <HotelBookingFlow
        tripId={tripId}
        sectorIndex={sectorIndex}
        tripType={tripType}
        clientId={clientId}
        checkinPre={checkinPre}
        checkoutPre={checkoutPre}
        onBooked={handleBooked}
      />
    </div>
  );
}
