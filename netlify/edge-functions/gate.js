// Server-side password gate for the internal Open Arms pages.
//
// The password lives ONLY in the Netlify environment variable GATE_PASSWORD —
// never in this repo and never in any page sent to the browser. A successful
// sign-in sets an HttpOnly cookie that covers every gated page for 12 hours.
//
// Protected paths are declared in `config.path` at the bottom. The public
// pages (landing, employment, waitlist, staff-photos) are NOT listed, so they
// stay open to everyone.

const COOKIE = "oa_gate";
const MAX_AGE = 60 * 60 * 12; // 12 hours

// The cookie value is a hash of the password (+ a fixed version tag), so the
// raw password is never stored in the cookie and the cookie can't be forged
// without knowing the password.
async function tokenFor(password) {
  const data = new TextEncoder().encode("oa-gate-v1:" + password);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default async function gate(request, context) {
  const password = Netlify.env.get("GATE_PASSWORD");

  // Fail closed: if no password is configured, lock everyone out rather than
  // risk serving a protected page.
  if (!password) {
    return new Response(renderPage({ configError: true }), {
      status: 503,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  const expected = await tokenFor(password);

  // Already signed in?
  const cookies = request.headers.get("cookie") || "";
  const authed = cookies
    .split(/;\s*/)
    .some((c) => c === COOKIE + "=" + expected);
  if (authed) return context.next();

  // Handle a submitted password.
  if (request.method === "POST") {
    const form = await request.formData();
    const attempt = String(form.get("password") || "").trim();
    if (attempt.toLowerCase() === password.toLowerCase()) {
      const url = new URL(request.url);
      const headers = new Headers();
      headers.set("location", url.pathname + url.search);
      headers.append(
        "set-cookie",
        COOKIE +
          "=" +
          expected +
          "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=" +
          MAX_AGE,
      );
      return new Response(null, { status: 303, headers });
    }
    return new Response(renderPage({ error: true }), {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }

  // Not signed in — show the password form.
  return new Response(renderPage({}), {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export const config = {
  path: [
    "/estimate",
    "/estimate.html",
    "/status",
    "/status.html",
    "/launch",
    "/launch.html",
    "/submissions",
    "/submissions.html",
    "/admin-video-interview-guide",
    "/admin-video-interview-guide.html",
  ],
};

function renderPage({ error, configError }) {
  const message = configError
    ? "Access is temporarily unavailable. Please contact the site administrator."
    : error
      ? "Sorry, that password is not correct."
      : "This page is restricted to Open Arms staff.";

  const form = configError
    ? ""
    : `<form method="POST" autocomplete="off">
        <div class="wrap">
          <input type="password" name="password" placeholder="Enter password"
                 autofocus aria-label="Password" />
        </div>
        <button type="submit">Continue</button>
      </form>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex" />
  <title>Open Arms — Staff Access</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@800;900&family=Open+Sans:wght@400;600&display=swap" rel="stylesheet" />
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: flex; align-items: center;
      justify-content: center; padding: 24px;
      font-family: 'Open Sans', system-ui, sans-serif;
      background: linear-gradient(135deg, #1A1A1A 0%, #1d5a96 100%); }
    .box { background: #fff; border-radius: 24px; padding: 40px 36px;
      max-width: 420px; width: 100%; text-align: center;
      box-shadow: 0 30px 60px rgba(0,0,0,.28); }
    .box img { width: 130px; margin-bottom: 20px; }
    h1 { font-family: 'Nunito', sans-serif; font-size: 22px; font-weight: 900;
      margin: 0 0 8px; color: #1A1A1A; }
    .msg { color: #5b6470; font-size: 14px; margin: 0 0 20px; line-height: 1.5; }
    .msg.err { color: #E94E41; font-weight: 600; }
    .wrap { position: relative; margin-bottom: 12px; }
    input { width: 100%; padding: 14px 16px; border: 2px solid #e6e8eb;
      border-radius: 12px; font-size: 15px; font-family: inherit; }
    input:focus { outline: none; border-color: #2A71B0; }
    button { width: 100%; padding: 14px; border: none; border-radius: 12px;
      background: #2A71B0; color: #fff; font-family: 'Nunito', sans-serif;
      font-weight: 800; font-size: 15px; cursor: pointer; }
    button:hover { background: #1d5a96; }
  </style>
</head>
<body>
  <div class="box">
    <img src="/images/open-arms-logo-black-letters-with-tag.png" alt="Open Arms Child Development Center" />
    <h1>Staff Access</h1>
    <p class="msg${error ? " err" : ""}">${message}</p>
    ${form}
  </div>
</body>
</html>`;
}
