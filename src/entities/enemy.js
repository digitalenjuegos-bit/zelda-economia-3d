/**
 * src/entities/enemy.js — enemigos comunes y los cuatro jefes de región.
 *
 * Enemigos comunes: sombra, golem y avispa. Cada uno tiene su modelo
 * procedural, su ritmo de persecución y su ataque cuerpo a cuerpo.
 *
 * Jefes: Guardián de Piedra, Buitre de las Cumbres, Sierpe del Lodo y
 * Coloso de Bronce. Cada uno tiene dos ataques con aviso previo (telegrafiado)
 * para que el jugador pueda leerlos y esquivarlos.
 *
 * API (ver SPEC.md, Anexo A):
 *   ENEMY_TYPES
 *   createEnemy(scene, type, x, z, opts) -> enemy
 *   createBoss(scene, regionIndex, arena) -> enemy
 */
import * as THREE from 'three';
import { toon, withOutline, glow } from '../engine/toon.js';
import { sampleHeight, resolveMove } from '../engine/physics.js';

// ---------------------------------------------------------------------
//  Definiciones de enemigos comunes
// ---------------------------------------------------------------------
export const ENEMY_TYPES = {
  sombra: {
    name: 'Sombra de la Escasez',
    hp: 3,
    speed: 2.9,
    damage: 0.5,
    radius: 0.5,
    aggro: 13,
    attackRange: 1.7,
    attackCd: 1.5,
    rupees: 3,
    hover: 0.95,
    color: 0x5a3f8a,
  },
  golem: {
    name: 'Golem de Piedra',
    hp: 5,
    speed: 1.9,
    damage: 1,
    radius: 0.72,
    aggro: 11,
    attackRange: 2.0,
    attackCd: 1.9,
    rupees: 5,
    hover: 0,
    color: 0x8a8a7a,
  },
  avispa: {
    name: 'Avispa del Pantano',
    hp: 2,
    speed: 4.4,
    damage: 0.5,
    radius: 0.42,
    aggro: 15,
    attackRange: 1.6,
    attackCd: 1.2,
    rupees: 2,
    hover: 1.35,
    color: 0xd8b23a,
  },
};

// ---------------------------------------------------------------------
//  Utilidades
// ---------------------------------------------------------------------
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

function part(parent, geo, material, x, y, z, ow = 0.018) {
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(withOutline(mesh, { width: ow }));
  return mesh;
}

function disposeTree(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const m = o.material;
    if (!m) return;
    if (Array.isArray(m)) m.forEach((x) => x && x.dispose && x.dispose());
    else if (m.dispose) m.dispose();
  });
}

// ---------------------------------------------------------------------
//  Modelos de enemigos comunes
// ---------------------------------------------------------------------
function buildSombra() {
  const g = new THREE.Group();
  const bodyMat = toon(0x4a3270, { rim: 0xb08aff, rimStrength: 0.7, transparent: true, opacity: 0.92 });
  const cloakMat = toon(0x2a1a44, { rim: 0x8a6aff, rimStrength: 0.5, transparent: true, opacity: 0.85 });

  const core = part(g, new THREE.SphereGeometry(0.34, 14, 10), bodyMat, 0, 0, 0, 0.02);
  core.scale.set(1, 1.15, 1);

  const cloak = part(g, new THREE.ConeGeometry(0.5, 1.1, 10, 1, true), cloakMat, 0, -0.55, 0, 0.02);
  cloak.rotation.x = Math.PI;

  const eyeMat = glow(0xff4a6a, { intensity: 2.6, opacity: 1 });
  part(g, new THREE.SphereGeometry(0.055, 8, 6), eyeMat, -0.12, 0.08, 0.28, 0.008);
  part(g, new THREE.SphereGeometry(0.055, 8, 6), eyeMat, 0.12, 0.08, 0.28, 0.008);

  return { group: g, core, cloak, eyeMat };
}

function buildGolem() {
  const g = new THREE.Group();
  const stoneMat = toon(0x8a8a7a, { rim: 0xd8d8c0, rimStrength: 0.35, flatShading: true });
  const darkMat = toon(0x5a5a4e, { rim: 0xa0a090, rimStrength: 0.3, flatShading: true });

  const torso = part(g, new THREE.IcosahedronGeometry(0.62, 0), stoneMat, 0, 1.05, 0, 0.024);
  torso.scale.set(1, 1.1, 0.85);

  part(g, new THREE.IcosahedronGeometry(0.34, 0), stoneMat, 0, 1.72, 0, 0.02);

  const armL = part(g, new THREE.BoxGeometry(0.26, 0.85, 0.28), darkMat, -0.72, 1.05, 0, 0.02);
  const armR = part(g, new THREE.BoxGeometry(0.26, 0.85, 0.28), darkMat, 0.72, 1.05, 0, 0.02);
  armL.rotation.z = 0.12;
  armR.rotation.z = -0.12;

  part(g, new THREE.BoxGeometry(0.3, 0.55, 0.32), darkMat, -0.28, 0.3, 0, 0.02);
  part(g, new THREE.BoxGeometry(0.3, 0.55, 0.32), darkMat, 0.28, 0.3, 0, 0.02);

  const runeMat = glow(0xffa63a, { intensity: 2.2, opacity: 0.95 });
  part(g, new THREE.OctahedronGeometry(0.14, 0), runeMat, 0, 1.15, 0.5, 0.008);

  const eyeMat = glow(0xffb04a, { intensity: 2.4, opacity: 1 });
  part(g, new THREE.SphereGeometry(0.05, 8, 6), eyeMat, -0.12, 1.76, 0.28, 0.006);
  part(g, new THREE.SphereGeometry(0.05, 8, 6), eyeMat, 0.12, 1.76, 0.28, 0.006);

  return { group: g, armL, armR, torso, runeMat, eyeMat };
}

