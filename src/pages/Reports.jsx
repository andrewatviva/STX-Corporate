import React, { useState, useMemo, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import { useTrips } from '../hooks/useTrips';
import { useTeamScope, filterTripsByScope } from '../hooks/useTeamScope';
import PermissionGate from '../components/shared/PermissionGate';
import { PERMISSIONS } from '../utils/permissions';
import AllTravelReport from '../components/reports/AllTravelReport';
import AvgSpendByDestination from '../components/reports/AvgSpendByDestination';
import SpendByDepartureCity from '../components/reports/SpendByDepartureCity';
import HotelPopularity from '../components/reports/HotelPopularity';
import TravelPolicy from '../components/reports/TravelPolicy';
import ProviderRatings from '../components/reports/ProviderRatings';

const TABS = [
  { key: 'all_travel',       label: 'All Travel' },
  { key: 'avg_dest',         label: 'Avg Spend by Destination' },
  { key: 'departure',        label: 'Spend by Departure City' },
  { key: 'hotel',            label: 'Hotel Popularity' },
  { key: 'policy',           label: 'Travel Policy' },
  { key: 'provider_ratings', label: 'Provider Ratings', global: true },
];

const BLURBS = {
  all_travel:       'A complete list of all trips across your organisation. Filter by date basis, status, trip type, and cost centre to drill into any segment. Use the booking window column to spot late-notice travel.',
  avg_dest:         'Shows the average and total cost of trips broken down by destination city, with an optional per-sector breakdown. Useful for benchmarking spend and identifying high-cost destinations.',
  departure:        'Groups total and average spend by the city each trip departs from. Helps you understand where most travel originates and compare costs across locations.',
  hotel:            'Ranks hotels by booking frequency within each destination, with average nightly rates. Use this to identify preferred suppliers, track usage patterns, and support rate negotiation.',
  policy:           'Compares actual accommodation and flight spend against your organisation\'s configured policy limits by city. Flags bookings that exceed thresholds so you can track and report on compliance.',
  provider_ratings: 'Anonymised ratings and feedback submitted by travellers after their trips. Covers accessibility, service quality, and overall experience across airlines, hotels, and other providers.',
};

export default function Reports() {
  useEffect(() => {
    document.title = 'Reports — STX Connect';
  }, []);

  const { userProfile } = useAuth();
  const { clientId: tenantClientId, activeClientId, isSTX, clientConfig, activeClientConfig } = useTenant();
  const [activeTab, setActiveTab] = useState('all_travel');

  const clientId = isSTX ? activeClientId : tenantClientId;
  const effectiveConfig = isSTX ? activeClientConfig : clientConfig;

  const { trips, loading } = useTrips(clientId, isSTX, isSTX ? activeClientId : null);
  const scope = useTeamScope(userProfile, clientId);
  const scopedTrips = useMemo(
    () => filterTripsByScope(trips, scope, userProfile),
    [trips, scope, userProfile]
  );

  // Hide Travel Policy tab if both sub-policies are disabled
  const showPolicyTab = effectiveConfig?.features?.accommodationPolicy !== false
    || effectiveConfig?.features?.flightPolicy === true;

  const visibleTabs = TABS.filter(t => t.key !== 'policy' || showPolicyTab);
  const activeTabIsGlobal = TABS.find(t => t.key === activeTab)?.global;

  if (isSTX && !activeClientId && !activeTabIsGlobal) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-800 mb-6">Reports</h1>

        <div className="flex gap-1 mb-6 border-b border-gray-200 overflow-x-auto">
          {visibleTabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 -mb-px whitespace-nowrap transition-colors ${
                activeTab === tab.key
                  ? 'border-teal-600 text-teal-600 bg-white'
                  : 'border-transparent text-gray-700 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-600">
          <p className="text-sm">Select a client from the top bar to view this report.</p>
        </div>
      </div>
    );
  }

  return (
    <PermissionGate permission={PERMISSIONS.REPORT_VIEW}>
      <div>
        <h1 className="text-2xl font-bold text-gray-800 mb-6">Reports</h1>

        <div className="flex gap-1 mb-6 border-b border-gray-200 overflow-x-auto">
          {visibleTabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 -mb-px whitespace-nowrap transition-colors ${
                activeTab === tab.key
                  ? 'border-teal-600 text-teal-600 bg-white'
                  : 'border-transparent text-gray-700 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {BLURBS[activeTab] && (
          <p className="text-sm text-gray-700 mb-5 max-w-3xl leading-relaxed">{BLURBS[activeTab]}</p>
        )}

        {activeTab === 'provider_ratings' ? (
          <ProviderRatings />
        ) : loading ? (
          <div className="text-center py-12 text-gray-600 text-sm">Loading trips…</div>
        ) : (
          <>
            {activeTab === 'all_travel' && <AllTravelReport  trips={scopedTrips} userProfile={userProfile} />}
            {activeTab === 'avg_dest'   && <AvgSpendByDestination trips={scopedTrips} />}
            {activeTab === 'departure'  && <SpendByDepartureCity  trips={scopedTrips} />}
            {activeTab === 'hotel'      && <HotelPopularity       trips={scopedTrips} />}
            {activeTab === 'policy'     && <TravelPolicy trips={scopedTrips} clientId={clientId} isSTX={isSTX} clientConfig={effectiveConfig} />}
          </>
        )}
      </div>
    </PermissionGate>
  );
}
