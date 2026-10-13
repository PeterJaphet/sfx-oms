# M11 — installation, connectivity and updates

Supporting designs approved with the M11 plan. Use the existing brand tokens, Archivo body text,
Bricolage headings, rounded borders, no shadows, and buttons at least 44px high.

The icon extends the existing red SFx mark. `public/icons/icon.svg` is the editable source;
PNG icons serve 192px/512px installation, 512px maskable and 180px Apple home-screen use.
The maskable mark fits inside the central safe region. App name: SFx Burger OMS; short name:
SFx Burger. The installed app opens `/`, which retains existing role-based routing.

## Installation strip and help sheet

A white strip above the app shows the mark, “SFx Burger on your home screen”, and an Install app
button when the browser offers a prompt. Otherwise How to install opens a sheet for Safari,
Chrome and desktop instructions. Later dismisses the strip for that tab. An installed standalone
window hides it. Installation requires HTTPS (localhost is suitable for development); the HTTP
LAN dev URL cannot demonstrate phone installation.

## Connection warning

An amber strip appears above all screens, including sign-in and checkout. Open sheets repeat
the warning inside the modal so it remains visible and accessible while the background is inert. It says “You are offline”
when the browser reports offline, or “Connection interrupted” after a failed network request.
Copy: “Saving and uploads are paused. Keep this tab open and reconnect before saving. Displayed
figures may be out of date.” Check connection is a 44px action. A read-only connection check also
runs every ten seconds while disconnected; it never resubmits a financial request.

Server-write buttons dim and disable offline. Local cart/details editing stays available where
the necessary reference data is already loaded. File selection remains a local draft action;
uploads require connection. Query data stays in memory; service-worker cache holds static app
files only, never Auth/API responses or private photos. A reload offline can show the shell and
connection warning; signing in and loading server-authorized account data still need connection.

New saves preflight before creating recovery records. A write already sent when the connection
fails can have committed: retain its existing request ID and use the existing manual Retry
confirmation. Reconnecting refreshes reads; it does not automatically send new or queued writes.

## Update strip

A red-tinted strip announces “An app update is ready” with Update app and Later buttons.
Copy tells staff to finish or cancel open forms: an update reloads the tab and clears unsaved
form entries. Persisted order drafts remain available after reload.

Updates require connection, no request currently saving, no pending confirmation in this tab,
and no other open app tabs/windows on this origin. Staff finish work and close other tabs before
activating the update. The service worker supplies only a tab count; it does not receive order
payloads or staff details. No automatic reload follows an update activated elsewhere. Recheck
request safety immediately before reload. Later leaves the current page in place.

Installation/offline/update strips wrap at 360–430px and remain readable at desktop widths.
They use alert/status regions, descriptive text, decorative icons and normal labelled buttons.
