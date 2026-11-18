FeePilot (rebuilt front-end)
============================
Upload the CONTENTS of this folder to any static host (Cloudflare Pages, Netlify, GitHub Pages, Vercel).

  /            landing page          /app/     the school app (staff sign in here)
  /admin/      platform owner console    /verify/  public receipt check

Edit config.js to set the support WhatsApp number (e.g. 233244000000). The Supabase URL and PUBLIC key
are already there; the backend is unchanged (same tables, views and functions as the original).

After you choose a domain: in Supabase > Authentication > URL Configuration set Site URL to it.
Avoid putting words like "bank", "pay" or "login" in a free shared hostname; they can trigger phishing filters.
