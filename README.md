# TECHNO · Team meeting presentation

An interactive presentation built as a single continuous world that descends downwards, for TECHNO's team meeting (the Scientific Club, Department of Computing and Information Sciences).
It works without internet: fonts, images and the QR generator are all included.

## Online link

https://muntherh.github.io/techno-meeting-/ — published automatically on every push to `main` (`.github/workflows/pages.yml`)
once Pages is enabled: **Settings → Pages → Source: GitHub Actions**.

## How to run it
- Open `index.html` directly in Chrome or Edge (a double-click is enough; no server needed).
- Full screen: `F`.

## Controls
| Key | Action |
|---|---|
| `Space` / `↓` / `←` / `PageDown` / mouse click | Next: one element per press, then the glide to the next scene |
| `↑` / `→` / `PageUp` / right click | Previous |
| `O` | Overview of all 17 scenes (choose any scene) |
| `N` | Presenter notes at the bottom of the screen |
| `P` | Presenter window (put it on the second screen: notes, next element, timer) |
| `Z` | Enlarge the scene's poster |
| `B` | Black screen |
| `L` | Light performance mode (for slow laptops; it switches on by itself if the device is slow) |
| `Home` / `End` | Start / end |
| `?` | Shortcuts |

- Presentation clickers work, because they send `PageDown` / `PageUp`.
- The presentation never moves on its own while you are talking.
- On reload it reopens on the same scene and step (`#7.2` = scene 7, step 2).

## Editing
- **Dates, places, form links:** `settings.js` only. Leave a value empty and it shows as "يُحدَّد لاحقًا" (to be confirmed).
  Put the Google Form link for each committee in `forms`, and the QR code is generated automatically.
- **Scene text:** `index.html`. Each scene is one `<section>`.
  - The presenter notes are in `data-notes`.
- **Steps:** any element with `data-step="n"` appears on press n of that scene.

## Files
- `css/deck.css`: the whole design.
- `js/world.js`: the world (data stream, circuit-board layers, server walls, parallax).
- `js/deck.js`: camera, steps, controls and windows.
- `js/icons.js`: icons.
- `js/cloth.js` + `js/logo-data.js`: the TECHNO logo as a hanging holographic cloth on the opening scene (WebGL; drag it with the mouse or a finger; the static logo is shown if WebGL is unavailable).
- `assets/`:
  - The Alexandria and IBM Plex Sans Arabic fonts.
  - The TECHNO logo (from the game-1 repository).
  - The Scientific Club logo (a white version for dark backgrounds).
  - The two posters (from the workshops file).
- `vendor/qrcode.js`: Kazuhiko Arase's QR generator (MIT licence).
