# Pomio Timer

Pomio Timer is a dependency-free web app for normal timers and hourly Pomodoro routines. It is designed for split-screen use down to a 150 × 300 CSS-pixel viewport and can be uploaded directly to static hosting.

## Use

1. Open **Timer** and choose a normal or Pomodoro timer.
2. Give it a name, emoji, section, and color.
3. Use **Start**, **Pause**, **Reset**, or **Settings** on each card. **Start all** starts every idle timer with one shared timestamp.
4. Create sections to organize routines; deleting a section moves its timers to **Timers**.

Pomodoros accept whole hours. Each hour contains one focus phase and one 5, 10, 15, or 20-minute rest. For example, three hours with a 15-minute rest produces three 45/15 cycles. Enable automatic continuation or pause at every phase boundary.

## Sounds

Open **Sounds** to choose heavy rain, TV static, ocean waves, or silence and set background and alert volumes. Audio is generated with Web Audio; there are no downloaded sound files.

Browsers require a user gesture before audio can begin. If **Ring until Continue** is enabled, a phase waits while the bell repeats. Press **Continue** to stop the bell and start the prepared phase. Timing and visual controls remain usable when audio is unavailable or suspended.

## Persistence limits

Timers, sections, settings, phases, and deadlines are stored as versioned JSON in `localStorage`. Running timers reconcile from their deadlines after sleep, reload, or a computer restart.

Data persists only in the same browser profile on the same device. Clearing site data, using private browsing, changing browsers, or changing the site origin can remove or isolate it. There is no account, cloud sync, database, or cross-device backup.

## Accessibility

- Semantic buttons, headings, forms, dialogs, labels, and live announcements.
- Keyboard-visible focus and an early skip link.
- Accessible labels for icon-only timer controls.
- Reduced-motion support.
- Responsive stacking without horizontal page overflow at the minimum viewport.

## Local checks

```sh
npm test
python3 -m http.server 4173
```

Open `http://localhost:4173` and use responsive mode at 150 × 300.

### Browser smoke matrix

| Browser | Minimum checks |
|---|---|
| Chromium | 150×300 layout, timer CRUD, reload catch-up, sound unlock |
| Firefox | Dialog keyboard flow, concurrent timers, localStorage recovery |
| Safari | Split view, visibility recovery, generated noise and bell |

For every browser, confirm there is no horizontal overflow; header and timer controls remain reachable; focus/rest colors change; minutes appear above seconds; and Ring until Continue blocks progression.

## Deploy to Hostinger

No build step is required.

1. Open Hostinger File Manager for the target domain.
2. Open `public_html` and remove or archive the previous site only if you intend to replace it.
3. Upload `index.html`, `styles/`, `src/`, `package.json`, and this README while preserving their paths.
4. Visit the HTTPS domain and run the smoke checks above.

The production web server must serve `.js` files with a JavaScript MIME type. To roll back, restore the prior static directory; Pomio Timer has no server migration.
