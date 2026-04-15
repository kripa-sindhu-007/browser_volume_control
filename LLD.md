# Browser Volume Control — Low-Level Design

## 1. Design Direction

**Aesthetic:** Refined-industrial. Think analog studio mixer meets editorial magazine. The extension is a precision instrument, not a toy — it should feel mechanical, confident, and quiet.

- **Type:** Display — `Fraunces` (optical-sized serif, for the numeric readout and headings). Body — `JetBrains Mono` (compact monospace, for labels, states, domains).
- **Palette (dark-first):**
  - `--ink: #0E0E0C` (base)
  - `--paper: #F3EFE6` (foreground / text)
  - `--amber: #E8A13A` (active signal — the VU needle)
  - `--rust: #B5442C` (muted / danger)
  - `--moss: #6B7A4F` (remembered-preset badge, Phase 2)
  - `--graphite: #1C1C1A` (surfaces)
- **Texture:** subtle film-grain overlay (`background-image: url(noise.svg); opacity: .04`) across the popup; hairline 1px dividers in `--paper` at 12% opacity.
- **Motion:** slider drag → needle swings with spring (stiffness 220, damping 22). Mute toggle → iris-wipe in `--rust`. No bounce on numeric tickers — they count crisply.
- **Signature detail:** a horizontal VU-meter strip above the slider that lights amber with the audio's live RMS level. This is the "unforgettable" piece — users see the tab *breathing*.

---

## 2. System Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    Browser Extension                     │
├──────────────┬───────────────────┬───────────────────────┤
│  Popup (UI)  │  Service Worker   │  Content Script       │
│  React+Vite  │  (background.ts)  │  (injected per tab)   │
└──────┬───────┴─────────┬─────────┴──────────┬────────────┘
       │                 │                    │
       │  chrome.runtime messaging            │
       │                 │                    │
       │          ┌──────▼──────┐      ┌──────▼──────┐
       │          │ chrome.tabs │      │ Web Audio   │
       │          │   API       │      │ API (gain)  │
       │          └─────────────┘      └─────────────┘
       │
   ┌───▼────────────────┐
   │ chrome.storage.    │   (Phase 2: per-site prefs)
   │   sync / local     │
   └────────────────────┘
```

**Why a content script owns the audio graph:** `chrome.tabs.setMuted` only mutes; it cannot scale gain. To set arbitrary gain (0.0–2.0 with Boost), we must intercept each `<audio>`/`<video>` element in the page with Web Audio's `MediaElementAudioSourceNode → GainNode → destination`.

---

## 3. Phase 1 — Minimal Volume Control

### 3.1 Components

| Component | Path | Responsibility |
|---|---|---|
| `PopupApp` | `popup/App.tsx` | Root; reads current tab state, renders panel |
| `TabStatusHeader` | `popup/TabStatusHeader.tsx` | Shows domain, favicon, state chip (INACTIVE / ACTIVE / MUTED / UNAVAILABLE) |
| `VUMeter` | `popup/VUMeter.tsx` | 24-segment amber strip driven by `AnalyserNode` RMS |
| `VolumeDial` | `popup/VolumeDial.tsx` | Horizontal slider 0–100, large numeric readout in Fraunces |
| `MuteToggle` | `popup/MuteToggle.tsx` | Single button, iris-wipe animation |
| `ControlToggle` | `popup/ControlToggle.tsx` | Enable/disable control for this tab |
| `audioController.ts` | `content/audioController.ts` | Manages `AudioContext`, `GainNode`, element observers |
| `messaging.ts` | `shared/messaging.ts` | Typed `chrome.runtime` wrapper |

### 3.2 State Machine (per tab)

```
UNAVAILABLE ──(tab has audio element)──► INACTIVE
INACTIVE ──(user clicks Enable)──► ACTIVE (gain=1.0)
ACTIVE ──(slider)──► ACTIVE (gain=0.0–2.0)
ACTIVE ──(mute)──► MUTED (gain=0, remembers prior)
MUTED ──(unmute)──► ACTIVE (gain=prior)
ACTIVE/MUTED ──(Stop controlling)──► INACTIVE (graph torn down)
```

### 3.3 Message Protocol

```ts
type Msg =
  | { type: 'GET_TAB_STATE' }
  | { type: 'ENABLE_CONTROL'; tabId: number }
  | { type: 'SET_GAIN'; tabId: number; gain: number }
  | { type: 'SET_MUTED'; tabId: number; muted: boolean }
  | { type: 'DISABLE_CONTROL'; tabId: number }
  | { type: 'RMS_TICK'; level: number };  // content → popup, 30 Hz
