# Browser Volume Control

Per-tab volume control browser extension. Phase 1 scope: current-tab volume slider, mute, and enable/disable control.

## Security posture

- **MV3**, no host permissions at install time. Uses `activeTab` so the extension only touches a tab after the user clicks it.
- **Strict CSP** on extension pages (`script-src 'self'`), no `eval`, no remote code execution.
- **Message origin check** on every `chrome.runtime` message (`sender.id === chrome.runtime.id`) so web pages cannot send fake control messages.
- **No analytics, no telemetry, no network calls** except Google Fonts CSS for the popup UI (allow-listed in CSP; can be bundled locally for an offline build — see below).
- **No storage** in Phase 1. No PII is recorded anywhere. Phase 2 will store per-origin volume prefs in `chrome.storage.sync` and nothing else.
- **Origin-bound state**: on cross-origin navigation of a tab, in-memory state is wiped so the prior site's settings cannot affect a new site.

## Dev

```bash
npm install
npm run dev       # watches and writes to dist/
```

Load `dist/` as an unpacked extension in `chrome://extensions` (Developer mode on).

## Build

```bash
npm run build
npm run package   # produces browser-volume-control.zip
```

## What NOT to commit

`.gitignore` excludes `node_modules/`, `dist/`, build artefacts, `.env*`, `*.pem` (extension signing keys), `*.key`, the Chrome Web Store publishing key (`.chrome-webstore-key`), and editor-local config. Never commit the private key used to sign packaged builds.

## Offline fonts (optional hardening)

To remove the Google Fonts network fetch entirely, download Fraunces and JetBrains Mono `.woff2` files into `src/assets/fonts/`, replace the `@import` in `src/popup/styles.css` with local `@font-face` declarations, and tighten the popup CSP back to `font-src 'self'; style-src 'self' 'unsafe-inline'`.
