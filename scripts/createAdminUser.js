// Run with: node scripts/createAdminUser.js
// Creates the first STX admin user in Firebase Auth + Firestore

const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

// ── Config ────────────────────────────────────────────────────────────────────
const SERVICE_ACCOUNT_PATH = process.argv[2];
const ADMIN_EMAIL          = process.argv[3];
const ADMIN_PASSWORD       = process.argv[4];
const ADMIN_NAME           = process.argv[5] || 'STX Admin';

if (!SERVICE_ACCOUNT_PATH || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Usage: node scripts/createAdminUser.js <serviceAccountPath> <email> <password> [displayName]');
  process.exit(1);
}

const serviceAccount = require(require('path').resolve(SERVICE_ACCOUNT_PATH));
initializeApp({ credential: cert(serviceAccount) });

const auth = getAuth();
const db   = getFirestore();

async function run() {
  // Create the Auth user
  let user;
  try {
    user = await auth.createUser({
      email:       ADMIN_EMAIL,
      password:    ADMIN_PASSWORD,
      displayName: ADMIN_NAME,
    });
    console.log(`✓ Auth user created: ${user.uid}`);
  } catch (err) {
    if (err.code === 'auth/email-already-exists') {
      user = await auth.getUserByEmail(ADMIN_EMAIL);
      console.log(`✓ Auth user already exists: ${user.uid}`);
    } else {
      throw err;
    }
  }

  // Write the Firestore profile (triggers syncUserClaims function)
  await db.collection('users').doc(user.uid).set({
    uid:         user.uid,
    email:       ADMIN_EMAIL,
    displayName: ADMIN_NAME,
    role:        'stx_admin',
    clientId:    null,
    active:      true,
    createdAt:   new Date(),
  });
  console.log(`✓ Firestore profile written`);
  console.log(`✓ syncUserClaims function will set custom claims automatically`);
  console.log(`\nDone! You can now log in at stx-corporate-dev.web.app`);
  console.log(`Email: ${ADMIN_EMAIL}`);
}

run().catch(err => { console.error(err); process.exit(1); });