```

Background service worker is the single source of truth for per-tab state (`Map<tabId, TabState>`). Popup is stateless UI.

### 3.4 Audio Graph (content script)

```ts
const ctx = new AudioContext();
const gain = ctx.createGain();
const analyser = ctx.createAnalyser();
gain.connect(analyser).connect(ctx.destination);

// For each <audio|video> in DOM + MutationObserver for new ones:
const src = ctx.createMediaElementSource(el);
src.connect(gain);
```

Edge cases to handle:
- Cross-origin media (CORS `crossorigin="anonymous"` not always present) → graceful fallback to `el.volume` scaling (no Boost above 1.0 possible; surface as `UNAVAILABLE_BOOST`).
- `AudioContext` suspended until user gesture → lazy-init on first `ENABLE_CONTROL`.
- SPA navigation → `MutationObserver` re-attaches.

### 3.5 Popup Layout (Phase 1)

```
┌─────────────────────────────────┐
│  ◉ youtube.com         ACTIVE   │  ← TabStatusHeader (mono, small caps)
├─────────────────────────────────┤
│  ▁▂▃▅▆▇█▇▆▅▃▂▁▁▁▁▁▁▁▁▁▁▁▁      │  ← VUMeter (live amber)
│                                 │
│          0 7 4                  │  ← Fraunces 72px numeric
│          ═══════════════        │  ← dial
│  ────────●──────────────────    │
│                                 │
│  [ MUTE ]         [ STOP CTRL ] │  ← mono buttons, hairline borders
└─────────────────────────────────┘
```

Dimensions: 320×380. Padding 20px. Film-grain overlay on `--graphite`.

---

## 4. Phase 2 — Website Memory & Preset Modes

### 4.1 New Components

| Component | Responsibility |
|---|---|
| `PresetRail` | Horizontal row of 4 chips: NORMAL / QUIET / BOOST / MUTE |
| `RememberedBadge` | Small `--moss` pill "remembered" next to domain when prefs applied |
| `PrefMenu` | Overflow: "reset this site", "forget all" |
| `prefStore.ts` | Wrapper over `chrome.storage.sync` with debounce |

### 4.2 Data Model

```ts
type SitePref = {
  origin: string;         // e.g. "https://youtube.com"
  mode: 'normal' | 'quiet' | 'boost' | 'mute' | 'custom';
  gain: number;           // 0.0–2.0
  updatedAt: number;
};

type Store = {
  prefs: Record<string /*origin*/, SitePref>;
  defaults: { normal: 1.0; quiet: 0.4; boost: 1.6; mute: 0.0 };
  boostCap: 2.0;          // safety ceiling (answers open question)
};
```

**Scoping decision:** origin-level (`scheme://host`). Full-domain is too broad (different subdomains have different audio profiles, e.g. `meet.google.com` vs `youtube.com`). Exact URL is too narrow.

**Save policy:** auto-save after 800ms of slider inactivity. A small toast "saved for youtube.com" appears once per site per session — honest, not stealthy.

### 4.3 Application Flow

```
Tab navigates ──► background.onUpdated ──►
  lookup prefs[origin] ──► inject content script ──►
  ENABLE_CONTROL with saved gain ──► popup shows RememberedBadge
```

If user overrides: new value replaces saved one after debounce. Preset click → sets gain + writes pref immediately.

### 4.4 Popup Layout (Phase 2)

