# Mobile audit

> Can Coffee Flow be played on a phone? An audit of the UX and the code
> behind it, and the list of fixes that follow from it.

Audited on 2026-10-10 against `fded80f` (the React/TypeScript port), in
headless Chromium with Playwright's iPhone 13 (390×664, portrait and
landscape) and Pixel 5 (393×727) profiles: splash, free play, build tray,
placing a till, the ⋯ menu and Research.

**Verdict at audit time: not playable on a phone.** Tapping a tray, a
tile and the floor does place a till, so the first tutorial step works.
Beyond that the page is wider than the screen, the ⋯ menu cannot be
reached, and several actions exist only on a keyboard or a right mouse
button.

Each finding has a status. Fixes tick them off.

## Blockers

### 1. The page is wider than the phone

- **Status:** fixed: at ≤600px the bar stacks money, controls and pass, pause/play plus a speed-stepping button replace the five speed buttons, dock tools shrink and stacked Research scrolls as one; no horizontal overflow on iPhone 13 or Pixel 5
- **Where:** `src/app/styles.css` (`.bar`, `.controls`, the
  `max-width: 1100px` rule), `src/app/components/TopBar.tsx`
- **Seen:** on a 390px iPhone the document is 448px wide. `.controls`
  (Open shop, clock, five speed buttons, ⋯) is `flex-wrap: nowrap` and
  needs about 413px; at ≤1100px the bar becomes `minmax(0,1fr) auto`, so
  the money column collapses to nothing.
  - The cash is drawn on top of the "Open shop" button.
  - The ⋯ button is off-screen and cannot be tapped (the `20×` button
    intercepts the tap). Flow charts, Replay code, Playtest bots, Pixel
    mode and Title screen are unreachable.
  - The splash title, the level list, Research and the dock are cut off
    on the right. A real mobile browser zooms the whole page out to fit.
- **Fix:** a narrow-screen layout (≤600px). Collapse the five speed
  buttons into pause/play plus a speed cycler (or move speed into ⋯), and
  give the controls their own row or let them wrap. The document must be
  no wider than the viewport.

### 2. Rotate, cancel and multi-place need a keyboard or a mouse

- **Status:** fixed: while placing, the status box has Rotate, Several (keep placing), Cancel (back to the tray) and Done (leave build mode); a still finger held 500ms opens the item or floor menu, and neither a moving finger nor a second finger counts as a tap, nor does the release after a menu opens (while placing, a long-press opens nothing and the release aims as a tap)
- **Where:** `src/app/game.ts` (`pointerUp`, `click`, `contextClick`,
  `keydown`), `src/app/components/Stage.tsx`

| Action | Desktop | Touch at audit time |
|---|---|---|
| Rotate the item being placed | `R` (`PlacementRotated` only from `keydown`) | none |
| Cancel placing | Esc or right-click | none |
| Place several in a row | Shift-click | none |
| Floor menu ("Build here") | right-click (`down.b === 2`) | none: a touch is always button 0 |
| Item menu (builders, sell) | right-click | only by tapping the item in build mode |

- **Fix:** while placing, an on-screen bar with **Rotate**, **Done** and
  **Cancel** (and a way to keep placing several). Open the context menus
  on long-press for touch pointers.

### 3. No preview of where an item will land

- **Status:** fixed: on a touch pointer the first tap aims (`PlacementAimed`): the ghost and its tip or warning stay on that cell; a second tap on it, or ✓ Place, places
- **Where:** `src/app/game.ts` (`hoverTick`, `pointerLeave`)
- **Seen:** `hoverTick` needs `this.pointer`. On touch, `pointerleave`
  fires straight after `pointerup` and clears it, and while a finger is
  down the code returns early. The ghost and the "That space is taken"
  warning never show; the first tap commits blind.
- **Fix:** for touch, the first tap on the floor shows the ghost at that
  cell (with its warning); tapping the same cell again, or a ✓ button,
  places it.

### 4. Landscape does not fit

- **Status:** fixed: under `max-height: 500px` the stage loses its `min-height`, the bar is one slim row with the pass in the middle, the dock and tray tiles are slimmer, the tray is capped at 75% of the stage with its facts in two columns so it needs no inner scroll, and the ⋯ menu is capped at the viewport and scrolls inside itself; iPhone 13 landscape no longer scrolls, ⋯ menu open included
- **Where:** `src/app/styles.css` (`.stage { min-height: 320px }`, bar,
  dock, tray)
- **Seen:** 320px stage + 60px bar + 88px dock = 468px on a 342px-tall
  screen. The page scrolls and the dock is below the fold. An open tray
  covers almost the whole visible shop.
- **Fix:** on short screens (`max-height: 500px`) drop the stage
  `min-height`, slim the bar and dock, and cap the tray's height.

## Major

### 5. No safe-area handling

- **Status:** fixed: `.bar`, `.dock` and the splash are padded by `env(safe-area-inset-*)`, and the floating stage overlays keep clear of the left and right insets
- **Where:** `index.html` sets `viewport-fit=cover`; no CSS uses
  `env(safe-area-inset-*)`.
- **Seen:** in landscape the cash is clipped by the notch; the dock sits
  under the iPhone home indicator.
