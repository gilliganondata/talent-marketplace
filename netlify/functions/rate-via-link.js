// netlify/functions/rate-via-link.js
//
// Handles clicks on the one-click rating links sent in the notification
// email. Validates the token (exists, not expired, not already used),
// applies the rating to the job seeker, and invalidates all sibling
// tokens for that same person (so clicking "4" disables 1/2/3/5 too).

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const token = event.queryStringParameters && event.queryStringParameters.token;

  if (!token) {
    return htmlResponse(400, "Missing token.");
  }

  // 1. Look up the token
  const tokenRow = await fetchToken(token);

  if (!tokenRow) {
    return htmlResponse(404, "This rating link isn't valid.");
  }

  if (tokenRow.used_at) {
    return htmlResponse(200, "This rating has already been recorded (or this link was already used). No changes made.");
  }

  if (new Date(tokenRow.expires_at) < new Date()) {
    return htmlResponse(410, "This rating link has expired. Open the admin view to set the rating manually.");
  }

  // 2. Apply the rating
  const updateOk = await applyRating(tokenRow.job_seeker_id, tokenRow.rating_value);
  if (!updateOk) {
    return htmlResponse(500, "Something went wrong applying this rating. Please try again or use the admin view.");
  }

  // 3. Invalidate this token and all sibling tokens for the same job seeker
  await invalidateSiblingTokens(tokenRow.job_seeker_id);

  return htmlResponse(200, `Rating of ${tokenRow.rating_value} recorded. Thanks!`);
};

async function fetchToken(token) {
  const response = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/rating_tokens?token=eq.${encodeURIComponent(token)}&select=*`,
    {
      headers: {
        "apikey": process.env.SUPABASE_SECRET_KEY,
        "Authorization": `Bearer ${process.env.SUPABASE_SECRET_KEY}`
      }
    }
  );

  if (!response.ok) return null;
  const rows = await response.json();
  return rows[0] || null;
}

async function applyRating(jobSeekerId, ratingValue) {
  const response = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/job_seekers?id=eq.${encodeURIComponent(jobSeekerId)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "apikey": process.env.SUPABASE_SECRET_KEY,
        "Authorization": `Bearer ${process.env.SUPABASE_SECRET_KEY}`,
        "Prefer": "return=minimal"
      },
      body: JSON.stringify({ rating: ratingValue })
    }
  );

  return response.ok;
}

async function invalidateSiblingTokens(jobSeekerId) {
  // Marks every not-yet-used token for this job seeker as used right now —
  // covers the clicked link and all four others in the same email.
  await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/rating_tokens?job_seeker_id=eq.${encodeURIComponent(jobSeekerId)}&used_at=is.null`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "apikey": process.env.SUPABASE_SECRET_KEY,
        "Authorization": `Bearer ${process.env.SUPABASE_SECRET_KEY}`,
        "Prefer": "return=minimal"
      },
      body: JSON.stringify({ used_at: new Date().toISOString() })
    }
  );
}

function htmlResponse(statusCode, message) {
  return {
    statusCode,
    headers: { "Content-Type": "text/html" },
    body: `
      <!DOCTYPE html>
      <html>
        <head><meta charset="UTF-8" /><title>Rating</title></head>
        <body style="font-family: system-ui, sans-serif; max-width: 420px; margin: 4rem auto; text-align: center; color: #1a1a1a;">
          <p style="font-size: 1.1rem;">${escapeHtml(message)}</p>
        </body>
      </html>
    `
  };
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}