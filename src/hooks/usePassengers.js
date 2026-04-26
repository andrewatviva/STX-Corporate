import { useState, useEffect } from 'react';
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp, query, orderBy,
} from 'firebase/firestore';
import { db } from '../firebase';

export function usePassengers(clientId) {
  const [passengers, setPassengers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientId) { setLoading(false); return; }
    const q = query(
      collection(db, 'clients', clientId, 'passengers'),
      orderBy('lastName'),
    );
    const unsub = onSnapshot(q, snap => {
      setPassengers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, [clientId]);

  const addPassenger = (data) =>
    addDoc(collection(db, 'clients', clientId, 'passengers'), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

  const updatePassenger = (id, data) =>
    updateDoc(doc(db, 'clients', clientId, 'passengers', id), {
      ...data,
      updatedAt: serverTimestamp(),
    });

  const deletePassenger = (id) =>
    deleteDoc(doc(db, 'clients', clientId, 'passengers', id));

  return { passengers, loading, addPassenger, updatePassenger, deletePassenger };
}