- **Fix:** pad `.dock` by `env(safe-area-inset-bottom)` and `.bar`/`.dock`
  by the left, right and top insets.

### 6. Information that only appears on hover

- **Status:** fixed: on touch, tapping a locked tool or Open shop shows its reason until the next touch or for 4 seconds, the Flow and Playtest chart tips follow a tap or sideways drag, and the ⋯ menu lists custom rules; canvas hover tips stay mouse-only, as a tap acts at once and the ticker reports it
- **Where:** `game.ts` `hoverTick` (canvas tips), `components/WhyTip.tsx`
  (why a tool is locked), `title=` attributes throughout, the Flow chart
  crosshair (`components/Flow.tsx`), the scenario rules on the ⋯ heading
- **Seen:** none of these show on touch. Tapping a locked dock tool does
  nothing and says nothing.
- **Fix:** on touch, tapping a locked tool shows its reason; the Flow
  chart tip follows a tap or drag; anything only in a `title` that a
  player needs is shown another way.

### 7. Tap targets are too small

- **Status:** fixed: under `@media (pointer: coarse)` buttons are at least 44px tall, and small ones 44px wide; the Playtest 'Include' labels are 44px tall with a 22px box; nothing visible under 44×44 on iPhone 13, iPhone 13 landscape or Pixel 5
- **Seen:** speed buttons 40×36, ⋯ 36×36, menu chips and Research/Flow
  header buttons 30 tall, context-menu rows 30, steppers 28×28, ticket
  buttons 26, `ol.builds` buttons 24. Guidance is 44pt (Apple) / 48dp
  (Android).
- **Fix:** under `@media (pointer: coarse)` raise interactive controls to
  at least 44×44.

### 8. On-screen text still describes desktop controls

- **Status:** fixed: `isTouch()` in `src/app/touch.ts` picks tap, long-press, pinch and on-screen-button wording, and shortcut keys are hidden; desktop copy unchanged (the camera hint stays hidden at ≤760px as before, and must follow #9 if the gestures change)
- **Seen:** "Esc to close", "Click to place · R rotates · Shift-click for
  several", "Drag to orbit · right-drag to pan · scroll to zoom · Space
  pauses", "right-click" in the placing tip.
- **Fix:** pick the wording from `matchMedia('(pointer: coarse)')`: tap,
  long-press, pinch, and the on-screen buttons from #2.

## Minor

### 9. Camera gestures

- **Status:** fixed: one finger pans, two fingers dolly+rotate (`controls.touches`), mouse unchanged; the touch hint says so
- **Where:** `src/app/scene/shop.ts` (`OrbitControls`)
- **Seen:** touch defaults are kept: one finger orbits, two fingers zoom
  and pan. For an isometric management game one-finger pan is expected,
  and it makes accidental rotation while tapping less likely.
- **Fix:** `controls.touches = { ONE: THREE.TOUCH.PAN, TWO:
  THREE.TOUCH.DOLLY_ROTATE }`.

### 10. Replay textarea zooms the page

- **Status:** fixed: 16px under `@media (pointer: coarse)`
- **Seen:** its font is 12px (`.sheet textarea`); iOS zooms in on inputs
  under 16px when focused.
- **Fix:** 16px on coarse pointers.

### 11. Battery

- **Status:** fixed: paused and idle for 600ms (no input, camera `change`, UI or sim change), `Game.frame` skips sync, render and the per-frame notify bar one frame a second (paused frame notifies 25–40/s to 1/s); the 5/s HUD tick still re-renders the HUD
- **Seen:** the scene renders every frame, and `frameListeners` re-render
  React (`Labels` and others) every frame, even while paused with nothing
  moving.
- **Fix:** while paused and idle, skip re-rendering when nothing changed
  (camera still, no input), or cap the rate.

### 12. Viewport height, long-press callouts, dock labels

- **Status:** fixed: `#root` is `100dvh`; the stage and dock have `-webkit-touch-callout: none` and `user-select: none` (text fields excepted); dock labels fit and, when the tools still overflow, the edge they run off fades to show the row scrolls
- **Seen:**
  - `html, body, #root { height: 100% }`; `100dvh` behaves better as the
    mobile address bar shows and hides.
  - A long-press on the stage or dock can select text or pop the iOS
    callout.
  - Dock labels are `nowrap` at fixed widths, so "60 cups" shows as
    "60 cu". The dock scrolls sideways with no hint, and the Research
    tool is off the right edge in portrait.
- **Fix:** `100dvh`; `-webkit-touch-callout: none; user-select: none` on
  the stage and dock; dock labels that fit, and a dock that fits or
  clearly scrolls.

## Already fine

- Tapping trays, tiles and the floor works.
- The selection panel becomes a bottom sheet at ≤760px.
- Pixel ratio is capped at 2; the canvas has `touch-action: none`.
- No 300ms tap delay (`width=device-width` is set).

## Checking

Run the dev server (`npm run dev`) and drive it with Playwright's
`devices['iPhone 13']`, `devices['iPhone 13 landscape']` and
`devices['Pixel 5']` (`hasTouch: true`, so taps are touch pointers).
Use `--use-gl=swiftshader` for WebGL in headless Chromium. The document
must not be wider than the viewport, and every control must be reachable
by tapping.
