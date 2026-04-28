const { onDocumentWritten, onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError }                    = require('firebase-functions/v2/https');
const { onSchedule }                            = require('firebase-functions/v2/scheduler');
const { defineSecret }                          = require('firebase-functions/params');
const { initializeApp }                         = require('firebase-admin/app');
const { getAuth }                               = require('firebase-admin/auth');
const { getFirestore, FieldValue }              = require('firebase-admin/firestore');
const sgMail                                    = require('@sendgrid/mail');

initializeApp();

const SENDGRID_KEY = defineSecret('SENDGRID_API_KEY');
const FROM_EMAIL   = 'notifications@supportedtravelx.com.au';
const FROM_NAME    = 'STX Corporate';

// ── Helpers ───────────────────────────────────────────────────────────────────

function portalUrl() {
  return process.env.GCLOUD_PROJECT === 'stx-corporate'
    ? 'https://stx-corporate.web.app'
    : 'https://stx-corporate-dev.web.app';
}

function emailHtml({ preheader = '', heading, body, ctaText, ctaUrl }) {
  const btn = ctaText && ctaUrl
    ? `<div style="margin-top:28px;"><a href="${ctaUrl}"
         style="display:inline-block;background:#0d9488;color:#ffffff;text-decoration:none;
                padding:12px 28px;border-radius:8px;font-weight:600;font-size:14px;"
         >${ctaText}</a></div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  ${preheader ? `<span style="display:none;max-height:0;overflow:hidden;">${preheader}&zwnj;&nbsp;</span>` : ''}
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0"
             style="background:#ffffff;border-radius:12px;overflow:hidden;
                    border:1px solid #e5e7eb;max-width:560px;width:100%;">
        <!-- Header -->
        <tr>
          <td style="background:#0d9488;padding:24px 32px;">
            <p style="margin:0;font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">
              STX Corporate
            </p>
            <p style="margin:4px 0 0;font-size:11px;color:#ccfbf1;letter-spacing:0.3px;">
              TRAVEL MANAGEMENT PORTAL
            </p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <h2 style="margin:0 0 12px;font-size:20px;color:#111827;font-weight:700;line-height:1.3;">
              ${heading}
            </h2>
            ${body}
            ${btn}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.5;">
              This message was sent by STX Corporate on behalf of your organisation.
              Please do not reply to this email — log in to the portal to respond.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function infoRow(label, value) {
  if (!value) return '';
  return `<tr>
    <td style="padding:5px 12px 5px 0;font-size:12px;color:#6b7280;white-space:nowrap;
               vertical-align:top;width:110px;">${label}</td>
    <td style="padding:5px 0;font-size:13px;color:#111827;font-weight:500;">${value}</td>
  </tr>`;
}

function tripInfoBox(fields) {
  const rows = fields.map(([l, v]) => infoRow(l, v)).filter(Boolean).join('');
  if (!rows) return '';
  return `<table cellpadding="0" cellspacing="0"
    style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;
           padding:14px 16px;width:100%;margin:16px 0;">
    ${rows}
  </table>`;
}

function alertBox(color, title, message) {
  const bg  = { red: '#fef2f2', amber: '#fffbeb' }[color] || '#f0fdf4';
  const bc  = { red: '#fecaca', amber: '#fde68a' }[color] || '#bbf7d0';
  const tc  = { red: '#dc2626', amber: '#d97706' }[color] || '#16a34a';
  const mc  = { red: '#991b1b', amber: '#92400e' }[color] || '#166534';
  return `<div style="background:${bg};border:1px solid ${bc};border-radius:8px;
                      padding:12px 16px;margin:12px 0;">
    <p style="margin:0;font-size:13px;color:${tc};font-weight:600;">${title}</p>
    <p style="margin:6px 0 0;font-size:13px;color:${mc};">${message}</p>
  </div>`;
}

function fmtDate(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString('en-AU', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
  } catch { return iso; }
}

function buildEmailMessage(type, data, recipientEmails, trip) {
  const portal = portalUrl();
  const travelUrl = `${portal}/travel`;

  const tripFields = [
    ['Trip',       data.tripTitle || trip?.title],
    ['Traveller',  data.travellerName || trip?.travellerName],
    ['Start date', fmtDate(trip?.startDate)],
    ['End date',   fmtDate(trip?.endDate)],
    ['Cost centre', trip?.costCentre],
  ];

  const firstName = (data.travellerName || trip?.travellerName || '').split(' ')[0] || '';

  const templates = {
    trip_submitted: {
      subject:   `Action required: Trip approval needed — ${data.tripTitle}`,
      preheader: `${data.travellerName || 'A traveller'} has submitted a trip for your approval.`,
      heading:   'A trip is awaiting your approval',
      body: `
        <p style="font-size:14px;color:#374151;margin:0 0 4px;line-height:1.6;">
          A travel request has been submitted and requires your approval.
        </p>
        ${tripInfoBox(tripFields)}
        <p style="font-size:13px;color:#6b7280;margin:12px 0 0;line-height:1.5;">
          Log in to the portal to review the full itinerary, costs, and sector details.
        </p>`,
      ctaText: 'Review and approve →',
      ctaUrl:  travelUrl,
    },

    trip_approved: {
      subject:   `Trip approved: ${data.tripTitle}`,
      preheader: 'Your travel request has been approved and is being arranged.',
      heading:   'Your trip has been approved ✓',
      body: `
        <p style="font-size:14px;color:#374151;margin:0 0 4px;line-height:1.6;">
          Great news — your travel request has been approved and STX will now arrange the bookings.
        </p>
        ${tripInfoBox(tripFields)}
        <p style="font-size:13px;color:#6b7280;margin:12px 0 0;line-height:1.5;">
          You'll receive another notification once your trip has been fully booked.
        </p>`,
      ctaText: 'View trip in portal →',
      ctaUrl:  travelUrl,
    },

    trip_declined: {
      subject:   `Trip not approved: ${data.tripTitle}`,
      preheader: 'Your travel request was not approved. You can edit and resubmit.',
      heading:   'Trip request not approved',
      body: `
        <p style="font-size:14px;color:#374151;margin:0 0 4px;line-height:1.6;">
          Unfortunately your travel request was not approved at this time.
        </p>
        ${tripInfoBox(tripFields)}
        ${data.declineReason ? alertBox('red', 'Reason given:', data.declineReason) : ''}
        <p style="font-size:13px;color:#6b7280;margin:12px 0 0;line-height:1.5;">
          You can edit the trip and resubmit for approval from the portal.
        </p>`,
      ctaText: 'Edit and resubmit →',
      ctaUrl:  travelUrl,
    },

    trip_booked: {
      subject:   `Trip confirmed: ${data.tripTitle}`,
      preheader: 'Your travel is confirmed. Log in to view your full itinerary.',
      heading:   `Your trip is confirmed${firstName ? ', ' + firstName : ''}!`,
      body: `
        <p style="font-size:14px;color:#374151;margin:0 0 4px;line-height:1.6;">
          Everything is arranged. Check the portal for your full itinerary and any documents or access requirements.
        </p>
        ${tripInfoBox(tripFields)}
        <p style="font-size:13px;color:#6b7280;margin:12px 0 0;line-height:1.5;">
          If anything changes or you need to make amendments, contact STX as soon as possible.
        </p>`,
      ctaText: 'View your itinerary →',
      ctaUrl:  travelUrl,
    },

    trip_rating_request: {
      subject:   `How was your trip? — ${data.tripTitle}`,
      preheader: 'Take a minute to rate the providers from your recent trip.',
      heading:   `We hope your trip went well${firstName ? ', ' + firstName : ''}!`,
      body: `
        <p style="font-size:14px;color:#374151;margin:0 0 4px;line-height:1.6;">
          We'd love to hear how everything went. Rating your providers takes less than a minute
          and helps us make every future trip even better.
        </p>
        ${tripInfoBox([
          ['Trip', data.tripTitle || trip?.title],
        ])}
        <p style="font-size:13px;color:#6b7280;margin:12px 0 0;line-height:1.5;">
          Your ratings are anonymous and help us hold providers accountable for accessibility and service quality.
        </p>`,
      ctaText: 'Rate your trip →',
      ctaUrl:  travelUrl,
    },
  };

  const t = templates[type];
  if (!t) return null;

  return {
    to:      recipientEmails,
    from:    { email: FROM_EMAIL, name: FROM_NAME },
    subject: t.subject,
    html:    emailHtml({ preheader: t.preheader, heading: t.heading, body: t.body, ctaText: t.ctaText, ctaUrl: t.ctaUrl }),
  };
}

// ── Core dispatch logic (shared by trigger + sweep) ───────────────────────────

async function dispatchQueuedEmail(docRef, data) {
  // Not yet due (scheduled for the future)
  if (data.scheduledFor && new Date(data.scheduledFor) > new Date()) return;

  // Already processed
  if (data.status !== 'pending') return;

  const db = getFirestore();
  let recipientEmails = [];

  if (data.type === 'trip_submitted') {
    // Find all active client_approver users who cover this traveller
    const snap = await db.collection('users')
      .where('clientId', '==', data.clientId)
      .where('role', '==', 'client_approver')
      .get();

    for (const d of snap.docs) {
      const u = d.data();
      if (u.active === false || !u.email) continue;
      const af = u.approveFor || [];
      if (af.length === 0 || (data.travellerId && af.includes(data.travellerId))) {
        recipientEmails.push(u.email);
      }
    }
  } else {
    const uid = data.recipientId || data.travellerId;
    if (uid) {
      const snap = await db.collection('users').doc(uid).get();
      const email = snap.data()?.email;
      if (email) recipientEmails.push(email);
    }
  }

  if (recipientEmails.length === 0) {
    await docRef.update({ status: 'skipped', processedAt: FieldValue.serverTimestamp() });
    return;
  }

  // Fetch the live trip document for date/cost details in the email body
  let trip = null;
  if (data.tripId && data.clientId) {
    try {
      const tripSnap = await db.doc(`clients/${data.clientId}/trips/${data.tripId}`).get();
      if (tripSnap.exists) trip = tripSnap.data();
    } catch {}
  }

  const msg = buildEmailMessage(data.type, data, recipientEmails, trip);
  if (!msg) {
    await docRef.update({ status: 'skipped', processedAt: FieldValue.serverTimestamp(), note: 'Unknown type' });
    return;
  }

  await sgMail.send(msg);
  await docRef.update({
    status:         'sent',
    processedAt:    FieldValue.serverTimestamp(),
    recipientCount: recipientEmails.length,
  });
}

// ── Cloud Functions ───────────────────────────────────────────────────────────

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
    uid:         authUser.uid,
    email,
    firstName:   firstName || '',
    lastName:    lastName  || '',
    displayName,
    role,
    clientId:    clientId || null,
    active:      true,
    createdAt:   FieldValue.serverTimestamp(),
    createdBy:   callerUid,
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

  if (safe.firstName !== undefined || safe.lastName !== undefined) {
    const targetSnap = await db.collection('users').doc(targetUid).get();
    const current = targetSnap.data() || {};
    const first = safe.firstName ?? current.firstName ?? '';
    const last  = safe.lastName  ?? current.lastName  ?? '';
    safe.displayName = [first, last].filter(Boolean).join(' ') || current.email;
  }

  await db.collection('users').doc(targetUid).update({ ...safe, updatedAt: FieldValue.serverTimestamp() });

  if (safe.displayName) {
    await getAuth().updateUser(targetUid, { displayName: safe.displayName });
  }

  return { success: true };
});

// Permanently delete a user from Auth + Firestore (STX admin only)
exports.deleteClientUser = onCall({ enforceAppCheck: false }, async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) throw new HttpsError('unauthenticated', 'Must be signed in.');

  const db = getFirestore();
  const callerSnap = await db.collection('users').doc(callerUid).get();
  if (callerSnap.data()?.role !== 'stx_admin') {
    throw new HttpsError('permission-denied', 'Only STX admins can delete users.');
  }

  const { targetUid } = request.data;
  if (!targetUid) throw new HttpsError('invalid-argument', 'targetUid required.');
  if (targetUid === callerUid) throw new HttpsError('invalid-argument', 'You cannot delete your own account.');

  try {
    await getAuth().deleteUser(targetUid);
  } catch (err) {
    if (err.code !== 'auth/user-not-found') throw new HttpsError('internal', err.message);
  }

  await db.collection('users').doc(targetUid).delete();
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
  return { link };
});

// Triggered immediately when a doc is added to emailQueue
exports.onEmailQueued = onDocumentCreated(
  { document: 'emailQueue/{docId}', secrets: [SENDGRID_KEY] },
  async (event) => {
    sgMail.setApiKey(SENDGRID_KEY.value());
    const data = event.data?.data();
    if (!data) return;
    try {
      await dispatchQueuedEmail(event.data.ref, data);
    } catch (err) {
      console.error('onEmailQueued error:', err?.response?.body || err.message);
      try {
        await event.data.ref.update({
          status: 'failed',
          error:  err?.response?.body?.errors?.[0]?.message || err.message,
          processedAt: FieldValue.serverTimestamp(),
        });
      } catch {}
    }
  }
);

// Daily sweep — sends any deferred emails (e.g. post-trip rating requests) that are now due
exports.sweepEmailQueue = onSchedule(
  { schedule: 'every 24 hours', secrets: [SENDGRID_KEY] },
  async () => {
    sgMail.setApiKey(SENDGRID_KEY.value());
    const db = getFirestore();
    const now = new Date().toISOString();

    const snap = await db.collection('emailQueue')
      .where('status', '==', 'pending')
      .where('scheduledFor', '<=', now)
      .get();

    await Promise.allSettled(snap.docs.map(async d => {
      try {
        await dispatchQueuedEmail(d.ref, d.data());
      } catch (err) {
        console.error('sweepEmailQueue error for', d.id, err?.response?.body || err.message);
        await d.ref.update({
          status: 'failed',
          error:  err?.response?.body?.errors?.[0]?.message || err.message,
          processedAt: FieldValue.serverTimestamp(),
        }).catch(() => {});
      }
    }));
  }
);
