// netlify/functions/rate-via-link.js
//
// Handles clicks on the one-click rating links sent in the notification
// email. Validates the token (exists, not expired, not already used),
// applies the rating to the job seeker, and invalidates all sibling
// tokens for that same person (so clicking "4" disables 1/2/3/5 too).

// Shown for a token that doesn't exist. Deleting a job seeker also deletes
// their tokens (ON DELETE CASCADE), so a deleted person's link lands here too.
const UNKNOWN_LINK_MESSAGE = "This link isn't valid, or the record no longer exists.";

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const token = event.queryStringParameters && event.queryStringParameters.token;

  if (!token) {
    return htmlResponse(400, "Missing token.");
  }

  try {
    // 1. Look up the token
    const tokenRow = await fetchToken(token);

    if (!tokenRow) {
      return htmlResponse(404, UNKNOWN_LINK_MESSAGE);
    }

    if (tokenRow.used_at) {
      return htmlResponse(200, "This rating has already been recorded (or this link was already used). No changes made.");
    }

    if (new Date(tokenRow.expires_at) < new Date()) {
      return htmlResponse(410, "This rating link has expired. Open the admin view to set the rating manually.");
    }

    // 2. Apply the rating
    const result = await applyRating(tokenRow.job_seeker_id, tokenRow.rating_value);
    if (result === "missing") {
      // The person was deleted after the token was looked up.
      return htmlResponse(404, UNKNOWN_LINK_MESSAGE);
    }
    if (result !== "ok") {
      return htmlResponse(500, "Something went wrong applying this rating. Please try again or use the admin view.");
    }

    // 3. Invalidate this token and all sibling tokens for the same job seeker
    await invalidateSiblingTokens(tokenRow.job_seeker_id);

    return htmlResponse(200, `Rating of ${tokenRow.rating_value} recorded. Thanks!`);
  } catch (err) {
    // Never leak a stack trace to the visitor.
    console.error("rate-via-link failed:", err);
    return htmlResponse(500, "Something went wrong applying this rating. Please try again or use the admin view.");
  }
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
    `${process.env.SUPABASE_URL}/rest/v1/job_seekers?id=eq.${encodeURIComponent(jobSeekerId)}&select=id`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "apikey": process.env.SUPABASE_SECRET_KEY,
        "Authorization": `Bearer ${process.env.SUPABASE_SECRET_KEY}`,
        "Prefer": "return=representation"
      },
      body: JSON.stringify({ rating: ratingValue })
    }
  );

  if (!response.ok) return "error";
  // PostgREST updates zero rows without an error if the person no longer exists.
  const updated = await response.json();
  return updated.length > 0 ? "ok" : "missing";
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
        <head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><meta name="color-scheme" content="light dark" /><title>Rating</title></head>
        <body style="font-family: system-ui, sans-serif; max-width: 420px; margin: 4rem auto; text-align: center;">
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