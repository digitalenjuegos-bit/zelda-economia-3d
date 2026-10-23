/**
 * src/entities/props.js — objetos del mundo: santuarios, cofres, carteles,
 * antorchas, portales, rocas, árboles, arbustos, rupias, cercas y puentes.
 *
 * Todo se construye por código: cero archivos externos. Los materiales salen
 * de `toon.js` para conservar el cel-shading, y las runas, llamas y portales
 * usan `glow()` para que el bloom los encienda.
 *
 * API (ver SPEC.md, Anexo A):
 *   makeShrine(index, lit)   -> { group, runes, setLit(b), ring }
 *   makeChest()              -> { group, open(), opened }
 *   makeSign(text)           -> group
 *   makeTorch()              -> { group, flame }
 *   makePortal()             -> { group, activate(), active }
 *   makeRock(scale)          -> group
 *   makeTree(kind)           -> group
 *   makeBush()               -> group
 *   makeRupee()              -> group
 *   makeFenceSegment()       -> group
 *   makeBridge(len)          -> group
 */
import * as THREE from 'three';
import { toon, withOutline, glow } from '../engine/toon.js';
import { TEX, canvasTex, rng } from '../engine/tex.js';
import { onFrame } from '../engine/core.js';

// ---------------------------------------------------------------------
//  Utilidades internas
// ---------------------------------------------------------------------

/** Textura cacheada con repetición propia (no altera la textura original). */
function tex(base, rx = 1, ry = 1) {
  const t = base.clone();
  t.needsUpdate = true;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  return t;
}

/** Material toon con textura opcional y rim light suave. */
function mat(color, opts = {}) {
  return toon(color, {
    rim: opts.rim !== undefined ? opts.rim : 0xffe6b8,
    rimStrength: opts.rimStrength !== undefined ? opts.rimStrength : 0.35,
    ...opts,
  });
}

/** Añade un mesh con contorno a un grupo, respetando sombras. */
function addOutlined(parent, mesh, opts = {}) {
  mesh.castShadow = opts.castShadow !== false;
  mesh.receiveShadow = opts.receiveShadow !== false;
  const g = withOutline(mesh, opts.outline || {});
  parent.add(g);
  return g;
}

/** Marca un grupo para que `dispose()` libere geometrías y materiales. */
function track(group) {
  group.userData.disposable = true;
  return group;
}

/** Libera geometrías y materiales de un subárbol. */
export function disposeObject(root) {
  if (!root) return;
  root.traverse((o) => {
    // Hooks propios (llamas, runas, etc.): se ejecutan una sola vez.
    // La guarda evita la recursión de los hooks que llaman a disposeObject.
    const ud = o.userData;
    if (ud && typeof ud.dispose === 'function' && !ud._disposed) {
      ud._disposed = true;
      try { ud.dispose(); } catch (e) { /* ya liberado */ }
    }
    if (o.geometry) o.geometry.dispose();
    const m = o.material;
    if (!m) return;
    if (Array.isArray(m)) m.forEach((x) => x && x.dispose && x.dispose());
    else if (m.dispose) m.dispose();
  });
}

// ---------------------------------------------------------------------
//  Animación compartida de llamas
// ---------------------------------------------------------------------
const flames = [];
let flameHooked = false;

function hookFlames() {
  if (flameHooked) return;
  flameHooked = true;
  onFrame((dt) => {
    for (let i = 0; i < flames.length; i++) {
      const f = flames[i];
      if (!f || !f.alive) continue;
      f.t += dt;
      const s = 1 + Math.sin(f.t * 11 + f.seed) * 0.12 + Math.sin(f.t * 23 + f.seed * 2) * 0.06;
      f.mesh.scale.set(s * 0.92, s * 1.18, s * 0.92);
      f.mesh.rotation.y += dt * 1.6;
      if (f.core) {
        f.core.scale.setScalar(0.72 + Math.sin(f.t * 17 + f.seed) * 0.08);
      }
    }
  });
}

