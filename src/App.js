import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import { AuthProvider, useAuth } from './contexts/AuthContext';
import { TenantProvider } from './contexts/TenantContext';
import { PermissionsProvider } from './contexts/PermissionsContext';

import AppShell from './components/layout/AppShell';
import LoginPage from './components/auth/LoginPage';

import Dashboard        from './pages/Dashboard';
import TravelManagement from './pages/TravelManagement';
import Profiles         from './pages/Profiles';
import Invoices         from './pages/Invoices';
import Reports          from './pages/Reports';
import Team             from './pages/Team';
import AdminPanel       from './pages/AdminPanel';
import Contact          from './pages/Contact';
import HotelBookingPage from './pages/HotelBookingPage';

function AuthGate({ children }) {
  const { currentUser, authLoading } = useAuth();
  if (authLoading) return null;
  if (!currentUser) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <TenantProvider>
        <PermissionsProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route
                element={
                  <AuthGate>
                    <AppShell />
                  </AuthGate>
                }
              >
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/travel"    element={<TravelManagement />} />
                <Route path="/profiles"  element={<Profiles />} />
                <Route path="/invoices"  element={<Invoices />} />
                <Route path="/reports"   element={<Reports />} />
                <Route path="/team"      element={<Team />} />
                <Route path="/admin"     element={<AdminPanel />} />
                <Route path="/contact"   element={<Contact />} />
              </Route>
              <Route
                path="/hotel-booking"
                element={
                  <AuthGate>
                    <HotelBookingPage />
                  </AuthGate>
                }
              />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </BrowserRouter>
        </PermissionsProvider>
      </TenantProvider>
    </AuthProvider>
  );
}
