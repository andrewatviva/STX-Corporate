import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search, X, RefreshCw, CheckCircle, ChevronLeft, ChevronRight,
  MapPin, Hotel, CreditCard, Wifi, Car,
  Dumbbell, Utensils, Coffee, Waves, Bell, Wind, Heart,
  AlertTriangle, Check, ArrowLeft,
} from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';

// ── API ──────────────────────────────────────────────────────────────────────

const NUITEE_BASE = 'https://api.liteapi.travel/v3.0';


const COUNTRY_OPTIONS = [
  { code: 'AU', name: 'Australia' },     { code: 'NZ', name: 'New Zealand' },
  { code: 'US', name: 'United States' }, { code: 'GB', name: 'United Kingdom' },
  { code: 'SG', name: 'Singapore' },     { code: 'JP', name: 'Japan' },
  { code: 'TH', name: 'Thailand' },      { code: 'ID', name: 'Indonesia' },
  { code: 'MY', name: 'Malaysia' },      { code: 'IN', name: 'India' },
  { code: 'AE', name: 'UAE' },           { code: 'FR', name: 'France' },
  { code: 'DE', name: 'Germany' },       { code: 'IT', name: 'Italy' },
  { code: 'ES', name: 'Spain' },         { code: 'CA', name: 'Canada' },
];

function makeApiKey(useSandbox) {
  return useSandbox
    ? process.env.REACT_APP_NUITEE_API_KEY_SANDBOX || ''
    : process.env.REACT_APP_NUITEE_API_KEY_PROD || '';
}