// ---------------------------------------------------------------------
//  Santuario
// ---------------------------------------------------------------------
/**
 * Santuario de runa. `index` (0..4) varía altura y giro para que los cinco
 * no parezcan copias. `lit` enciende la runa desde el inicio.
 */
export function makeShrine(index = 0, lit = false) {
  const group = new THREE.Group();
  group.name = 'santuario_' + index;

  const stone = tex(TEX.stoneWall(), 2, 2);
  const stoneMat = mat(0xb9b3a4, { map: stone, rimStrength: 0.28 });
  const darkMat = mat(0x8d8779, { map: stone, rimStrength: 0.22 });

  // Base octogonal en dos escalones.
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 2.05, 0.42, 8), stoneMat);
  base.position.y = 0.21;
  base.rotation.y = Math.PI / 8;
  addOutlined(group, base, { outline: { width: 0.02 } });

  const step = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.5, 0.34, 8), darkMat);
  step.position.y = 0.58;
  step.rotation.y = Math.PI / 8;
  addOutlined(group, step, { outline: { width: 0.018 } });

  // Columna central.
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.52, 2.1, 8), stoneMat);
  pillar.position.y = 1.8;
  addOutlined(group, pillar, { outline: { width: 0.02 } });

  // Capitel.
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.5, 0.26, 8), darkMat);
  cap.position.y = 2.95;
  cap.rotation.y = Math.PI / 8;
  addOutlined(group, cap, { outline: { width: 0.018 } });

  // Anillo de runa: se enciende en cian al responder bien.
  const ringMat = glow(0x2a6f7a, { intensity: 0.55, opacity: 0.55 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.055, 8, 28), ringMat);
  ring.position.y = 3.12;
  ring.rotation.x = Math.PI / 2;
  group.add(ring);

  // Runa flotante.
  const runeMat = glow(0x2a6f7a, { intensity: 0.6, opacity: 0.5 });
  const rune = new THREE.Mesh(new THREE.OctahedronGeometry(0.26, 0), runeMat);
  rune.position.y = 3.62;
  group.add(rune);

  // Tres esquirlas que orbitan la runa.
  const runes = [rune];
  const shardMat = glow(0x2a6f7a, { intensity: 0.5, opacity: 0.45 });
  for (let i = 0; i < 3; i++) {
    const shard = new THREE.Mesh(new THREE.TetrahedronGeometry(0.09, 0), shardMat);
    const a = (i / 3) * Math.PI * 2;
    shard.position.set(Math.cos(a) * 0.55, 3.62 + Math.sin(a * 2) * 0.12, Math.sin(a) * 0.55);
    shard.userData.orbit = a;
    group.add(shard);
    runes.push(shard);
  }

  // Giro lento de la runa y las esquirlas.
  let spin = 0;
  const stopSpin = onFrame((dt) => {
    spin += dt;
    rune.rotation.y = spin * 0.9;
    rune.rotation.x = Math.sin(spin * 0.7) * 0.25;
    for (let i = 1; i < runes.length; i++) {
      const s = runes[i];
      const a = s.userData.orbit + spin * 0.8;
      s.position.set(Math.cos(a) * 0.55, 3.62 + Math.sin(a * 2 + spin) * 0.14, Math.sin(a) * 0.55);
      s.rotation.y = spin * 1.4;
    }
  });

  let isLit = false;
  function setLit(b) {
    isLit = !!b;
    const c = isLit ? 0x3fe4ff : 0x2a6f7a;
    const inten = isLit ? 2.6 : 0.55;
    const op = isLit ? 1 : 0.5;
    ringMat.color.setHex(c).multiplyScalar(inten);
    runeMat.color.setHex(c).multiplyScalar(inten);
    shardMat.color.setHex(c).multiplyScalar(inten * 0.85);
    ringMat.opacity = op;
    runeMat.opacity = op;
    shardMat.opacity = op * 0.9;
    ring.scale.setScalar(isLit ? 1.08 : 1);
    rune.scale.setScalar(isLit ? 1.25 : 1);
  }
  setLit(lit);

  group.userData.shrineIndex = index;
  group.userData.dispose = () => {
    stopSpin();
    disposeObject(group);
  };
  track(group);

  return { group, runes, setLit, ring, get lit() { return isLit; } };
}

