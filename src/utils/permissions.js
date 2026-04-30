export const PERMISSIONS = {
  TRIP_VIEW:        'trip:view',
  TRIP_CREATE:      'trip:create',
  TRIP_EDIT:        'trip:edit',
  TRIP_APPROVE:     'trip:approve',
  TRIP_DELETE:      'trip:delete',
  TRIP_VIEW_ALL:    'trip:view_all',

  PASSENGER_VIEW:   'passenger:view',
  PASSENGER_EDIT:   'passenger:edit',

  INVOICE_VIEW:     'invoice:view',
  INVOICE_GENERATE: 'invoice:generate',

  REPORT_VIEW:      'report:view',
  REPORT_VIEW_ALL:  'report:view_all',

  USER_MANAGE:      'user:manage',
  TEAM_MANAGE:      'team:manage',
  CLIENT_MANAGE:    'client:manage',
  SETTINGS_EDIT:    'settings:edit',
};

export const ROLE_PERMISSIONS = {
  stx_admin: Object.values(PERMISSIONS),

  stx_ops: [
    'trip:view', 'trip:create', 'trip:edit', 'trip:approve', 'trip:view_all',
    'passenger:view', 'passenger:edit',
    'invoice:view', 'invoice:generate',
    'report:view', 'report:view_all',
    'user:manage', 'team:manage',
  ],

  client_ops: [
    'trip:view', 'trip:create', 'trip:edit', 'trip:approve', 'trip:view_all',
    'passenger:view', 'passenger:edit',
    'invoice:view',
    'report:view',
    'team:manage',
  ],

  client_approver: [
    'trip:view', 'trip:approve',
    'passenger:view',
    'report:view',
  ],

  client_traveller: [
    'trip:view',
    'passenger:view',
  ],
};

export const ROLE_LABELS = {
  stx_admin:        'STX Admin',
  stx_ops:          'STX Operations',
  client_ops:       'Client Operations',
  client_approver:  'Client Approver',
  client_traveller: 'Traveller',
};

export const STX_ROLES = ['stx_admin', 'stx_ops'];
export const CLIENT_ROLES = ['client_ops', 'client_approver', 'client_traveller'];

// Permissions that STX (or client_ops with the feature enabled) can override per user.
// Invoice access is handled separately via the invoiceAccess field.
export const CLIENT_CONFIGURABLE_PERMISSIONS = [
  {
    key: 'trip:create',
    label: 'Create trips',
    description: 'Submit new travel requests. Included in Operations and Traveller roles by default.',
  },
  {
    key: 'trip:edit',
    label: 'Edit trips',
    description: 'Modify existing trip details, sectors, and costs. Included in Operations role only.',
  },
  {
    key: 'trip:approve',
    label: 'Approve trips',
    description: 'Approve or decline travel requests. Included in Operations and Approver roles by default.',
  },
  {
    key: 'trip:view_all',
    label: 'View all team trips',
    description: 'See trips across the entire client account, not just their own. Included in Operations role only.',
  },
  {
    key: 'trip:delete',
    label: 'Delete trips',
    description: 'Permanently remove trip records. Not included in any client role by default — use with caution.',
  },
  {
    key: 'passenger:edit',
    label: 'Edit passenger profiles',
    description: 'Create and update passenger profiles. Included in Operations role only.',
  },
  {
    key: 'report:view',
    label: 'View reports',
    description: 'Access analytics and spend reports. Included in Operations and Approver roles.',
  },
  {
    key: 'team:manage',
    label: 'Manage team members',
    description: 'Add, edit, and deactivate staff accounts. Included in Operations role only.',
  },
];
