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
    'trip:view', 'trip:create', 'trip:edit',
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