// ---------------------------------------------------------------------
//  Cofre
// ---------------------------------------------------------------------
export function makeChest() {
  const group = new THREE.Group();
  group.name = 'cofre';

  const wood = tex(TEX.wood(), 2, 1);
  const woodMat = mat(0x8a5a2b, { map: wood, rimStrength: 0.3 });
  const metalMat = mat(0xd8b24a, { map: tex(TEX.metal(), 1, 1), rimStrength: 0.5 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.62, 0.78), woodMat);
  body.position.y = 0.31;
  addOutlined(group, body, { outline: { width: 0.02 } });

  // Bandas metálicas verticales.
  for (const x of [-0.42, 0.42]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.66, 0.82), metalMat);
    band.position.set(x, 0.31, 0);
    group.add(band);
  }

  // Tapa: medio cilindro que gira sobre su bisagra trasera.
  const lidPivot = new THREE.Group();
  lidPivot.position.set(0, 0.62, -0.39);
  group.add(lidPivot);

  const lid = new THREE.Mesh(
    new THREE.CylinderGeometry(0.39, 0.39, 1.15, 14, 1, false, 0, Math.PI),
    woodMat
  );
  lid.rotation.z = Math.PI / 2;
  lid.rotation.y = Math.PI / 2;
  lid.position.set(0, 0, 0.39);
  addOutlined(lidPivot, lid, { outline: { width: 0.02 } });

  const lidBand = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.08, 0.1), metalMat);
  lidBand.position.set(0, 0.36, 0.39);
  lidPivot.add(lidBand);

  // Cerradura.
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 0.08), metalMat);
  lock.position.set(0, 0.5, 0.42);
  group.add(lock);

  let opened = false;
  let anim = 0;
  let animating = false;

  function open() {
    if (opened) return false;
    opened = true;
    animating = true;
    anim = 0;
    return true;
  }

  const stop = onFrame((dt) => {
    if (!animating) return;
    anim = Math.min(1, anim + dt * 3.2);
    // Rebote suave al abrir.
    const e = 1 - Math.pow(1 - anim, 3);
    lidPivot.rotation.x = -e * 2.05 + Math.sin(anim * Math.PI) * 0.12;
    if (anim >= 1) animating = false;
  });

  group.userData.dispose = () => {
    stop();
    disposeObject(group);
  };
  track(group);

  return {
    group,
    open,
    get opened() { return opened; },
  };
}

// ---------------------------------------------------------------------
//  Cartel
// ---------------------------------------------------------------------
export function makeSign(text = '') {
  const group = new THREE.Group();
  group.name = 'cartel';

  const woodMat = mat(0x7a4f28, { map: tex(TEX.wood(), 1, 2), rimStrength: 0.3 });

  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 1.5, 6), woodMat);
  post.position.y = 0.75;
  addOutlined(group, post, { outline: { width: 0.016 } });

  // Tabla con el texto dibujado en canvas.
  const boardTex = canvasTex(512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#c9a06a';
    ctx.fillRect(0, 0, w, h);
    // Vetas.
    const r = rng(77);
    for (let i = 0; i < 90; i++) {
      ctx.strokeStyle = 'rgba(120,80,40,' + (0.05 + r() * 0.12).toFixed(3) + ')';
      ctx.lineWidth = 1 + r() * 2;
      const y = r() * h;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(w * 0.3, y + (r() - 0.5) * 14, w * 0.7, y + (r() - 0.5) * 14, w, y);
      ctx.stroke();
    }
    // Marco.
    ctx.strokeStyle = '#6b4423';
    ctx.lineWidth = 12;
    ctx.strokeRect(6, 6, w - 12, h - 12);
    // Texto.
    ctx.fillStyle = '#3a2412';
    ctx.font = 'bold 34px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const words = String(text || '').split(/\s+/);
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > w - 60 && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    const lh = 40;
    const startY = h / 2 - ((lines.length - 1) * lh) / 2;
    lines.slice(0, 4).forEach((l, i) => ctx.fillText(l, w / 2, startY + i * lh));
  }, { wrap: false, srgb: true });

  const boardMat = mat(0xffffff, { map: boardTex, rimStrength: 0.2 });
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.75, 0.08), boardMat);
  board.position.y = 1.55;
  addOutlined(group, board, { outline: { width: 0.016 } });

  group.userData.dispose = () => disposeObject(group);
  track(group);
  return group;
}

