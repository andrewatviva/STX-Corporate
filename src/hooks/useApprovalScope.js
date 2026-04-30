import { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { ROLE_PERMISSIONS } from '../utils/permissions';

const STX_ROLES = ['stx_admin', 'stx_ops'];

/**
 * Resolves the effective approval scope for the given user.
 *
 * Returns:
 *   null        — can approve trips for ALL users in the client
 *   Set<uid>    — can only approve trips where trip.travellerId is in this set
 *   'none'      — has no approval permission at all
 *
 * When approveScope === 'reports', subscribes to the client's users collection
 * to build the reporting hierarchy set in real time.
 */
export function useApprovalScope(userProfile, clientId) {
  const [members, setMembers] = useState([]);

  const role     = userProfile?.role;
  const isSTX    = STX_ROLES.includes(role);
  const overrides = userProfile?.permissionOverrides || {};
  const roleHasApprove = !isSTX && !!(ROLE_PERMISSIONS[role]?.includes('trip:approve'));
  const hasApprovePermission = 'trip:approve' in overrides
    ? overrides['trip:approve'] === true
    : roleHasApprove;

  const approveScope       = userProfile?.approveScope;
  const approveFor         = userProfile?.approveFor || [];
  const effectiveScope     = approveScope ?? (approveFor.length > 0 ? 'select' : 'all');
  const approveReportsDepth = userProfile?.approveReportsDepth || 1;

  // Stable primitive key to avoid re-running memo on array identity changes
  const approveForKey = approveFor.join(',');

  useEffect(() => {
    if (isSTX || !hasApprovePermission) return;
    if (effectiveScope !== 'reports') return;
    if (!clientId || !userProfile?.uid) return;

    const q = query(collection(db, 'users'), where('clientId', '==', clientId));
    const unsub = onSnapshot(q, snap => {
      setMembers(snap.docs.map(d => ({ id: d.id, managerId: d.data().managerId })));
    });
    return unsub;
  }, [isSTX, hasApprovePermission, effectiveScope, clientId, userProfile?.uid]);

  return useMemo(() => {
    if (isSTX) return null;
    if (!hasApprovePermission) return 'none';
    if (effectiveScope === 'all') return null;

    if (effectiveScope === 'select') {
      // Empty select list falls back to "all" for backward compatibility
      if (!approveForKey) return null;
      return new Set(approveForKey.split(','));
    }

    if (effectiveScope === 'reports') {
      const myUid = userProfile?.uid;
      if (!myUid || members.length === 0) return new Set();

      const reachable = new Set();
      let frontier = members.filter(m => m.managerId === myUid).map(m => m.id);
      let depth = 0;

      while (frontier.length > 0 && depth < approveReportsDepth) {
        const currentFrontier = frontier;
        currentFrontier.forEach(uid => reachable.add(uid));
        depth += 1;
        if (depth < approveReportsDepth) {
          frontier = members
            .filter(m => currentFrontier.includes(m.managerId) && !reachable.has(m.id))
            .map(m => m.id);
        } else {
          frontier = [];
        }
      }

      return reachable;
    }

    return null;
  }, [isSTX, hasApprovePermission, effectiveScope, approveForKey, approveReportsDepth, members, userProfile?.uid]);
}

/**
 * Returns true if the given approvalScope (from useApprovalScope) permits
 * approving the given trip.
 */
export function matchesApprovalScope(scope, trip) {
  if (scope === 'none') return false;
  if (scope === null)   return true;
  if (!trip?.travellerId) return false;
  return scope.has(trip.travellerId);
}
