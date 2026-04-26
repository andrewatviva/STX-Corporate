const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp();

// Sets custom claims whenever a user profile doc is created or updated.
// This keeps the JWT role+clientId in sync with Firestore automatically.
exports.syncUserClaims = onDocumentWritten('users/{userId}', async (event) => {
  const userId = event.params.userId;
  const after = event.data?.after;

  if (!after || !after.exists) return null;

  const profile = after.data();
  const { role, clientId, active } = profile;

  if (!role) return null;

  const claims = active === false
    ? { role: null, clientId: null, disabled: true }
    : { role, clientId: clientId ?? null };

  await getAuth().setCustomUserClaims(userId, claims);
  return null;
});

// HTTPS callable — STX admin can force-refresh a user's claims immediately
// after a role change without waiting for next sign-in.
exports.refreshUserClaims = onCall({ enforceAppCheck: false }, async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) throw new HttpsError('unauthenticated', 'Must be signed in.');

  const db = getFirestore();
  const callerSnap = await db.collection('users').doc(callerUid).get();
  const callerRole = callerSnap.data()?.role;

  if (callerRole !== 'stx_admin') {
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