// ---------------------------------------------------------------------
//  Antorcha
// ---------------------------------------------------------------------
export function makeTorch() {
  const group = new THREE.Group();
  group.name = 'antorcha';

  const woodMat = mat(0x5e3d20, { map: tex(TEX.wood(), 1, 2), rimStrength: 0.25 });
  const ironMat = mat(0x4a4a52, { map: tex(TEX.metal(), 1, 1), rimStrength: 0.4 });

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 1.75, 6), woodMat);
  pole.position.y = 0.875;
  addOutlined(group, pole, { outline: { width: 0.014 } });

  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.11, 0.24, 8), ironMat);
  bowl.position.y = 1.82;
  addOutlined(group, bowl, { outline: { width: 0.014 } });

  // Llama: dos conos aditivos, sin luz real (el bloom hace el trabajo).
  const flameMat = glow(0xffa63a, { intensity: 2.4, opacity: 0.9 });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.5, 7), flameMat);
  flame.position.y = 2.12;
  group.add(flame);

  const coreMat = glow(0xfff0b0, { intensity: 3.2, opacity: 0.95 });
  const core = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 6), coreMat);
  core.position.y = 2.06;
  group.add(core);

  hookFlames();
  const entry = { mesh: flame, core, t: Math.random() * 10, seed: Math.random() * 6.28, alive: true };
  flames.push(entry);

  group.userData.dispose = () => {
    entry.alive = false;
    const i = flames.indexOf(entry);
    if (i >= 0) flames.splice(i, 1);
    disposeObject(group);
  };
  track(group);

  return { group, flame };
}

// ---------------------------------------------------------------------
//  Portal
// ---------------------------------------------------------------------
export function makePortal() {
  const group = new THREE.Group();
  group.name = 'portal';

  const stoneMat = mat(0x9a9488, { map: tex(TEX.stoneWall(), 2, 2), rimStrength: 0.25 });

  // Dos pilares y un dintel.
  for (const x of [-1.5, 1.5]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, 3.4, 8), stoneMat);
    p.position.set(x, 1.7, 0);
    addOutlined(group, p, { outline: { width: 0.02 } });
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.5, 0.6), stoneMat);
  lintel.position.y = 3.55;
  addOutlined(group, lintel, { outline: { width: 0.02 } });

  // Disco interior: apagado al inicio.
  const discMat = glow(0x2a6f7a, { intensity: 0.35, opacity: 0.18, side: THREE.DoubleSide });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.35, 32), discMat);
  disc.position.y = 1.85;
  group.add(disc);

  const ringMat = glow(0x2a6f7a, { intensity: 0.4, opacity: 0.3 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.07, 8, 40), ringMat);
  ring.position.y = 1.85;
  group.add(ring);

  let active = false;
  let t = 0;
  const stop = onFrame((dt) => {
    t += dt;
    ring.rotation.z = t * (active ? 0.9 : 0.15);
    if (active) {
      discMat.opacity = 0.55 + Math.sin(t * 3.2) * 0.12;
      disc.scale.setScalar(1 + Math.sin(t * 2.1) * 0.03);
    }
  });

  function activate() {
    if (active) return;
    active = true;
    discMat.color.setHex(0x3fe4ff).multiplyScalar(2.2);
    ringMat.color.setHex(0x3fe4ff).multiplyScalar(2.4);
    discMat.opacity = 0.6;
    ringMat.opacity = 1;
  }

  group.userData.dispose = () => {
    stop();
    disposeObject(group);
  };
  track(group);

  return { group, activate, get active() { return active; } };
}

