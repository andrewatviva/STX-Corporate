import { useState, useEffect } from 'react';
import {
  collection, onSnapshot, query, orderBy,
  updateDoc, deleteDoc, doc, serverTimestamp, runTransaction,
} from 'firebase/firestore';
import { db } from '../firebase';

export function useInvoices(clientId) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    if (!clientId) { setInvoices([]); setLoading(false); return; }
    const unsub = onSnapshot(
      query(collection(db, 'clients', clientId, 'invoices'), orderBy('createdAt', 'desc')),
      snap => { setInvoices(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false); },
      () => setLoading(false)
    );
    return unsub;
  }, [clientId]);

  const createInvoice = async (cid, data) => {
    const settingsRef = doc(db, 'clients', cid, 'config', 'settings');
    const newRef      = doc(collection(db, 'clients', cid, 'invoices'));

    await runTransaction(db, async (tx) => {
      const snap    = await tx.get(settingsRef);
      const counter = (snap.data()?.invoiceCounter || 0) + 1;
      const prefix  = cid.replace(/[^a-zA-Z]/g, '').slice(0, 4).toUpperCase() || 'STX';
      const invoiceNumber = `INV-${prefix}-${String(counter).padStart(3, '0')}`;

      tx.set(settingsRef, { invoiceCounter: counter }, { merge: true });
      tx.set(newRef, {
        ...data,
        invoiceNumber,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });

    return newRef.id;
  };

  const updateInvoice = (cid, invoiceId, data) =>
    updateDoc(doc(db, 'clients', cid, 'invoices', invoiceId), {
      ...data,
      updatedAt: serverTimestamp(),
    });

  const deleteInvoice = (cid, invoiceId) =>
    deleteDoc(doc(db, 'clients', cid, 'invoices', invoiceId));

  return { invoices, loading, createInvoice, updateInvoice, deleteInvoice };
}
