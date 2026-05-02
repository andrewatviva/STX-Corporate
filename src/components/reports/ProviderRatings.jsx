import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { Star } from 'lucide-react';

const TYPE_LABELS = {
  flight:        'Airline',
  accommodation: 'Hotel',
  'car-hire':    'Car Hire',
  transfers:     'Transfer Provider',
  parking:       'Parking Facility',
  meals:         'Venue',
  other:         'Provider',
};

function Stars({ value, size = 14 }) {
  return (
    <span className="flex gap-0.5 items-center" role="img" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map(n => (
        <Star
          key={n}
          size={size}
          aria-hidden="true"
          fill={value >= n ? 'currentColor' : 'none'}
          className={value >= n ? 'text-amber-400' : 'text-gray-200'}
        />
      ))}
    </span>
  );
}

function avg(arr) {
  return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
}

export default function ProviderRatings() {
  const [feedbackDocs, setFeedbackDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [minRating, setMinRating] = useState(0);

  useEffect(() => {
    getDocs(collection(db, 'tripFeedback'))
      .then(snap => setFeedbackDocs(snap.docs.map(d => d.data())))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const [accessibilityOnly, setAccessibilityOnly] = useState(false);

  const { providers, processRatings, generalComments, types } = useMemo(() => {
    const pMap = {};
    const processRatings = [];
    const generalComments = [];

    feedbackDocs.forEach(d => {
      if (d.processRating > 0) processRatings.push(d.processRating);
      if (d.generalFeedback?.trim()) generalComments.push(d.generalFeedback.trim());

      (d.providerRatings || []).forEach(r => {
        const key = `${r.type}::${r.name}`;
        if (!pMap[key]) pMap[key] = {
          name: r.name, type: r.type, stars: [], comments: [],
          accessibilityStars: [], accessibilityMetCount: { yes: 0, no: 0 }, wouldUseAgainCount: { yes: 0, no: 0 },
        };
        if (r.stars > 0) pMap[key].stars.push(r.stars);
        if (r.comment?.trim()) pMap[key].comments.push(r.comment.trim());
        if (r.accessibilityStars > 0) pMap[key].accessibilityStars.push(r.accessibilityStars);
        if (r.accessibilityMet === true)  pMap[key].accessibilityMetCount.yes++;
        if (r.accessibilityMet === false) pMap[key].accessibilityMetCount.no++;
        if (r.wouldUseAgain === true)  pMap[key].wouldUseAgainCount.yes++;
        if (r.wouldUseAgain === false) pMap[key].wouldUseAgainCount.no++;
      });
    });

    const providers = Object.values(pMap).sort((a, b) => avg(b.stars) - avg(a.stars));
    const types = [...new Set(providers.map(p => p.type))].sort();

    return { providers, processRatings, generalComments, types };
  }, [feedbackDocs]);

  const filtered = providers.filter(p => {
    if (typeFilter !== 'all' && p.type !== typeFilter) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (minRating > 0 && avg(p.stars) < minRating) return false;
    if (accessibilityOnly && p.accessibilityStars.length === 0) return false;
    return true;
  });

  const hasAnyAccessibilityRatings = providers.some(p => p.accessibilityStars.length > 0);
  const processAvg = avg(processRatings);

  if (loading) {
    return <div className="text-sm text-gray-600 py-12 text-center">Loading ratings…</div>;
  }

  if (feedbackDocs.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-600">
        <Star size={28} aria-hidden="true" className="mx-auto mb-3 text-gray-700" />
        <p className="text-sm font-medium text-gray-700">No ratings yet</p>
        <p className="text-xs mt-1">
          Ratings will appear here once travellers have rated their trips.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-600 mb-1">Total reviews</p>
          <p className="text-2xl font-bold text-gray-900">{feedbackDocs.length}</p>
        </div>
        {processRatings.length > 0 && processAvg >= 4.5 && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-600 mb-1">STX service rating</p>
            <div className="flex items-center gap-2">
              <p className="text-2xl font-bold text-gray-900">{processAvg.toFixed(1)}</p>
              <Stars value={Math.round(processAvg)} size={13} />
            </div>
            <p className="text-xs text-gray-600 mt-0.5">from {processRatings.length} response{processRatings.length !== 1 ? 's' : ''}</p>
          </div>
        )}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-600 mb-1">Providers rated</p>
          <p className="text-2xl font-bold text-gray-900">{providers.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-600 mb-1">Written comments</p>
          <p className="text-2xl font-bold text-gray-900">
            {providers.reduce((s, p) => s + p.comments.length, 0) + generalComments.length}
          </p>
        </div>
      </div>

      {/* Provider ratings */}
      {providers.length > 0 && (
        <div>
          <div className="flex flex-col gap-3 mb-3">
            <div className="flex items-center gap-3 flex-wrap">
              <h3 className="text-sm font-semibold text-gray-700">Provider Ratings</h3>
              {types.length > 1 && (
                <div className="flex gap-1 flex-wrap">
                  <button
                    onClick={() => setTypeFilter('all')}
                    className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                      typeFilter === 'all'
                        ? 'bg-teal-600 text-white border-teal-600'
                        : 'border-gray-200 text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    All
                  </button>
                  {types.map(t => (
                    <button
                      key={t}
                      onClick={() => setTypeFilter(t)}
                      className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                        typeFilter === t
                          ? 'bg-teal-600 text-white border-teal-600'
                          : 'border-gray-200 text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      {TYPE_LABELS[t] || t}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                placeholder="Search provider…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 w-48 focus:outline-none focus:ring-1 focus:ring-teal-500 placeholder:text-gray-600"
              />
              <div className="flex gap-1">
                {[0, 3, 4, 4.5].map(r => (
                  <button
                    key={r}
                    onClick={() => setMinRating(r)}
                    className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                      minRating === r
                        ? 'bg-amber-400 text-white border-amber-400'
                        : 'border-gray-200 text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    {r === 0 ? 'Any rating' : `${r}★+`}
                  </button>
                ))}
              </div>
              {hasAnyAccessibilityRatings && (
                <button
                  onClick={() => setAccessibilityOnly(v => !v)}
                  className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                    accessibilityOnly
                      ? 'bg-amber-400 text-white border-amber-400'
                      : 'border-gray-200 text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Accessibility rated only
                </button>
              )}
              {(search || minRating > 0 || accessibilityOnly) && (
                <span className="text-xs text-gray-600">
                  {filtered.length} of {providers.length}
                </span>
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {filtered.map(p => {
              const a = avg(p.stars);
              return (
                <div key={`${p.type}::${p.name}`} className="bg-white border border-gray-200 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                      <p className="text-xs text-gray-600">{TYPE_LABELS[p.type] || p.type}</p>
                    </div>
                    {p.stars.length > 0 && (
                      <div className="text-right shrink-0">
                        <div className="flex items-center gap-1.5 justify-end">
                          <Stars value={Math.round(a)} />
                          <span className="text-sm font-bold text-gray-800">{a.toFixed(1)}</span>
                        </div>
                        <p className="text-xs text-gray-600 mt-0.5">{p.stars.length} review{p.stars.length !== 1 ? 's' : ''}</p>
                      </div>
                    )}
                  </div>

                  {/* Star distribution */}
                  {p.stars.length > 1 && (
                    <div className="mt-3 space-y-1">
                      {[5, 4, 3, 2, 1].map(n => {
                        const count = p.stars.filter(s => s === n).length;
                        const pct = (count / p.stars.length) * 100;
                        return (
                          <div key={n} className="flex items-center gap-2">
                            <span className="text-xs text-gray-600 w-2">{n}</span>
                            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-amber-400 rounded-full"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-600 w-4 text-right">{count}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {p.comments.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                      {p.comments.map((c, i) => (
                        <p key={i} className="text-xs text-gray-600 italic leading-relaxed">"{c}"</p>
                      ))}
                    </div>
                  )}

                  {p.accessibilityStars.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-amber-100 space-y-1.5">
                      <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Accessibility</p>
                      <div className="flex items-center gap-2">
                        <Stars value={Math.round(avg(p.accessibilityStars))} size={12} />
                        <span className="text-xs text-gray-700">{avg(p.accessibilityStars).toFixed(1)} avg ({p.accessibilityStars.length} rated)</span>
                      </div>
                      {(p.accessibilityMetCount.yes + p.accessibilityMetCount.no) > 0 && (
                        <p className="text-xs text-gray-600">
                          Needs met: <span className="font-medium text-green-700">{p.accessibilityMetCount.yes} yes</span>
                          {p.accessibilityMetCount.no > 0 && <span className="font-medium text-red-600 ml-1">{p.accessibilityMetCount.no} no</span>}
                        </p>
                      )}
                      {(p.wouldUseAgainCount.yes + p.wouldUseAgainCount.no) > 0 && (
                        <p className="text-xs text-gray-600">
                          Would use again: <span className="font-medium text-green-700">{p.wouldUseAgainCount.yes} yes</span>
                          {p.wouldUseAgainCount.no > 0 && <span className="font-medium text-red-600 ml-1">{p.wouldUseAgainCount.no} no</span>}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* General feedback */}
      {generalComments.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">General Feedback</h3>
          <div className="space-y-2">
            {generalComments.map((c, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-lg px-4 py-3">
                <p className="text-sm text-gray-700 italic leading-relaxed">"{c}"</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