// ---------------------------------------------------------------------
//  Rocas, árboles, arbustos
// ---------------------------------------------------------------------
export function makeRock(scale = 1) {
  const group = new THREE.Group();
  group.name = 'roca';

  const geo = new THREE.IcosahedronGeometry(1, 1);
  // Deformación determinista para que ninguna roca sea idéntica.
  const pos = geo.attributes.position;
  const r = rng(Math.round(scale * 1000) + 17);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const k = 0.78 + r() * 0.42;
    pos.setXYZ(i, x * k, y * k * 0.82, z * k);
  }
  geo.computeVertexNormals();

  const m = mat(0x9a9a92, {
    map: tex(TEX.rock(), 1, 1),
    flatShading: true,
    rimStrength: 0.22,
  });
  const mesh = new THREE.Mesh(geo, m);
  mesh.scale.setScalar(scale);
  mesh.position.y = scale * 0.55;
  mesh.rotation.y = r() * Math.PI * 2;
  addOutlined(group, mesh, { outline: { width: 0.02 } });

  group.userData.dispose = () => disposeObject(group);
  track(group);
  return group;
}

export function makeTree(kind = 'oak') {
  const group = new THREE.Group();
  group.name = 'arbol_' + kind;

  const barkMat = mat(0x6b4a2a, { map: tex(TEX.bark(), 1, 3), rimStrength: 0.25 });
  const leafMat = mat(0x4f8a3a, { map: tex(TEX.leaf(), 2, 2), rimStrength: 0.3 });

  if (kind === 'pine') {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 2.2, 7), barkMat);
    trunk.position.y = 1.1;
    addOutlined(group, trunk, { outline: { width: 0.018 } });

    for (let i = 0; i < 3; i++) {
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(1.5 - i * 0.36, 1.7 - i * 0.2, 8),
        leafMat
      );
      cone.position.y = 2.1 + i * 0.95;
      cone.rotation.y = i * 0.7;
      addOutlined(group, cone, { outline: { width: 0.02 } });
    }
  } else if (kind === 'dead') {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.3, 3.2, 6), barkMat);
    trunk.position.y = 1.6;
    addOutlined(group, trunk, { outline: { width: 0.018 } });

    for (let i = 0; i < 4; i++) {
      const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.1, 1.3, 5), barkMat);
      const a = (i / 4) * Math.PI * 2 + 0.4;
      branch.position.set(Math.cos(a) * 0.45, 2.2 + i * 0.28, Math.sin(a) * 0.45);
      branch.rotation.z = Math.cos(a) * 0.9;
      branch.rotation.x = Math.sin(a) * 0.9;
      group.add(branch);
    }
  } else {
    // Roble: tronco corto y copa de varias esferas irregulares.
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.38, 2.4, 8), barkMat);
    trunk.position.y = 1.2;
    addOutlined(group, trunk, { outline: { width: 0.018 } });

    const r = rng(kind === 'oak' ? 31 : 57);
    const blobs = [
      [0, 3.1, 0, 1.55],
      [0.95, 2.75, 0.35, 1.05],
      [-0.85, 2.85, -0.4, 1.0],
      [0.2, 3.7, -0.55, 0.95],
      [-0.35, 2.6, 0.85, 0.9],
    ];
    for (const [x, y, z, s] of blobs) {
      const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), leafMat);
      blob.position.set(x + (r() - 0.5) * 0.2, y, z + (r() - 0.5) * 0.2);
      blob.rotation.set(r() * 3, r() * 3, r() * 3);
      addOutlined(group, blob, { outline: { width: 0.022 } });
    }
  }

  group.userData.dispose = () => disposeObject(group);
  track(group);
  return group;
}

