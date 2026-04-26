import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { STX_ROLES } from '../utils/permissions';

/**
 * Returns the set of user UIDs whose trips the current user is allowed to see.
 *
 * type: 'all'  — STX staff or client_ops: see everything (no filter applied)
 * type: 'team' — has direct reports: own UID + direct-report UIDs
 * type: 'self' — no direct reports: own UID only
 *
 * Returns null while loading (don't filter yet).
 */
export function useTeamScope(userProfile, clientId) {
  const [scope, setScope] = useState(null);

  useEffect(() => {
    if (!userProfile) { setScope(null); return; }

    const role = userProfile.role;

    // STX staff and client_ops always see all trips in the client
    if (STX_ROLES.includes(role) || role === 'client_ops') {
      setScope({ type: 'all' });
      return;
    }

    const myUid = userProfile.uid;

    if (!clientId) {
      setScope({ type: 'self', uids: new Set([myUid]) });
      return;
    }

    // Subscribe to direct reports (users who have this person as their manager)
    const q = query(
      collection(db, 'users'),
      where('managerId', '==', myUid),
      where('clientId', '==', clientId)
    );

    const unsub = onSnapshot(q, snap => {
      const reportUids = snap.docs.map(d => d.id);
      if (reportUids.length === 0) {
        setScope({ type: 'self', uids: new Set([myUid]) });
      } else {
        setScope({ type: 'team', uids: new Set([myUid, ...reportUids]) });
      }
    });
    return unsub;
  }, [userProfile, clientId]);

  return scope;
}

/**
 * Filter a trips array to only those within the given scope.
 * Falls back to matching by travellerName for trips without a travellerId.
 */
export function filterTripsByScope(trips, scope, userProfile) {
  if (!scope || scope.type === 'all') return trips;

  const myName = [userProfile?.firstName, userProfile?.lastName].filter(Boolean).join(' ').toLowerCase();

  return trips.filter(t => {
    // Primary: travellerId field (set on new trips)
    if (t.travellerId) return scope.uids.has(t.travellerId);
    // Secondary: travellerName match or createdBy
    if (scope.uids.has(t.createdBy)) return true;
    if (myName && t.travellerName?.toLowerCase() === myName) return true;
    return false;
  });
}
