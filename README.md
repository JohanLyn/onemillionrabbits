# 🐇 One Million Rabbits

A cel-shaded horde-survival game for the browser, inspired by the Roblox game **Survive a Million Monkeys** and the "bullet heaven" genre (Vampire Survivors and friends).

You're alone in a meadow. One million rabbits want you gone. Your weapons are a toaster, a lightsabre, a rubber chicken and a jar of angry bees. Good luck.

Runs on a laptop (keyboard) and on a phone (touch joystick). It's built with [three.js](https://threejs.org) and compiles to **one self-contained HTML file**.

---

## Play it

| Where | How |
|---|---|
| **Laptop, no install** | Open `docs/index.html` in a browser. It's one file with everything inside. |
| **Laptop, dev mode** | `npm install`, then `npm run dev`, then open the URL it prints. |
| **Phone, same Wi-Fi** | Run `npm run dev` on your laptop and open the `Network:` URL it prints (e.g. `http://192.168.1.20:5173`) on your phone. |
| **Phone, anywhere** | Turn on GitHub Pages: repo **Settings → Pages → Deploy from a branch → `main` (once this branch is merged) / `/docs`**. The game is then at `https://<user>.github.io/onemillionrabbits/`. |

`npm run build` rebuilds `dist/index.html` and copies it to `docs/index.html`.

### Controls

| | Laptop | Phone |
|---|---|---|
| Move | WASD / arrow keys | Drag anywhere (floating joystick) |
| Attack | Automatic | Automatic |
| Orbital Carrot Strike | Space (or Q/E) | Tap the 🥕 button |
| Pick a level-up card | Click, or keys 1–4 (R rerolls) | Tap |
| Pause | Esc / P | ❚❚ button |

---

## Research: what makes the genre tick

**Survive a Million Monkeys (Roblox)** is a co-op survival game where you hold out against endless, escalating waves of monkeys. Runs are about endurance: you're expected to lose eventually. Key ingredients:

- **Absurd enemy counts** that threaten through numbers, not cleverness.
- **Wave structure** with rising difficulty and bosses.
- **In-run upgrades**: cash earned mid-run buys weapon tiers and health.
- **Classes** with different kits (barricades, airstrikes, revives), unlocked with a meta currency (gems).
- **An ultimate** (the airstrike) that clears space when you're swamped.

**The wider genre (Vampire Survivors, Brotato, Halls of Torment)** adds:

- **Auto-firing weapons**: you only steer, which makes it perfect for phones.
- **XP gems → level-up choices**: pick 1 of 3 random upgrades and build combos.
- **Weapon evolutions**: max a weapon plus a matching item to unlock a stronger form.
- **Contact damage only**: enemies hurt by touching you, so positioning is the whole skill.
- **Meta progression** between runs (permanent upgrades, unlockable characters).
- **Treasure chests from bosses** and rare loot enemies.

### How this game uses them

| Genre feature | In One Million Rabbits |
|---|---|
| Endless horde | Hundreds of rabbits on screen; a live **"1,000,000 rabbits to go"** counter |
| Waves + bosses | 40-second waves; a royal boss rabbit every 5th wave (leaps, slams, summons babies) |
| Horde events | "They surrounded you" rings and hare stampedes |
| Auto weapons + level-ups | 10 ridiculous weapons, 10 trinkets, pick 1 of 3 cards, rerolls |
| Evolutions | **Fusions** (see below) |
| Ultimate | **Orbital Carrot Strike**, charged by defeating rabbits |
| Classes + meta currency | 5 survivors unlocked with golden carrots; **The Shed** sells permanent upgrades |
| Loot enemies + chests | Golden Bunnies that flee and drop golden carrots; boss treasure chests |

---

## ✨ The three original features

1. **Rabbits breed.** Rabbits left alive near each other fall in love (💕), and a baby pops out that grows up into a full rabbit. The "rabbits to go" counter **goes up** and flashes pink. A slow, careful player gets buried, so you need to clear the horde fast. The boss summons babies too.
2. **The Wheel of Chaos.** At the start of every wave a game-show wheel spins and bends one rule for that wave: Fancy Hats (double XP), Moon Gravity, Giant Rabbits, Turbo Tuesday, Carrot Rain, Disco Inferno (the meadow turns into a dance floor), Spring Fever (4× breeding, uh oh), Glass Cannon, Slow-Mo Horde, Jelly World and Super Magnet.
3. **Weapon fusion.** Max out two compatible weapons and a golden **FUSION** card appears that merges them into something dumber. The full cookbook is under *How to play*.

## 🍞 The arsenal

| Weapon | What it does |
|---|---|
| 🍞 Toaster | Lobs flaming toast that explodes on landing |
| ⚔️ Lightsabre | Humming laser blades orbit you |
| 🐔 Rubber Chicken | Squeaky boomerang that hits going out and coming back |
| 🍃 Leaf Blower | Hurricane cone that launches rabbits into the air |
| 🐝 Jar of Angry Bees | Very angry, very homing bees |
| 🪩 Disco Ball Drone | Orbiting disco ball that fires groovy lasers |
| 🎵 Bagpipes of Doom | Expanding rings of horrific noise |
| 🩴 Grandma's Slipper | A colossal slipper falls from the heavens |
| 🪠 Thunder Plunger | 10,000 volt bonk that chains between rabbits |
| 🍌 Banana Peels | Rabbits slip, spin and go flying |

| Fusion | Recipe |
|---|---|
| 🌪️ Saber Cyclone | Lightsabre + Leaf Blower |
| ☄️ Breakfast Meteor | Toaster + Grandma's Slipper |
| 🐣 Chicken Swarm | Rubber Chicken + Jar of Angry Bees |
| ⚡ Funkadelic Storm | Disco Ball Drone + Thunder Plunger |
| 🎉 Banana Bagpipe Rave | Bagpipes of Doom + Banana Peels |

**Rabbits:** Bunnies, speedy Hares, tanky Chonks, charging Jackalopes, Kamikaze Bomb Bunnies (their explosions chain-react through the horde) and rare Golden Bunnies.

**Survivors:** The Gardener (free), The Chef, DJ Fluffkiller, The Space Monk and Grandma. Each has a different starting weapon and perk.

---

## How it's built

- **Cel shading**: `MeshToonMaterial` with a 3-step gradient map, plus inverted-hull outlines (back faces pushed out along their normals and drawn in dark ink).
- **Performance**: every rabbit type, projectile, particle and pickup is a single `InstancedMesh`, so hundreds of rabbits cost a handful of draw calls. A spatial hash grid handles collisions and targeting. Phones get a lower rabbit cap and pixel ratio, and resolution drops automatically if the frame rate does.
- **No asset files**: every model is built from merged primitives with vertex colors, and every sound and the music loop are synthesized with WebAudio.

```
src/
  main.js      game loop, state machine, camera
  enemies.js   rabbit AI, breeding, spatial grid, wave director, bosses
  weapons.js   the 10 weapons, 5 fusions and the Orbital Carrot Strike
  upgrades.js  trinkets, level-up cards, stats, The Shed
  chaos.js     the Wheel of Chaos
  player.js    survivors and movement
  pickups.js   carrots, cake, magnets, golden carrots, chests
  world.js     the meadow, scenery and collisions
  fx.js        particles, beams, shockwaves, floating numbers
  toon.js      cel-shading materials, outlines, instancing helpers
  models.js    every model, built from primitives
  audio.js     synthesized sound effects and music
  input.js     keyboard + touch joystick
  ui.js        HUD and menus
```

Progress (golden carrots, unlocks, best run) is saved in your browser's `localStorage`.