```
┌─────────────────────────────────┐
│  ◉ youtube.com  [remembered]    │  ← moss badge
├─────────────────────────────────┤
│  [NORMAL] [QUIET] [BOOST] [MUTE]│  ← PresetRail; active chip inverted
├─────────────────────────────────┤
│  ▁▂▃▅▆▇█▇▆▅▃▂▁▁▁▁▁▁▁▁▁        │
│          0 7 4                  │
│  ────────●──────────────────    │
│                                 │
│  [ MUTE ]   [ ⋯ ]   [ STOP ]    │  ← ⋯ opens PrefMenu
└─────────────────────────────────┘
```

Preset chips use monospace small-caps, hairline borders, amber fill when active. Active chip does NOT animate — stillness signals commitment. Switching between chips uses a 140ms crossfade on the fill.

### 4.5 Boost Safety

- Hard cap at 2.0× gain (answers open question).
- When gain > 1.5, VU segments above the threshold render in `--rust` — visual warning without nagging copy.
- On first-ever Boost selection: one-time inline note "Boost can distort on already-loud sites" that dismisses on any interaction.

---

## 5. Cross-Phase Concerns

### 5.1 File Structure

```
src/
  popup/
    App.tsx, TabStatusHeader.tsx, VUMeter.tsx,
    VolumeDial.tsx, MuteToggle.tsx, ControlToggle.tsx,
    PresetRail.tsx (P2), RememberedBadge.tsx (P2), PrefMenu.tsx (P2),
    styles.css  (CSS vars, grain overlay, font-face)
  background/
    index.ts           (service worker, tab state map, message router)
  content/
    audioController.ts, elementObserver.ts, rmsTicker.ts
  shared/
    messaging.ts, types.ts, prefStore.ts (P2)
  assets/
    fonts/Fraunces-VF.woff2, JetBrainsMono.woff2, noise.svg
manifest.json          (MV3)
```

### 5.2 Manifest (MV3)

Permissions: `activeTab`, `tabs`, `scripting`, `storage` (P2). No host permissions until user enables control on a tab — keeps the "never secretly changing audio" principle visible at install time.

### 5.3 Performance Budget

- Popup first paint < 80ms (pre-bundled fonts, no network).
- RMS tick throttled to 30 Hz; `requestAnimationFrame`-aligned when popup open, suspended when closed.
- Audio graph teardown on `DISABLE_CONTROL` is synchronous; no leaked `AudioContext`s.

### 5.4 Accessibility

- Slider is a native `<input type="range">` with `aria-valuetext="74 percent"`.
- VU meter is `aria-hidden` (decorative).
- Preset chips are `role="radiogroup"`.
- All state changes announced via `aria-live="polite"` on the status chip.
- Full keyboard operation: Tab order = presets → slider → mute → menu → stop.

### 5.5 Testing Strategy

- Unit: `prefStore` (storage mocked), state machine transitions.
- Integration: Playwright against a fixture page with `<video>`; assert gain changes affect measured output via an `OfflineAudioContext`.
- Manual matrix: YouTube, Spotify Web, Google Meet, Twitch, a CORS-blocked media site (fallback path).

---

## 6. Delivery Plan

**Phase 1 (2 weeks)**
1. Scaffold MV3 + Vite + React; wire popup ↔ background ↔ content messaging.
2. Audio graph with single `<video>`; slider + mute.
3. `MutationObserver` for dynamic media; state machine; UNAVAILABLE handling.
4. Visual polish: fonts, grain, VU meter, needle animation.
5. Manual matrix + Chrome Web Store listing.

**Phase 2 (2 weeks)**
1. `chrome.storage.sync` with debounced writes; origin-scoped prefs.
2. `PresetRail` + preset application on navigation.
3. `RememberedBadge`, `PrefMenu` (reset / forget all), save toast.
4. Boost cap + rust-colored warning segments.
5. Sync conflict handling, migration stub for future schema.

---

## 7. Open Questions — Resolved

| Question | Decision |
|---|---|
| Auto-save vs explicit save? | **Auto-save** with visible one-time toast. Fewer steps; honesty via surfaced confirmation. |
| Scope: exact / domain / group? | **Origin** (`scheme://host`). |
| Boost cap? | **2.0× hard cap**, rust warning above 1.5×. |
| Mixer view? | Deferred — Phase 3. |
| Keyboard shortcuts? | Deferred — Phase 3 (`Alt+↑/↓` for current tab). |
