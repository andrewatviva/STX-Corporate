import React from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import TopBar from './TopBar';
import Sidebar from './Sidebar';
import AccessibilityToolbar from './AccessibilityToolbar';

export default function AppShell() {
  const { currentUser, authLoading } = useAuth();
  const { tenantLoading } = useTenant();

  if (authLoading || tenantLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div role="status" aria-live="polite" className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" aria-hidden="true" />
          <p className="text-sm text-gray-700">Loading…</p>
        </div>
      </div>
    );
  }

  if (!currentUser) return <Navigate to="/login" replace />;

  return (
    <div className="flex flex-col h-screen">
      {/* Skip navigation — visually hidden until focused by keyboard */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[200] focus:px-4 focus:py-2 focus:bg-blue-600 focus:text-white focus:rounded-lg focus:font-medium focus:shadow-lg"
      >
        Skip to main content
      </a>

      {/* Screen reader live region for status announcements */}
      <div id="status-announcer" aria-live="polite" aria-atomic="true" className="sr-only" />

      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto bg-gray-50 p-6 focus:outline-none">
          <Outlet />
        </main>
      </div>
      <AccessibilityToolbar />
    </div>
  );
}
