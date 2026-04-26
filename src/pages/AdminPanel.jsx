import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Building2, Users } from 'lucide-react';
import { usePermissions } from '../contexts/PermissionsContext';
import { PERMISSIONS } from '../utils/permissions';
import ClientManager from '../components/admin/ClientManager';
import UserManager from '../components/admin/UserManager';

const TABS = [
  { id: 'clients', label: 'Clients',  icon: Building2 },
  { id: 'users',   label: 'Users',    icon: Users },
];

export default function AdminPanel() {
  const { hasPermission } = usePermissions();
  const [tab, setTab] = useState('clients');

  if (!hasPermission(PERMISSIONS.CLIENT_MANAGE)) return <Navigate to="/dashboard" replace />;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-1">Admin Panel</h1>
      <p className="text-sm text-gray-500 mb-6">Manage client tenants and users across the platform.</p>

      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {tab === 'clients' && <ClientManager />}
      {tab === 'users'   && <UserManager />}
    </div>
  );
}