function buildAvispa() {
  const g = new THREE.Group();
  const bodyMat = toon(0xd8b23a, { rim: 0xffe9a0, rimStrength: 0.5 });
  const stripeMat = toon(0x2a2a2a, { rim: 0x8a8a8a, rimStrength: 0.3 });
  const wingMat = toon(0xdff0ff, {
    rim: 0xffffff, rimStrength: 0.6, transparent: true, opacity: 0.55, side: THREE.DoubleSide,
  });

  const body = part(g, new THREE.SphereGeometry(0.3, 12, 10), bodyMat, 0, 0, 0, 0.018);
  body.scale.set(0.85, 0.85, 1.5);

  for (const z of [-0.18, 0.12]) {
    const stripe = part(g, new THREE.TorusGeometry(0.27, 0.05, 6, 14), stripeMat, 0, 0, z, 0.01);
    stripe.rotation.x = Math.PI / 2;
  }

  const head = part(g, new THREE.SphereGeometry(0.2, 10, 8), stripeMat, 0, 0.02, 0.5, 0.014);
  head.scale.set(1, 0.9, 0.9);

  const eyeMat = glow(0xff3a3a, { intensity: 2.4, opacity: 1 });
  part(g, new THREE.SphereGeometry(0.045, 8, 6), eyeMat, -0.09, 0.08, 0.62, 0.006);
  part(g, new THREE.SphereGeometry(0.045, 8, 6), eyeMat, 0.09, 0.08, 0.62, 0.006);

  const stinger = part(g, new THREE.ConeGeometry(0.07, 0.35, 6), stripeMat, 0, 0, -0.62, 0.01);
  stinger.rotation.x = -Math.PI / 2;

  const wingL = part(g, new THREE.PlaneGeometry(0.75, 0.32), wingMat, -0.42, 0.18, 0, 0.008);
  const wingR = part(g, new THREE.PlaneGeometry(0.75, 0.32), wingMat, 0.42, 0.18, 0, 0.008);
  wingL.rotation.set(-Math.PI / 2, 0, 0.25);
  wingR.rotation.set(-Math.PI / 2, 0, -0.25);

  return { group: g, wingL, wingR, body, eyeMat };
}

