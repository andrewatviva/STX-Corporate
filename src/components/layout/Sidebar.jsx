import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Plane, Users, FileText, BarChart2,
  Phone, Shield,
} from 'lucide-react';
import { usePermissions } from '../../contexts/PermissionsContext';
import { useTenant } from '../../contexts/TenantContext';
import { PERMISSIONS } from '../../utils/permissions';
import { useAttentionCount } from '../../hooks/useAttentionCount';

const NAV = [
  { to: '/dashboard',  label: 'Dashboard',         icon: LayoutDashboard, permission: null },
  { to: '/travel',     label: 'Travel Management', icon: Plane,           permission: PERMISSIONS.TRIP_VIEW,    badge: true },
  { to: '/profiles',  label: 'Profiles',           icon: Users,           permission: PERMISSIONS.PASSENGER_VIEW },
  { to: '/invoices',   label: 'Invoices',           icon: FileText,        permission: PERMISSIONS.INVOICE_VIEW,  feature: 'invoiceGeneration' },
  { to: '/reports',    label: 'Reports',            icon: BarChart2,       permission: PERMISSIONS.REPORT_VIEW,   feature: 'reports' },
  { to: '/team',       label: 'Team',               icon: Users,           permission: PERMISSIONS.TEAM_MANAGE },
  { to: '/admin',      label: 'Admin Panel',        icon: Shield,          permission: PERMISSIONS.CLIENT_MANAGE },
  { to: '/contact',    label: 'Contact',            icon: Phone,           permission: null },
];

function Badge({ count, tooltip }) {
  if (!count) return null;
  return (
    <span
      className="ml-auto shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white
                 text-[10px] font-bold flex items-center justify-center leading-none cursor-default"
      title={tooltip || undefined}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

export default function Sidebar() {
  const { hasPermission } = usePermissions();
  const { clientConfig, isSTX } = useTenant();
  const { count: attentionCount, tooltip: attentionTooltip } = useAttentionCount();

  const visibleNav = NAV.filter(item => {
    if (item.permission && !hasPermission(item.permission)) return false;
    if (item.feature && !isSTX && clientConfig?.features?.[item.feature] === false) return false;
    return true;
  });

  return (
    <nav className="w-56 bg-gray-900 flex flex-col shrink-0">
      <div className="flex-1 py-4">
        {visibleNav.map(({ to, label, icon: Icon, badge }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`
            }
          >
            <Icon size={16} />
            {label}
            {badge && <Badge count={attentionCount} tooltip={attentionTooltip} />}
          </NavLink>
        ))}
      </div>
      <div className="p-4 border-t border-gray-800">
        <p className="text-xs text-gray-600">STX Corporate Portal</p>
        <p className="text-xs text-gray-700">v2.0</p>
      </div>
    </nav>
  );
}
