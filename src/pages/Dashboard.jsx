import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';

export default function Dashboard() {
  const { userProfile } = useAuth();
  const { clientConfig, isSTX } = useTenant();

  const title = isSTX
    ? 'STX Global Dashboard'
    : clientConfig?.branding?.portalTitle ?? 'Dashboard';

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-1">{title}</h1>
      <p className="text-gray-500 text-sm mb-6">
        Welcome back, {userProfile?.displayName || userProfile?.email}
      </p>
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
        <p className="text-lg font-medium mb-1">Dashboard</p>
        <p className="text-sm">Coming in Phase 4 — trip stats and recent activity will appear here.</p>
      </div>
    </div>
  );
}
