# Personal Talent Marketplace

A small, private tool for keeping track of two lists that are easy to lose track of in your head:

- **People in your network looking for their next role** (job seekers)
- **People asking you to help fill an open role** (hiring contacts)

Each side gets a public, no-login, under-a-minute intake form. You get a private, authenticated admin view where you can review both lists, privately rate job seekers, filter by keyword/location, add private notes, and archive people once things resolve — plus an email notification (with a one-click rating shortcut) every time someone submits.

Nobody who fills out either form can see anyone else's submission, your ratings, or your notes. That's enforced at the database level, not just hidden in the UI — see the Security section below.

This repo is meant to be forked and run as **your own independent instance** — there's no shared data between copies of this app. If you're reading this because you clicked "Use this template" on GitHub, welcome — here's how to get your own copy running.

## What you'll need

All free-tier, aside from GitHub and Netlify, which this assumes you already have:

- A [GitHub](https://github.com) account (you're already here)
- A [Netlify](https://netlify.com) account (hosting)
- A [Supabase](https://supabase.com) account (database + auth)
- A [Resend](https://resend.com) account (email notifications)

## Setup

### 1. Supabase project

1. Create a new Supabase project. Pick any region close to you.
2. In the SQL Editor, run everything in [`supabase/schema.sql`](./supabase/schema.sql). This creates all four tables, enables row-level security, and creates the two public submission functions.
3. Go to **Authentication → Providers → GitHub** and enable it. This requires creating a GitHub OAuth App (**GitHub → Settings → Developer settings → OAuth Apps → New OAuth App**) using the callback URL Supabase shows you on that page. Leave "Enable Device Flow" unchecked. Copy the resulting Client ID/Secret back into Supabase.
4. From the **Connect** dialog, grab your **Project URL**, **Publishable key**, and **Secret key** — you'll need these shortly.

### 2. Deploy to Netlify

1. Push this repo to your own GitHub account if you haven't already (if you used "Use this template," it's already there).
2. In Netlify: **Add new project → Import an existing project**, connect the repo.
3. Build settings: leave **Base directory** and **Build command** blank, set **Publish directory** to `public`.
4. Deploy — you'll get a `*.netlify.app` URL.

`netlify.toml` contains one `[[redirects]]` rule that sends the original instance's old domain to its new one. It only matches that hostname, so it's harmless in a fork, but you should remove or replace it with your own.

### 3. Environment variables

In Netlify: **Project configuration → Environment variables**, add:

| Key | Value | Secret? | Scope |
|---|---|---|---|
| `SUPABASE_URL` | Your Supabase project URL | No | Functions |
| `SUPABASE_SECRET_KEY` | Your Supabase secret key | **Yes** | Functions |
| `RESEND_API_KEY` | Your Resend API key (Sending access only) | **Yes** | Functions |
| `NOTIFY_EMAIL` | Where you want submission emails sent | Recommended | Functions |
| `SITE_URL` | Your live site URL (e.g. `https://your-site.netlify.app`) | No | Functions |
| `WEBHOOK_SECRET` | A random string — generate with `openssl rand -hex 32` | **Yes** | Functions |

Trigger a redeploy after adding these so the functions pick them up.

### 4. Wire up the notification webhooks

In Supabase: **Database → Webhooks** (if you get a "schema does not exist" error, first enable the `pg_net` extension under **Database → Extensions**, then retry).

Create two webhooks, both **Insert**-only, **HTTP Request**, method **POST**:
- On `job_seekers` → URL: `<your-site>/.netlify/functions/send-notification`
- On `hiring_contacts` → same URL

Both need an HTTP header: `x-webhook-secret` set to the same value as your `WEBHOOK_SECRET` env var.

### 5. Configure the site

Edit [`public/assets/site-config.js`](./public/assets/site-config.js):

```javascript
window.SITE_CONFIG = {
  ownerName: "Your Name",
  siteName: "Your Name's Personal Talent Marketplace",
  theme: "ocean", // slate, ocean, forest, sunset, plum, midnight, or custom
  repoUrl: "https://github.com/your-username/your-repo"
};
```

The file in this repo ships with a `custom` theme (and `customTheme` / `fontStylesheetUrl` entries) for the original instance. Replace those with your own, or delete them and set `theme` to a preset. See [Theming](#theming).

Commit and push.

### 6. Make yourself an admin

1. Visit `<your-site>/admin/` and sign in with GitHub.
2. In Supabase, check **Authentication → Users** for your new user, and copy its UUID.
3. In the SQL Editor: `insert into admins (user_id) values ('paste-your-uuid-here');`
4. Reload `/admin/` — you should now see the (empty) lists.

### 7. Test it

Submit a test entry on `/seeker-form.html` and `/hiring-form.html`. You should get an email for each, and see them appear in `/admin/`.

## Theming

Set `theme` in `site-config.js` to one of the presets: `slate` (neutral), `ocean`, `forest`, `sunset`, `plum` (all light) or `midnight` (neutral dark).

For your own look, set `theme: "custom"` and add a `customTheme` object. It's merged over the preset named in `customTheme.base` (default `slate`); any token you leave out, or give an invalid value, falls back to that preset.

```javascript
theme: "custom",
customTheme: {
  base: "midnight",
  primary: "#FFC23C", primaryText: "#14161A",
  fontBody: "'IBM Plex Sans', sans-serif",
  colorScheme: "dark"
},
fontStylesheetUrl: "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500&display=swap"
```

Tokens:

| Token | Used for |
|---|---|
| `bg` | Page background |
| `surface` | Cards, inputs and other raised areas |
| `text` | Body text |
| `mutedText` | Secondary text: hints, captions, dates |
| `primary` / `primaryText` | Buttons and selected states (and checked checkboxes/radios); text on top of `primary` |
| `accentBg` | Subtle tinted panels and inactive tabs |
| `border` | Borders and dividers |
| `link` | Links only |
| `focus` | Keyboard focus outline |
| `danger` | Error messages |
| `fontBody` / `fontDisplay` | Font stacks for body text and headings |
| `colorScheme` | `light` or `dark`; sets the CSS `color-scheme` so native form controls match |

**Fonts:** `fontBody` and `fontDisplay` are CSS `font-family` values. To use a web font, set `fontStylesheetUrl` to its `https://` stylesheet URL (e.g. from Google Fonts) and `theme.js` will load it. Without that URL, only fonts already on the visitor's device are used.

**Contrast:** run `node scripts/check-contrast.js` to check every preset and your own theme against WCAG 4.5:1 for text pairs (hex colors only).

## Security notes

- Public form submissions go through Postgres functions (`submit_job_seeker`, `submit_hiring_contact`), never direct table access — the public role has no read or write grant on the underlying tables at all.
- Admin access requires both a valid Supabase Auth session *and* your user ID being present in the `admins` table — logging in with GitHub alone isn't enough.
- Ratings, admin notes, and email addresses are never exposed through any public-facing code path.
- Before relying on this for real, it's worth re-verifying the checks above against your own instance rather than taking them on faith — the schema and functions are all in this repo for you to read.

## What this doesn't do

- No messaging built in — replying to submitters is expected to happen the old-fashioned way (email/LinkedIn), not through this tool.
- No multi-admin support out of the box (see `admins` table if you want to add more than one).
- No automated matching — filtering is keyword/location based, reviewed by a human (you).

## License

MIT — see [`LICENSE`](./LICENSE). Do what you like with it.