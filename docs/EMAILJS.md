# Staff Contact Form — EmailJS Setup

This document is for future developers (or future-Gary) who need to understand,
maintain, or migrate the staff contact form on the Open Arms website.

## TL;DR

- The "Message" button on each staff card opens a modal that submits to
  [EmailJS](https://www.emailjs.com), a third-party "send email from the
  browser" service.
- The Open Arms website (Netlify-hosted static site) is **not** involved in
  email delivery — Netlify just serves the HTML/CSS/JS. All routing happens
  EmailJS-side.
- Account ownership: **Gary Ricke** — set up under his personal login on the
  EmailJS **free tier** (200 sends/month, 1 allowed origin domain).

## Why EmailJS instead of Netlify Forms / mailto / a backend?

- **Netlify Forms** can only deliver to a single, fixed email per form. We
  needed per-staff routing (each classroom has its own inbox), so a single
  Netlify form wouldn't work without a Functions-backed forwarder.
- **`mailto:` links** open the user's email client. On phones this is fine, but
  on shared desktops or kiosks it often opens nothing useful, and it leaks
  staff addresses to bots scraping the page source.
- **A backend** (Node/Cloudflare Worker/etc.) would have worked but adds infra
  to maintain — overkill for a contact form.
- **EmailJS** is free up to 200/month, requires zero backend, lets us pass the
  recipient address as a template variable so one template handles all 13
  routing addresses, and keeps the addresses out of the rendered HTML
  (they live only in the JS data array and are sent to EmailJS via XHR).

## Architecture

```
┌─────────────────────────┐   1. Page load (HTML + JS)
│  openarmsak.netlify.app │ ◄──────────────────────────── Browser
│       (Netlify CDN)     │
└─────────────────────────┘
                            2. User clicks "Message",
                               fills form, submits
                            ┌──────────────────────────────────┐
                            │   emailjs.send(SERVICE, TEMPLATE,│
                            │     { to_email, from_email, …})  │
                            └──────────────────────────────────┘
                                          │
                                          ▼
                            ┌──────────────────────────────────┐
                            │     EmailJS api.emailjs.com      │
                            │  - Verifies allowed origin       │
                            │  - Renders template variables    │
                            │  - Sends via connected mailbox   │
                            └──────────────────────────────────┘
                                          │
                                          ▼
                            ┌──────────────────────────────────┐
                            │   Gary's connected Gmail account │
                            │   (acts as the SMTP sender)      │
                            └──────────────────────────────────┘
                                          │
                                          ▼
                            ┌──────────────────────────────────┐
                            │  Recipient classroom inbox       │
                            │  e.g. Infant@openarmsfairbanks…  │
                            └──────────────────────────────────┘
```

## Where everything lives in the code

| Thing | File | Lines (approx) |
|---|---|---|
| EmailJS SDK script tag | `index.html` | head, `<script src="https://cdn.jsdelivr.net/npm/@emailjs/browser@4/...">` |
| Three credentials (public key, service ID, template ID) | `index.html` | near bottom, in the staff contact form `<script>` block |
| Staff data array (with `email` field per person) | `index.html` | search for `const staff = [` |
| Modal HTML (`#contact-modal`) | `index.html` | search for `<!-- ── STAFF CONTACT MODAL ──` |
| Modal CSS (`.cm-*` classes) | `index.html` | search for `── STAFF CONTACT MODAL ──` in the `<style>` block |
| Submit handler (`emailjs.send` call) | `index.html` | inside `cm-form`'s submit listener |

## EmailJS dashboard configuration

Login: Gary's personal account (gary.ricke@orbisdesign.com or similar — check
1Password / wherever credentials live).

- **Email Services → one service connected** (the Gmail account that acts as
  the sender). If this gets disconnected (Google revokes the OAuth grant
  periodically), the form will fail until it's reconnected. The dashboard
  History tab will show explicit auth errors.
- **Email Templates → one template** with these variables:
  - `{{to_email}}` — used in the **To** field (dynamic recipient)
  - `{{to_name}}` — used in the body greeting
  - `{{from_name}}`, `{{from_email}}` — used in body; `{{from_email}}` is
    also set as **Reply-To** so staff replies go back to the parent
  - `{{subject}}` — used in the **Subject** field
  - `{{message}}` — used in the body
- **Account → General → Domains:** locked to `https://openarmsak.netlify.app`.
  Free tier allows exactly 1 domain — when the site migrates to a custom
  domain, this needs to be **swapped** (not added).
