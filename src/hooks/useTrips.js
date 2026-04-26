import { useState, useEffect } from 'react';
import {
  collection, onSnapshot, updateDoc, deleteDoc,
  doc, serverTimestamp, query, orderBy, collectionGroup,
  runTransaction,
} from 'firebase/firestore';
import { db } from '../firebase';

export function useTrips(clientId, isSTX, filterClientId = null) {
  const [trips, setTrips]     = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let q;
    if (isSTX) {
      if (filterClientId) {
        q = query(collection(db, 'clients', filterClientId, 'trips'), orderBy('createdAt', 'desc'));
      } else {
        q = query(collectionGroup(db, 'trips'), orderBy('createdAt', 'desc'));
      }
    } else {
      if (!clientId) { setLoading(false); return; }
      q = query(collection(db, 'clients', clientId, 'trips'), orderBy('createdAt', 'desc'));
    }
    const unsub = onSnapshot(q, snap => {
      setTrips(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, [clientId, isSTX, filterClientId]);

  const addTrip = async (cid, data) => {
    const settingsRef = doc(db, 'clients', cid, 'config', 'settings');
    const newTripRef  = doc(collection(db, 'clients', cid, 'trips'));

    await runTransaction(db, async (tx) => {
      const snap    = await tx.get(settingsRef);
      const counter = (snap.data()?.tripCounter || 0) + 1;
      const prefix  = cid.replace(/[^a-zA-Z]/g, '').slice(0, 4).toUpperCase() || 'STX';
      const tripRef = `${prefix}-${String(counter).padStart(4, '0')}`;

      tx.set(settingsRef, { tripCounter: counter }, { merge: true });
      tx.set(newTripRef, {
        ...data,
        tripRef,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
  };

  const updateTrip = (clientId, tripId, data) =>
    updateDoc(doc(db, 'clients', clientId, 'trips', tripId), {
      ...data,
      updatedAt: serverTimestamp(),
    });

  const deleteTrip = (clientId, tripId) =>
    deleteDoc(doc(db, 'clients', clientId, 'trips', tripId));

  return { trips, loading, addTrip, updateTrip, deleteTrip };
}
