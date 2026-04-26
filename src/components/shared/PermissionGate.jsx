import { usePermissions } from '../../contexts/PermissionsContext';

export default function PermissionGate({ permission, fallback = null, children }) {
  const { hasPermission } = usePermissions();
  return hasPermission(permission) ? children : fallback;
}
