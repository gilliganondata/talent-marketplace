// netlify/functions/send-notification.js
//
// Triggered by a Supabase Database Webhook on INSERT into job_seekers or
// hiring_contacts. Sends Tim a full-detail email via Resend. For job seeker
// submissions, also generates 5 single-use rating tokens (1-5) and includes
// one-click rating links in the email (the links won't do anything until
// the rate-via-link function is built in a later step).

exports.handler = async (event) => {
  // Only accept POST — this endpoint should only ever be hit by the Supabase webhook.
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  // Verify the shared secret so random internet traffic can't trigger emails
  // or write bogus rating tokens.
  const providedSecret = event.headers["x-webhook-secret"];
  if (!providedSecret || providedSecret !== process.env.WEBHOOK_SECRET) {
    return { statusCode: 401, body: "Unauthorized" };
  }

  const payload = JSON.parse(event.body);
  const { table, record } = payload;

  if (table === "job_seekers") {
    await handleJobSeeker(record);
  } else if (table === "hiring_contacts") {
    await handleHiringContact(record);
  } else {
    // Unrecognized table — ignore quietly, nothing to do.
    return { statusCode: 200, body: "ignored" };
  }

  return { statusCode: 200, body: "ok" };
};

async function handleJobSeeker(record) {
  const ratingLinks = await createRatingTokensAndLinks(record.id);

  const fields = `
    <p><strong>Name:</strong> ${escapeHtml(record.name)}</p>
    <p><strong>LinkedIn:</strong> <a href="${escapeAttr(record.linkedin_url)}">${escapeHtml(record.linkedin_url)}</a></p>
    <p><strong>Location:</strong> ${escapeHtml(record.location)}</p>
    <p><strong>Work preference:</strong> ${escapeHtml(record.work_preference || "— not specified —")}</p>
    <p><strong>How we know each other:</strong> ${escapeHtml(record.relationship_note || "— not specified —")}</p>
    <p><strong>Notes:</strong> ${escapeHtml(record.notes || "— none —")}</p>
    <p><strong>Submitted:</strong> ${escapeHtml(record.submitted_at)}</p>
  `;

  const ratingRow = `
    <p><strong>Rate this person:</strong>
      ${ratingLinks.map(l => `<a href="${escapeAttr(l.url)}" style="margin-right:12px;">${l.rating}</a>`).join("")}
    </p>
  `;

  const adminLink = `<p><a href="${process.env.SITE_URL}/admin/">Open admin view</a></p>`;

  await sendEmail({
    subject: `New job seeker: ${record.name}`,
    html: `<h2>New job seeker submission</h2>${fields}${ratingRow}${adminLink}`
  });
}

async function handleHiringContact(record) {
  const fields = `
    <p><strong>Name:</strong> ${escapeHtml(record.name)}</p>
    <p><strong>Email:</strong> ${escapeHtml(record.email)}</p>
    <p><strong>Job description:</strong> <a href="${escapeAttr(record.jd_url)}">${escapeHtml(record.jd_url)}</a></p>
    <p><strong>Notes:</strong> ${escapeHtml(record.notes || "— none —")}</p>
    <p><strong>Submitted:</strong> ${escapeHtml(record.submitted_at)}</p>
  `;

  const adminLink = `<p><a href="${process.env.SITE_URL}/admin/">Open admin view</a></p>`;

  await sendEmail({
    subject: `New hiring contact: ${record.name}`,
    html: `<h2>New hiring contact submission</h2>${fields}${adminLink}`
  });
}

async function createRatingTokensAndLinks(jobSeekerId) {
  const rows = [1, 2, 3, 4, 5].map((rating) => ({
    job_seeker_id: jobSeekerId,
    rating_value: rating
  }));

  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rating_tokens`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": process.env.SUPABASE_SECRET_KEY,
      "Authorization": `Bearer ${process.env.SUPABASE_SECRET_KEY}`,
      "Prefer": "return=representation"
    },
    body: JSON.stringify(rows)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to create rating tokens: ${errText}`);
  }

  const inserted = await response.json();

  return inserted.map((row) => ({
    rating: row.rating_value,
    url: `${process.env.SITE_URL}/.netlify/functions/rate-via-link?token=${row.token}`
  }));
}

async function sendEmail({ subject, html }) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.RESEND_API_KEY}`
    },
    body: JSON.stringify({
      from: "Talent Marketplace <onboarding@resend.dev>",
      to: process.env.NOTIFY_EMAIL,
      subject,
      html
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Resend send failed: ${errText}`);
  }
}

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, "&quot;");
}