// ---------------------------------------------------------------------
//  Enemigo común
// ---------------------------------------------------------------------
export function createEnemy(scene, type = 'sombra', x = 0, z = 0, opts = {}) {
  const def = ENEMY_TYPES[type] || ENEMY_TYPES.sombra;
  const particles = opts.particles || null;

  const built = type === 'golem' ? buildGolem() : type === 'avispa' ? buildAvispa() : buildSombra();
  const group = built.group;
  group.name = 'enemigo_' + type;
  scene.add(group);

  const pos = { x, y: 0, z };
  const vel = { x: 0, z: 0 };
  const knock = { x: 0, z: 0 };

  let hp = def.hp;
  let alive = true;
  let deathT = 0;
  let flashT = 0;
  let attackCd = 0;
  let windup = 0;
  let t = Math.random() * 10;
  let facing = Math.random() * Math.PI * 2;
  let state = 'idle';
  let wanderT = 0;
  let wanderDir = { x: 0, z: 0 };

  const enemy = {
    group,
    type,
    name: def.name,
    hp,
    maxHp: def.hp,
    alive: true,
    isBoss: false,
    pos,
    radius: def.radius,
    damage: def.damage,
    rupees: def.rupees,
    onDeath: opts.onDeath || null,
    onHit: opts.onHit || null,
  };

  function die() {
    if (!alive) return;
    alive = false;
    enemy.alive = false;
    deathT = 0;
    if (particles) {
      particles.burst('smoke', { x: pos.x, y: pos.y + 0.8, z: pos.z }, { count: 18, speed: 1.4 });
      particles.burst('rupee', { x: pos.x, y: pos.y + 0.9, z: pos.z }, { count: 6, speed: 1.2 });
    }
    if (typeof enemy.onDeath === 'function') enemy.onDeath(enemy);
  }

  function takeHit(dmg = 1, dir = null) {
    if (!alive) return false;
    hp -= dmg;
    enemy.hp = hp;
    flashT = 0.18;
    if (dir) {
      const len = Math.hypot(dir.x || 0, dir.z || 0) || 1;
      knock.x = ((dir.x || 0) / len) * 7;
      knock.z = ((dir.z || 0) / len) * 7;
    }
    if (particles) {
      particles.burst('spark', { x: pos.x, y: pos.y + 0.9, z: pos.z }, { count: 8, speed: 1.5 });
    }
    if (typeof enemy.onHit === 'function') enemy.onHit(enemy, dmg);
    if (hp <= 0) die();
    return true;
  }

  function update(dt, hero, region) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const d = Math.min(dt, 0.05);
    t += d;

    // ── Muerte ──
    if (!alive) {
      deathT += d;
      const k = clamp01(deathT / 0.85);
      group.scale.setScalar(Math.max(0.001, 1 - k));
      group.position.y -= d * 1.4;
      group.rotation.y += d * 3;
      if (k >= 1) group.visible = false;
      return;
    }

    flashT = Math.max(0, flashT - d);
    attackCd = Math.max(0, attackCd - d);

    const ground = region ? sampleHeight(region, pos.x, pos.z) : 0;
    const hover = def.hover + Math.sin(t * 2.2) * (def.hover > 0 ? 0.14 : 0);

    // ── Objetivo ──
    const hx = hero && hero.pos ? hero.pos.x : pos.x;
    const hz = hero && hero.pos ? hero.pos.z : pos.z;
    const dx = hx - pos.x;
    const dz = hz - pos.z;
    const dist = Math.hypot(dx, dz);
    const heroAlive = !hero || !hero.isDead;

    let tx = 0;
    let tz = 0;

    if (heroAlive && dist < def.aggro) {
      state = dist <= def.attackRange ? 'attack' : 'chase';
    } else {
      state = 'idle';
    }

    if (state === 'chase') {
      const nx = dx / (dist || 1);
      const nz = dz / (dist || 1);
      tx = nx * def.speed;
      tz = nz * def.speed;
      facing = Math.atan2(nx, nz);
    } else if (state === 'attack') {
      facing = Math.atan2(dx, dz);
      if (attackCd <= 0 && windup <= 0) {
        windup = 0.42;
      }
    } else {
      // Vagar lento alrededor del punto de origen.
      wanderT -= d;
      if (wanderT <= 0) {
        wanderT = 1.6 + Math.random() * 2.2;
        const a = Math.random() * Math.PI * 2;
        wanderDir.x = Math.cos(a);
        wanderDir.z = Math.sin(a);
      }
      tx = wanderDir.x * def.speed * 0.28;
      tz = wanderDir.z * def.speed * 0.28;
      if (Math.hypot(tx, tz) > 0.05) facing = Math.atan2(tx, tz);
    }

    // ── Aviso y golpe ──
    if (windup > 0) {
      windup -= d;
      tx = 0;
      tz = 0;
      if (windup <= 0) {
        attackCd = def.attackCd;
        if (heroAlive && dist <= def.attackRange + 0.7 && hero && typeof hero.hurt === 'function') {
          hero.hurt(def.damage, { x: dx / (dist || 1), z: dz / (dist || 1) });
        }
        if (particles) {
          particles.burst('dust', { x: pos.x, y: pos.y + 0.3, z: pos.z }, { count: 8, speed: 1.1 });
        }
      }
    }

    // ── Movimiento ──
    const k = 1 - Math.exp(-9 * d);
    vel.x += (tx - vel.x) * k;
    vel.z += (tz - vel.z) * k;

    const mx = (vel.x + knock.x) * d;
    const mz = (vel.z + knock.z) * d;
    knock.x *= Math.exp(-8 * d);
    knock.z *= Math.exp(-8 * d);

    if (region) {
      const next = resolveMove(region, pos, def.radius, mx, mz);
      pos.x = next.x;
      pos.z = next.z;
    } else {
      pos.x += mx;
      pos.z += mz;
    }

    pos.y = ground + hover;
    group.position.set(pos.x, pos.y, pos.z);
    group.rotation.y = facing;

    // ── Animación por tipo ──
    const moving = Math.hypot(vel.x, vel.z) > 0.3;

    if (type === 'sombra') {
      built.core.scale.set(1 + Math.sin(t * 3) * 0.06, 1.15 + Math.sin(t * 2.4) * 0.08, 1);
      built.cloak.rotation.y = Math.sin(t * 1.6) * 0.25;
      built.cloak.scale.setScalar(1 + Math.sin(t * 2.8) * 0.05);
    } else if (type === 'golem') {
      const step = moving ? Math.sin(t * 6) : 0;
      built.armL.rotation.x = step * 0.5;
      built.armR.rotation.x = -step * 0.5;
      built.torso.position.y = 1.05 + Math.abs(step) * 0.05;
      if (windup > 0) {
        built.armL.rotation.x = -1.6;
        built.armR.rotation.x = -1.6;
      }
    } else {
      const flap = Math.sin(t * 26) * 0.7;
      built.wingL.rotation.z = 0.25 + flap;
      built.wingR.rotation.z = -0.25 - flap;
      built.body.position.y = Math.sin(t * 4) * 0.05;
    }

    // ── Parpadeo al recibir daño ──
    const flashOn = flashT > 0 && Math.floor(flashT * 40) % 2 === 0;
    group.traverse((o) => {
      const m = o.material;
      if (!m || !m.emissive || m.isMeshBasicMaterial) return;
      if (flashOn) {
        m.emissive.setHex(0xffffff);
        m.emissiveIntensity = 1.2;
      } else if (m.emissive.getHex() === 0xffffff) {
        m.emissive.setHex(0x000000);
        m.emissiveIntensity = 1;
      }
    });
  }

  function dispose() {
    scene.remove(group);
    disposeTree(group);
    group.clear();
  }

  enemy.update = update;
  enemy.takeHit = takeHit;
  enemy.dispose = dispose;
  enemy.die = die;

  // Posición inicial.
  group.position.set(x, 0, z);
  return enemy;
}

