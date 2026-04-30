import React, { useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { Building2, Users, MessageSquare } from 'lucide-react';
import { usePermissions } from '../contexts/PermissionsContext';
import { PERMISSIONS } from '../utils/permissions';
import ClientManager from '../components/admin/ClientManager';
import UserManager from '../components/admin/UserManager';
import FeedbackManager from '../components/admin/FeedbackManager';

const TABS = [
  { id: 'clients',  label: 'Clients',           icon: Building2 },
  { id: 'users',    label: 'Users',              icon: Users },
  { id: 'feedback', label: 'Feedback & Faults',  icon: MessageSquare },
];

export default function AdminPanel() {
  const { hasPermission } = usePermissions();
  const [searchParams] = useSearchParams();

  const initialTab = TABS.some(t => t.id === searchParams.get('tab'))
    ? searchParams.get('tab')
    : 'clients';
  const initialId = searchParams.get('id') || null;

  const [tab, setTab] = useState(initialTab);

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

      {tab === 'clients'  && <ClientManager />}
      {tab === 'users'    && <UserManager />}
      {tab === 'feedback' && <FeedbackManager initialId={initialId} />}
    </div>
  );
}
