import React, { createContext, useContext, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { ROLE_PERMISSIONS } from '../utils/permissions';

const PermissionsContext = createContext({ permissions: [], hasPermission: () => false });

export function PermissionsProvider({ children }) {
  const { userProfile } = useAuth();

  const permissions = useMemo(
    () => (userProfile?.role ? ROLE_PERMISSIONS[userProfile.role] ?? [] : []),
    [userProfile]
  );

  const hasPermission = (permission) => permissions.includes(permission);

  return (
    <PermissionsContext.Provider value={{ permissions, hasPermission }}>
      {children}
    </PermissionsContext.Provider>
  );
}

export const usePermissions = () => useContext(PermissionsContext);
