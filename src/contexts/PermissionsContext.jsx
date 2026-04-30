import React, { createContext, useContext, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { ROLE_PERMISSIONS } from '../utils/permissions';

const INVOICE_PERMISSIONS = ['invoice:view', 'invoice:generate'];

const PermissionsContext = createContext({ permissions: [], hasPermission: () => false });

export function PermissionsProvider({ children }) {
  const { userProfile } = useAuth();

  const rolePermissions = useMemo(
    () => (userProfile?.role ? ROLE_PERMISSIONS[userProfile.role] ?? [] : []),
    [userProfile]
  );

  const hasPermission = (permission) => {
    // Per-user permission override — explicit grant or deny takes priority over everything
    const overrides = userProfile?.permissionOverrides;
    if (overrides && permission in overrides) {
      return overrides[permission] === true;
    }
    // Invoice permissions: user-level flag overrides role default
    if (INVOICE_PERMISSIONS.includes(permission)) {
      const flag = userProfile?.invoiceAccess;
      if (flag === true)  return true;
      if (flag === false) return false;
      // undefined → fall through to role
    }
    return rolePermissions.includes(permission);
  };

  return (
    <PermissionsContext.Provider value={{ permissions: rolePermissions, hasPermission }}>
      {children}
    </PermissionsContext.Provider>
  );
}

export const usePermissions = () => useContext(PermissionsContext);
