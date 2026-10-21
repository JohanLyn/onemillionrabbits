# Changelog

## 0.9.0-beta

The first public beta. Install it on your phone, play it offline, and [tell us what breaks](https://github.com/JohanLyn/onemillionrabbits/issues).

### New

- **You can win.** Beat the final boss on wave 30 for a victory screen, confetti and a big golden-carrot bonus (bigger the first time with each survivor). Wins are counted, and each survivor's card shows a 🏆.
- **Trophies.** 21 of them, each worth golden carrots, with pop-ups mid-run and a trophy shelf with progress bars and lifetime stats.
- **First-run tips.** Short, skippable coaching the first time each thing happens: moving, auto-fire, carrots, your first level-up, the counter going *up* from breeding, the Wheel of Chaos, bosses, golden bunnies, fusions and the Carrot Strike.
- **Settings.** Music and effects volume, sound on/off, screen shake, damage numbers, vibrate when hit, tips, fullscreen, graphics quality (AUTO / FAST / PRETTY) and reset progress. Open them from the title screen or the pause menu.
- **Install it.** The game is a PWA: add it to your home screen and it opens fullscreen and works offline.
- **Credits and feedback.** A version badge on the title screen, a **Send feedback** link and a credits screen.

### Better

- The game-over screen calls out **NEW BEST!** records, the trophies you unlocked and survivors you can now afford, and shows where your golden carrots came from.
- **3-2-1 countdown** when you unpause.
- **Give up** and **reset progress** ask first, in the game instead of a browser pop-up.
- **Keyboard menus**: arrow keys move between buttons, Enter picks, Esc goes back, with a clear focus outline. Level-up cards show their 1–4 key.
- **Phones**: the touch joystick has a dead zone and reaches full speed sooner; survivors scroll sideways on narrow screens; the pause button no longer covers the wave info or boss bar; landscape layouts fit the level-up cards, the wheel and the game-over screen; buttons are thumb-sized; pinch and double-tap zoom are blocked.
- Level-up cards ignore taps for a moment after they appear, so a thumb that was steering doesn't pick one by accident.

<!-- TODO(lead): new rabbits, bosses and weapons from the content work. -->
<!-- TODO(lead): new visual effects from the visuals work. -->
<!-- TODO(lead): new sounds and music from the audio work. -->

### Behind the scenes

- GitHub Actions: CI builds and runs headless smoke tests (laptop and phone) on every push; pushes to `main` deploy to GitHub Pages.
- `npm test`, `npm run screens` (screenshots of every menu at four sizes) and `npm run icons`.
