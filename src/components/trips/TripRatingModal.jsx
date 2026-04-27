import React, { useState } from 'react';
import { X, Star } from 'lucide-react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';

function StarInput({ value, onChange }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          className="p-0.5 transition-colors"
        >
          <Star
            size={20}
            fill={(hover || value) >= n ? 'currentColor' : 'none'}
            className={(hover || value) >= n ? 'text-amber-400' : 'text-gray-300'}
          />
        </button>
      ))}
    </div>
  );
}

const PROVIDER_LABEL = {
  flight: 'Airline',
  accommodation: 'Hotel',
  'car-hire': 'Car Hire',
  transfers: 'Transfer Provider',
  parking: 'Parking Facility',
  meals: 'Venue',
  other: 'Provider',
};

function extractProviders(sectors) {
  const seen = new Set();
  const providers = [];

  (sectors || []).forEach((s, i) => {
    let name = null;
    if (s.type === 'flight') name = s.airline;
    else if (s.type === 'accommodation') name = s.propertyName;
    else if (s.type === 'car-hire') name = s.company;
    else if (s.type === 'transfers') name = s.provider;
    else if (s.type === 'parking') name = s.facility;
    else if (s.type === 'meals') name = s.venue;
    else if (s.type === 'other') name = s.provider;

    if (name && !seen.has(name)) {
      seen.add(name);
      providers.push({ name, type: s.type, sectorIndex: i });
    }
  });

  return providers;
}

export default function TripRatingModal({ trip, onClose, existingRating }) {
  const { userProfile } = useAuth();
  const providers = extractProviders(trip.sectors);

  const [ratings, setRatings] = useState(() => {
    const base = Object.fromEntries(providers.map(p => [p.name, { stars: 0, comment: '' }]));
    if (existingRating) {
      (existingRating.providerRatings || []).forEach(r => {
        if (base[r.name]) base[r.name] = { stars: r.stars || 0, comment: r.comment || '' };
      });
    }
    return base;
  });
  const [processRating, setProcessRating] = useState(existingRating?.processRating || 0);
  const [generalFeedback, setGeneralFeedback] = useState(existingRating?.generalFeedback || '');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const uid = userProfile.uid;
      const docId = `${trip.id}_${uid}`;

      const providerRatings = providers
        .filter(p => (ratings[p.name]?.stars > 0) || ratings[p.name]?.comment?.trim())
        .map(p => ({
          name: p.name,
          type: p.type,
          stars: ratings[p.name]?.stars || 0,
          comment: ratings[p.name]?.comment?.trim() || '',
        }));

      await setDoc(doc(db, 'tripFeedback', docId), {
        tripId: trip.id,
        tripTitle: trip.title || '',
        ratedBy: uid,
        clientId: trip.clientId || '',
        ratedAt: serverTimestamp(),
        providerRatings,
        processRating,
        generalFeedback: generalFeedback.trim(),
      });

      onClose(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-xl">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Rate your trip</h2>
            {trip.title && <p className="text-xs text-gray-400 mt-0.5">{trip.title}</p>}
          </div>
          <button
            onClick={() => onClose(false)}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-6">
          {/* Provider ratings */}
          {providers.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-800 mb-3">Rate your providers</p>
              <div className="space-y-3">
                {providers.map(p => (
                  <div key={p.name} className="border border-gray-200 rounded-lg p-3.5">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{p.name}</p>
                        <p className="text-xs text-gray-400">{PROVIDER_LABEL[p.type] || p.type}</p>
                      </div>
                      <StarInput
                        value={ratings[p.name]?.stars || 0}
                        onChange={stars => setRatings(r => ({ ...r, [p.name]: { ...r[p.name], stars } }))}
                      />
                    </div>
                    <textarea
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-700 resize-none"
                      rows={2}
                      placeholder="Comment on accessibility, service, or anything else (optional)"
                      value={ratings[p.name]?.comment || ''}
                      onChange={e => setRatings(r => ({ ...r, [p.name]: { ...r[p.name], comment: e.target.value } }))}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STX service rating */}
          <div className="border border-gray-200 rounded-lg p-3.5">
            <p className="text-sm font-medium text-gray-800 mb-2">Overall STX service</p>
            <p className="text-xs text-gray-400 mb-2">How would you rate the booking process and support from STX?</p>
            <StarInput value={processRating} onChange={setProcessRating} />
          </div>

          {/* General feedback */}
          <div>
            <p className="text-sm font-medium text-gray-800 mb-2">General feedback</p>
            <textarea
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-700"
              rows={4}
              placeholder="Any other feedback on this trip, the process, or providers — this helps us improve accessibility outcomes for future travellers."
              value={generalFeedback}
              onChange={e => setGeneralFeedback(e.target.value)}
            />
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-200 flex items-center justify-between">
          <p className="text-xs text-gray-400">Your identity is not shown in aggregated reports.</p>
          <div className="flex gap-2">
            <button
              onClick={() => onClose(false)}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="px-4 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 disabled:opacity-50"
            >
              {saving ? 'Submitting…' : existingRating ? 'Update rating' : 'Submit rating'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