async function nuiteeGet(endpoint, apiKey) {
  const res = await fetch(`${NUITEE_BASE}${endpoint}`, {
    headers: { 'X-API-Key': apiKey, 'accept': 'application/json' },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || `API error ${res.status}`);
  return data;
}

async function nuiteePost(endpoint, body, apiKey) {
  const res = await fetch(`${NUITEE_BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json', 'accept': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = (typeof data?.message === 'string' ? data.message : null)
      || (typeof data?.error === 'string' ? data.error : null)
      || data?.errors?.[0]?.message
      || JSON.stringify(data)
      || `API error ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

// ── Rate deduplication ────────────────────────────────────────────────────────

function checkRefundable(rate) {
  const tag = rate?.cancellationPolicies?.refundableTag ?? rate?.cancellationPolicy?.refundableTag;
  if (tag === 'RFN') return true;
  if (tag === 'NRFN') return false;
  const policies = rate?.cancellationPolicies?.cancelPolicyInfos ?? rate?.cancellationPolicy?.cancelPolicyInfos ?? [];
  return policies.some(p => p.cancelTime && new Date(p.cancelTime) > new Date());
}

function pickBestRates(ratesData, currency) {
  const roomTypes = ratesData?.roomTypes || [];
  const bestByKey = new Map();

  for (const roomType of roomTypes) {
    const rates = roomType?.rates || [];
    for (const rate of rates) {
      const roomId = roomType?.roomTypeId ?? roomType?.id ?? roomType?.mappedRoom?.id ?? 'UNKNOWN';
      const board    = rate?.boardType ?? rate?.boardName ?? 'UNKNOWN';
      const refTag   = rate?.cancellationPolicies?.refundableTag ?? rate?.cancellationPolicy?.refundableTag ?? 'UNKNOWN';
      const payTypes = Array.isArray(rate?.paymentTypes) && rate.paymentTypes.length ? rate.paymentTypes : ['UNKNOWN'];

      const retailAmt =
        parseFloat(roomType?.offerRetailRate?.amount) ||
        parseFloat(rate?.retailRate?.total?.[0]?.amount) ||
        parseFloat(rate?.retailRate?.amount) || 0;
      if (!retailAmt) continue;

      const netAmt = parseFloat(rate?.netRate) || parseFloat(rate?.net?.total?.[0]?.amount) || 0;

      for (const payType of payTypes) {
        const key = `${roomId}|${board}|${refTag}|${payType}`;
        const existing = bestByKey.get(key);
        if (!existing || retailAmt < existing.price) {
          const sspAmt = parseFloat(roomType?.suggestedSellingPrice?.amount) || parseFloat(rate?.suggestedSellingPrice?.amount) || 0;
          bestByKey.set(key, {
            key,
            rateId:        rate.rateId,
            offerId:       roomType?.offerId,
            ssp:           sspAmt,
            roomName:      rate?.name?.trim() || roomType?.name?.trim() || 'Room',
            mappedRoomId:  rate?.mappedRoomId || roomType?.mappedRoom?.id || null,
            amenities:     roomType?.mappedRoom?.amenities || roomType?.mappedRoom?.features || [],
            boardType:     rate?.boardType,
            boardName:     rate?.boardName || rate?.boardType || 'Room Only',
            refundableTag: refTag,
            isRefundable:  refTag === 'RFN' || checkRefundable(rate),
            paymentType:   payType,
            price:         retailAmt,
            netPrice:      netAmt,
            currency,
            cancelPolicy:  rate?.cancellationPolicies,
            mealType:      rate?.mealType || rate?.boardType,
          });
        }
      }
    }
  }

  return Array.from(bestByKey.values()).sort((a, b) => a.price - b.price);
}

function applyMarkup(price, pct) {
  return price * (1 + (pct || 0) / 100);
}

// ── Facility icon mapping ─────────────────────────────────────────────────────

const FACILITY_ICON_MAP = [
  { Icon: Wifi,     label: 'Free WiFi',    match: [/wifi|wi.?fi/i] },
  { Icon: Waves,    label: 'Pool',         match: [/pool|swimming/i] },
  { Icon: Dumbbell, label: 'Gym',          match: [/fitness|gym/i] },
  { Icon: Utensils, label: 'Restaurant',   match: [/restaurant/i] },
  { Icon: Coffee,   label: 'Breakfast',    match: [/breakfast|cafe/i] },
  { Icon: Car,      label: 'Parking',      match: [/parking/i] },
  { Icon: Bell,     label: 'Room Service', match: [/room\s*service/i] },
  { Icon: Wind,     label: 'Air Con',      match: [/air\s*cond/i] },
  { Icon: Heart,    label: 'Accessible',   match: [/wheelchair|accessible/i] },
];

function getRatingMeta(rating) {
  if (!rating) return null;
  if (rating >= 9) return { label: 'Exceptional', color: 'bg-teal-600' };
  if (rating >= 8) return { label: 'Very Good',   color: 'bg-teal-500' };
  if (rating >= 7) return { label: 'Good',        color: 'bg-blue-500' };
  if (rating >= 6) return { label: 'Pleasant',    color: 'bg-amber-500' };
  return                  { label: 'Rated',       color: 'bg-slate-500' };
}

// ── LiteAPI Payment Widget ────────────────────────────────────────────────────

function PaymentWidget({ secretKey, returnUrl, useSandbox, onError }) {
  const containerRef = useRef(null);
  const scriptLoadedRef = useRef(false);

  useEffect(() => {
    if (!secretKey || !returnUrl) return;

    const initPayment = () => {
      if (!window.LiteAPIPayment) {
        onError('Payment SDK failed to load. Please refresh and try again.');
        return;
      }
      try {
        const payment = new window.LiteAPIPayment({
          publicKey:    useSandbox ? 'sandbox' : 'live',
          appearance:   { theme: 'flat' },
          options:      { business: { name: 'STX Travel' } },
          targetElement: '#liteapi-payment-form',
          secretKey,
          returnUrl,
        });
        payment.handlePayment();
      } catch (e) {
        onError('Payment form failed to initialise: ' + e.message);
      }
    };

    if (scriptLoadedRef.current) { initPayment(); return; }

    const existing = document.querySelector('script[data-liteapi-payment]');
    if (existing) existing.remove();

    const script = document.createElement('script');
    script.src = 'https://payment-wrapper.liteapi.travel/dist/liteAPIPayment.js?v=a1';
    script.setAttribute('data-liteapi-payment', 'true');
    script.onload = () => { scriptLoadedRef.current = true; initPayment(); };
    script.onerror = () => onError('Could not load the payment SDK. Check your connection and try again.');
    document.head.appendChild(script);
  }, [secretKey, returnUrl, useSandbox]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={containerRef} className="min-h-[300px]">
      <div id="liteapi-payment-form" className="w-full" />
    </div>
  );
}

// ── Step progress bar ─────────────────────────────────────────────────────────

const STEPS = ['Search', 'Hotels', 'Detail', 'Guest', 'Review', 'Pay', 'Done'];
const STEP_NUM = { search: 1, results: 2, hotel_detail: 3, guest: 4, confirm: 5, payment: 6, booked: 7 };

function ProgressBar({ step }) {
  const current = STEP_NUM[step] || 1;
  return (
    <div className="bg-slate-800 px-6 py-3 flex items-center justify-center gap-1">
      {STEPS.map((label, i) => {
        const done   = current > i + 1;
        const active = current === i + 1;
        return (
          <React.Fragment key={i}>
            <div className="flex flex-col items-center">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors
                ${done ? 'bg-teal-500 text-white' : active ? 'bg-teal-400 text-white ring-2 ring-teal-300/40' : 'bg-slate-700 text-slate-400'}`}>
                {done ? <Check size={10} /> : i + 1}
              </div>
              <span className={`text-[9px] mt-0.5 font-medium ${active ? 'text-teal-400' : 'text-slate-500'}`}>{label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-0.5 w-8 mb-3 transition-colors ${done ? 'bg-teal-500' : 'bg-slate-700'}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function HotelBookingFlow({ tripId, sectorIndex, tripType, clientId, checkinPre, checkoutPre, travellerName, destinationCity, email, onBooked }) {
  const { userProfile } = useAuth();
  const isSTX = userProfile?.role === 'stx' || userProfile?.role === 'stx_admin' || userProfile?.role === 'stx_ops';
  const isSelfManaged = (tripType || '').toLowerCase().includes('self');

  // Sandbox toggle — STX users start in sandbox, switch to prod explicitly
  const [useSandbox, setUseSandbox] = useState(true);
  const apiKey = makeApiKey(useSandbox);

  // Client config
  const [markupPercent,   setMarkupPercent]   = useState(0);
  const [feed,            setFeed]            = useState('vivatravelholdingscug');
  const [stxNotifyEmail,  setStxNotifyEmail]  = useState('enquiries@supportedtravelx.com.au');

  useEffect(() => {
    if (!clientId) return;
    getDoc(doc(db, 'clients', clientId, 'config', 'settings')).then(snap => {
      if (!snap.exists()) return;
      const data = snap.data();
      const hb = data?.hotelBooking || {};
      if (typeof hb.markupPercent === 'number') setMarkupPercent(hb.markupPercent);
      if (hb.nuiteeFeed) setFeed(hb.nuiteeFeed);
      const notifyEmail = data?.contact?.stxNotifyEmail;
      if (notifyEmail) setStxNotifyEmail(notifyEmail);
    }).catch(() => {});
  }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Step
  const [step, setStep] = useState('search');

  // Search fields — pre-populate from trip props
  const [searchQuery,    setSearchQuery]    = useState(destinationCity || '');
  const [searchSugs,     setSearchSugs]     = useState({ regions: [], hotels: [] });
  const [showSugs,       setShowSugs]       = useState(false);
  const [selectedSearch, setSelectedSearch] = useState(
    destinationCity ? { kind: 'place', displayName: destinationCity, nominatimName: destinationCity, address: '' } : null
  );
  const [countryCode,    setCountryCode]    = useState('AU');
  const [checkin,  setCheckin]  = useState(checkinPre  || '');
  const [checkout, setCheckout] = useState(checkoutPre || '');
  const [adults,   setAdults]   = useState(1);
  const [children, setChildren] = useState(0);
  const [currency, setCurrency] = useState('AUD');
  const [nationality, setNationality] = useState('AU');
  const [filterStars, setFilterStars] = useState([]);
  const [filterMealType, setFilterMealType] = useState('');
  const [filterMinPrice, setFilterMinPrice] = useState('');
  const [filterMaxPrice, setFilterMaxPrice] = useState('');
  const [hotelFilter, setHotelFilter] = useState('');

  const selectionMadeRef = useRef(false);

  // Results
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState('');
  const [hotels,          setHotels]          = useState([]);
  const [ratesMap,        setRatesMap]        = useState({});
  const [hotelDetailsMap, setHotelDetailsMap] = useState({});

  // Result filters
  const [filterRefundable,  setFilterRefundable]  = useState('any');
  const [filterPaymentType, setFilterPaymentType] = useState('any');
  const [sortBy,            setSortBy]            = useState('price_asc');

  // Hotel detail & selection
  const [selectedHotelForDetail, setSelectedHotelForDetail] = useState(null);
  const [galleryIndex,           setGalleryIndex]           = useState(0);
  const [lightboxPhotos,         setLightboxPhotos]         = useState([]);
  const [lightboxIndex,          setLightboxIndex]          = useState(0);
  const [selectedHotel,          setSelectedHotel]          = useState(null);
  const [selectedRoom,           setSelectedRoom]           = useState(null);

  // Guest — pre-populate from travellerName prop
  const [guestFirst,      setGuestFirst]      = useState(() => {
    if (!travellerName) return '';
    const parts = travellerName.trim().split(' ');
    return parts[0] || '';
  });
  const [guestLast,       setGuestLast]       = useState(() => {
    if (!travellerName) return '';
    const parts = travellerName.trim().split(' ');
    return parts.slice(1).join(' ') || '';
  });
  const [guestEmail,      setGuestEmail]      = useState(email || '');
  const [specialRequests, setSpecialRequests] = useState('');

  // Booking flow
  const [prebookLoading, setPrebookLoading] = useState(false);
  const [prebookId,      setPrebookId]      = useState('');
  const [prebookDetails, setPrebookDetails] = useState(null);
  const [secretKey,      setSecretKey]      = useState('');
  const [transactionId,  setTransactionId]  = useState('');
  const [bookLoading,    setBookLoading]    = useState(false); // eslint-disable-line no-unused-vars
  const [bookingResult,  setBookingResult]  = useState(null);
  const [processingPayment, setProcessingPayment] = useState(false);

  // ── Auto-fill guest from auth user ──
  useEffect(() => {
    if (step !== 'guest' || !userProfile) return;
    if (!isSTX && !guestFirst) {
      const firstName = userProfile.firstName || '';
      const lastName  = userProfile.lastName  || '';
      setGuestFirst(firstName);
      setGuestLast(lastName);
      setGuestEmail(userProfile.email || '');
    }
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Detect payment redirect return ──
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pid = params.get('liteapi_pid');
    const tid = params.get('liteapi_tid');
    const fn  = params.get('liteapi_fn');
    const ln  = params.get('liteapi_ln');
    const em  = params.get('liteapi_em');
    if (pid && tid) {
      window.history.replaceState({}, '', window.location.pathname + window.location.search.replace(/[?&]liteapi_[^&]+/g, '').replace(/^&/, '?'));
      setProcessingPayment(true);
      setStep('results');
      const saved = sessionStorage.getItem('hotel_booking_state');
      if (saved) {
        try {
          const state = JSON.parse(saved);
          if (state.selectedHotel) setSelectedHotel(state.selectedHotel);
          if (state.selectedRoom)  setSelectedRoom(state.selectedRoom);
          if (state.checkin)       setCheckin(state.checkin);
          if (state.checkout)      setCheckout(state.checkout);
          if (state.currency)      setCurrency(state.currency);
          if (state.useSandbox !== undefined) setUseSandbox(state.useSandbox);
          sessionStorage.removeItem('hotel_booking_state');
        } catch {}
      }
      if (fn) setGuestFirst(fn);
      if (ln) setGuestLast(ln);
      if (em) setGuestEmail(em);
      doBook(pid, tid, fn || guestFirst, ln || guestLast, em || guestEmail);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Search autocomplete ──
  useEffect(() => {
    if (selectionMadeRef.current) { selectionMadeRef.current = false; return; }
    if (searchQuery.length < 2) { setSearchSugs({ regions: [], hotels: [] }); setShowSugs(false); return; }
    const timer = setTimeout(async () => {
      try {
        const [nominatimRes, hotelRes] = await Promise.allSettled([
          fetch(
            `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&addressdetails=1&limit=5`,
            { headers: { 'Accept-Language': 'en', 'User-Agent': 'STX-Corporate/1.0' } }
          ).then(r => r.json()),
          nuiteeGet(`/data/hotels?hotelName=${encodeURIComponent(searchQuery)}&countryCode=${countryCode}&limit=8`, apiKey),
        ]);

        const ALLOWED_TYPES = ['city','town','village','suburb','neighbourhood','quarter','hamlet','municipality','borough','administrative','place'];
        const regions = nominatimRes.status === 'fulfilled'
          ? nominatimRes.value
              .filter(i => ALLOWED_TYPES.includes(i.addresstype) || ALLOWED_TYPES.includes(i.type) || i.class === 'place' || i.class === 'boundary')
              .map(i => {
                const a = i.address || {};
                const shortName = a.suburb || a.neighbourhood || a.city || a.town || a.village || a.municipality || i.name;
                const context   = [a.city || a.town || a.county, a.state, a.country].filter(Boolean).join(', ');
                return { kind: 'place', nominatimName: i.name, displayName: shortName || i.name, address: context };
              })
              .filter((c, i, arr) => c.displayName && arr.findIndex(x => x.displayName === c.displayName && x.address === c.address) === i)
              .slice(0, 5)
          : [];

        const hotelSugs = hotelRes.status === 'fulfilled'
          ? (hotelRes.value.data || []).map(h => ({
              kind: 'hotel', hotelId: h.id, displayName: h.name || '',
              address: [h.address?.addressLine1, h.address?.city, h.address?.country].filter(Boolean).join(', '),
            }))
          : [];

        setSearchSugs({ regions, hotels: hotelSugs });
        setShowSugs(regions.length > 0 || hotelSugs.length > 0);
      } catch { setSearchSugs({ regions: [], hotels: [] }); }
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived: filtered hotels ──
  const totalNights = useMemo(() => {
    if (!checkin || !checkout) return 0;
    return Math.max(0, Math.round((new Date(checkout) - new Date(checkin)) / 86400000));
  }, [checkin, checkout]);

  const filteredHotels = useMemo(() => {
    const term = hotelFilter.toLowerCase();
    return hotels
      .map(h => {
        const rateData = ratesMap[h.id] || null;
        const all = rateData ? pickBestRates(rateData, currency) : [];
        const filteredOffers = all.filter(offer => {
          if (filterRefundable === 'refundable'     && !offer.isRefundable) return false;
          if (filterRefundable === 'non_refundable' && offer.isRefundable)  return false;
          if (filterPaymentType !== 'any' && offer.paymentType !== filterPaymentType) return false;
          // For STX-managed trips, hide PROPERTY_PAY
          if (!isSelfManaged && offer.paymentType === 'PROPERTY_PAY') return false;
          return true;
        });
        if (!filteredOffers.length) return null;
        const sorted = [...filteredOffers].sort((a, b) => {
          if (sortBy === 'refundable_first') {
            if (a.isRefundable && !b.isRefundable) return -1;
            if (!a.isRefundable && b.isRefundable) return 1;
          }
          if (sortBy === 'price_desc') return applyMarkup(b.price, markupPercent) - applyMarkup(a.price, markupPercent);
          return applyMarkup(a.price, markupPercent) - applyMarkup(b.price, markupPercent);
        });
        return { ...h, filteredOffers: sorted, cheapestOffer: sorted[0] };
      })
      .filter(Boolean)
      .filter(h => !term || (h.name || '').toLowerCase().includes(term))
      .sort((a, b) => {
        if (sortBy === 'price_desc') return applyMarkup(b.cheapestOffer.price, markupPercent) - applyMarkup(a.cheapestOffer.price, markupPercent);
        return applyMarkup(a.cheapestOffer.price, markupPercent) - applyMarkup(b.cheapestOffer.price, markupPercent);
      });
  }, [hotels, ratesMap, hotelFilter, filterRefundable, filterPaymentType, sortBy, markupPercent, currency, isSelfManaged]);

  // ── Handlers ──

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!selectedSearch) { setError('Please select a destination or hotel from the suggestions.'); return; }
    setLoading(true); setError(''); setHotels([]); setRatesMap({}); setHotelDetailsMap({});

    try {
      let hotelList = [];
      if (selectedSearch.kind === 'hotel') {
        hotelList = [{ id: selectedSearch.hotelId, name: selectedSearch.displayName }];
      } else {
        const cityParam = selectedSearch.nominatimName || selectedSearch.displayName;
        const res1 = await nuiteeGet(
          `/data/hotels?cityName=${encodeURIComponent(cityParam)}&countryCode=${countryCode}&limit=50`, apiKey
        );
        hotelList = res1.data || [];
        if (!hotelList.length) {
          const res2 = await nuiteeGet(
            `/data/hotels?cityName=${encodeURIComponent(selectedSearch.displayName)}&countryCode=${countryCode}&limit=50`, apiKey
          );
          hotelList = res2.data || [];
        }
      }

      if (!hotelList.length) {
        setError(`No hotels found for "${selectedSearch.displayName}". Try a different destination.`);
        setLoading(false); return;
      }
      setHotels(hotelList);

      const occupancy = { adults };
      if (children > 0) occupancy.children = Array(children).fill(10);
      const ratesBody = {
        feed, hotelIds: hotelList.slice(0, 50).map(h => h.id),
        occupancies: [occupancy], currency, guestNationality: nationality,
        checkin, checkout, roomMapping: true,
      };
      if (filterStars.length > 0) ratesBody.starRatings = filterStars.map(Number);
      if (filterMealType)         ratesBody.mealTypes   = [filterMealType];
      if (filterMinPrice)         ratesBody.minRate     = parseFloat(filterMinPrice);
      if (filterMaxPrice)         ratesBody.maxRate     = parseFloat(filterMaxPrice);

      const ratesRes = await nuiteePost('/hotels/rates', ratesBody, apiKey);
      const newMap = {};
      (ratesRes.data || []).forEach(h => { if (h.roomTypes?.length) newMap[h.hotelId] = h; });
      setRatesMap(newMap);
      setStep('results');

      const idsWithRates = Object.keys(newMap).slice(0, 25);
      const detailResults = await Promise.allSettled(
        idsWithRates.map(id => nuiteeGet(`/data/hotel?hotelId=${id}`, apiKey))
      );
      const detailsMap = {};
      detailResults.forEach((r, i) => { if (r.status === 'fulfilled') detailsMap[idsWithRates[i]] = r.value.data; });
      setHotelDetailsMap(detailsMap);
    } catch (err) {
      setError(`Search failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handlePrebook = async () => {
    if (!guestFirst || !guestLast || !guestEmail) {
      setError('Please complete all required guest fields.');
      return;
    }
    setPrebookLoading(true); setError('');
    try {
      const body = { usePaymentSdk: true };
      if (selectedRoom.offerId) body.offerId = selectedRoom.offerId;
      else body.rateId = selectedRoom.rateId;

      const res = await nuiteePost('/rates/prebook', body, apiKey);
      const d = res.data;
      setPrebookId(d?.prebookId);
      setPrebookDetails(d);
      setSecretKey(d?.secretKey || '');
      setTransactionId(d?.transactionId || '');

      const returnUrl = new URL(window.location.href);
      returnUrl.searchParams.set('liteapi_fn', guestFirst);
      returnUrl.searchParams.set('liteapi_ln', guestLast);
      returnUrl.searchParams.set('liteapi_em', guestEmail);

      sessionStorage.setItem('hotel_booking_state', JSON.stringify({
        selectedHotel: { id: selectedHotel?.id, name: selectedHotel?.name, address: selectedHotel?.address },
        selectedRoom:  { roomName: selectedRoom?.roomName, boardName: selectedRoom?.boardName, price: selectedRoom?.price, isRefundable: selectedRoom?.isRefundable, paymentType: selectedRoom?.paymentType },
        checkin, checkout, currency, useSandbox,
      }));

      setStep('payment');
    } catch (err) {
      setError(`Pre-book failed: ${err.message}`);
    } finally {
      setPrebookLoading(false);
    }
  };

  const doBook = async (overridePrebookId, overrideTransactionId, overrideFirst, overrideLast, overrideEmail) => {
    setBookLoading(true); setError('');
    try {
      const body = {
        prebookId:     overridePrebookId     || prebookId,
        holder:        { firstName: overrideFirst || guestFirst, lastName: overrideLast || guestLast, email: overrideEmail || guestEmail },
        guests:        [{ occupancyNumber: 1, firstName: overrideFirst || guestFirst, lastName: overrideLast || guestLast, email: overrideEmail || guestEmail }],
        payment:       { method: 'TRANSACTION_ID', transactionId: overrideTransactionId || transactionId },
        contactEmails: [stxNotifyEmail],
      };
      if (specialRequests) body.remarks = specialRequests;
      const res = await nuiteePost('/rates/book', body, apiKey);
      setBookingResult(res.data);
      setStep('booked');
    } catch (err) {
      setError(`Booking failed: ${err.message}`);
      setProcessingPayment(false);
    } finally {
      setBookLoading(false);
      setProcessingPayment(false);
    }
  };

  const getFinalAmount = () => parseFloat(
    prebookDetails?.retailRate?.total?.[0]?.amount ??
    prebookDetails?.totalAmount ??
    selectedRoom?.price ?? 0
  );

  const handleConfirmBooked = () => {
    const bookingData = {
      propertyName:  selectedHotel?.name || '',
      bookingRef:    bookingResult?.bookingId || bookingResult?.id || '',
      checkIn:       checkin,
      checkOut:      checkout,
      cost:          applyMarkup(getFinalAmount(), markupPercent).toFixed(2),
      roomType:      selectedRoom?.roomName || '',
      inclusions:    selectedRoom?.boardName || '',
      notes:         specialRequests || '',
      hotelCity:     selectedHotel?.address?.city || selectedSearch?.displayName || '',
      international: countryCode !== 'AU',
    };
    onBooked(bookingData);
  };

  // ── Render: sandbox banner ──
  const renderSandboxBanner = () => (
    useSandbox && isSTX ? (
      <div className="bg-amber-400 text-amber-900 px-4 py-2 flex items-center justify-between text-xs font-semibold">
        <div className="flex items-center gap-2">
          <AlertTriangle size={14} />
          SANDBOX MODE — test bookings only, no real charges
        </div>
        <button
          onClick={() => { if (window.confirm('Switch to PRODUCTION API? Real bookings and charges will apply.')) setUseSandbox(false); }}
          className="underline hover:text-amber-700"
        >
          Switch to Production
        </button>
      </div>
    ) : !useSandbox && isSTX ? (
      <div className="bg-green-600 text-white px-4 py-2 flex items-center justify-between text-xs font-semibold">
        <div className="flex items-center gap-2">
          <CheckCircle size={14} />
          PRODUCTION — live bookings
        </div>
        <button onClick={() => setUseSandbox(true)} className="underline hover:text-green-200">
          Switch to Sandbox
        </button>
      </div>
    ) : null
  );

  // ── Render: search ──
  const renderSearch = () => (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-5">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Search Hotels</h2>
          <p className="text-sm text-slate-500 mt-1">
            Find and book accommodation via Nuitee · {totalNights > 0 ? `${totalNights} night${totalNights !== 1 ? 's' : ''}` : 'Enter dates below'}
          </p>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-sm">{error}</div>}

        <form onSubmit={handleSearch} className="space-y-4">
          {/* Destination autocomplete */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Destination or Hotel *</label>
            <div className="relative">
              <input
                type="text" required
                placeholder="City, suburb, airport or hotel name…"
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setSelectedSearch(null); }}
                onFocus={() => !selectedSearch && (searchSugs.regions.length || searchSugs.hotels.length) && setShowSugs(true)}
                onBlur={() => setTimeout(() => setShowSugs(false), 150)}
                autoComplete="off"
              />
              {selectedSearch && (
                <span className={`absolute right-3 top-2.5 text-[10px] font-bold px-2 py-0.5 rounded-full ${selectedSearch.kind === 'hotel' ? 'bg-teal-100 text-teal-700' : 'bg-blue-100 text-blue-700'}`}>
                  {selectedSearch.kind === 'hotel' ? '🏨 Hotel' : '📍 Region'}
                </span>
              )}
              {showSugs && (searchSugs.regions.length > 0 || searchSugs.hotels.length > 0) && (
                <div className="absolute z-30 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-72 overflow-y-auto">
                  {searchSugs.regions.length > 0 && (
                    <>
                      <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-100 sticky top-0">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">📍 Regions & Areas</span>
                      </div>
                      {searchSugs.regions.map((item, i) => (
                        <button key={`r-${i}`} type="button"
                          className="w-full text-left px-4 py-2.5 hover:bg-blue-50 flex items-start gap-2 border-b border-slate-50 last:border-0"
                          onMouseDown={() => { selectionMadeRef.current = true; setSelectedSearch(item); setSearchQuery(item.displayName); setShowSugs(false); }}>
                          <MapPin size={13} className="text-blue-500 flex-shrink-0 mt-0.5" />
                          <div>
                            <div className="text-sm font-medium text-slate-800">{item.displayName}</div>
                            {item.address && item.address !== item.displayName && <div className="text-xs text-slate-400">{item.address}</div>}
                          </div>
                        </button>
                      ))}
                    </>
                  )}
                  {searchSugs.hotels.length > 0 && (
                    <>
                      <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-100 border-t border-slate-200 sticky top-0">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">🏨 Hotels</span>
                      </div>
                      {searchSugs.hotels.map((item, i) => (
                        <button key={`h-${i}`} type="button"
                          className="w-full text-left px-4 py-2.5 hover:bg-teal-50 flex items-start gap-2 border-b border-slate-50 last:border-0"
                          onMouseDown={() => { selectionMadeRef.current = true; setSelectedSearch(item); setSearchQuery(item.displayName); setShowSugs(false); }}>
                          <Hotel size={13} className="text-teal-500 flex-shrink-0 mt-0.5" />
                          <div>
                            <div className="text-sm font-medium text-slate-800">{item.displayName}</div>
                            {item.address && <div className="text-xs text-slate-400">{item.address}</div>}
                          </div>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Country for API */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Country</label>
            <select className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none bg-white"
              value={countryCode} onChange={e => setCountryCode(e.target.value)}>
              {COUNTRY_OPTIONS.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Check-in *</label>
              <input type="date" required min={new Date().toISOString().split('T')[0]}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                value={checkin} onChange={e => setCheckin(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Check-out *</label>
              <input type="date" required min={checkin || new Date().toISOString().split('T')[0]}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                value={checkout} onChange={e => setCheckout(e.target.value)} />
            </div>
          </div>

          {/* Guests */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Adults</label>
              <input type="number" min={1} max={6}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                value={adults} onChange={e => setAdults(Math.max(1, parseInt(e.target.value) || 1))} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Children</label>
              <input type="number" min={0} max={4}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                value={children} onChange={e => setChildren(Math.max(0, parseInt(e.target.value) || 0))} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Currency</label>
              <select className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none bg-white"
                value={currency} onChange={e => setCurrency(e.target.value)}>
                {['AUD','USD','NZD','GBP','EUR','SGD','JPY'].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Nationality */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Guest Nationality</label>
            <select className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none bg-white"
              value={nationality} onChange={e => setNationality(e.target.value)}>
              {COUNTRY_OPTIONS.map(c => <option key={c.code} value={c.code}>{c.name} ({c.code})</option>)}
            </select>
          </div>

          {/* Filters */}
          <details className="border border-slate-200 rounded-lg">
            <summary className="px-4 py-3 text-sm font-semibold text-slate-700 cursor-pointer select-none">Filters</summary>
            <div className="px-4 pb-4 pt-2 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Star Rating</label>
                <div className="flex gap-2">
                  {[1,2,3,4,5].map(star => (
                    <button key={star} type="button"
                      onClick={() => setFilterStars(prev => prev.includes(star) ? prev.filter(s => s !== star) : [...prev, star])}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-colors ${filterStars.includes(star) ? 'bg-amber-400 text-white border-amber-400' : 'bg-white text-slate-500 border-slate-200 hover:border-amber-400'}`}>
                      {'★'.repeat(star)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Board Basis</label>
                <div className="grid grid-cols-3 gap-2">
                  {[{value:'',label:'Any'},{value:'ROOM_ONLY',label:'Room Only'},{value:'BREAKFAST',label:'Breakfast'},{value:'HALF_BOARD',label:'Half Board'},{value:'FULL_BOARD',label:'Full Board'},{value:'ALL_INCLUSIVE',label:'All Incl.'}].map(opt => (
                    <button key={opt.value} type="button"
                      onClick={() => setFilterMealType(opt.value)}
                      className={`py-1.5 px-2 rounded-lg text-xs font-bold border transition-colors ${filterMealType === opt.value ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-slate-500 border-slate-200 hover:border-teal-500'}`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Price Range ({currency} total)</label>
                <div className="flex items-center gap-2">
                  <input type="number" min="0" placeholder="Min" className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-teal-500" value={filterMinPrice} onChange={e => setFilterMinPrice(e.target.value)} />
                  <span className="text-slate-400">—</span>
                  <input type="number" min="0" placeholder="Max" className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-teal-500" value={filterMaxPrice} onChange={e => setFilterMaxPrice(e.target.value)} />
                </div>
              </div>
            </div>
          </details>

          <button type="submit" disabled={loading}
            className="w-full py-3 bg-teal-600 text-white font-bold rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
            {loading ? <><RefreshCw size={16} className="animate-spin" /> Searching…</> : <><Search size={16} /> Search Hotels</>}
          </button>
        </form>
      </div>
    </div>
  );

  // ── Render: results ──
  const renderResults = () => (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto p-4 space-y-4">
        {/* Summary bar */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{selectedSearch?.displayName || 'Hotels'}</h2>
            <p className="text-xs text-slate-500">
              {checkin} → {checkout} · {adults} adult{adults !== 1 ? 's' : ''}{children > 0 ? ` · ${children} child${children !== 1 ? 'ren' : ''}` : ''} · {totalNights} night{totalNights !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setStep('search')} className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1">
              <ArrowLeft size={12} /> Modify search
            </button>
          </div>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-sm">{error}</div>}

        {/* Filter bar */}
        <div className="flex flex-wrap gap-2 pb-2 border-b border-slate-100">
          <input
            type="text" placeholder="Filter by hotel name…"
            className="flex-1 min-w-[200px] px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none"
            value={hotelFilter} onChange={e => setHotelFilter(e.target.value)}
          />
          <select className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm outline-none bg-white"
            value={sortBy} onChange={e => setSortBy(e.target.value)}>
            <option value="price_asc">Price: Low → High</option>
            <option value="price_desc">Price: High → Low</option>
            <option value="refundable_first">Refundable first</option>
          </select>
          <select className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm outline-none bg-white"
            value={filterRefundable} onChange={e => setFilterRefundable(e.target.value)}>
            <option value="any">All policies</option>
            <option value="refundable">Refundable only</option>
            <option value="non_refundable">Non-refundable only</option>
          </select>
          {isSelfManaged && (
            <select className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm outline-none bg-white"
              value={filterPaymentType} onChange={e => setFilterPaymentType(e.target.value)}>
              <option value="any">All payment types</option>
              <option value="NUITEE_PAY">Pay now</option>
              <option value="PROPERTY_PAY">Pay at hotel</option>
            </select>
          )}
        </div>

        <p className="text-xs text-slate-400">{filteredHotels.length} hotel{filteredHotels.length !== 1 ? 's' : ''} with availability</p>

        {processingPayment && (
          <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg text-sm text-blue-700 flex items-center gap-2">
            <RefreshCw size={16} className="animate-spin" /> Processing payment — please wait…
          </div>
        )}

        {filteredHotels.length === 0 && !loading && (
          <div className="text-center py-16 text-slate-400">
            <Hotel size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-semibold">No hotels match your filters</p>
            <p className="text-xs mt-1">Try adjusting your filters or search criteria</p>
          </div>
        )}

        {filteredHotels.map(hotel => {
          const detail     = hotelDetailsMap[hotel.id];
          const hotelImgs  = detail?.hotelImages || [];
          const mainPhoto  = hotel.main_photo || hotel.thumbnail || (hotelImgs.length ? (hotelImgs[0].urlHd || hotelImgs[0].url) : '');
          const ratingMeta = getRatingMeta(hotel.guestScore || hotel.reviewScore);
          const stars      = Math.round(hotel.starRating || hotel.stars || 0);
          const address    = [hotel.address?.addressLine1, hotel.address?.city].filter(Boolean).join(', ');
          const hotelFacilities = detail?.hotelFacilities || detail?.hotel_facilities || detail?.facilities || [];

          return (
            <div key={hotel.id}
              className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden cursor-pointer hover:shadow-md hover:border-teal-300 transition-all"
              onClick={() => { setSelectedHotelForDetail(hotel); setGalleryIndex(0); setStep('hotel_detail'); }}>
              <div className="flex flex-col md:flex-row">
                {/* Image — click opens lightbox instead of navigating */}
                <div className="md:w-56 w-full h-40 md:h-auto bg-slate-100 flex-shrink-0 relative overflow-hidden"
                  onClick={e => { if (hotelImgs.length) { e.stopPropagation(); setLightboxPhotos(hotelImgs); setLightboxIndex(0); } }}>
                  {mainPhoto
                    ? <img src={mainPhoto} alt={hotel.name} className="w-full h-full object-cover" onError={e => { e.target.style.display='none'; }} />
                    : <div className="w-full h-full flex items-center justify-center"><Hotel size={32} className="text-slate-300" /></div>
                  }
                  {hotelImgs.length > 1 && (
                    <div className="absolute bottom-2 right-2 bg-black/50 text-white text-[10px] px-2 py-0.5 rounded-full font-medium">
                      +{hotelImgs.length - 1} photos
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm">{hotel.name}</h3>
                      {address && <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5"><MapPin size={10} />{address}</p>}
                      {stars > 0 && <p className="text-xs text-amber-500 mt-0.5">{'★'.repeat(stars)}</p>}
                    </div>
                    {ratingMeta && (
                      <div className={`${ratingMeta.color} text-white rounded-lg px-2 py-1 text-center min-w-[52px] flex-shrink-0`}>
                        <p className="text-base font-bold leading-none">{(hotel.guestScore || hotel.reviewScore || 0).toFixed(1)}</p>
                        <p className="text-[9px] font-semibold mt-0.5">{ratingMeta.label}</p>
                      </div>
                    )}
                  </div>

                  {/* Facility icons — match against hotel_facilities name strings */}
                  {hotelFacilities.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {FACILITY_ICON_MAP.filter(({ match }) =>
                        hotelFacilities.some(f => {
                          const name = typeof f === 'string' ? f : (f?.name || f?.facilityName || '');
                          return match.some(rx => rx.test(name));
                        })
                      ).slice(0, 5).map(({ Icon, label }) => (
                        <span key={label} className="flex items-center gap-1 text-[10px] text-slate-500 bg-slate-50 border border-slate-100 rounded px-1.5 py-0.5">
                          <Icon size={10} />{label}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Cheapest offer teaser */}
                  {hotel.cheapestOffer && (
                    <div className="text-xs text-slate-500 mb-3">
                      From{' '}
                      <span className="text-lg font-bold text-slate-900">
                        {currency} {applyMarkup(hotel.cheapestOffer.price, markupPercent).toFixed(2)}
                      </span>
                      {' '}
                      <span className="text-[10px]">total · {hotel.cheapestOffer.boardName}</span>
                      {isSTX && markupPercent > 0 && (
                        <span className="ml-2 text-[10px] text-amber-600">(net {currency} {hotel.cheapestOffer.price.toFixed(2)} + {markupPercent}% markup)</span>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-1 text-teal-600 text-xs font-semibold mt-1">
                    View rooms &amp; details <ChevronRight size={13} />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // ── Render: hotel detail / room picker ──
  const renderHotelDetail = () => {
    const hotel  = selectedHotelForDetail;
    if (!hotel) return null;
    const detail    = hotelDetailsMap[hotel.id];
    const hotelImgs = detail?.hotelImages || [];
    const roomsData = detail?.rooms || [];     // rooms[].id, .roomName, .description, .photos[]
    const rateData  = ratesMap[hotel.id];
    const allRates  = rateData ? pickBestRates(rateData, currency) : [];
    const displayRates = allRates.filter(r => isSelfManaged ? true : r.paymentType !== 'PROPERTY_PAY');
    const stars = Math.round(hotel.starRating || hotel.stars || 0);

    // Helper: get room content via mappedRoomId, then fuzzy name fallback
    const getRoomContent = (rate) => {
      if (rate.mappedRoomId) {
        const byId = roomsData.find(r => r.id === rate.mappedRoomId);
        if (byId) return byId;
      }
      const rateName = (rate.roomName || '').toLowerCase().trim();
      if (rateName.length >= 4) {
        return roomsData.find(r => {
          const rn = (r.roomName || '').toLowerCase().trim();
          return rn === rateName ||
            rn.includes(rateName.slice(0, 8)) ||
            rateName.includes(rn.slice(0, 8));
        }) || null;
      }
      return null;
    };

    return (
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto p-4 space-y-5">
          <button onClick={() => setStep('results')} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
            <ArrowLeft size={14} /> Back to results
          </button>

          {/* Gallery — use hotelImages[] with urlHd preference */}
          {hotelImgs.length > 0 && (
            <div className="relative rounded-xl overflow-hidden bg-slate-100 h-64">
              <img
                src={hotelImgs[galleryIndex]?.urlHd || hotelImgs[galleryIndex]?.url}
                alt={hotel.name}
                className="w-full h-full object-cover cursor-pointer"
                onClick={() => { setLightboxPhotos(hotelImgs); setLightboxIndex(galleryIndex); }}
                onError={e => { e.target.style.display = 'none'; }}
              />
              {hotelImgs.length > 1 && (
                <>
                  <button onClick={() => setGalleryIndex(i => (i - 1 + hotelImgs.length) % hotelImgs.length)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/50 text-white rounded-full flex items-center justify-center hover:bg-black/70">
                    <ChevronLeft size={16} />
                  </button>
                  <button onClick={() => setGalleryIndex(i => (i + 1) % hotelImgs.length)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/50 text-white rounded-full flex items-center justify-center hover:bg-black/70">
                    <ChevronRight size={16} />
                  </button>
                  <div className="absolute bottom-2 right-2 bg-black/50 text-white text-[10px] px-2 py-0.5 rounded-full">
                    {galleryIndex + 1} / {hotelImgs.length}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Thumbnail strip */}
          {hotelImgs.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {hotelImgs.slice(0, 10).map((img, i) => (
                <button key={i} type="button" onClick={() => setGalleryIndex(i)}
                  className={`flex-shrink-0 w-16 h-12 rounded-lg overflow-hidden border-2 transition-all ${i === galleryIndex ? 'border-teal-500' : 'border-transparent opacity-60 hover:opacity-100'}`}>
                  <img src={img.url || img.urlHd} alt="" className="w-full h-full object-cover" onError={e => { e.target.style.display='none'; }} />
                </button>
              ))}
            </div>
          )}

          {/* Hotel header + description */}
          <div>
            <h2 className="text-xl font-bold text-slate-900">{hotel.name}</h2>
            {stars > 0 && <p className="text-amber-400 mt-0.5">{'★'.repeat(stars)}</p>}
            {hotel.address?.city && <p className="text-sm text-slate-500 flex items-center gap-1 mt-1"><MapPin size={12} />{hotel.address.city}</p>}
            {detail?.hotelDescription && (
              <div className="text-sm text-slate-600 mt-3 leading-relaxed [&_ul]:list-disc [&_ul]:pl-4 [&_p]:mb-1"
                dangerouslySetInnerHTML={{ __html: detail.hotelDescription }} />
            )}
            {detail?.hotelImportantInformation && (
              <div className="mt-3 p-3 bg-amber-50 border border-amber-100 rounded-lg">
                <p className="text-[10px] font-bold text-amber-700 uppercase mb-1">Good to know</p>
                <div className="text-xs text-amber-800 leading-relaxed [&_ul]:list-disc [&_ul]:pl-4 [&_p]:mb-1"
                  dangerouslySetInnerHTML={{ __html: detail.hotelImportantInformation }} />
              </div>
            )}
            {(detail?.checkinCheckoutTimes?.checkinTime || detail?.checkinCheckoutTimes?.checkoutTime) && (
              <div className="mt-3 flex gap-4 text-xs text-slate-500">
                {detail.checkinCheckoutTimes.checkinTime && (
                  <span>Check-in: <strong className="text-slate-700">{detail.checkinCheckoutTimes.checkinTime}</strong></span>
                )}
                {detail.checkinCheckoutTimes.checkoutTime && (
                  <span>Check-out: <strong className="text-slate-700">{detail.checkinCheckoutTimes.checkoutTime}</strong></span>
                )}
              </div>
            )}
          </div>

          {/* Facilities */}
          {(() => {
            const facs = detail?.hotelFacilities || detail?.hotel_facilities || detail?.facilities || [];
            const matched = FACILITY_ICON_MAP.filter(({ match }) =>
              facs.some(f => {
                const name = typeof f === 'string' ? f : (f?.name || f?.facilityName || '');
                return match.some(rx => rx.test(name));
              })
            );
            return matched.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {matched.map(({ Icon, label }) => (
                  <span key={label} className="flex items-center gap-1.5 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
                    <Icon size={12} />{label}
                  </span>
                ))}
              </div>
            ) : null;
          })()}

          {error && <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-sm">{error}</div>}

          {/* Room list */}
          <div>
            <h3 className="font-bold text-slate-800 mb-3 text-base">Available Rooms</h3>
            {displayRates.length === 0 && (
              <p className="text-slate-400 text-sm">No rooms match your search criteria.</p>
            )}
            <div className="space-y-4">
              {displayRates.map(rate => {
                const displayPrice  = applyMarkup(rate.price, markupPercent);
                const isPropertyPay = rate.paymentType === 'PROPERTY_PAY';
                const roomContent   = getRoomContent(rate);
                const roomPhotos    = (roomContent?.photos || []).filter(p => p.hd_url || p.url);
                const roomPhoto     = roomPhotos.find(p => p.mainPhoto) || roomPhotos[0];
                // Fallback to hotel gallery when room has no photos
                const fallbackImgUrl = !roomPhoto ? (hotelImgs[0]?.urlHd || hotelImgs[0]?.url || null) : null;

                return (
                  <div key={rate.key} className="border border-slate-200 rounded-xl overflow-hidden hover:border-teal-400 transition-colors">
                    {/* Room photo — use room-specific photos, fallback to hotel gallery */}
                    {(roomPhoto || fallbackImgUrl) && (
                      <div className="h-36 bg-slate-100 overflow-hidden relative cursor-pointer"
                        onClick={() => { if (roomPhotos.length) { setLightboxPhotos(roomPhotos); setLightboxIndex(0); } }}>
                        <img
                          src={roomPhoto ? (roomPhoto.hd_url || roomPhoto.url || roomPhoto.failoverPhoto) : fallbackImgUrl}
                          alt={rate.roomName}
                          className="w-full h-full object-cover"
                          onError={e => { e.target.style.display='none'; }}
                        />
                        {roomPhotos.length > 1 && (
                          <div className="absolute bottom-2 right-2 bg-black/50 text-white text-[10px] px-2 py-0.5 rounded-full">
                            +{roomPhotos.length - 1} photos
                          </div>
                        )}
                      </div>
                    )}

                    <div className="p-4">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="flex-1">
                          <h4 className="font-semibold text-slate-800 text-sm">{rate.roomName}</h4>
                          {/* Room description from hotel content */}
                          {roomContent?.description && (
                            <p className="text-xs text-slate-500 mt-1 leading-relaxed line-clamp-2">{roomContent.description}</p>
                          )}
                          <div className="flex flex-wrap gap-2 mt-2">
                            <span className="text-[10px] font-medium bg-slate-100 text-slate-600 px-2 py-0.5 rounded">{rate.boardName}</span>
                            <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${rate.isRefundable ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                              {rate.isRefundable ? '✓ Refundable' : '✕ Non-refundable'}
                            </span>
                            {isPropertyPay && (
                              <span className="text-[10px] font-medium bg-amber-100 text-amber-700 px-2 py-0.5 rounded">🏨 Pay at hotel</span>
                            )}
                          </div>
                          {rate.amenities?.length > 0 && (
                            <p className="text-[11px] text-slate-400 mt-1.5">
                              {(rate.amenities || []).slice(0, 4).map(a => typeof a === 'string' ? a : (a?.name || '')).filter(Boolean).join(' · ')}
                            </p>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-xl font-bold text-slate-900">{currency} {displayPrice.toFixed(2)}</p>
                          <p className="text-[10px] text-slate-400">total stay · {totalNights} night{totalNights !== 1 ? 's' : ''}</p>
                          {totalNights > 0 && (
                            <p className="text-[10px] text-slate-400">≈ {currency} {(displayPrice / totalNights).toFixed(2)}/night</p>
                          )}
                          {isSTX && markupPercent > 0 && (
                            <p className="text-[10px] text-amber-600">net {currency} {rate.price.toFixed(2)}</p>
                          )}
                          <button
                            onClick={() => { setSelectedHotel({ ...hotel, address: hotel.address }); setSelectedRoom(rate); setError(''); setStep('guest'); }}
                            className="mt-2 px-4 py-2 bg-teal-600 text-white text-xs font-bold rounded-lg hover:bg-teal-700 transition-colors">
                            Select Room
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ── Render: guest details ──
  const renderGuest = () => (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-xl mx-auto p-6 space-y-5">
        <button onClick={() => setStep('hotel_detail')} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft size={14} /> Back to rooms
        </button>

        <div>
          <h2 className="text-xl font-bold text-slate-900">Guest Details</h2>
          <p className="text-sm text-slate-500 mt-1">{selectedHotel?.name} · {checkin} → {checkout}</p>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
          <p className="text-xs font-bold text-slate-500 uppercase mb-2">Selected Room</p>
          <p className="font-semibold text-slate-800">{selectedRoom?.roomName}</p>
          <div className="flex flex-wrap gap-2 mt-1.5">
            <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded">{selectedRoom?.boardName}</span>
            <span className={`text-[10px] px-2 py-0.5 rounded ${selectedRoom?.isRefundable ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
              {selectedRoom?.isRefundable ? '✓ Refundable' : '✕ Non-refundable'}
            </span>
            {selectedRoom?.paymentType === 'PROPERTY_PAY' && (
              <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded">🏨 Pay at hotel</span>
            )}
          </div>
          <p className="text-lg font-bold text-slate-900 mt-2">
            {currency} {applyMarkup(selectedRoom?.price || 0, markupPercent).toFixed(2)}
          </p>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-sm">{error}</div>}

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">First Name *</label>
              <input type="text" required className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                value={guestFirst} onChange={e => setGuestFirst(e.target.value)} placeholder="John" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Last Name *</label>
              <input type="text" required className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                value={guestLast} onChange={e => setGuestLast(e.target.value)} placeholder="Smith" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Email Address *</label>
            <input type="email" required className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none"
              value={guestEmail} onChange={e => setGuestEmail(e.target.value)} placeholder="guest@example.com" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Special Requests</label>
            <textarea rows={3} className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none resize-none"
              value={specialRequests} onChange={e => setSpecialRequests(e.target.value)}
              placeholder="e.g. wheelchair accessible room, roll-in shower, ground floor, early check-in…" />
          </div>
        </div>

        <button
          onClick={() => setStep('confirm')}
          disabled={!guestFirst || !guestLast || !guestEmail}
          className="w-full py-3 bg-teal-600 text-white font-bold rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors">
          Continue to Review
        </button>
      </div>
    </div>
  );

  // ── Render: confirm ──
  const renderConfirm = () => {
    const displayPrice = applyMarkup(selectedRoom?.price || 0, markupPercent);
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-xl mx-auto p-6 space-y-5">
          <button onClick={() => setStep('guest')} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
            <ArrowLeft size={14} /> Back
          </button>
          <h2 className="text-xl font-bold text-slate-900">Review Booking</h2>

          {error && <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-sm">{error}</div>}

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="bg-slate-800 px-4 py-3 text-white text-sm font-bold">Booking Summary</div>
            <div className="p-4 space-y-3">
              <div className="flex justify-between text-sm"><span className="text-slate-500">Hotel</span><span className="font-semibold">{selectedHotel?.name}</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-500">Room</span><span className="font-semibold">{selectedRoom?.roomName}</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-500">Board</span><span>{selectedRoom?.boardName}</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-500">Check-in</span><span>{checkin}</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-500">Check-out</span><span>{checkout}</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-500">Nights</span><span>{totalNights}</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-500">Guests</span><span>{adults} adult{adults !== 1 ? 's' : ''}{children > 0 ? ` · ${children} child${children !== 1 ? 'ren' : ''}` : ''}</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-500">Guest</span><span>{guestFirst} {guestLast} · {guestEmail}</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-500">Policy</span>
                <span className={selectedRoom?.isRefundable ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                  {selectedRoom?.isRefundable ? '✓ Refundable' : '✕ Non-refundable'}
                </span>
              </div>
              <div className="flex justify-between text-sm"><span className="text-slate-500">Payment</span>
                <span>{selectedRoom?.paymentType === 'PROPERTY_PAY' ? '🏨 Pay at hotel' : '💳 Pay now (online)'}</span>
              </div>
              {specialRequests && <div className="flex justify-between text-sm"><span className="text-slate-500">Requests</span><span className="text-right max-w-[60%]">{specialRequests}</span></div>}
              <div className="border-t border-slate-100 pt-3 flex justify-between items-center">
                <span className="font-bold text-slate-700">Total</span>
                <span className="text-2xl font-bold text-slate-900">{currency} {displayPrice.toFixed(2)}</span>
              </div>
              {isSTX && markupPercent > 0 && (
                <p className="text-xs text-amber-600 text-right">Net: {currency} {(selectedRoom?.price || 0).toFixed(2)} + {markupPercent}% markup</p>
              )}
            </div>
          </div>

          {!selectedRoom?.isRefundable && (
            <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg text-xs text-amber-700 flex items-start gap-2">
              <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
              This room is non-refundable. Cancellation after booking will not be refunded.
            </div>
          )}

          <button
            onClick={handlePrebook}
            disabled={prebookLoading}
            className="w-full py-3 bg-teal-600 text-white font-bold rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
            {prebookLoading
              ? <><RefreshCw size={16} className="animate-spin" /> Processing…</>
              : <><CreditCard size={16} /> Confirm &amp; Pay</>}
          </button>
        </div>
      </div>
    );
  };

  // ── Render: payment ──
  const renderPayment = () => {
    const returnUrl = new URL(window.location.href);
    returnUrl.searchParams.set('liteapi_pid', prebookId || 'PENDING');
    returnUrl.searchParams.set('liteapi_tid', transactionId || 'PENDING');
    returnUrl.searchParams.set('liteapi_fn', guestFirst);
    returnUrl.searchParams.set('liteapi_ln', guestLast);
    returnUrl.searchParams.set('liteapi_em', guestEmail);

    return (
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-xl mx-auto p-6 space-y-5">
          <h2 className="text-xl font-bold text-slate-900">Payment</h2>
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex justify-between items-center">
            <span className="text-sm text-slate-600">{selectedHotel?.name} · {selectedRoom?.roomName}</span>
            <span className="text-lg font-bold text-slate-900">{currency} {applyMarkup(selectedRoom?.price || 0, markupPercent).toFixed(2)}</span>
          </div>
          {error && <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-sm">{error}</div>}
          <PaymentWidget
            secretKey={secretKey}
            returnUrl={returnUrl.toString()}
            useSandbox={useSandbox}
            onError={msg => setError(msg)}
          />
        </div>
      </div>
    );
  };

  // ── Render: booked ──
  const renderBooked = () => {
    const finalAmount = applyMarkup(getFinalAmount(), markupPercent);
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-xl mx-auto p-6 space-y-5 text-center">
          <div className="bg-green-50 rounded-full w-20 h-20 flex items-center justify-center mx-auto">
            <CheckCircle size={40} className="text-green-500" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Booking Confirmed!</h2>
            {bookingResult?.bookingId && (
              <p className="text-sm text-slate-500 mt-1">Booking ID: <span className="font-mono font-semibold">{bookingResult.bookingId}</span></p>
            )}
          </div>

          {error && <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-sm">{error}</div>}

          <div className="bg-white border border-slate-200 rounded-xl p-5 text-left space-y-2">
            <div className="flex justify-between text-sm"><span className="text-slate-500">Hotel</span><span className="font-semibold">{selectedHotel?.name}</span></div>
            <div className="flex justify-between text-sm"><span className="text-slate-500">Room</span><span>{selectedRoom?.roomName}</span></div>
            <div className="flex justify-between text-sm"><span className="text-slate-500">Check-in</span><span>{checkin}</span></div>
            <div className="flex justify-between text-sm"><span className="text-slate-500">Check-out</span><span>{checkout}</span></div>
            <div className="flex justify-between text-sm"><span className="text-slate-500">Guest</span><span>{guestFirst} {guestLast}</span></div>
            <div className="border-t border-slate-100 pt-2 flex justify-between items-center">
              <span className="font-bold">Total Paid</span>
              <span className="text-xl font-bold text-green-600">{currency} {finalAmount.toFixed(2)}</span>
            </div>
          </div>

          <div className="space-y-3">
            <button
              onClick={handleConfirmBooked}
              className="w-full py-3 bg-teal-600 text-white font-bold rounded-lg hover:bg-teal-700 transition-colors flex items-center justify-center gap-2">
              <Check size={16} /> Add to Trip Sector
            </button>
            <p className="text-xs text-slate-400">This will pre-fill the accommodation sector in your trip. You can review and save it there.</p>
          </div>
        </div>
      </div>
    );
  };

  // ── Lightbox ──
  const renderLightbox = () => {
    if (!lightboxPhotos.length) return null;
    return (
      <div className="fixed inset-0 z-[200] bg-black/90 flex flex-col items-center justify-center"
        onClick={() => setLightboxPhotos([])}>
        <button onClick={() => setLightboxPhotos([])}
          className="absolute top-4 right-4 text-white/70 hover:text-white bg-black/50 rounded-full p-2 z-10">
          <X size={20} />
        </button>
        <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/70 text-sm font-medium bg-black/50 px-3 py-1 rounded-full">
          {lightboxIndex + 1} / {lightboxPhotos.length}
        </div>
        <img
          src={lightboxPhotos[lightboxIndex]?.hd_url || lightboxPhotos[lightboxIndex]?.urlHd || lightboxPhotos[lightboxIndex]?.url}
          alt=""
          className="max-w-[90vw] max-h-[75vh] object-contain rounded-lg shadow-2xl"
          onClick={e => e.stopPropagation()}
        />
        {lightboxPhotos.length > 1 && (
          <>
            <button onClick={e => { e.stopPropagation(); setLightboxIndex(i => (i - 1 + lightboxPhotos.length) % lightboxPhotos.length); }}
              className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/60 hover:bg-black/80 text-white rounded-full flex items-center justify-center text-2xl">‹</button>
            <button onClick={e => { e.stopPropagation(); setLightboxIndex(i => (i + 1) % lightboxPhotos.length); }}
              className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/60 hover:bg-black/80 text-white rounded-full flex items-center justify-center text-2xl">›</button>
          </>
        )}
      </div>
    );
  };

  const stepContent = {
    search:       renderSearch,
    results:      renderResults,
    hotel_detail: renderHotelDetail,
    guest:        renderGuest,
    confirm:      renderConfirm,
    payment:      renderPayment,
    booked:       renderBooked,
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-slate-900 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Hotel size={20} className="text-teal-400" />
          <div>
            <h1 className="text-white font-bold text-sm">Hotel Booking</h1>
            <p className="text-slate-400 text-[11px]">Powered by Nuitee</p>
          </div>
        </div>
        {tripId && (
          <div className="text-slate-400 text-xs">
            Trip: <span className="text-slate-300 font-mono">{tripId}</span>
          </div>
        )}
      </div>

      {renderSandboxBanner()}
      <ProgressBar step={step} />

      {(stepContent[step] || renderSearch)()}
      {renderLightbox()}
    </div>
  );
}