// ---------------------------------------------------------------------
//  Jefes
// ---------------------------------------------------------------------
const BOSS_DEFS = [
  {
    name: 'Guardián de Piedra',
    hp: 16,
    speed: 2.4,
    damage: 1,
    radius: 1.9,
    color: 0x8a8a7a,
    height: 3.4,
  },
  {
    name: 'Buitre de las Cumbres',
    hp: 14,
    speed: 4.2,
    damage: 1,
    radius: 1.7,
    color: 0x4a3a2a,
    height: 3.0,
  },
  {
    name: 'Sierpe del Lodo',
    hp: 18,
    speed: 3.0,
    damage: 1,
    radius: 1.8,
    color: 0x3a5a2a,
    height: 2.2,
  },
  {
    name: 'Coloso de Bronce',
    hp: 22,
    speed: 2.0,
    damage: 1,
    radius: 2.4,
    color: 0x9a6a2a,
    height: 4.6,
  },
];

function buildGuardian() {
  const g = new THREE.Group();
  const stoneMat = toon(0x8a8a7a, { rim: 0xd8d8c0, rimStrength: 0.4, flatShading: true });
  const darkMat = toon(0x5a5a4e, { rim: 0xa0a090, rimStrength: 0.3, flatShading: true });

  const torso = part(g, new THREE.IcosahedronGeometry(1.15, 0), stoneMat, 0, 2.0, 0, 0.03);
  torso.scale.set(1, 1.15, 0.9);

  part(g, new THREE.IcosahedronGeometry(0.6, 0), stoneMat, 0, 3.25, 0, 0.026);

  const armL = part(g, new THREE.BoxGeometry(0.5, 1.7, 0.55), darkMat, -1.35, 2.0, 0, 0.026);
  const armR = part(g, new THREE.BoxGeometry(0.5, 1.7, 0.55), darkMat, 1.35, 2.0, 0, 0.026);
  armL.rotation.z = 0.1;
  armR.rotation.z = -0.1;

  part(g, new THREE.BoxGeometry(0.6, 1.1, 0.65), darkMat, -0.5, 0.55, 0, 0.026);
  part(g, new THREE.BoxGeometry(0.6, 1.1, 0.65), darkMat, 0.5, 0.55, 0, 0.026);

  const runeMat = glow(0xffa63a, { intensity: 2.6, opacity: 1 });
  part(g, new THREE.OctahedronGeometry(0.28, 0), runeMat, 0, 2.15, 0.95, 0.01);

  const eyeMat = glow(0xffb04a, { intensity: 2.8, opacity: 1 });
  part(g, new THREE.SphereGeometry(0.09, 8, 6), eyeMat, -0.22, 3.32, 0.5, 0.008);
  part(g, new THREE.SphereGeometry(0.09, 8, 6), eyeMat, 0.22, 3.32, 0.5, 0.008);

  return { group: g, armL, armR, torso, runeMat, eyeMat };
}

function buildVulture() {
  const g = new THREE.Group();
  const featherMat = toon(0x4a3a2a, { rim: 0xc09060, rimStrength: 0.45 });
  const darkMat = toon(0x2a2018, { rim: 0x8a6a4a, rimStrength: 0.3 });
  const beakMat = toon(0xd8b24a, { rim: 0xffe9a0, rimStrength: 0.5 });

  const body = part(g, new THREE.SphereGeometry(0.85, 14, 10), featherMat, 0, 0, 0, 0.026);
  body.scale.set(0.9, 0.85, 1.5);

  const head = part(g, new THREE.SphereGeometry(0.42, 12, 10), darkMat, 0, 0.35, 1.15, 0.02);
  const beak = part(g, new THREE.ConeGeometry(0.16, 0.55, 6), beakMat, 0, 0.28, 1.6, 0.012);
  beak.rotation.x = Math.PI / 2;

  const eyeMat = glow(0xff3a2a, { intensity: 2.8, opacity: 1 });
  part(g, new THREE.SphereGeometry(0.07, 8, 6), eyeMat, -0.2, 0.45, 1.35, 0.008);
  part(g, new THREE.SphereGeometry(0.07, 8, 6), eyeMat, 0.2, 0.45, 1.35, 0.008);

  const wingL = new THREE.Group();
  const wingR = new THREE.Group();
  wingL.position.set(-0.7, 0.1, 0);
  wingR.position.set(0.7, 0.1, 0);
  g.add(wingL, wingR);

  for (const [wing, sign] of [[wingL, -1], [wingR, 1]]) {
    for (let i = 0; i < 3; i++) {
      const feather = new THREE.Mesh(
        new THREE.BoxGeometry(1.5 - i * 0.25, 0.06, 0.55),
        i === 0 ? featherMat : darkMat
      );
      feather.position.set(sign * (0.75 - i * 0.12), 0, -i * 0.42);
      feather.rotation.z = sign * (0.05 + i * 0.06);
      feather.castShadow = true;
      wing.add(feather);
    }
  }

  const tail = part(g, new THREE.ConeGeometry(0.4, 1.2, 6), darkMat, 0, -0.1, -1.5, 0.02);
  tail.rotation.x = -Math.PI / 2;

  return { group: g, wingL, wingR, body, eyeMat };
}

