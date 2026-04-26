import { useState, useEffect } from 'react';
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp, query, orderBy, collectionGroup
} from 'firebase/firestore';
import { db } from '../firebase';

export function useTrips(clientId, isSTX, filterClientId = null) {
  const [trips, setTrips]     = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let q;

    if (isSTX) {
      // STX staff — query across all clients, optionally filtered to one
      if (filterClientId) {
        q = query(
          collection(db, 'clients', filterClientId, 'trips'),
          orderBy('createdAt', 'desc')
        );
      } else {
        q = query(collectionGroup(db, 'trips'), orderBy('createdAt', 'desc'));
      }
    } else {
      // Client user — own tenant only
      if (!clientId) { setLoading(false); return; }
      q = query(
        collection(db, 'clients', clientId, 'trips'),
        orderBy('createdAt', 'desc')
      );
    }

    const unsub = onSnapshot(q, snap => {
      setTrips(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, [clientId, isSTX, filterClientId]);

  const addTrip = (clientId, data) =>
    addDoc(collection(db, 'clients', clientId, 'trips'), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

  const updateTrip = (clientId, tripId, data) =>
    updateDoc(doc(db, 'clients', clientId, 'trips', tripId), {
      ...data,
      updatedAt: serverTimestamp(),
    });

  const deleteTrip = (clientId, tripId) =>
    deleteDoc(doc(db, 'clients', clientId, 'trips', tripId));

  return { trips, loading, addTrip, updateTrip, deleteTrip };
}
