import React, { createContext, useContext, useState, useEffect } from 'react';
import { doc, onSnapshot, collection, getDoc } from 'firebase/firestore';
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
    managementFeeAppliesTo: [],
    amendmentFeeEnabled: false,
    amendmentFeeAmount: 0,
    amendmentFeeAppliesTo: [],
    gstRate: 0.10,
  },
  workflow: {
    requiresApproval: true,
    approvalLevels: 1,
    emailNotifications: false,
    approvalByTripType: null,
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
  contact: {
    email: 'enquiries@supportedtravelx.com.au',
    stxNotifyEmail: '',
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
    contact:      { ...CONFIG_DEFAULTS.contact,      ...config.contact },
  };
}

export function TenantProvider({ children }) {
  const { userProfile } = useAuth();
  const [clientConfig, setClientConfig]   = useState(null);
  const [clientId, setClientId]           = useState(null);
  const [clientName, setClientName]       = useState('');
  const [tenantLoading, setTenantLoading] = useState(true);

  // STX working-client context
  const [clientsList, setClientsList]           = useState([]);
  const [activeClientId, setActiveClientId]     = useState(null);
  const [activeClientConfig, setActiveClientConfig] = useState(null);

  const isSTX = userProfile && STX_ROLES.includes(userProfile.role);

  // ── own tenant config (non-STX users) ────────────────────────────────────
  useEffect(() => {
    if (!userProfile) {
      setClientConfig(null);
      setClientId(null);
      setTenantLoading(false);
      return;
    }

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
    // Load the client's display name from the root document
    getDoc(doc(db, 'clients', cid)).then(snap => {
      if (snap.exists()) setClientName(snap.data()?.name || '');
    });
    const unsub = onSnapshot(
      doc(db, 'clients', cid, 'config', 'settings'),
      (snap) => {
        setClientConfig(mergeWithDefaults(snap.exists() ? snap.data() : null));
        setTenantLoading(false);
      }
    );
    return unsub;
  }, [userProfile, isSTX]);

  // ── clients list (STX only) ───────────────────────────────────────────────
  useEffect(() => {
    if (!isSTX) return;
    const unsub = onSnapshot(collection(db, 'clients'), snap => {
      setClientsList(
        snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(c => c.active !== false)
          .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      );
    });
    return unsub;
  }, [isSTX]);

  // ── active client config (STX working-client) ─────────────────────────────
  useEffect(() => {
    if (!isSTX || !activeClientId) {
      setActiveClientConfig(null);
      return;
    }
    const unsub = onSnapshot(
      doc(db, 'clients', activeClientId, 'config', 'settings'),
      snap => setActiveClientConfig(mergeWithDefaults(snap.exists() ? snap.data() : null))
    );
    return unsub;
  }, [isSTX, activeClientId]);

  // Resolved display name — works for both STX (from clientsList) and client users
  const activeClientName = isSTX && activeClientId
    ? (clientsList.find(c => c.id === activeClientId)?.name || '')
    : '';

  return (
    <TenantContext.Provider value={{
      clientId,
      clientConfig,
      clientName,         // non-STX: org name from clients/{id}
      tenantLoading,
      isSTX,
      // STX working-client
      clientsList,
      activeClientId,
      setActiveClientId,
      activeClientConfig,
      activeClientName,   // STX: name of the currently selected client
    }}>
      {children}
    </TenantContext.Provider>
  );
}

export const useTenant = () => useContext(TenantContext);