- **Account → General → API Settings:** "Allow EmailJS API for non-browser
  applications" is **off**. Keeping it off ensures the public key can't be
  used from server-side scripts that bypass the origin check.

## Spam protection

Three layers, all already in place:

1. **Honeypot field** (`name="cm_trap"`) hidden via inline `style="display:none"`
   in the modal. The submit handler short-circuits if it has any value. Blocks
   most automated form-fillers.
2. **EmailJS origin restriction** — requests from any origin other than
   `openarmsak.netlify.app` are rejected at the EmailJS server.
3. **200/month free-tier cap** — hard ceiling on abuse volume; the dashboard
   makes overages obvious.

The "Restrict 'To Email'" allow-list (which would prevent abuse via the
dynamic `{{to_email}}` variable from a logged-in attacker on our own domain)
is a **paid** feature on EmailJS as of this setup. We accepted that residual
risk because the attack requires hands-on effort against a specific daycare
contact form — not a realistic threat profile.

## Common issues

| Symptom | Likely cause | Fix |
|---|---|---|
| **Form succeeds but message lands in the wrong inbox** (specifically the connected sender account, not the intended recipient) | EmailJS template's **To Email** field is set to its default (the connected service account) rather than the variable `{{to_email}}`. This is the #1 EmailJS template misconfiguration — it bit us during initial testing on May 7, 2026. | Open the template → set **To Email** to exactly `{{to_email}}` (with the double braces) → Save. Use the template's "Test It" button to verify before going back to the live site. |
| Form shows red error toast on submit | Origin mismatch (browsing a preview URL or local dev server) | Test on the live `openarmsak.netlify.app` URL |
| Form shows error, dashboard shows auth failure | Gmail OAuth revoked | Reconnect the Gmail service in EmailJS dashboard |
| Form succeeds but staff don't get the email at all | Spam folder, or template variables don't match the JS payload | Check Gmail/M365 spam, then verify template uses `{{to_email}}` not `{{recipient}}` etc. |
| Form button stays disabled forever | JS error before `emailjs.send` resolves | Check browser console |
| Sends silently dropped | Honeypot filled (legit user with autofill?) | Check the `cm_trap` field — should always be empty for real submits |
| Replies from staff go to Gary instead of the parent | Template's **Reply-To** field is empty or wrong | Set **Reply-To** to exactly `{{from_email}}` |

### How to verify the template is wired correctly

The fastest sanity check, copy-pasteable into the EmailJS template editor:

| Template field | Required value |
|---|---|
| **To Email** | `{{to_email}}` |
| **From Name** | `{{from_name}}` *(or a fixed string like "Open Arms Website")* |
| **Reply To** | `{{from_email}}` |
| **Subject** | `[Open Arms] {{subject}}` *(or similar — must reference `{{subject}}`)* |
| **Bcc / Cc** | empty |
| **Body** | references `{{to_name}}`, `{{from_name}}`, `{{from_email}}`, `{{message}}` |

If any of those fields hold a literal email address (like `gary.ricke@orbisdesign.com`) instead of the curly-brace variable, that's almost certainly the bug.

## Future TODOs

- [ ] **When the site moves to a custom domain** (e.g., `openarmsfairbanks.org`):
      log in to EmailJS → Account → Domains → **replace** the existing
      `openarmsak.netlify.app` entry with the new domain. The free tier doesn't
      allow a second domain, so this is a swap. No code change needed — the
      three credentials in `index.html` are tied to the account, not the domain.
- [ ] **Wesley and Paetynn** currently have `email: null` in the staff array
      (so their cards render without a Message button). When they're assigned a
      classroom routing address, fill in the `email` field in `index.html` and
      the buttons will appear automatically.
- [ ] **Account ownership transfer**: if Open Arms ever wants to own the EmailJS
      account directly (rather than rely on Gary's login), either (a) transfer
      the existing account by changing the login email in EmailJS settings, or
      (b) create a new account under their email, redo the setup steps from
      `status.html`'s May 5 entry, and swap the three IDs in `index.html`.
- [ ] **Monitoring**: there's no automated alert if the form starts failing.
      Worth a once-a-quarter manual check of the EmailJS History tab to confirm
      sends are succeeding.

## Related changelog entries

- **May 5, 2026** (status.html) — initial build of the modal, staff data array,
  and EmailJS integration code (with placeholder credentials).
- **May 7, 2026** (status.html) — credentials wired in, end-to-end test, go-live.
