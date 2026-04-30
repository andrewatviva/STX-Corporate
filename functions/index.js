const { onDocumentWritten, onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError }                    = require('firebase-functions/v2/https');
const { onSchedule }                            = require('firebase-functions/v2/scheduler');
const { defineSecret }                          = require('firebase-functions/params');
const { initializeApp }                         = require('firebase-admin/app');
const { getAuth }                               = require('firebase-admin/auth');
const { getFirestore, FieldValue }              = require('firebase-admin/firestore');
const sgMail                                    = require('@sendgrid/mail');
const crypto                                    = require('crypto');

initializeApp();

const SENDGRID_KEY    = defineSecret('SENDGRID_API_KEY');
const FROM_EMAIL      = 'noreply@supportedtravelx.com.au';
const FROM_NAME       = 'STX Corporate';
// Always receives portal_feedback and trip_cancelled_by_client regardless of registered users
const STX_DEFAULT_NOTIFY_EMAIL = 'enquiries@supportedtravelx.com.au';

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
              Please do not reply to this email — log in to the portal to respond.<br>
              To manage your email notification preferences, visit <strong style="color:#9ca3af;">Settings</strong> in the portal.
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

function normaliseUrl(url) {
  if (!url) return null;
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
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

    trip_pre_departure: (() => {
      const itineraryUrl = normaliseUrl(data.digitalItineraryLink || trip?.digitalItineraryLink);

      // Build sector summary rows
      const sectors = (trip?.sectors || []);
      const sectorSummaryRows = sectors.map(s => {
        if (s.type === 'flight') {
          return infoRow('Flight', [s.flightNumber, s.departureAirport, '→', s.arrivalAirport].filter(Boolean).join(' ') || '—');
        }
        if (s.type === 'accommodation') {
          return infoRow('Accommodation', [s.propertyName, s.city].filter(Boolean).join(', ') || '—');
        }
        if (s.type === 'transfers') {
          return infoRow('Transfer', [s.provider, s.from && s.to ? `${s.from} → ${s.to}` : ''].filter(Boolean).join(' — ') || '—');
        }
        return '';
      }).filter(Boolean).join('');

      const summaryBox = sectorSummaryRows
        ? `<table cellpadding="0" cellspacing="0"
             style="background:#f0fdfa;border:1px solid #99f6e4;border-radius:8px;
                    padding:14px 16px;width:100%;margin:16px 0;">
             ${infoRow('Departure', fmtDate(trip?.startDate))}
             ${infoRow('Return', fmtDate(trip?.endDate))}
             ${sectorSummaryRows}
           </table>`
        : tripInfoBox([
            ['Departure', fmtDate(trip?.startDate)],
            ['Return',    fmtDate(trip?.endDate)],
          ]);

      return {
        subject:   `Your trip starts in 3 days — ${data.tripTitle}`,
        preheader: `Reminder: your trip "${data.tripTitle}" is coming up in 3 days.`,
        heading:   `Your trip is coming up${firstName ? ', ' + firstName : ''}!`,
        body: `
          <p style="font-size:14px;color:#374151;margin:0 0 4px;line-height:1.6;">
            Just a reminder that your trip is 3 days away. Here's a summary of what's arranged.
          </p>
          ${summaryBox}
          ${itineraryUrl ? `
          <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:12px 16px;margin:12px 0;">
            <p style="margin:0 0 6px;font-size:13px;color:#0369a1;font-weight:600;">Digital itinerary available</p>
            <a href="${itineraryUrl}" style="font-size:13px;color:#0284c7;word-break:break-all;">${itineraryUrl}</a>
          </div>` : ''}
          <p style="font-size:13px;color:#6b7280;margin:12px 0 0;line-height:1.5;">
            If anything needs to change, please contact STX as soon as possible.
          </p>`,
        ctaText: 'View full itinerary →',
        ctaUrl:  travelUrl,
      };
    })(),

    trip_itinerary_added: {
      subject:   `Your digital itinerary is ready — ${data.tripTitle}`,
      preheader: 'Your travel itinerary is now available. Click the link to access it.',
      heading:   `Your itinerary is ready${firstName ? ', ' + firstName : ''}`,
      body: (() => {
        const itineraryUrl = normaliseUrl(data.digitalItineraryLink || trip?.digitalItineraryLink);
        return `
          <p style="font-size:14px;color:#374151;margin:0 0 4px;line-height:1.6;">
            Your digital travel itinerary has been added to your upcoming trip.
          </p>
          ${tripInfoBox(tripFields)}
          ${itineraryUrl ? `
          <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:12px 16px;margin:16px 0;">
            <p style="margin:0 0 6px;font-size:13px;color:#0369a1;font-weight:600;">Access your itinerary</p>
            <a href="${itineraryUrl}" style="font-size:13px;color:#0284c7;word-break:break-all;">${itineraryUrl}</a>
          </div>` : ''}
          <p style="font-size:13px;color:#6b7280;margin:12px 0 0;line-height:1.5;">
            If you have any questions or need changes, please contact STX.
          </p>`;
      })(),
      ctaText: 'View trip in portal →',
      ctaUrl:  travelUrl,
    },

    trip_cancelled_by_client: {
      subject:   `[Trip cancelled] ${data.tripTitle}`,
      preheader: `${data.cancelledByName || 'A client user'} has cancelled a trip. Review for non-refundable invoicing.`,
      heading:   'Trip cancelled — invoice review required',
      body: `
        <p style="font-size:14px;color:#374151;margin:0 0 4px;line-height:1.6;">
          A client user has cancelled a trip. Please review whether any non-refundable costs
          should be invoiced to the client before closing this trip.
        </p>
        <table cellpadding="0" cellspacing="0"
          style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 16px;width:100%;margin:16px 0;">
          ${infoRow('Cancelled by', data.cancelledByName || 'Unknown')}
          ${data.clientId ? infoRow('Client', data.clientId) : ''}
          ${data.cancellationReason ? infoRow('Reason', data.cancellationReason) : ''}
        </table>
        ${tripInfoBox([
          ['Trip', data.tripTitle || trip?.title],
        ])}
        <p style="font-size:13px;color:#6b7280;margin:12px 0 0;line-height:1.5;">
          Open the trip to review sectors and mark any non-refundable items for invoicing.
        </p>`,
      ctaText: 'Review trip →',
      ctaUrl:  travelUrl,
    },

    portal_feedback: {
      subject:   `[${data.feedbackType === 'fault' ? 'Fault report' : 'Feedback'}] ${data.subject}`,
      preheader: `Portal ${data.feedbackType === 'fault' ? 'fault report' : 'feedback'} from ${data.userName || data.userEmail || 'a user'}.`,
      heading:   data.feedbackType === 'fault' ? '🔧 Fault report submitted' : '💬 Portal feedback received',
      body: `
        <p style="font-size:14px;color:#374151;margin:0 0 4px;line-height:1.6;">
          ${data.feedbackType === 'fault' ? 'A user has reported a fault with the portal.' : 'A user has submitted feedback about the portal.'}
        </p>
        <table cellpadding="0" cellspacing="0"
          style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 16px;width:100%;margin:16px 0;">
          ${infoRow('From', [data.userName, data.userEmail].filter(Boolean).join(' — '))}
          ${data.clientId ? infoRow('Client', data.clientId) : ''}
          ${infoRow('Type', data.feedbackType === 'fault' ? 'Fault report' : 'Feedback')}
          ${infoRow('Subject', data.subject)}
        </table>
        <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:14px 16px;margin:8px 0;">
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;">Details</p>
          <p style="margin:0;font-size:14px;color:#374151;white-space:pre-wrap;line-height:1.6;">${data.description}</p>
        </div>`,
      ctaText: 'View in Admin Panel →',
      ctaUrl:  data.feedbackId
        ? `${portalUrl()}/admin?tab=feedback&id=${data.feedbackId}`
        : `${portalUrl()}/admin?tab=feedback`,
    },

    feedback_response: {
      subject:   `Re: ${data.subject}`,
      preheader: `STX has responded to your ${data.feedbackType === 'fault' ? 'fault report' : 'feedback'}.`,
      heading:   `We've responded to your ${data.feedbackType === 'fault' ? 'fault report' : 'feedback'}`,
      body: `
        <p style="font-size:14px;color:#374151;margin:0 0 4px;line-height:1.6;">
          ${data.respondedByName || 'The STX team'} has replied to your
          ${data.feedbackType === 'fault' ? 'fault report' : 'feedback'}:
          <strong>${data.subject}</strong>
        </p>
        <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:14px 16px;margin:16px 0;">
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;">Response</p>
          <p style="margin:0;font-size:14px;color:#374151;white-space:pre-wrap;line-height:1.6;">${data.responseText}</p>
        </div>
        <p style="font-size:13px;color:#6b7280;margin:12px 0 0;line-height:1.5;">
          If you have further questions, please don't hesitate to contact us through the portal.
        </p>`,
      ctaText: 'Visit the portal →',
      ctaUrl:  portalUrl(),
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

  // Mandatory types always send regardless of preferences
  const mandatory = new Set(['trip_approved', 'trip_declined']);

  if (data.type === 'portal_feedback' || data.type === 'trip_cancelled_by_client') {
    // Resolve client's STX notification email, fall back to default
    let stxNotifyEmail = STX_DEFAULT_NOTIFY_EMAIL;
    if (data.clientId) {
      try {
        const cfgSnap = await db.doc(`clients/${data.clientId}/config/settings`).get();
        const configured = cfgSnap.exists && cfgSnap.data()?.contact?.stxNotifyEmail;
        if (configured) stxNotifyEmail = configured;
      } catch {}
    }
    recipientEmails.push(stxNotifyEmail);
    // Also notify any registered STX staff users
    const snap = await db.collection('users')
      .where('role', 'in', ['stx_admin', 'stx_ops', 'stx'])
      .get();
    for (const d of snap.docs) {
      const u = d.data();
      if (u.active === false || !u.email) continue;
      if (!recipientEmails.includes(u.email)) recipientEmails.push(u.email);
    }
  } else if (data.type === 'trip_submitted') {
    // Notify all active client users who have effective trip:approve permission
    // and whose approval scope covers this traveller.
    const APPROVE_DEFAULT_ROLES = new Set(['client_approver', 'client_ops']);

    const allClientSnap = await db.collection('users')
      .where('clientId', '==', data.clientId)
      .get();

    // Build id→data map for hierarchy traversal (reports scope)
    const userMap = {};
    allClientSnap.forEach(d => { userMap[d.id] = d.data(); });

    function reachableReports(managerUid, depth) {
      const reachable = new Set();
      let frontier = Object.keys(userMap).filter(id => userMap[id].managerId === managerUid);
      let lvl = 0;
      while (frontier.length > 0 && lvl < depth) {
        const cur = frontier;
        cur.forEach(uid => reachable.add(uid));
        lvl += 1;
        if (lvl < depth) {
          frontier = Object.keys(userMap)
            .filter(id => cur.includes(userMap[id].managerId) && !reachable.has(id));
        } else {
          frontier = [];
        }
      }
      return reachable;
    }

    for (const d of allClientSnap.docs) {
      const u = d.data();
      if (u.active === false || !u.email) continue;

      // Effective trip:approve permission (role default overridable per user)
      const overrides = u.permissionOverrides || {};
      const roleHasApprove = APPROVE_DEFAULT_ROLES.has(u.role);
      const hasApprove = 'trip:approve' in overrides
        ? overrides['trip:approve'] === true
        : roleHasApprove;
      if (!hasApprove) continue;

      // Check approval scope
      const af = u.approveFor || [];
      const scope = u.approveScope ?? (af.length > 0 ? 'select' : 'all');

      if (scope === 'select') {
        if (af.length > 0 && (!data.travellerId || !af.includes(data.travellerId))) continue;
      } else if (scope === 'reports') {
        if (!data.travellerId) continue;
        const reachable = reachableReports(d.id, u.approveReportsDepth || 1);
        if (!reachable.has(data.travellerId)) continue;
      }
      // scope === 'all' falls through

      // Respect email preference (default on)
      const prefs = u.emailPreferences || {};
      if (prefs.trip_submitted === false) continue;
      recipientEmails.push(u.email);
    }
  } else {
    // Resolve creator + traveller; skip STX staff; de-duplicate
    const STX_ROLES = new Set(['stx_admin', 'stx_ops']);
    const uids = [...new Set([data.recipientId, data.travellerId].filter(Boolean))];
    for (const uid of uids) {
      const snap = await db.collection('users').doc(uid).get();
      const u = snap.data();
      if (!u?.email || u.active === false) continue;
      if (STX_ROLES.has(u.role)) continue;
      const prefs = u.emailPreferences || {};
      if (mandatory.has(data.type) || prefs[data.type] !== false) {
        recipientEmails.push(u.email);
      }
    }
    recipientEmails = [...new Set(recipientEmails)];
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

// Send an onboarding form link to a new client contact (STX admin/ops only)
exports.sendOnboardingForm = onCall({ enforceAppCheck: false, secrets: [SENDGRID_KEY] }, async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) throw new HttpsError('unauthenticated', 'Must be signed in.');

  const db = getFirestore();
  const callerSnap = await db.collection('users').doc(callerUid).get();
  const callerRole = callerSnap.data()?.role;
  if (!['stx_admin', 'stx_ops'].includes(callerRole)) {
    throw new HttpsError('permission-denied', 'Only STX staff can send onboarding forms.');
  }

  const { clientName, recipientEmail, recipientName, note } = request.data;
  if (!clientName?.trim())    throw new HttpsError('invalid-argument', 'clientName is required.');
  if (!recipientEmail?.trim()) throw new HttpsError('invalid-argument', 'recipientEmail is required.');

  const token = crypto.randomBytes(16).toString('hex');

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  await db.collection('onboarding').doc(token).set({
    token,
    clientName:     clientName.trim(),
    recipientEmail: recipientEmail.trim().toLowerCase(),
    recipientName:  recipientName?.trim() || '',
    note:           note?.trim() || '',
    status:         'pending',
    createdBy:      callerUid,
    createdByName:  callerSnap.data()?.displayName || '',
    createdAt:      FieldValue.serverTimestamp(),
    expiresAt:      expiresAt.toISOString(),
    responses:      null,
  });

  const formUrl   = `${portalUrl()}/onboarding/${token}`;
  const firstName = (recipientName?.trim() || '').split(' ')[0] || '';
  const greeting  = firstName ? `, ${firstName}` : '';

  const noteBlock = note?.trim()
    ? `<div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:12px 16px;margin:16px 0;">
         <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;">Note from the STX team</p>
         <p style="margin:0;font-size:14px;color:#374151;font-style:italic;">"${note.trim()}"</p>
       </div>`
    : '';

  sgMail.setApiKey(SENDGRID_KEY.value());
  await sgMail.send({
    to:      recipientEmail.trim(),
    from:    { email: FROM_EMAIL, name: FROM_NAME },
    subject: `Set up your ${clientName.trim()} travel portal — STX Corporate`,
    html: emailHtml({
      preheader: `Complete your portal setup preferences for ${clientName.trim()}.`,
      heading:   `Welcome to STX Corporate Travel${greeting}!`,
      body: `
        <p style="font-size:14px;color:#374151;margin:0 0 12px;line-height:1.6;">
          We're setting up the STX Corporate Travel Portal for <strong>${clientName.trim()}</strong> and
          would love your input on how you'd like it configured.
        </p>
        <p style="font-size:14px;color:#374151;margin:0 0 12px;line-height:1.6;">
          The form walks through your preferences — cost centres, approval workflows, features, and more.
          There are no wrong answers, and <strong>anything you're unsure about can simply be left blank</strong>
          for us to discuss with you when we finalise the setup.
        </p>
        ${noteBlock}
        <p style="font-size:13px;color:#6b7280;margin:16px 0 0;line-height:1.5;">
          This link is valid for <strong>30 days</strong>. Once you submit, the STX team will review
          your responses and be in touch to complete the configuration.
        </p>`,
      ctaText: 'Complete your portal preferences →',
      ctaUrl:  formUrl,
    }),
  });

  return { token, formUrl };
});

// Notify STX when a client submits their onboarding form
exports.onOnboardingSubmitted = onDocumentWritten(
  { document: 'onboarding/{token}', secrets: [SENDGRID_KEY] },
  async (event) => {
    const after  = event.data?.after?.data();
    const before = event.data?.before?.data();
    if (!after || after.status !== 'submitted' || before?.status === 'submitted') return;

    const db = getFirestore();

    // Notify the default STX inbox + any registered STX staff
    let recipientEmails = [STX_DEFAULT_NOTIFY_EMAIL];
    const snap = await db.collection('users')
      .where('role', 'in', ['stx_admin', 'stx_ops'])
      .get();
    for (const d of snap.docs) {
      const u = d.data();
      if (u.active === false || !u.email || recipientEmails.includes(u.email)) continue;
      recipientEmails.push(u.email);
    }

    const r = after.responses || {};

    const summaryRows = [
      after.clientName    && infoRow('Client',       after.clientName),
      after.recipientName && infoRow('Contact',      `${after.recipientName} — ${after.recipientEmail}`),
      !after.recipientName && after.recipientEmail && infoRow('Contact', after.recipientEmail),
      r.costCentres?.length  && infoRow('Cost centres',  r.costCentres.join(', ')),
      r.tripTypes?.length    && infoRow('Trip types',    r.tripTypes.join(', ')),
      r.emailNotifications !== undefined && infoRow('Email notifications', r.emailNotifications ? 'Enabled' : 'Disabled'),
      r.gstRate !== undefined && infoRow('GST rate', r.gstRate === 0.10 ? '10%' : r.gstRate === 0.15 ? '15%' : 'None'),
      r.accomRates && Object.keys(r.accomRates).length && infoRow('Accom. rates', `${Object.keys(r.accomRates).length} cities configured`),
      r.notes && infoRow('Client notes', r.notes.slice(0, 120) + (r.notes.length > 120 ? '…' : '')),
    ].filter(Boolean).join('');

    sgMail.setApiKey(SENDGRID_KEY.value());
    await sgMail.send({
      to:      recipientEmails,
      from:    { email: FROM_EMAIL, name: FROM_NAME },
      subject: `[Onboarding] ${after.clientName || 'New client'} has submitted their preferences`,
      html: emailHtml({
        preheader: `${after.clientName || 'A new client'} has completed their onboarding form. Review and apply in the Admin Panel.`,
        heading:   `${after.clientName || 'New client'} — onboarding complete`,
        body: `
          <p style="font-size:14px;color:#374151;margin:0 0 12px;line-height:1.6;">
            A client has submitted their portal setup preferences. Review the responses in the
            Admin Panel and apply them to the client configuration.
          </p>
          <table cellpadding="0" cellspacing="0"
            style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;
                   padding:14px 16px;width:100%;margin:16px 0;">
            ${summaryRows}
          </table>
          <p style="font-size:13px;color:#6b7280;margin:12px 0 0;line-height:1.5;">
            STX-managed fields (fees, contact emails, hotel booking settings) are not included in
            the client responses and will need to be configured separately.
          </p>`,
        ctaText: 'Review in Admin Panel →',
        ctaUrl:  `${portalUrl()}/admin?tab=onboarding`,
      }),
    });
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
