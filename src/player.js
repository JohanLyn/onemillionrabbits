import * as THREE from 'three';
import { G, damp } from './core.js';
import { outlined, vtoon } from './toon.js';
import { characterGeo } from './models.js';
import { pushOut } from './world.js';
import { input } from './input.js';
import { floater } from './fx.js';
import { sfx } from './audio.js';

export const CHARS = {
  gardener: { name: 'The Gardener', emoji: '🧑‍🌾', weapon: 'chicken', price: 0, hp: 100, speed: 1, perk: '+25% pickup range', mods: { magnet: 0.25 } },
  chef: { name: 'The Chef', emoji: '🧑‍🍳', weapon: 'toaster', price: 120, hp: 95, speed: 1, perk: '+15% blast area', mods: { area: 0.15 } },
  dj: { name: 'DJ Fluffkiller', emoji: '🎧', weapon: 'disco', price: 250, hp: 90, speed: 1.05, perk: '-12% cooldowns', mods: { cooldown: 0.12 } },
  monk: { name: 'The Space Monk', emoji: '🧘', weapon: 'sabre', price: 450, hp: 125, speed: 0.96, perk: '+15% damage, tanky', mods: { damage: 0.15 } },
  grandma: { name: 'Grandma', emoji: '👵', weapon: 'slipper', price: 700, hp: 110, speed: 0.92, perk: '+30% damage, +1 reroll', mods: { damage: 0.3, rerolls: 1 } },
};

export const xpNeed = (L) => Math.round(4 + L * 4 + L * L * 0.32);

export class Player {
  constructor() {
    this.group = new THREE.Group();
    this.models = {};
    for (const id in CHARS) {
      const m = outlined(characterGeo(id), vtoon(), 0.045);
      m.visible = false;
      this.group.add(m);
      this.models[id] = m;
    }
    G.scene.add(this.group);
    this.r = 0.5;
    this.reset('gardener');
  }

  reset(charId) {
    this.char = charId;
    for (const id in this.models) this.models[id].visible = id === charId;
    this.mesh = this.models[charId];
    this.x = 0;
    this.z = 0;
    this.fx = 0;
    this.fz = 1;
    this.rot = 0;
    this.walk = 0;
    this.level = 1;
    this.xp = 0;
    this.xpNext = xpNeed(1);
    this.invuln = 0;
    this.flash = 0;
    this.moving = false;
    this.maxHp = CHARS[charId].hp;
    this.hp = this.maxHp;
    this.dead = false;
    this.revived = false;
    this.group.position.set(0, 0, 0);
    this.group.rotation.set(0, 0, 0);
  }

  update(dt) {
    const s = G.stats;
    if (this.dead) return;
    const sp = 6.2 * s.speed;
    const ix = input.x, iz = input.z;
    this.moving = Math.hypot(ix, iz) > 0.05;
    if (this.moving) {
      this.x += ix * sp * dt;
      this.z += iz * sp * dt;
      const l = Math.hypot(ix, iz);
      this.fx = ix / l;
      this.fz = iz / l;
      this.walk += dt * 11 * Math.min(1, l + 0.3);
    } else {
      this.walk = damp(this.walk, Math.round(this.walk / Math.PI) * Math.PI, 10, dt);
    }
    pushOut(this, this.r);
    if (s.regen > 0 && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + s.regen * dt);
    this.invuln -= dt;
    this.flash -= dt;
    this.animate(dt);
  }

  animate(dt) {
    const target = Math.atan2(this.fx, this.fz);
    let diff = target - this.rot;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.rot += diff * Math.min(1, dt * 14);
    const bob = Math.abs(Math.sin(this.walk)) * 0.18;
    const g = this.group;
    g.position.set(this.x, bob, this.z);
    g.rotation.set(0, this.rot, Math.sin(this.walk) * 0.12);
    const sq = this.moving ? Math.cos(this.walk * 2) * 0.05 : Math.sin(G.time * 3) * 0.02;
    g.scale.set(1 - sq, 1 + sq, 1 - sq);
    this.mesh.material.emissive.setScalar(this.flash > 0 ? 0.7 : 0);
    this.mesh.visible = this.invuln > 0 && this.flash <= 0 ? Math.sin(G.time * 40) > -0.6 : true;
  }

  hurt(dmg, big = false) {
    if (this.invuln > 0 || this.dead || G.state !== 'playing') return;
    let amt = dmg * (1 - G.stats.armor);
    if (G.mod?.id === 'glass') amt *= 2;
    this.hp -= amt;
    this.invuln = big ? 0.8 : 0.45;
    this.flash = 0.1;
    G.shake = Math.max(G.shake, big ? 0.7 : 0.25);
    G.hurtFlash = 0.35;
    floater('-' + Math.round(amt), this.x, 2.4, this.z, '');
    sfx('hurt');
    if (this.hp <= 0) {
      this.hp = 0;
      G.onPlayerDeath();
    }
  }

  gainXp(v) {
    this.xp += v * G.stats.xpGain;
    while (this.xp >= this.xpNext) {
      this.xp -= this.xpNext;
      this.level++;
      this.xpNext = xpNeed(this.level);
      G.pendingLevels++;
    }
  }
}
