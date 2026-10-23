/**
 * src/entities/hero.js — el héroe: modelo procedural, animaciones y física.
 *
 * Figura humanoide de 1,7 m construida con primitivas, túnica verde, gorro,
 * espada y escudo. Las animaciones son procedurales (sin clips): caminar,
 * reposo, ataque, esquiva, daño y desmayo.
 *
 * API (ver SPEC.md, Anexo A):
 *   createHero(scene, particles) -> hero
 *   hero: { group, pos, radius, facing, hearts, maxHearts,
 *           update(dt, input, region), attack(), hurt(n, dir), heal(n),
 *           respawn(x, z), isAttacking, isDead, setVisible(b), dispose() }
 */
import * as THREE from 'three';
import { toon, withOutline, glow } from '../engine/toon.js';
import { sampleHeight, resolveMove, isInWater } from '../engine/physics.js';

// ---------------------------------------------------------------------
//  Constantes de movimiento
// ---------------------------------------------------------------------
const WALK_SPEED = 5.0;
const DODGE_SPEED = 8.6;
const DODGE_TIME = 0.32;
const DODGE_COOLDOWN = 0.85;
const ATTACK_TIME = 0.46;
const ATTACK_COOLDOWN = 0.42;
const INVULN_TIME = 1.0;
const DEATH_TIME = 1.7;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// ---------------------------------------------------------------------
//  Piezas del modelo
// ---------------------------------------------------------------------
function part(parent, geo, material, x, y, z, outlineWidth = 0.016) {
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const g = withOutline(mesh, { width: outlineWidth });
  parent.add(g);
  return mesh;
}

function pivot(parent, x, y, z) {
  const p = new THREE.Group();
  p.position.set(x, y, z);
  parent.add(p);
  return p;
}

