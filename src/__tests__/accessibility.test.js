/**
 * WCAG 2.1 AA automated accessibility tests using jest-axe.
 * These catch regressions — new violations will fail CI.
 *
 * Components that require Firebase/auth context are wrapped with mocks.
 * Components that require complex setup are smoke-tested with minimal props.
 */

import React from 'react';
import { render } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { MemoryRouter } from 'react-router-dom';

expect.extend(toHaveNoViolations);

// ── Minimal context mocks ─────────────────────────────────────────────────────

jest.mock('../firebase', () => ({ db: {}, auth: {}, storage: {} }));

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    currentUser: { uid: 'test-uid', email: 'test@example.com' },
    userProfile: { role: 'stx_admin', firstName: 'Test', lastName: 'User', email: 'test@example.com' },
  }),
}));

jest.mock('../contexts/TenantContext', () => ({
  useTenant: () => ({
    clientId: 'test-client',
    isSTX: false,
    activeClientId: null,
    clientName: 'Test Client',
    activeClientName: null,
    clientConfig: {},
    activeClientConfig: {},
  }),
}));

jest.mock('../contexts/PermissionsContext', () => ({
  usePermissions: () => ({
    hasPermission: () => true,
    permissions: new Set(['trip:view', 'trip:create', 'report:view']),
  }),
}));

// ── Shared components ─────────────────────────────────────────────────────────

import Modal from '../components/shared/Modal';

describe('Modal', () => {
  it('has no axe violations', async () => {
    const { container } = render(
      <Modal title="Test Modal" onClose={() => {}}>
        <p>Modal content for accessibility testing</p>
        <button>Action</button>
      </Modal>
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

// ── Auth ──────────────────────────────────────────────────────────────────────

import LoginPage from '../components/auth/LoginPage';

jest.mock('firebase/auth', () => ({
  getAuth: () => ({}),
  signInWithEmailAndPassword: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
}));

describe('LoginPage', () => {
  it('has no axe violations', async () => {
    const { container } = render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

// ── Trip list ─────────────────────────────────────────────────────────────────

import TripList from '../components/trips/TripList';

const SAMPLE_TRIPS = [
  {
    id: 'trip-1',
    title: 'Sydney Conference',
    travellerName: 'Jane Smith',
    travellerId: 'uid-1',
    status: 'approved',
    tripType: 'STX-Managed',
    costCentre: 'Operations',
    startDate: '2026-06-01',
    endDate: '2026-06-03',
    originCity: 'Melbourne',
    destinationCity: 'Sydney',
    sectors: [{ type: 'flight', cost: '450', international: false }],
    fees: [],
    createdAt: '2026-05-01T00:00:00.000Z',
  },
];

describe('TripList', () => {
  it('has no axe violations with trips', async () => {
    const { container } = render(
      <TripList
        trips={SAMPLE_TRIPS}
        loading={false}
        onNew={() => {}}
        onView={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        canCreate={true}
      />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('has no axe violations when empty', async () => {
    const { container } = render(
      <TripList
        trips={[]}
        loading={false}
        onNew={() => {}}
        onView={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        canCreate={false}
      />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('has no axe violations in loading state', async () => {
    const { container } = render(
      <TripList
        trips={[]}
        loading={true}
        onNew={() => {}}
        onView={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        canCreate={false}
      />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

// ── Shared: StatusBadge, LeadTimeBadge ────────────────────────────────────────

import { StatusBadge, LeadTimeBadge } from '../components/trips/TripList';

describe('StatusBadge', () => {
  const statuses = ['draft', 'pending_approval', 'approved', 'declined', 'booked', 'cancelled'];

  statuses.forEach(status => {
    it(`has no axe violations for status "${status}"`, async () => {
      const { container } = render(<StatusBadge status={status} />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });
});

describe('LeadTimeBadge', () => {
  [0, 5, 15, 30].forEach(days => {
    it(`has no axe violations for ${days} days`, async () => {
      const { container } = render(<LeadTimeBadge days={days} />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });
});

// ── TripRatingModal ───────────────────────────────────────────────────────────

import TripRatingModal from '../components/trips/TripRatingModal';

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(),
  setDoc: jest.fn(),
  serverTimestamp: jest.fn(),
  collection: jest.fn(),
  addDoc: jest.fn(),
  getDoc: jest.fn(() => Promise.resolve({ exists: () => false })),
  onSnapshot: jest.fn(() => () => {}),
  query: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  getDocs: jest.fn(() => Promise.resolve({ docs: [] })),
  updateDoc: jest.fn(),
}));

describe('TripRatingModal', () => {
  it('has no axe violations', async () => {
    const { container } = render(
      <TripRatingModal
        trip={{ id: 'trip-1', title: 'Sydney Conference', sectors: [] }}
        onClose={() => {}}
      />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