function buildSerpent() {
  const g = new THREE.Group();
  const scaleMat = toon(0x3a5a2a, { rim: 0x9fd070, rimStrength: 0.45 });
  const bellyMat = toon(0x7a8a4a, { rim: 0xd0e090, rimStrength: 0.35 });
  const eyeMat = glow(0xd8ff3a, { intensity: 2.6, opacity: 1 });

  const segments = [];
  for (let i = 0; i < 6; i++) {
    const s = 0.62 - i * 0.07;
    const seg = part(g, new THREE.SphereGeometry(s, 12, 10), i % 2 ? bellyMat : scaleMat, 0, 0.6, -i * 0.85, 0.02);
    seg.scale.set(1, 0.9, 1.15);
    segments.push(seg);
  }

  const head = part(g, new THREE.SphereGeometry(0.55, 14, 10), scaleMat, 0, 0.85, 0.75, 0.024);
  head.scale.set(1, 0.85, 1.25);

  const jaw = part(g, new THREE.BoxGeometry(0.6, 0.18, 0.7), bellyMat, 0, 0.62, 1.15, 0.018);
  jaw.rotation.x = 0.15;

  part(g, new THREE.SphereGeometry(0.09, 8, 6), eyeMat, -0.24, 1.0, 1.05, 0.008);
  part(g, new THREE.SphereGeometry(0.09, 8, 6), eyeMat, 0.24, 1.0, 1.05, 0.008);

  for (const x of [-0.18, 0.18]) {
    const fang = part(g, new THREE.ConeGeometry(0.05, 0.22, 5), bellyMat, x, 0.62, 1.45, 0.006);
    fang.rotation.x = Math.PI;
  }

  return { group: g, segments, head, jaw, eyeMat };
}

function buildColossus() {
  const g = new THREE.Group();
  const bronzeMat = toon(0x9a6a2a, { rim: 0xffd08a, rimStrength: 0.55 });
  const darkMat = toon(0x5a3a18, { rim: 0xc09050, rimStrength: 0.35 });
  const seamMat = glow(0xff7a2a, { intensity: 2.6, opacity: 1 });

  const torso = part(g, new THREE.BoxGeometry(1.9, 2.2, 1.2), bronzeMat, 0, 2.9, 0, 0.034);
  torso.scale.set(1, 1, 0.95);

  part(g, new THREE.BoxGeometry(0.9, 0.85, 0.85), bronzeMat, 0, 4.35, 0, 0.028);

  // Cuernos.
  for (const x of [-0.42, 0.42]) {
    const horn = part(g, new THREE.ConeGeometry(0.14, 0.7, 6), darkMat, x, 4.85, 0, 0.014);
    horn.rotation.z = x < 0 ? 0.35 : -0.35;
  }

  const armL = part(g, new THREE.BoxGeometry(0.62, 2.1, 0.7), darkMat, -1.45, 2.9, 0, 0.03);
  const armR = part(g, new THREE.BoxGeometry(0.62, 2.1, 0.7), darkMat, 1.45, 2.9, 0, 0.03);

  part(g, new THREE.BoxGeometry(0.75, 1.6, 0.8), darkMat, -0.55, 0.8, 0, 0.03);
  part(g, new THREE.BoxGeometry(0.75, 1.6, 0.8), darkMat, 0.55, 0.8, 0, 0.03);

  // Vetas encendidas.
  part(g, new THREE.BoxGeometry(0.08, 1.6, 0.06), seamMat, 0, 2.9, 0.62, 0.006);
  part(g, new THREE.BoxGeometry(1.2, 0.08, 0.06), seamMat, 0, 3.5, 0.62, 0.006);

  const eyeMat = glow(0xff5a1e, { intensity: 3.0, opacity: 1 });
  part(g, new THREE.SphereGeometry(0.11, 8, 6), eyeMat, -0.24, 4.42, 0.42, 0.008);
  part(g, new THREE.SphereGeometry(0.11, 8, 6), eyeMat, 0.24, 4.42, 0.42, 0.008);

  return { group: g, armL, armR, torso, seamMat, eyeMat };
}

