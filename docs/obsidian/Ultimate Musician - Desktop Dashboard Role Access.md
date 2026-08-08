# Ultimate DAW Desktop Role Access

Date: August 8, 2026

Ultimate DAW Desktop is now restricted to:

- Org Owner
- Admin
- Worship Leader

Desktop login requests a live Cloudflare verification challenge after password authentication. The desktop session is created only after `/sync/auth/verify` succeeds and the account passes the desktop role gate. Saved sessions re-check access on startup and every 60 seconds while the app is open.

If a role is removed, the desktop session is cleared and the user must sign in again. Users without one of the approved roles are blocked from the desktop dashboard.

Renderer stability fix: temporary sync/API failures no longer clear the desktop session. Ultimate DAW only revokes access on an explicit server denial or a locally stored non-leadership role.

Worker version: `2.4.8-desktop-login-verification`.