// ---------------------------------------------------------------------
//  Fábrica
// ---------------------------------------------------------------------
export function createHero(scene, particles) {
  if (!scene) throw new Error('createHero: se requiere la escena');

  const group = new THREE.Group();
  group.name = 'heroe';
  scene.add(group);

  // ── Materiales ─────────────────────────────────────────────────────
  const skinMat = toon(0xe8b98a, { rim: 0xffd9b0, rimStrength: 0.4 });
  const tunicMat = toon(0x2f7d4f, { rim: 0x9fe0b0, rimStrength: 0.45 });
  const tunicDarkMat = toon(0x24603c, { rim: 0x8fd0a0, rimStrength: 0.35 });
  const bootMat = toon(0x5a3a22, { rim: 0xc09060, rimStrength: 0.3 });
  const beltMat = toon(0x8a5a2b, { rim: 0xd8a060, rimStrength: 0.35 });
  const hairMat = toon(0x6b4a2a, { rim: 0xc09060, rimStrength: 0.3 });
  const bladeMat = toon(0xd8dde6, { rim: 0xffffff, rimStrength: 0.7 });
  const goldMat = toon(0xd8b24a, { rim: 0xffe9a0, rimStrength: 0.6 });
  const shieldMat = toon(0x2f5d8a, { rim: 0x9fd0ff, rimStrength: 0.5 });

  const flashMats = [skinMat, tunicMat, tunicDarkMat, bootMat, beltMat, hairMat, shieldMat];

  // ── Cuerpo ─────────────────────────────────────────────────────────
  const body = new THREE.Group();
  body.name = 'cuerpo';
  group.add(body);

  // Piernas (pivote en la cadera).
  const legL = pivot(body, -0.13, 0.78, 0);
  const legR = pivot(body, 0.13, 0.78, 0);

  for (const leg of [legL, legR]) {
    part(leg, new THREE.BoxGeometry(0.17, 0.62, 0.19), tunicDarkMat, 0, -0.31, 0);
    part(leg, new THREE.BoxGeometry(0.19, 0.2, 0.26), bootMat, 0, -0.68, 0.03);
  }

  // Torso.
  const torso = part(body, new THREE.BoxGeometry(0.46, 0.56, 0.28), tunicMat, 0, 1.06, 0, 0.02);
  part(body, new THREE.BoxGeometry(0.48, 0.1, 0.3), beltMat, 0, 0.8, 0, 0.016);
  part(body, new THREE.BoxGeometry(0.1, 0.1, 0.06), goldMat, 0, 0.8, 0.16, 0.012);

  // Cuello y cabeza.
  part(body, new THREE.CylinderGeometry(0.07, 0.08, 0.1, 8), skinMat, 0, 1.38, 0, 0.012);
  const head = part(body, new THREE.SphereGeometry(0.175, 16, 12), skinMat, 0, 1.53, 0, 0.018);
  head.scale.set(1, 1.05, 0.95);

  // Orejas.
  part(body, new THREE.ConeGeometry(0.05, 0.14, 6), skinMat, -0.17, 1.55, 0, 0.01).rotation.z = 0.5;
  part(body, new THREE.ConeGeometry(0.05, 0.14, 6), skinMat, 0.17, 1.55, 0, 0.01).rotation.z = -0.5;

  // Pelo y gorro.
  part(body, new THREE.SphereGeometry(0.185, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat, 0, 1.56, -0.01, 0.016);
  const cap = part(body, new THREE.ConeGeometry(0.19, 0.42, 10), tunicMat, 0, 1.72, -0.06, 0.016);
  cap.rotation.x = -0.55;

  // Brazos (pivote en el hombro).
  const armL = pivot(body, -0.29, 1.28, 0);
  const armR = pivot(body, 0.29, 1.28, 0);

  for (const arm of [armL, armR]) {
    part(arm, new THREE.BoxGeometry(0.14, 0.5, 0.15), tunicMat, 0, -0.25, 0, 0.014);
    part(arm, new THREE.BoxGeometry(0.13, 0.16, 0.14), skinMat, 0, -0.56, 0, 0.012);
  }

  // Escudo en el brazo izquierdo.
  const shield = part(armL, new THREE.BoxGeometry(0.06, 0.52, 0.42), shieldMat, -0.11, -0.3, 0.02, 0.014);
  shield.rotation.z = 0.08;
  part(armL, new THREE.BoxGeometry(0.02, 0.16, 0.16), goldMat, -0.15, -0.3, 0.02, 0.008);

  // Espada en la mano derecha.
  const sword = new THREE.Group();
  sword.position.set(0, -0.6, 0.02);
  armR.add(sword);

  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.86, 0.018), bladeMat);
  blade.position.y = -0.5;
  blade.castShadow = true;
  sword.add(blade);

  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.06), goldMat);
  guard.position.y = -0.06;
  guard.castShadow = true;
  sword.add(guard);

  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.18, 6), beltMat);
  grip.position.y = 0.04;
  sword.add(grip);

  const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), goldMat);
  pommel.position.y = 0.14;
  sword.add(pommel);

  // Estela del golpe: arco aditivo que sólo se ve al atacar.
  const trailMat = glow(0xbfe9ff, { intensity: 2.2, opacity: 0 });
  const trail = new THREE.Mesh(
    new THREE.TorusGeometry(0.95, 0.07, 6, 24, Math.PI * 1.15),
    trailMat
  );
  trail.position.set(0, 1.05, 0.35);
  trail.rotation.set(Math.PI / 2, 0, -0.6);
  trail.visible = false;
  body.add(trail);

  // ── Estado ─────────────────────────────────────────────────────────
  const pos = { x: 0, y: 0, z: 0 };
  const vel = { x: 0, z: 0 };
  const knock = { x: 0, z: 0 };

  let facing = 0;
  let walkPhase = 0;
  let idleT = 0;
  let attackT = 0;
  let attackCd = 0;
  let dodgeT = 0;
  let dodgeCd = 0;
  let invuln = 0;
  let flashT = 0;
  let deathT = 0;
  let splashCd = 0;
  let stepCd = 0;
  let lastRegion = null;
  let swingFired = false;

  const hero = {
    group,
    pos,
    radius: 0.42,
    facing: 0,
    hearts: 5,
    maxHearts: 5,
    isAttacking: false,
    isDead: false,
    speed: 0,
    attackHit: { active: false, x: 0, y: 0, z: 0, radius: 1.15, damage: 1, dir: { x: 0, z: 1 } },
    onSwing: null,
    onHurt: null,
    onDeath: null,
    onStep: null,
  };

  // ── Ataque ─────────────────────────────────────────────────────────
  function attack() {
    if (hero.isDead || hero.isAttacking || attackCd > 0) return false;
    hero.isAttacking = true;
    attackT = 0;
    attackCd = ATTACK_COOLDOWN;
    swingFired = false;
    return true;
  }

  // ── Daño y curación ────────────────────────────────────────────────
  function hurt(n = 1, dir = null) {
    if (hero.isDead || invuln > 0) return false;
    hero.hearts = Math.max(0, hero.hearts - n);
    invuln = INVULN_TIME;
    flashT = 0.22;

    if (dir) {
      const len = Math.hypot(dir.x || 0, dir.z || 0) || 1;
      knock.x = ((dir.x || 0) / len) * 7.5;
      knock.z = ((dir.z || 0) / len) * 7.5;
    }

    if (particles) {
      particles.burst('spark', { x: pos.x, y: pos.y + 1.1, z: pos.z }, { count: 12, speed: 1.4 });
    }
    if (typeof hero.onHurt === 'function') hero.onHurt(n, hero.hearts);

    if (hero.hearts <= 0) {
      hero.isDead = true;
      deathT = 0;
      if (typeof hero.onDeath === 'function') hero.onDeath();
    }
    return true;
  }

  function heal(n = 1) {
    const before = hero.hearts;
    hero.hearts = Math.min(hero.maxHearts, hero.hearts + n);
    if (hero.hearts > before && particles) {
      particles.burst('heal', { x: pos.x, y: pos.y + 1.0, z: pos.z }, { count: 16, speed: 0.8 });
    }
    return hero.hearts - before;
  }

  function respawn(x = 0, z = 0) {
    pos.x = x;
    pos.z = z;
    pos.y = lastRegion ? sampleHeight(lastRegion, x, z) : 0;
    vel.x = 0;
    vel.z = 0;
    knock.x = 0;
    knock.z = 0;
    hero.hearts = hero.maxHearts;
    hero.isDead = false;
    hero.isAttacking = false;
    deathT = 0;
    invuln = 1.6;
    flashT = 0;
    group.rotation.set(0, facing, 0);
    group.position.set(pos.x, pos.y, pos.z);
  }

  function setVisible(b) {
    group.visible = !!b;
  }

  // ── Actualización ──────────────────────────────────────────────────
  function update(dt, input, region) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const d = Math.min(dt, 0.05);
    if (region) lastRegion = region;

    idleT += d;
    attackCd = Math.max(0, attackCd - d);
    dodgeCd = Math.max(0, dodgeCd - d);
    invuln = Math.max(0, invuln - d);
    flashT = Math.max(0, flashT - d);
    splashCd = Math.max(0, splashCd - d);
    stepCd = Math.max(0, stepCd - d);

    // ── Entrada ──
    const enabled = !input || input.enabled !== false;
    const mv = (input && input.move) || { x: 0, z: 0 };
    let mx = enabled ? mv.x || 0 : 0;
    let mz = enabled ? mv.z || 0 : 0;
    const mlen = Math.hypot(mx, mz);
    if (mlen > 1) { mx /= mlen; mz /= mlen; }

    const canAct = !hero.isDead;

    if (canAct && input && typeof input.consume === 'function') {
      if (input.consume('attack')) attack();
      if (input.consume('dodge') && dodgeCd <= 0) {
        dodgeT = DODGE_TIME;
        dodgeCd = DODGE_COOLDOWN;
        invuln = Math.max(invuln, 0.4);
        if (particles) {
          particles.burst('dust', { x: pos.x, y: pos.y + 0.15, z: pos.z }, { count: 10, speed: 1.2 });
        }
      }
    }

    // ── Velocidad objetivo ──
    let speed = WALK_SPEED;
    if (hero.isAttacking) speed *= 0.32;
    if (dodgeT > 0) speed = DODGE_SPEED;

    let tx = mx * speed;
    let tz = mz * speed;

    // Durante la esquiva, si no hay dirección, avanza hacia donde mira.
    if (dodgeT > 0 && mlen < 0.1) {
      tx = Math.sin(facing) * DODGE_SPEED;
      tz = Math.cos(facing) * DODGE_SPEED;
    }

    const accel = dodgeT > 0 ? 26 : 15;
    const k = 1 - Math.exp(-accel * d);
    vel.x += (tx - vel.x) * k;
    vel.z += (tz - vel.z) * k;

    // ── Agua: frena ──
    const inWater = region ? isInWater(region, pos.x, pos.z) : false;
    if (inWater) {
      vel.x *= 0.55;
      vel.z *= 0.55;
      if (splashCd <= 0 && Math.hypot(vel.x, vel.z) > 1.2) {
        splashCd = 0.28;
        if (particles) {
          particles.burst('splash', { x: pos.x, y: pos.y + 0.1, z: pos.z }, { count: 8, speed: 1.1 });
        }
      }
    }

    // ── Desplazamiento con colisiones ──
    const dx = (vel.x + knock.x) * d;
    const dz = (vel.z + knock.z) * d;
    knock.x *= Math.exp(-9 * d);
    knock.z *= Math.exp(-9 * d);

    if (region) {
      const next = resolveMove(region, pos, hero.radius, dx, dz);
      pos.x = next.x;
      pos.z = next.z;
    } else {
      pos.x += dx;
      pos.z += dz;
    }

    // ── Altura del terreno ──
    const ground = region ? sampleHeight(region, pos.x, pos.z) : 0;
    pos.y += (ground - pos.y) * (1 - Math.exp(-20 * d));

    // ── Orientación ──
    if (mlen > 0.12 && !hero.isDead) {
      const target = Math.atan2(mx, mz);
      facing = lerpAngle(facing, target, 1 - Math.exp(-14 * d));
    }
    hero.facing = facing;

    // ── Ataque: ventana de impacto ──
    if (hero.isAttacking) {
      attackT += d / ATTACK_TIME;
      const t = attackT;

      if (t >= 0.3 && !swingFired) {
        swingFired = true;
        const fx = Math.sin(facing);
        const fz = Math.cos(facing);
        hero.attackHit.active = true;
        hero.attackHit.x = pos.x + fx * 0.85;
        hero.attackHit.y = pos.y + 1.0;
        hero.attackHit.z = pos.z + fz * 0.85;
        hero.attackHit.dir.x = fx;
        hero.attackHit.dir.z = fz;
        if (typeof hero.onSwing === 'function') hero.onSwing(hero.attackHit);
        if (particles) {
          particles.burst('spark', { x: hero.attackHit.x, y: hero.attackHit.y, z: hero.attackHit.z }, { count: 6, speed: 1.6 });
        }
      }
      if (t > 0.62) hero.attackHit.active = false;

      if (t >= 1) {
        hero.isAttacking = false;
        attackT = 0;
        hero.attackHit.active = false;
      }
    } else {
      hero.attackHit.active = false;
    }

    // ── Esquiva ──
    if (dodgeT > 0) dodgeT = Math.max(0, dodgeT - d);

    // ── Desmayo y reaparición ──
    if (hero.isDead) {
      deathT += d;
      group.rotation.x = -Math.min(1, deathT / 0.5) * 1.35;
      if (deathT >= DEATH_TIME && lastRegion) {
        const sp = lastRegion.spawn || { x: 0, z: 0 };
        respawn(sp.x, sp.z);
      }
    } else {
      group.rotation.x += (0 - group.rotation.x) * (1 - Math.exp(-12 * d));
    }

    // ── Animación ──
    const speedNow = Math.hypot(vel.x, vel.z);
    hero.speed = speedNow;
    const moveAmt = clamp01(speedNow / WALK_SPEED);

    walkPhase += d * (3.2 + speedNow * 1.55);

    const swing = Math.sin(walkPhase);
    legL.rotation.x = swing * 0.78 * moveAmt;
    legR.rotation.x = -swing * 0.78 * moveAmt;
    armL.rotation.x = -swing * 0.62 * moveAmt;
    armL.rotation.z = 0.08;

    if (hero.isAttacking) {
      const t = attackT;
      let a;
      if (t < 0.28) a = (t / 0.28) * 1.35;
      else if (t < 0.55) a = 1.35 - ((t - 0.28) / 0.27) * 3.05;
      else a = -1.7 + ((t - 0.55) / 0.45) * 1.7;
      armR.rotation.x = a;
      armR.rotation.z = -0.25;
      sword.rotation.x = 0.15;

      const showTrail = t > 0.26 && t < 0.62;
      trail.visible = showTrail;
      trailMat.opacity = showTrail ? 0.55 + Math.sin((t - 0.26) * 12) * 0.2 : 0;
      trail.rotation.z = -0.6 - t * 1.4;
    } else {
      armR.rotation.x = swing * 0.62 * moveAmt;
      armR.rotation.z = -0.08;
      sword.rotation.x = 0;
      trail.visible = false;
      trailMat.opacity = 0;
    }

    // Balanceo del cuerpo y respiración en reposo.
    const bob = Math.abs(Math.sin(walkPhase)) * 0.05 * moveAmt;
    const breathe = Math.sin(idleT * 2.1) * 0.012 * (1 - moveAmt);
    body.position.y = bob + breathe;

    // Inclinación al correr y al esquivar.
    const lean = moveAmt * 0.12 + (dodgeT > 0 ? 0.45 : 0);
    body.rotation.x += (lean - body.rotation.x) * (1 - Math.exp(-10 * d));
    body.rotation.z = Math.sin(walkPhase) * 0.03 * moveAmt;

    // ── Parpadeo de daño ──
    if (flashT > 0) {
      const on = Math.floor(flashT * 30) % 2 === 0;
      for (const m of flashMats) {
        m.emissive.setHex(on ? 0xff2a2a : 0x000000);
        m.emissiveIntensity = on ? 0.9 : 1;
      }
    } else {
      for (const m of flashMats) {
        if (m.emissive.getHex() !== 0x000000) {
          m.emissive.setHex(0x000000);
          m.emissiveIntensity = 1;
        }
      }
    }

    // ── Aplicar transformación ──
    group.position.set(pos.x, pos.y, pos.z);
    group.rotation.y = facing;

    // ── Pasos ──
    if (moveAmt > 0.35 && stepCd <= 0 && !inWater) {
      stepCd = 0.34;
      if (typeof hero.onStep === 'function') hero.onStep();
      if (particles) {
        particles.burst('dust', { x: pos.x, y: pos.y + 0.08, z: pos.z }, { count: 3, speed: 0.5, scale: 0.7 });
      }
    }
  }

  function dispose() {
    scene.remove(group);
    group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const m = o.material;
      if (!m) return;
      if (Array.isArray(m)) m.forEach((x) => x && x.dispose && x.dispose());
      else if (m.dispose) m.dispose();
    });
    group.clear();
  }

  hero.update = update;
  hero.attack = attack;
  hero.hurt = hurt;
  hero.heal = heal;
  hero.respawn = respawn;
  hero.setVisible = setVisible;
  hero.dispose = dispose;

  // Posición inicial: el llamador la fija con respawn().
  group.position.set(0, 0, 0);

  return hero;
}