export function makeBush() {
  const group = new THREE.Group();
  group.name = 'arbusto';

  const leafMat = mat(0x5c9a42, { map: tex(TEX.leaf(), 1, 1), rimStrength: 0.3 });
  const r = rng(91);
  for (let i = 0; i < 3; i++) {
    const s = 0.42 + r() * 0.22;
    const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), leafMat);
    blob.position.set((r() - 0.5) * 0.6, s * 0.75, (r() - 0.5) * 0.6);
    blob.rotation.set(r() * 3, r() * 3, r() * 3);
    addOutlined(group, blob, { outline: { width: 0.018 } });
  }

  group.userData.dispose = () => disposeObject(group);
  track(group);
  return group;
}

// ---------------------------------------------------------------------
//  Rupia
// ---------------------------------------------------------------------
export function makeRupee() {
  const group = new THREE.Group();
  group.name = 'rupia';

  const m = glow(0x2ee06a, { intensity: 2.0, opacity: 0.95 });
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), m);
  gem.scale.set(0.72, 1.35, 0.72);
  gem.position.y = 0.42;
  group.add(gem);

  const halo = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), glow(0x9dffc4, { intensity: 1.2, opacity: 0.35 }));
  halo.scale.set(0.8, 1.5, 0.8);
  halo.position.y = 0.42;
  group.add(halo);

  let t = Math.random() * 10;
  const stop = onFrame((dt) => {
    t += dt;
    gem.rotation.y = t * 2.2;
    halo.rotation.y = -t * 1.4;
    gem.position.y = 0.42 + Math.sin(t * 2.4) * 0.06;
    halo.position.y = gem.position.y;
  });

  group.userData.dispose = () => {
    stop();
    disposeObject(group);
  };
  track(group);
  return group;
}

// ---------------------------------------------------------------------
//  Cerca y puente
// ---------------------------------------------------------------------
export function makeFenceSegment() {
  const group = new THREE.Group();
  group.name = 'cerca';

  const woodMat = mat(0x7a5230, { map: tex(TEX.wood(), 1, 1), rimStrength: 0.25 });

  for (const x of [-0.9, 0.9]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.1, 0.14), woodMat);
    post.position.set(x, 0.55, 0);
    addOutlined(group, post, { outline: { width: 0.014 } });
  }
  for (const y of [0.42, 0.82]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.1, 0.08), woodMat);
    rail.position.set(0, y, 0);
    group.add(rail);
  }

  group.userData.dispose = () => disposeObject(group);
  track(group);
  return group;
}

export function makeBridge(len = 6) {
  const group = new THREE.Group();
  group.name = 'puente';

  const woodMat = mat(0x8a6038, { map: tex(TEX.wood(), 1, 1), rimStrength: 0.25 });
  const ropeMat = mat(0x6b5a3a, { rimStrength: 0.15 });

  const planks = Math.max(3, Math.round(len / 0.55));
  for (let i = 0; i < planks; i++) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.09, 0.42), woodMat);
    plank.position.set(0, 0, -len / 2 + (i + 0.5) * (len / planks));
    plank.rotation.y = (Math.random() - 0.5) * 0.05;
    plank.castShadow = true;
    plank.receiveShadow = true;
    group.add(plank);
  }

  // Cuerdas laterales.
  for (const x of [-0.86, 0.86]) {
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, len, 5), ropeMat);
    rope.rotation.x = Math.PI / 2;
    rope.position.set(x, 0.55, 0);
    group.add(rope);

    for (let i = 0; i <= 4; i++) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 5), woodMat);
      post.position.set(x, 0.3, -len / 2 + (i / 4) * len);
      group.add(post);
    }
  }

  group.userData.dispose = () => disposeObject(group);
  track(group);
  return group;
}
