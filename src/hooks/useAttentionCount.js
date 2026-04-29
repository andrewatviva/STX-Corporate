import { useState, useEffect, useMemo } from 'react';
import { collection, collectionGroup, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';

export function useAttentionCount() {
  const { userProfile } = useAuth();
  const { isSTX, clientId, activeClientId } = useTenant();
  const [trips, setTrips] = useState([]);

  const role = userProfile?.role;
  const uid  = userProfile?.uid;

  useEffect(() => {
    if (!role || !uid) return;

    let statuses;
    if (['stx_admin', 'stx_ops', 'client_ops'].includes(role)) {
      statuses = ['pending_approval', 'approved'];
    } else if (role === 'client_approver') {
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
  }, [role, uid, isSTX, clientId, activeClientId]);

  return useMemo(() => {
    if (!role || !uid) return { count: 0, tooltip: null };

    if (role === 'client_approver') {
      const approveFor = userProfile?.approveFor || [];
      const count = trips.filter(t => {
        if (t.status !== 'pending_approval') return false;
        if (approveFor.length === 0) return true;
        return t.travellerId && approveFor.includes(t.travellerId);
      }).length;
      return { count, tooltip: count > 0 ? `${count} pending your approval` : null };
    }

    if (role === 'client_traveller') {
      const count = trips.filter(t =>
        t.travellerId === uid || t.createdBy === uid
      ).length;
      return { count, tooltip: count > 0 ? `${count} trip${count !== 1 ? 's' : ''} declined` : null };
    }

    // stx_admin, stx_ops, client_ops — trips include pending_approval + approved
    const pendingCount  = trips.filter(t => t.status === 'pending_approval').length;
    const approvedCount = trips.filter(t => t.status === 'approved').length;
    const count = pendingCount + approvedCount;
    const parts = [];
    if (pendingCount  > 0) parts.push(`${pendingCount} pending approval`);
    if (approvedCount > 0) parts.push(`${approvedCount} to book`);
    return { count, tooltip: parts.length > 0 ? parts.join(' · ') : null };
  }, [trips, role, uid, userProfile]);
}
