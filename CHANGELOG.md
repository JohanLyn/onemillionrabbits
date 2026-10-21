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

### More rabbits, bosses and weapons

- **Carrot Archers**, **Burrowers** and glowing **Elites** that drop a free level-up.
- **Three boss patterns** (slammer, carrot spinner, egg-laying brood mother) that each turn FURIOUS at half health, and **the Rabbit Queen** on wave 30.
- **Four new weapons**: Garden Gnome Sentries, Kazoo of Confusion, Spaghetti Lasso and Shopping Cart. **Two new fusions**: Gnome Kazoo Choir and Meatball Express.
- **Rebalanced** the 30-wave curve with a bot that plays real runs. The Carrot Strike no longer does half of all damage, fusions are a real power spike, and every survivor can win.
- Fixes: rabbits slide around trees instead of getting stuck, loot never lands outside the fence, cake waits on the grass until you're hurt, and bees stop chasing rabbits that already died.

### Prettier

- A sky with clouds, a sun and a moon, and a **day-to-night cycle** across the waves: golden hour, sunset, starry nights with fireflies, then dawn.
- Butterflies, drifting petals, a pond, wind in the grass and trees, and a dance floor for Disco Inferno.
- Juicier hits: KO stars, smoke puffs, fireball flashes, landing dust, a level-up light pillar and sparkles for gold.
- Survivors lean, bounce, breathe and carry their signature item; the camera eases out when the horde gets huge.

### Better sound

- An adaptive soundtrack: menu theme, a full in-run song that builds with the waves, a boss march, a disco variant, stingers for waves, bosses, defeat and victory, and a heartbeat when you're low on health.
- Every sound effect has variants (yes, rabbits occasionally go "eep!"), plus a new kazoo honk and burrower digging. A voice limiter keeps 500 rabbit pops from clipping.

### Behind the scenes

- GitHub Actions: CI builds and runs headless smoke tests (laptop and phone) on every push; pushes to `main` deploy to GitHub Pages.
- `npm test`, `npm run screens` (screenshots of every menu at four sizes) and `npm run icons`.
