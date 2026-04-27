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

    const role   = userProfile.role;
    const myUid  = userProfile.uid;

    // STX staff and client_ops see everything in the client
    if (STX_ROLES.includes(role) || role === 'client_ops') {
      setScope({ type: 'all' });
      return;
    }

    if (!myUid) { setScope(null); return; }

    // Immediately set a restrictive self-only scope so nothing leaks during load.
    // If the Firestore query below fails or is slow, the user still only sees their
    // own data rather than seeing everything (which happens when scope is null).
    setScope({ type: 'self', uids: new Set([myUid]) });

    if (!clientId) return;

    // Then expand to team scope if this user has direct reports
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
    // Primary traveller match
    if (t.travellerId && scope.uids.has(t.travellerId)) return true;
    if (!t.travellerId && scope.uids.has(t.createdBy)) return true;
    if (!t.travellerId && myName && t.travellerName?.toLowerCase() === myName) return true;
    // Additional passenger match (by passengerId linked to a scoped user)
    if ((t.additionalPassengers || []).some(p => p.passengerId && scope.uids.has(p.passengerId))) return true;
    return false;
  });
}

/**
 * Filter a passengers array to only those within the given scope.
 * Uses the passenger's userId (portal account link) for matching.
 */
export function filterPassengersByScope(passengers, scope, userProfile) {
  if (!scope || scope.type === 'all') return passengers;

  return passengers.filter(p => {
    if (p.userId) return scope.uids.has(p.userId);
    // Unlinked passenger: visible to whoever created it if they're in scope
    if (p.createdBy && scope.uids.has(p.createdBy)) return true;
    return false;
  });
}
