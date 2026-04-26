import React, { createContext, useContext, useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './AuthContext';
import { STX_ROLES } from '../utils/permissions';

const TenantContext = createContext(null);

// Sensible defaults so components never crash on missing config fields
const CONFIG_DEFAULTS = {
  branding: {
    logo: null,
    primaryColor: '#1e40af',
    secondaryColor: '#93c5fd',
    portalTitle: 'STX Corporate Travel',
  },
  dropdowns: {
    costCentres: [],
    tripTypes: ['Self-Managed', 'STX-Managed', 'Group Event'],
    sectorTypes: ['Flight', 'Accommodation', 'Car Hire', 'Parking', 'Transfers', 'Meals', 'Other'],
    idTypes: ['Passport', 'Drivers Licence', 'Proof of Age Card', 'Other'],
  },
  fees: {
    managementFeeEnabled: false,
    managementFeeAmount: 0,
    managementFeeLabel: 'Management Fee',
    amendmentFeeEnabled: false,
    amendmentFeeAmount: 0,
    gstRate: 0.10,
  },
  workflow: {
    requiresApproval: true,
    approvalLevels: 1,
    emailNotifications: false,
  },
  features: {
    hotelBooking: true,
    invoiceGeneration: true,
    reports: true,
    accessibilityToolbar: true,
    groupEvents: true,
    fileAttachments: true,
    selfManagedTrips: true,
  },
  hotelBooking: {
    nuiteeFeed: 'vivatravelholdingscug',
    bookingPasswordEnabled: false,
  },
};

function mergeWithDefaults(config) {
  if (!config) return CONFIG_DEFAULTS;
  return {
    ...CONFIG_DEFAULTS,
    ...config,
    branding:     { ...CONFIG_DEFAULTS.branding,     ...config.branding },
    dropdowns:    { ...CONFIG_DEFAULTS.dropdowns,    ...config.dropdowns },
    fees:         { ...CONFIG_DEFAULTS.fees,         ...config.fees },
    workflow:     { ...CONFIG_DEFAULTS.workflow,     ...config.workflow },
    features:     { ...CONFIG_DEFAULTS.features,     ...config.features },
    hotelBooking: { ...CONFIG_DEFAULTS.hotelBooking, ...config.hotelBooking },
  };
}

export function TenantProvider({ children }) {
  const { userProfile } = useAuth();
  const [clientConfig, setClientConfig]     = useState(null);
  const [clientId, setClientId]             = useState(null);
  const [tenantLoading, setTenantLoading]   = useState(true);

  const isSTX = userProfile && STX_ROLES.includes(userProfile.role);

  useEffect(() => {
    if (!userProfile) {
      setClientConfig(null);
      setClientId(null);
      setTenantLoading(false);
      return;
    }

    // STX staff have no tenant — they operate globally
    if (isSTX) {
      setClientConfig(null);
      setClientId(null);
      setTenantLoading(false);
      return;
    }

    const cid = userProfile.clientId;
    if (!cid) {
      setTenantLoading(false);
      return;
    }

    setClientId(cid);
    const unsub = onSnapshot(
      doc(db, 'clients', cid, 'config', 'settings'),
      (snap) => {
        setClientConfig(mergeWithDefaults(snap.exists() ? snap.data() : null));
        setTenantLoading(false);
      }
    );
    return unsub;
  }, [userProfile, isSTX]);

  return (
    <TenantContext.Provider value={{ clientId, clientConfig, tenantLoading, isSTX }}>
      {children}
    </TenantContext.Provider>
  );
}

export const useTenant = () => useContext(TenantContext);
