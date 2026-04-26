const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

initializeApp();

// Syncs role+clientId custom claims whenever a user profile is written
exports.syncUserClaims = onDocumentWritten('users/{userId}', async (event) => {
  const userId = event.params.userId;
  const after = event.data?.after;
  if (!after || !after.exists) return null;
  const { role, clientId, active } = after.data();
  if (!role) return null;
  const claims = active === false
    ? { role: null, clientId: null, disabled: true }
    : { role, clientId: clientId ?? null };
  await getAuth().setCustomUserClaims(userId, claims);
  return null;
});

// Force-refresh claims for a user (STX admin only)
exports.refreshUserClaims = onCall({ enforceAppCheck: false }, async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) throw new HttpsError('unauthenticated', 'Must be signed in.');
  const db = getFirestore();
  const callerSnap = await db.collection('users').doc(callerUid).get();
  if (callerSnap.data()?.role !== 'stx_admin') {
    throw new HttpsError('permission-denied', 'Only STX admins can refresh claims.');
  }
  const { targetUid } = request.data;
  if (!targetUid) throw new HttpsError('invalid-argument', 'targetUid required.');
  const targetSnap = await db.collection('users').doc(targetUid).get();
  if (!targetSnap.exists) throw new HttpsError('not-found', 'User profile not found.');
  const { role, clientId, active } = targetSnap.data();
  const claims = active === false
    ? { role: null, clientId: null, disabled: true }
    : { role, clientId: clientId ?? null };
  await getAuth().setCustomUserClaims(targetUid, claims);
  return { success: true };
});

// Create a new user in Auth + Firestore (STX admin/ops only)
exports.createClientUser = onCall({ enforceAppCheck: false }, async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) throw new HttpsError('unauthenticated', 'Must be signed in.');

  const db = getFirestore();
  const callerSnap = await db.collection('users').doc(callerUid).get();
  const callerRole = callerSnap.data()?.role;
  if (!['stx_admin', 'stx_ops'].includes(callerRole)) {
    throw new HttpsError('permission-denied', 'Only STX staff can create users.');
  }

  const { email, password, firstName, lastName, role, clientId } = request.data;
  if (!email || !password || !role) {
    throw new HttpsError('invalid-argument', 'email, password and role are required.');
  }

  const displayName = [firstName, lastName].filter(Boolean).join(' ') || email;

  let authUser;
  try {
    authUser = await getAuth().createUser({ email, password, displayName });
  } catch (err) {
    if (err.code === 'auth/email-already-exists') {
      throw new HttpsError('already-exists', 'A user with that email address already exists.');
    }
    if (err.code === 'auth/invalid-password') {
      throw new HttpsError('invalid-argument', 'Password must be at least 6 characters.');
    }
    throw new HttpsError('internal', err.message);
  }

  await db.collection('users').doc(authUser.uid).set({
    uid: authUser.uid,
    email,
    firstName: firstName || '',
    lastName:  lastName  || '',
    displayName,
    role,
    clientId: clientId || null,
    active: true,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: callerUid,
  });

  return { uid: authUser.uid };
});

// Update an existing user (STX admin only)
exports.updateClientUser = onCall({ enforceAppCheck: false }, async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) throw new HttpsError('unauthenticated', 'Must be signed in.');

  const db = getFirestore();
  const callerSnap = await db.collection('users').doc(callerUid).get();
  if (callerSnap.data()?.role !== 'stx_admin') {
    throw new HttpsError('permission-denied', 'Only STX admins can update users.');
  }

  const { targetUid, updates } = request.data;
  if (!targetUid) throw new HttpsError('invalid-argument', 'targetUid required.');

  const allowed = ['firstName', 'lastName', 'displayName', 'role', 'clientId', 'active'];
  const safe = Object.fromEntries(Object.entries(updates).filter(([k]) => allowed.includes(k)));

  // Keep displayName in sync with first/last name if either changed
  if (safe.firstName !== undefined || safe.lastName !== undefined) {
    const targetSnap = await db.collection('users').doc(targetUid).get();
    const current = targetSnap.data() || {};
    const first = safe.firstName ?? current.firstName ?? '';
    const last  = safe.lastName  ?? current.lastName  ?? '';
    safe.displayName = [first, last].filter(Boolean).join(' ') || current.email;
  }

  await db.collection('users').doc(targetUid).update({ ...safe, updatedAt: FieldValue.serverTimestamp() });

  // Sync displayName to Firebase Auth as well
  if (safe.displayName) {
    await getAuth().updateUser(targetUid, { displayName: safe.displayName });
  }

  return { success: true };
});

// Send password reset email to a user (STX admin only)
exports.sendPasswordReset = onCall({ enforceAppCheck: false }, async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) throw new HttpsError('unauthenticated', 'Must be signed in.');

  const db = getFirestore();
  const callerSnap = await db.collection('users').doc(callerUid).get();
  if (callerSnap.data()?.role !== 'stx_admin') {
    throw new HttpsError('permission-denied', 'Only STX admins can send password resets.');
  }

  const { email } = request.data;
  if (!email) throw new HttpsError('invalid-argument', 'email required.');

  const link = await getAuth().generatePasswordResetLink(email);
  // Link generated — in production wire this to an email provider.
  // For now, return the link so the admin can share it manually.
  return { link };
});