export function createBoss(scene, regionIndex = 0, arena = { x: 0, z: -30, r: 16 }) {
  const idx = Math.max(0, Math.min(3, regionIndex | 0));
  const def = BOSS_DEFS[idx];

  const built = idx === 0 ? buildGuardian()
    : idx === 1 ? buildVulture()
    : idx === 2 ? buildSerpent()
    : buildColossus();

  const group = built.group;
  group.name = 'jefe_' + idx;
  scene.add(group);

  const pos = { x: arena.x, y: 0, z: arena.z };
  const vel = { x: 0, z: 0 };
  const knock = { x: 0, z: 0 };

  let hp = def.hp;
  let alive = true;
  let deathT = 0;
  let flashT = 0;
  let t = 0;
  let facing = 0;
  let attackCd = 2.0;
  let state = 'idle';
  let windup = 0;
  let windupKind = null;
  let dashT = 0;
  let dashDir = { x: 0, z: 1 };
  let phase = 1;

  const projectiles = [];
  const effects = [];

  const enemy = {
    group,
    type: 'boss',
    name: def.name,
    hp,
    maxHp: def.hp,
    alive: true,
    isBoss: true,
    pos,
    radius: def.radius,
    damage: def.damage,
    rupees: 20,
    phase: 1,
    onDeath: null,
    onHit: null,
  };

  // ── Proyectiles ────────────────────────────────────────────────────
  function spawnProjectile(x, y, z, vx, vy, vz, color = 0xff7a2a, radius = 0.28) {
    const m = glow(color, { intensity: 2.4, opacity: 1 });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 10, 8), m);
    mesh.position.set(x, y, z);
    group.parent.add(mesh);
    projectiles.push({ mesh, x, y, z, vx, vy, vz, life: 3.2, radius });
  }

  function updateProjectiles(d, hero) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.life -= d;
      p.x += p.vx * d;
      p.y += p.vy * d;
      p.z += p.vz * d;
      p.vy -= 2.2 * d;
      p.mesh.position.set(p.x, p.y, p.z);

      let hit = false;
      if (hero && !hero.isDead) {
        const dx = hero.pos.x - p.x;
        const dy = hero.pos.y + 1.0 - p.y;
        const dz = hero.pos.z - p.z;
        if (dx * dx + dy * dy + dz * dz < (p.radius + 0.55) ** 2) {
          hero.hurt(def.damage, { x: p.vx, z: p.vz });
          hit = true;
        }
      }

      if (hit || p.life <= 0 || p.y < -20) {
        group.parent.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        projectiles.splice(i, 1);
      }
    }
  }

  // ── Onda expansiva ─────────────────────────────────────────────────
  function spawnShockwave(x, z, maxR = 9, color = 0xffa63a) {
    const m = glow(color, { intensity: 2.2, opacity: 0.9 });
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(1, 0.16, 8, 32), m);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.25, z);
    group.parent.add(mesh);
    effects.push({ mesh, kind: 'wave', t: 0, maxR, x, z, hit: false });
  }

  function spawnPillar(x, z, delay = 0.6) {
    const m = glow(0xff5a1e, { intensity: 2.6, opacity: 0 });
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, 7, 12, 1, true), m);
    mesh.position.set(x, 3.5, z);
    group.parent.add(mesh);
    effects.push({ mesh, kind: 'pillar', t: -delay, x, z, hit: false });
  }

  function updateEffects(d, hero) {
    for (let i = effects.length - 1; i >= 0; i--) {
      const e = effects[i];
      e.t += d;

      if (e.kind === 'wave') {
        const k = clamp01(e.t / 0.75);
        const r = 1 + k * e.maxR;
        e.mesh.scale.set(r, r, r);
        e.mesh.material.opacity = 0.9 * (1 - k);
        if (!e.hit && hero && !hero.isDead) {
          const dist = Math.hypot(hero.pos.x - e.x, hero.pos.z - e.z);
          if (Math.abs(dist - r) < 1.1) {
            e.hit = true;
            hero.hurt(def.damage, { x: hero.pos.x - e.x, z: hero.pos.z - e.z });
          }
        }
        if (k >= 1) {
          group.parent.remove(e.mesh);
          e.mesh.geometry.dispose();
          e.mesh.material.dispose();
          effects.splice(i, 1);
        }
      } else {
        // Pilar de fuego: aparece, golpea y se apaga.
        if (e.t < 0) continue;
        const k = clamp01(e.t / 1.1);
        e.mesh.material.opacity = k < 0.25 ? k * 4 : 1 - (k - 0.25) / 0.75;
        e.mesh.scale.set(1, 0.6 + k * 0.8, 1);
        if (!e.hit && e.t > 0.15 && hero && !hero.isDead) {
          const dist = Math.hypot(hero.pos.x - e.x, hero.pos.z - e.z);
          if (dist < 1.6) {
            e.hit = true;
            hero.hurt(def.damage, { x: hero.pos.x - e.x, z: hero.pos.z - e.z });
          }
        }
        if (k >= 1) {
          group.parent.remove(e.mesh);
          e.mesh.geometry.dispose();
          e.mesh.material.dispose();
          effects.splice(i, 1);
        }
      }
    }
  }

  // ── Muerte ─────────────────────────────────────────────────────────
  function die() {
    if (!alive) return;
    alive = false;
    enemy.alive = false;
    deathT = 0;
    for (const p of projectiles) {
      group.parent.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
    }
    projectiles.length = 0;
    for (const e of effects) {
      group.parent.remove(e.mesh);
      e.mesh.geometry.dispose();
      e.mesh.material.dispose();
    }
    effects.length = 0;
    if (typeof enemy.onDeath === 'function') enemy.onDeath(enemy);
  }

  function takeHit(dmg = 1, dir = null) {
    if (!alive) return false;
    hp -= dmg;
    enemy.hp = hp;
    flashT = 0.16;
    if (dir) {
      const len = Math.hypot(dir.x || 0, dir.z || 0) || 1;
      knock.x = ((dir.x || 0) / len) * 3.2;
      knock.z = ((dir.z || 0) / len) * 3.2;
    }
    if (typeof enemy.onHit === 'function') enemy.onHit(enemy, dmg);

    // Segunda fase al bajar de la mitad de la vida.
    if (phase === 1 && hp <= def.hp * 0.5) {
      phase = 2;
      enemy.phase = 2;
      attackCd = Math.min(attackCd, 0.6);
    }

    if (hp <= 0) die();
    return true;
  }

  // ── Ataques ────────────────────────────────────────────────────────
  function chooseAttack(dist) {
    if (idx === 0) return dist < 5 ? 'slam' : 'charge';
    if (idx === 1) return dist < 6 ? 'dive' : 'feathers';
    if (idx === 2) return dist < 5 ? 'sweep' : 'spit';
    return dist < 6 ? 'stomp' : 'pillars';
  }

  function startAttack(kind) {
    windupKind = kind;
    windup = phase === 2 ? 0.45 : 0.65;
    state = 'windup';
  }

  function executeAttack(hero) {
    const hx = hero && hero.pos ? hero.pos.x : pos.x;
    const hz = hero && hero.pos ? hero.pos.z : pos.z;
    const dx = hx - pos.x;
    const dz = hz - pos.z;
    const dist = Math.hypot(dx, dz) || 1;

    if (windupKind === 'slam') {
      spawnShockwave(pos.x, pos.z, 6.5, 0xffa63a);
      if (dist < 5.5 && hero && !hero.isDead) {
        hero.hurt(def.damage, { x: dx / dist, z: dz / dist });
      }
    } else if (windupKind === 'charge') {
      dashT = 0.55;
      dashDir.x = dx / dist;
      dashDir.z = dz / dist;
    } else if (windupKind === 'dive') {
      dashT = 0.5;
      dashDir.x = dx / dist;
      dashDir.z = dz / dist;
    } else if (windupKind === 'feathers') {
      const base = Math.atan2(dx, dz);
      const n = phase === 2 ? 7 : 5;
      for (let i = 0; i < n; i++) {
        const a = base + (i - (n - 1) / 2) * 0.22;
        spawnProjectile(
          pos.x, pos.y + 2.2, pos.z,
          Math.sin(a) * 11, 1.2, Math.cos(a) * 11,
          0x8a6a4a, 0.24
        );
      }
    } else if (windupKind === 'spit') {
      const n = phase === 2 ? 5 : 3;
      for (let i = 0; i < n; i++) {
        const a = Math.atan2(dx, dz) + (i - (n - 1) / 2) * 0.3;
        spawnProjectile(
          pos.x, pos.y + 1.0, pos.z,
          Math.sin(a) * 9, 2.4, Math.cos(a) * 9,
          0x9fd03a, 0.3
        );
      }
    } else if (windupKind === 'sweep') {
      spawnShockwave(pos.x, pos.z, 5.5, 0x9fd03a);
      if (dist < 5.0 && hero && !hero.isDead) {
        hero.hurt(def.damage, { x: dx / dist, z: dz / dist });
      }
    } else if (windupKind === 'stomp') {
      spawnShockwave(pos.x, pos.z, 10, 0xff7a2a);
    } else if (windupKind === 'pillars') {
      const n = phase === 2 ? 6 : 4;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + t;
        spawnPillar(hx + Math.cos(a) * 2.2, hz + Math.sin(a) * 2.2, 0.35 + i * 0.12);
      }
    }

    windupKind = null;
    attackCd = phase === 2 ? 1.5 : 2.2;
    state = 'idle';
  }

  // ── Actualización ──────────────────────────────────────────────────
  function update(dt, hero, region) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const d = Math.min(dt, 0.05);
    t += d;

    if (!alive) {
      deathT += d;
      const k = clamp01(deathT / 1.6);
      group.rotation.z = k * 0.9;
      group.position.y -= d * 0.9;
      group.scale.setScalar(Math.max(0.001, 1 - k * 0.85));
      if (k >= 1) group.visible = false;
      return;
    }

    flashT = Math.max(0, flashT - d);
    attackCd = Math.max(0, attackCd - d);

    const ground = region ? sampleHeight(region, pos.x, pos.z) : 0;
    const hover = idx === 1 ? 3.1 + Math.sin(t * 1.8) * 0.35 : 0;

    const hx = hero && hero.pos ? hero.pos.x : pos.x;
    const hz = hero && hero.pos ? hero.pos.z : pos.z;
    const dx = hx - pos.x;
    const dz = hz - pos.z;
    const dist = Math.hypot(dx, dz) || 1;
    const heroAlive = !hero || !hero.isDead;

    let tx = 0;
    let tz = 0;

    if (dashT > 0) {
      dashT -= d;
      tx = dashDir.x * (idx === 1 ? 16 : 13);
      tz = dashDir.z * (idx === 1 ? 16 : 13);
      facing = Math.atan2(dashDir.x, dashDir.z);

      // Daño por embestida.
      if (heroAlive && dist < def.radius + 1.0 && hero && typeof hero.hurt === 'function') {
        hero.hurt(def.damage, { x: dashDir.x, z: dashDir.z });
        dashT = 0;
      }
    } else if (windup > 0) {
      windup -= d;
      facing = Math.atan2(dx, dz);
      if (windup <= 0) executeAttack(hero);
    } else if (heroAlive) {
      facing = Math.atan2(dx, dz);
      if (dist > def.radius + 2.2) {
        tx = (dx / dist) * def.speed;
        tz = (dz / dist) * def.speed;
      }
      if (attackCd <= 0 && dist < 14) {
        startAttack(chooseAttack(dist));
      }
    }

    // ── Movimiento ──
    const k = 1 - Math.exp(-7 * d);
    vel.x += (tx - vel.x) * k;
    vel.z += (tz - vel.z) * k;

    const mx = (vel.x + knock.x) * d;
    const mz = (vel.z + knock.z) * d;
    knock.x *= Math.exp(-7 * d);
    knock.z *= Math.exp(-7 * d);

    if (region) {
      const next = resolveMove(region, pos, def.radius, mx, mz);
      pos.x = next.x;
      pos.z = next.z;
    } else {
      pos.x += mx;
      pos.z += mz;
    }

    // Confinar a la arena.
    const adx = pos.x - arena.x;
    const adz = pos.z - arena.z;
    const ad = Math.hypot(adx, adz);
    const maxR = Math.max(2, arena.r - def.radius);
    if (ad > maxR) {
      pos.x = arena.x + (adx / ad) * maxR;
      pos.z = arena.z + (adz / ad) * maxR;
    }

    pos.y = ground + hover;
    group.position.set(pos.x, pos.y, pos.z);
    group.rotation.y = facing;

    // ── Animación ──
    const moving = Math.hypot(vel.x, vel.z) > 0.4;
    const windupK = windup > 0 ? 1 - windup / 0.65 : 0;

    if (idx === 0) {
      const step = moving ? Math.sin(t * 5) : 0;
      built.armL.rotation.x = step * 0.4 - windupK * 1.8;
      built.armR.rotation.x = -step * 0.4 - windupK * 1.8;
      built.torso.position.y = 2.0 + Math.abs(step) * 0.08;
    } else if (idx === 1) {
      const flap = Math.sin(t * 7) * 0.45;
      built.wingL.rotation.z = flap;
      built.wingR.rotation.z = -flap;
      built.body.position.y = Math.sin(t * 2.2) * 0.12;
      if (windup > 0) {
        built.wingL.rotation.z = 0.9;
        built.wingR.rotation.z = -0.9;
      }
    } else if (idx === 2) {
      for (let i = 0; i < built.segments.length; i++) {
        const s = built.segments[i];
        s.position.x = Math.sin(t * 3 - i * 0.6) * 0.35;
        s.position.y = 0.6 + Math.sin(t * 3 - i * 0.6) * 0.12;
      }
      built.head.position.x = Math.sin(t * 3 + 0.6) * 0.4;
      built.jaw.rotation.x = 0.15 + (windup > 0 ? 0.5 : Math.sin(t * 4) * 0.1);
    } else {
      const step = moving ? Math.sin(t * 4) : 0;
      built.armL.rotation.x = step * 0.35 - windupK * 1.5;
      built.armR.rotation.x = -step * 0.35 - windupK * 1.5;
      built.torso.position.y = 2.9 + Math.abs(step) * 0.1;
    }

    // ── Aviso luminoso ──
    const warn = windup > 0;
    const eyeMat = built.eyeMat;
    if (eyeMat) {
      eyeMat.color.setHex(warn ? 0xffffff : (idx === 3 ? 0xff5a1e : idx === 2 ? 0xd8ff3a : 0xffb04a));
      eyeMat.color.multiplyScalar(warn ? 4.5 : 2.6);
    }

    // ── Parpadeo al recibir daño ──
    const flashOn = flashT > 0 && Math.floor(flashT * 40) % 2 === 0;
    group.traverse((o) => {
      const m = o.material;
      if (!m || !m.emissive || m.isMeshBasicMaterial) return;
      if (flashOn) {
        m.emissive.setHex(0xffffff);
        m.emissiveIntensity = 1.3;
      } else if (m.emissive.getHex() === 0xffffff) {
        m.emissive.setHex(0x000000);
        m.emissiveIntensity = 1;
      }
    });

    updateProjectiles(d, hero);
    updateEffects(d, hero);
  }

  function dispose() {
    for (const p of projectiles) {
      group.parent.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
    }
    projectiles.length = 0;
    for (const e of effects) {
      group.parent.remove(e.mesh);
      e.mesh.geometry.dispose();
      e.mesh.material.dispose();
    }
    effects.length = 0;
    scene.remove(group);
    disposeTree(group);
    group.clear();
  }

  enemy.update = update;
  enemy.takeHit = takeHit;
  enemy.dispose = dispose;
  enemy.die = die;

  group.position.set(pos.x, 0, pos.z);
  return enemy;
}
