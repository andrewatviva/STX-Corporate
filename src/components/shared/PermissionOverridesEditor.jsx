import React from 'react';
import { CLIENT_CONFIGURABLE_PERMISSIONS, ROLE_PERMISSIONS } from '../../utils/permissions';

export default function PermissionOverridesEditor({ role, overrides = {}, onChange }) {
  const rolePerms = ROLE_PERMISSIONS[role] ?? [];

  const currentValue = (key) => {
    if (key in overrides) return overrides[key] ? 'grant' : 'deny';
    return 'default';
  };

  const setOverride = (key, value) => {
    const next = { ...overrides };
    if (value === 'default') {
      delete next[key];
    } else {
      next[key] = value === 'grant';
    }
    onChange(next);
  };

  return (
    <div className="divide-y divide-gray-100">
      {CLIENT_CONFIGURABLE_PERMISSIONS.map(({ key, label, description }) => {
        const inRole = rolePerms.includes(key);
        const val = currentValue(key);
        return (
          <div key={key} className="flex items-start gap-3 py-2.5">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-700">{label}</p>
              <p className="text-xs text-gray-400 mt-0.5">{description}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0 pt-0.5">
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap ${
                inRole ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
              }`}>
                {inRole ? 'In role' : 'Not in role'}
              </span>
              <select
                value={val}
                onChange={e => setOverride(key, e.target.value)}
                className={`border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  val === 'grant' ? 'border-green-300 bg-green-50 text-green-700' :
                  val === 'deny'  ? 'border-red-300 bg-red-50 text-red-700' :
                                    'border-gray-200 bg-white text-gray-600'
                }`}
              >
                <option value="default">Role default</option>
                <option value="grant">Grant</option>
                <option value="deny">Deny</option>
              </select>
            </div>
          </div>
        );
      })}
    </div>
  );
}
