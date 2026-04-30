import { useState, useEffect, useMemo } from 'react';
import { collection, collectionGroup, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import { ROLE_PERMISSIONS } from '../utils/permissions';
import { useApprovalScope, matchesApprovalScope } from './useApprovalScope';

export function useAttentionCount() {
  const { userProfile } = useAuth();
  const { isSTX, clientId, activeClientId } = useTenant();
  const [trips, setTrips] = useState([]);

  const role = userProfile?.role;
  const uid  = userProfile?.uid;

  // Resolve effective approval permission (role default overridden by permissionOverrides)
  const overrides = userProfile?.permissionOverrides || {};
  const roleHasApprove = !!(ROLE_PERMISSIONS[role]?.includes('trip:approve'));
  const hasApprovePermission = 'trip:approve' in overrides
    ? overrides['trip:approve'] === true
    : roleHasApprove;

  // Approval scope — for users whose badge is filtered by who they can approve for
  const approvalScope = useApprovalScope(userProfile, isSTX ? null : clientId);

  useEffect(() => {
    if (!role || !uid) return;

    let statuses;
    if (['stx_admin', 'stx_ops', 'client_ops'].includes(role)) {
      statuses = ['pending_approval', 'approved'];
    } else if (hasApprovePermission) {
      statuses = ['pending_approval'];
    } else if (role === 'client_traveller') {
      statuses = ['declined'];
    } else {
      return;
    }

    let q;
    if (isSTX) {
      if (activeClientId) {
        q = query(
          collection(db, 'clients', activeClientId, 'trips'),
          where('status', 'in', statuses)
        );
      } else {
        q = query(collectionGroup(db, 'trips'), where('status', 'in', statuses));
      }
    } else {
      if (!clientId) return;
      q = query(
        collection(db, 'clients', clientId, 'trips'),
        where('status', 'in', statuses)
      );
    }

    const unsub = onSnapshot(q, snap => {
      setTrips(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => setTrips([]));
    return unsub;
  }, [role, uid, isSTX, clientId, activeClientId, hasApprovePermission]);

  return useMemo(() => {
    if (!role || !uid) return { count: 0, tooltip: null };

    // STX + client_ops: full ops badge — pending to approve + approved to book
    if (['stx_admin', 'stx_ops', 'client_ops'].includes(role)) {
      const pendingCount  = trips.filter(t => t.status === 'pending_approval').length;
      const approvedCount = trips.filter(t => t.status === 'approved').length;
      const count = pendingCount + approvedCount;
      const parts = [];
      if (pendingCount  > 0) parts.push(`${pendingCount} pending approval`);
      if (approvedCount > 0) parts.push(`${approvedCount} to book`);
      return { count, tooltip: parts.length > 0 ? parts.join(' · ') : null };
    }

    // Approver badge — scoped to trips this user can actually approve
    if (hasApprovePermission) {
      const count = trips.filter(t =>
        t.status === 'pending_approval' && matchesApprovalScope(approvalScope, t)
      ).length;
      return { count, tooltip: count > 0 ? `${count} pending your approval` : null };
    }

    // Traveller badge — declined trips
    if (role === 'client_traveller') {
      const count = trips.filter(t =>
        t.travellerId === uid || t.createdBy === uid
      ).length;
      return { count, tooltip: count > 0 ? `${count} trip${count !== 1 ? 's' : ''} declined` : null };
    }

    return { count: 0, tooltip: null };
  }, [trips, role, uid, hasApprovePermission, approvalScope]);
}
