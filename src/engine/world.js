/**
 * src/engine/world.js — construcción de las cuatro regiones.
 *
 * Cada región se genera por completo en código: terreno con color por vértice,
 * agua con shader propio, hierba instanciada con balanceo, árboles y rocas
 * instanciados, santuarios, cofre, cartel, antorchas, portal y arena del jefe.
 *
 * API (ver SPEC.md, Anexo A):
 *   REGIONS                     metadatos de las 4 regiones
 *   buildRegion(scene, index)   -> region
 */
import * as THREE from 'three';
import { toon, glow } from '../engine/toon.js';
import { TEX, fbm, rng } from '../engine/tex.js';
import { setTheme, onFrame } from '../engine/core.js';
import {
  makeShrine, makeChest, makeSign, makeTorch, makePortal,
  makeRock, makeTree, makeBush, disposeObject,
} from '../entities/props.js';

// ---------------------------------------------------------------------
//  Temas (Anexo B del SPEC)
// ---------------------------------------------------------------------
const THEMES = [
  {
    sunColor: 0xfff1d0, sunIntensity: 1.55,
    hemiSky: 0x9fd7ff, hemiGround: 0x4a6b3a, hemiIntensity: 0.6,
    skyTop: 0x74b9ff, skyHorizon: 0xfdf3d6,
    fogColor: 0xfdf3d6, fogNear: 80, fogFar: 190,
    exposure: 1.12, sunDir: [0.42, 0.62, 0.34],
  },
  {
    sunColor: 0xfff7e8, sunIntensity: 1.7,
    hemiSky: 0xbfe0ff, hemiGround: 0x8a6a44, hemiIntensity: 0.55,
    skyTop: 0x8ec5ff, skyHorizon: 0xffe3b0,
    fogColor: 0xffe3b0, fogNear: 70, fogFar: 170,
    exposure: 1.14, sunDir: [0.55, 0.55, 0.2],
  },
  {
    sunColor: 0xe8ffd0, sunIntensity: 1.15,
    hemiSky: 0x9fb8a0, hemiGround: 0x2e3a28, hemiIntensity: 0.62,
    skyTop: 0x9fb8a0, skyHorizon: 0xd8e8c0,
    fogColor: 0xd8e8c0, fogNear: 35, fogFar: 110,
    exposure: 1.05, sunDir: [0.3, 0.5, 0.45],
  },
  {
    sunColor: 0xffc79a, sunIntensity: 1.45,
    hemiSky: 0x8a7a9a, hemiGround: 0x3a2a24, hemiIntensity: 0.5,
    skyTop: 0x5a4a6a, skyHorizon: 0xff9a6a,
    fogColor: 0xff9a6a, fogNear: 45, fogFar: 130,
    exposure: 1.1, sunDir: [-0.35, 0.55, 0.4],
  },
];

// ---------------------------------------------------------------------
//  Metadatos públicos
// ---------------------------------------------------------------------
export const REGIONS = [
  {
    index: 0,
    name: 'Pradera de la Escasez',
    biome: 'pradera',
    enemyType: 'sombra',
    bossName: 'Guardián de Piedra',
    focus: 'Escasez, necesidades y deseos, costo de oportunidad, bienes gratuitos',
    theme: THEMES[0],
    size: 170,
    waterLevel: -1.05,
    treeKind: 'oak',
    grassCount: 7200,
    rockCount: 90,
    bushCount: 90,
    treeCount: 120,
    colors: { grass: 0x6fae4e, dark: 0x3f6b32, rock: 0x8f8b80, sand: 0xd9c48a },
  },
  {
    index: 1,
    name: 'Cañón del Intercambio',
    biome: 'canon',
    enemyType: 'golem',
    bossName: 'Buitre de las Cumbres',
    focus: 'Mercado, trueque, dinero, oferta y demanda, precio de equilibrio',
    theme: THEMES[1],
    size: 170,
    waterLevel: null,
    treeKind: 'dead',
    grassCount: 4200,
    rockCount: 150,
    bushCount: 45,
    treeCount: 55,
    colors: { grass: 0x9aa85a, dark: 0x6b7a3a, rock: 0xc08a5a, sand: 0xe0c08a },
  },
  {
    index: 2,
    name: 'Pantano del Esfuerzo',
    biome: 'pantano',
    enemyType: 'avispa',
    bossName: 'Sierpe del Lodo',
    focus: 'Factores de producción, productividad, división del trabajo, empresa',
    theme: THEMES[2],
    size: 170,
    waterLevel: 0.15,
    treeKind: 'oak',
    grassCount: 5200,
    rockCount: 55,
    bushCount: 120,
    treeCount: 95,
    colors: { grass: 0x5a7a4a, dark: 0x33482e, rock: 0x6a6a5a, sand: 0x8a8a5a },
  },
  {
    index: 3,
    name: 'Ruinas del Estado',
    biome: 'ruinas',
    enemyType: 'sombra',
    bossName: 'Coloso de Bronce',
    focus: 'Impuestos, gasto público, bienes públicos, externalidades, desarrollo',
    theme: THEMES[3],
    size: 170,
    waterLevel: null,
    treeKind: 'dead',
    grassCount: 3600,
    rockCount: 130,
    bushCount: 40,
    treeCount: 40,
    colors: { grass: 0x6a6a5a, dark: 0x3a3a38, rock: 0x7a6a62, sand: 0x8a7a6a },
  },
];

// ---------------------------------------------------------------------
//  Utilidades numéricas
// ---------------------------------------------------------------------
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0 || 1e-6));
  return t * t * (3 - 2 * t);
}

// ---------------------------------------------------------------------
//  Funciones de altura por bioma
// ---------------------------------------------------------------------
function makeRawHeight(cfg) {
  const i = cfg.index;

  if (i === 0) {
    // Pradera: colinas suaves y un arroyo serpenteante.
    return (x, z) => {
      let h = fbm(x * 0.010, z * 0.010, 4, 11) * 7.5
            + fbm(x * 0.045, z * 0.045, 3, 23) * 1.1
            - 2.2;
      const streamZ = Math.sin(x * 0.035) * 14 + 8;
      const d = Math.abs(z - streamZ);
      h -= smoothstep(9, 0, d) * 3.1;
      return h;
    };
  }

  if (i === 1) {
    // Cañón: mesetas escalonadas y un cauce seco profundo.
    return (x, z) => {
      let h = fbm(x * 0.008, z * 0.008, 4, 31) * 14;
      const step = 2.6;
      const q = Math.floor(h / step) * step;
      const f = h / step - Math.floor(h / step);
      h = q + step * smoothstep(0.55, 0.95, f);
      const trench = Math.abs(z - Math.sin(x * 0.022) * 22);
      h -= smoothstep(16, 3, trench) * 9;
      return h;
    };
  }

  if (i === 2) {
    // Pantano: llanura baja, pozas y montículos de lodo.
    return (x, z) => {
      let h = fbm(x * 0.020, z * 0.020, 4, 47) * 2.4 - 1.15;
      h += fbm(x * 0.060, z * 0.060, 3, 53) * 0.55;
      const mound = fbm(x * 0.014 + 7.3, z * 0.014 - 2.1, 3, 59);
      h += smoothstep(0.62, 0.82, mound) * 2.2;
      return h;
    };
  }

  // Ruinas: meseta con un volcán al noroeste.
  return (x, z) => {
    let h = fbm(x * 0.012, z * 0.012, 4, 61) * 6 - 1.5;
    const vd = Math.hypot(x + 46, z + 46);
    const cone = Math.max(0, 1 - vd / 34);
    h += Math.pow(cone, 1.7) * 22;
    return h;
  };
}

// ---------------------------------------------------------------------
//  Geometría de la hierba (dos cuadriláteros cruzados)
// ---------------------------------------------------------------------
function bladeGeometry() {
  const w = 0.26;
  const h = 0.82;
  const pos = [
    -w, 0, 0, w, 0, 0, w, h, 0, -w, h, 0,
    0, 0, -w, 0, 0, w, 0, h, w, 0, h, -w,
  ];
  const nor = [
    0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
    1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0,
  ];
  const uv = [0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1];
  const idx = [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7];

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// ---------------------------------------------------------------------
//  Agua
// ---------------------------------------------------------------------
function makeWater(cfg, size, waterLevel, stops) {
  const geo = new THREE.PlaneGeometry(size, size, 1, 1);
  geo.rotateX(-Math.PI / 2);

  const shallow = new THREE.Color(cfg.index === 2 ? 0x4a6b3a : 0x4fb8d8);
  const deep = new THREE.Color(cfg.index === 2 ? 0x1e2e1c : 0x1a5f8a);
  const sky = new THREE.Color(cfg.theme.skyHorizon);

  const uniforms = {
    uTime: { value: 0 },
    uShallow: { value: shallow },
    uDeep: { value: deep },
    uSky: { value: sky },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      uniform float uTime;
      varying vec3 vWorld;
      varying vec2 vXZ;
      void main() {
        vec3 p = position;
        float w = sin(p.x * 0.22 + uTime * 0.9) * 0.09
                + sin(p.z * 0.31 - uTime * 1.3) * 0.07;
        p.y += w;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vWorld = wp.xyz;
        vXZ = p.xz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform vec3 uShallow;
      uniform vec3 uDeep;
      uniform vec3 uSky;
      varying vec3 vWorld;
      varying vec2 vXZ;
      void main() {
        vec3 V = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - clamp(V.y, 0.0, 1.0), 2.2);
        float ripple = sin(vXZ.x * 1.7 + uTime * 1.6) * 0.5
                     + sin(vXZ.y * 2.1 - uTime * 1.2) * 0.5;
        vec3 col = mix(uDeep, uShallow, 0.45 + ripple * 0.12);
        col = mix(col, uSky, fres * 0.75);
        float alpha = 0.70 + fres * 0.22;
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = waterLevel;
  mesh.renderOrder = 2;
  mesh.name = 'agua';

  stops.push(onFrame((dt) => { uniforms.uTime.value += dt; }));
  return mesh;
}

// ---------------------------------------------------------------------
//  Construcción de una región
// ---------------------------------------------------------------------
export function buildRegion(scene, index = 0) {
  const cfg = REGIONS[Math.max(0, Math.min(REGIONS.length - 1, index | 0))];
  const SIZE = cfg.size;
  const HALF = SIZE / 2;
  const SEG = 128;
  const stops = [];

  const group = new THREE.Group();
  group.name = 'region_' + cfg.index;
  scene.add(group);

  // ── Altura con arena aplanada ──────────────────────────────────────
  const rawHeight = makeRawHeight(cfg);
  const arena = { x: 0, z: -30, r: 16 };
  const arenaH = rawHeight(arena.x, arena.z);

  function heightAt(x, z) {
    let h = rawHeight(x, z);
    const ad = Math.hypot(x - arena.x, z - arena.z);
    if (ad < arena.r + 6) {
      const k = smoothstep(arena.r + 6, arena.r - 2, ad);
      h = h * (1 - k) + arenaH * k;
    }
    return h;
  }

  // ── Terreno ────────────────────────────────────────────────────────
  const terrainGeo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  terrainGeo.rotateX(-Math.PI / 2);

  const posAttr = terrainGeo.attributes.position;
  const count = posAttr.count;
  const heights = new Float32Array(count);
  const cols = SEG + 1;
  const stepXZ = SIZE / SEG;

  for (let i = 0; i < count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    const h = heightAt(x, z);
    heights[i] = h;
    posAttr.setY(i, h);
  }
  posAttr.needsUpdate = true;

  // Color por vértice: hierba, pendiente, roca y arena junto al agua.
  const cGrass = new THREE.Color(cfg.colors.grass);
  const cDark = new THREE.Color(cfg.colors.dark);
  const cRock = new THREE.Color(cfg.colors.rock);
  const cSand = new THREE.Color(cfg.colors.sand);
  const tmpCol = new THREE.Color();
  const colorArr = new Float32Array(count * 3);
  const water = cfg.waterLevel;

  for (let r = 0; r < cols; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const h = heights[i];

      const hL = heights[r * cols + Math.max(0, c - 1)];
      const hR = heights[r * cols + Math.min(cols - 1, c + 1)];
      const hD = heights[Math.max(0, r - 1) * cols + c];
      const hU = heights[Math.min(cols - 1, r + 1) * cols + c];
      const dhx = (hR - hL) / (2 * stepXZ);
      const dhz = (hU - hD) / (2 * stepXZ);
      const slope = Math.sqrt(dhx * dhx + dhz * dhz);

      // Base: hierba clara en lo plano, oscura en pendiente.
      tmpCol.copy(cGrass).lerp(cDark, clamp01(slope * 0.9));

      // Roca en pendientes fuertes y en alturas grandes.
      const rockK = clamp01((slope - 0.55) * 1.6) * 0.85
                  + clamp01((h - 9) / 8) * 0.5;
      tmpCol.lerp(cRock, clamp01(rockK));

      // Arena en la orilla.
      if (water !== null && water !== undefined) {
        const shore = smoothstep(water + 1.1, water + 0.05, h);
        tmpCol.lerp(cSand, shore * 0.9);
      }

      // Variación fina para que el terreno no se vea plano.
      const v = 0.94 + fbm(posAttr.getX(i) * 0.09, posAttr.getZ(i) * 0.09, 2, 7) * 0.12;
      colorArr[i * 3] = tmpCol.r * v;
      colorArr[i * 3 + 1] = tmpCol.g * v;
      colorArr[i * 3 + 2] = tmpCol.b * v;
    }
  }

  terrainGeo.setAttribute('color', new THREE.BufferAttribute(colorArr, 3));
  terrainGeo.computeVertexNormals();

  const terrainMat = toon(0xffffff, {
    vertexColors: true,
    map: (() => {
      const t = TEX.grass().clone();
      t.needsUpdate = true;
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(28, 28);
      return t;
    })(),
    rimStrength: 0.12,
  });

  const terrain = new THREE.Mesh(terrainGeo, terrainMat);
  terrain.receiveShadow = true;
  terrain.castShadow = false;
  terrain.name = 'terreno';
  group.add(terrain);

  // ── Agua ───────────────────────────────────────────────────────────
  let waterMesh = null;
  if (water !== null && water !== undefined) {
    waterMesh = makeWater(cfg, SIZE, water, stops);
    group.add(waterMesh);
  }

  // ── Recolección de colisiones ──────────────────────────────────────
  const colliders = [];
  const cylinders = [];

  // ── Hierba instanciada ─────────────────────────────────────────────
  const uTime = { value: 0 };
  stops.push(onFrame((dt) => { uTime.value += dt; }));

  const grassMat = toon(0xffffff, { rimStrength: 0.18, side: THREE.DoubleSide });
  grassMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 iPos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          float phase = iPos.x * 0.35 + iPos.z * 0.27;
          float sway = sin(uTime * 1.6 + phase) * 0.13
                     + sin(uTime * 2.7 + phase * 1.7) * 0.05;
          float bend = max(0.0, position.y);
          transformed.x += sway * bend;
          transformed.z += sway * 0.6 * bend;
        #endif`
      );
  };
  grassMat.customProgramCacheKey = () => 'grass-sway-v1';

  const grassGeo = bladeGeometry();
  const grass = new THREE.InstancedMesh(grassGeo, grassMat, cfg.grassCount);
  grass.name = 'hierba';
  grass.frustumCulled = false;
  grass.castShadow = false;
  grass.receiveShadow = false;

  const dummy = new THREE.Object3D();
  const rnd = rng(1000 + cfg.index * 97);
  const grassColor = new THREE.Color();
  let placed = 0;
  let guard = 0;

  while (placed < cfg.grassCount && guard < cfg.grassCount * 12) {
    guard++;
    const x = (rnd() - 0.5) * (SIZE - 8);
    const z = (rnd() - 0.5) * (SIZE - 8);
    const h = heightAt(x, z);

    if (water !== null && water !== undefined && h < water + 0.22) continue;
    if (Math.hypot(x - arena.x, z - arena.z) < arena.r + 1) continue;

    // Pendiente aproximada.
    const s = Math.abs(heightAt(x + 0.7, z) - heightAt(x - 0.7, z))
            + Math.abs(heightAt(x, z + 0.7) - heightAt(x, z - 0.7));
    if (s > 1.5) continue;

    const sc = 0.7 + rnd() * 0.85;
    dummy.position.set(x, h - 0.04, z);
    dummy.rotation.set(0, rnd() * Math.PI * 2, 0);
    dummy.scale.set(sc, sc * (0.8 + rnd() * 0.6), sc);
    dummy.updateMatrix();
    grass.setMatrixAt(placed, dummy.matrix);

    grassColor.setHex(cfg.colors.grass).offsetHSL(
      (rnd() - 0.5) * 0.05,
      (rnd() - 0.5) * 0.12,
      (rnd() - 0.5) * 0.16
    );
    grass.setColorAt(placed, grassColor);
    placed++;
  }
  grass.count = placed;
  grass.instanceMatrix.needsUpdate = true;
  if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
  group.add(grass);

  // ── Árboles instanciados ───────────────────────────────────────────
  const treePositions = [];
  const treeRnd = rng(2000 + cfg.index * 131);
  let tGuard = 0;
  while (treePositions.length < cfg.treeCount && tGuard < cfg.treeCount * 20) {
    tGuard++;
    const x = (treeRnd() - 0.5) * (SIZE - 16);
    const z = (treeRnd() - 0.5) * (SIZE - 16);
    const h = heightAt(x, z);
    if (water !== null && water !== undefined && h < water + 0.5) continue;
    if (Math.hypot(x - arena.x, z - arena.z) < arena.r + 4) continue;
    if (Math.hypot(x, z - 62) < 12) continue; // despeje del punto de entrada
    const s = Math.abs(heightAt(x + 1, z) - heightAt(x - 1, z))
            + Math.abs(heightAt(x, z + 1) - heightAt(x, z - 1));
    if (s > 2.2) continue;
    treePositions.push({ x, z, h, s: 0.8 + treeRnd() * 0.6, rot: treeRnd() * Math.PI * 2 });
  }

  const trunkGeo = new THREE.CylinderGeometry(0.2, 0.34, 2.6, 7);
  trunkGeo.translate(0, 1.3, 0);
  const trunkMat = toon(0x6b4a2a, {
    map: (() => { const t = TEX.bark().clone(); t.needsUpdate = true; t.repeat.set(1, 3); return t; })(),
    rimStrength: 0.2,
  });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, Math.max(1, treePositions.length));
  trunks.name = 'troncos';
  trunks.castShadow = true;
  trunks.receiveShadow = true;

  const leafGeo = new THREE.IcosahedronGeometry(1, 1);
  const leafMat = toon(0x4f8a3a, {
    map: (() => { const t = TEX.leaf().clone(); t.needsUpdate = true; t.repeat.set(2, 2); return t; })(),
    rimStrength: 0.28,
  });
  const foliage = new THREE.InstancedMesh(leafGeo, leafMat, Math.max(1, treePositions.length * 3));
  foliage.name = 'copas';
  foliage.castShadow = true;
  foliage.receiveShadow = true;

  const leafColor = new THREE.Color();
  let fi = 0;
  treePositions.forEach((t, i) => {
    dummy.position.set(t.x, t.h, t.z);
    dummy.rotation.set(0, t.rot, 0);
    dummy.scale.setScalar(t.s);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);

    cylinders.push({ x: t.x, z: t.z, r: 0.42 * t.s, h: 2.6 * t.s });

    const blobs = [
      [0, 3.0, 0, 1.5],
      [0.85, 2.6, 0.3, 1.0],
      [-0.75, 2.7, -0.35, 0.95],
    ];
    for (const [bx, by, bz, bs] of blobs) {
      dummy.position.set(t.x + bx * t.s, t.h + by * t.s, t.z + bz * t.s);
      dummy.rotation.set(t.rot * 0.7, t.rot, t.rot * 0.4);
      dummy.scale.setScalar(bs * t.s);
      dummy.updateMatrix();
      foliage.setMatrixAt(fi, dummy.matrix);
      leafColor.setHex(cfg.index === 3 ? 0x5a6a4a : 0x4f8a3a).offsetHSL(
        (t.rot % 1) * 0.04 - 0.02, 0, (t.rot % 1) * 0.1 - 0.05
      );
      foliage.setColorAt(fi, leafColor);
      fi++;
    }
  });
  trunks.count = treePositions.length;
  foliage.count = fi;
  trunks.instanceMatrix.needsUpdate = true;
  foliage.instanceMatrix.needsUpdate = true;
  if (foliage.instanceColor) foliage.instanceColor.needsUpdate = true;
  group.add(trunks, foliage);

  // ── Rocas instanciadas ─────────────────────────────────────────────
  const rockGeo = new THREE.IcosahedronGeometry(1, 1);
  const rockMat = toon(0x9a9a92, {
    map: (() => { const t = TEX.rock().clone(); t.needsUpdate = true; return t; })(),
    flatShading: true,
    rimStrength: 0.2,
  });
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, cfg.rockCount);
  rocks.name = 'rocas';
  rocks.castShadow = true;
  rocks.receiveShadow = true;

  const rockRnd = rng(3000 + cfg.index * 173);
  let ri = 0;
  let rGuard = 0;
  while (ri < cfg.rockCount && rGuard < cfg.rockCount * 20) {
    rGuard++;
    const x = (rockRnd() - 0.5) * (SIZE - 10);
    const z = (rockRnd() - 0.5) * (SIZE - 10);
    const h = heightAt(x, z);
    if (water !== null && water !== undefined && h < water + 0.1) continue;
    if (Math.hypot(x - arena.x, z - arena.z) < arena.r + 2) continue;
    if (Math.hypot(x, z - 62) < 8) continue;

    const s = 0.5 + rockRnd() * 1.9;
    dummy.position.set(x, h + s * 0.35, z);
    dummy.rotation.set(rockRnd() * 3, rockRnd() * 3, rockRnd() * 3);
    dummy.scale.set(s, s * 0.8, s);
    dummy.updateMatrix();
    rocks.setMatrixAt(ri, dummy.matrix);

    if (s > 0.9) cylinders.push({ x, z, r: s * 0.85, h: s });
    ri++;
  }
  rocks.count = ri;
  rocks.instanceMatrix.needsUpdate = true;
  group.add(rocks);

  // ── Arbustos instanciados ──────────────────────────────────────────
  const bushGeo = new THREE.IcosahedronGeometry(0.55, 1);
  const bushMat = toon(0x5c9a42, {
    map: (() => { const t = TEX.leaf().clone(); t.needsUpdate = true; return t; })(),
    rimStrength: 0.26,
  });
  const bushes = new THREE.InstancedMesh(bushGeo, bushMat, cfg.bushCount);
  bushes.name = 'arbustos';
  bushes.castShadow = true;
  bushes.receiveShadow = true;

  const bushRnd = rng(4000 + cfg.index * 211);
  let bi = 0;
  let bGuard = 0;
  while (bi < cfg.bushCount && bGuard < cfg.bushCount * 20) {
    bGuard++;
    const x = (bushRnd() - 0.5) * (SIZE - 10);
    const z = (bushRnd() - 0.5) * (SIZE - 10);
    const h = heightAt(x, z);
    if (water !== null && water !== undefined && h < water + 0.15) continue;
    if (Math.hypot(x - arena.x, z - arena.z) < arena.r + 1) continue;

    const s = 0.7 + bushRnd() * 0.8;
    dummy.position.set(x, h + s * 0.3, z);
    dummy.rotation.set(0, bushRnd() * Math.PI * 2, 0);
    dummy.scale.set(s, s * 0.85, s);
    dummy.updateMatrix();
    bushes.setMatrixAt(bi, dummy.matrix);
    bi++;
  }
  bushes.count = bi;
  bushes.instanceMatrix.needsUpdate = true;
  group.add(bushes);

  // ── Árboles emblemáticos con contorno ──────────────────────────────
  const landmarkSpots = [
    [-14, 50], [16, 44], [-30, 20], [32, 12], [-22, -8], [24, -12],
  ];
  for (const [lx, lz] of landmarkSpots) {
    const h = heightAt(lx, lz);
    if (water !== null && water !== undefined && h < water + 0.4) continue;
    const tree = makeTree(cfg.treeKind);
    tree.position.set(lx, h, lz);
    tree.rotation.y = (lx * 0.37 + lz * 0.11) % (Math.PI * 2);
    tree.scale.setScalar(1.15);
    group.add(tree);
    cylinders.push({ x: lx, z: lz, r: 0.5, h: 3 });
  }

  // ── Santuarios ─────────────────────────────────────────────────────
  const shrines = [];
  const shrineAngles = [155, 200, 245, 290, 335];
  const shrineRadius = 46;

  shrineAngles.forEach((deg, i) => {
    const a = (deg * Math.PI) / 180;
    const x = Math.cos(a) * shrineRadius;
    const z = Math.sin(a) * shrineRadius;
    const y = heightAt(x, z);

    const shrine = makeShrine(i, false);
    shrine.group.position.set(x, y, z);
    shrine.group.rotation.y = -a + Math.PI / 2;
    group.add(shrine.group);

    colliders.push({ x, z, hw: 2.0, hd: 2.0 });

    shrines.push({
      id: 's' + (cfg.index + 1) + '-' + (i + 1),
      index: i,
      x, y, z,
      mesh: shrine.group,
      lit: false,
      setLit(b) {
        this.lit = !!b;
        shrine.setLit(b);
      },
      ring: shrine.ring,
    });
  });

  // ── Cofre ──────────────────────────────────────────────────────────
  const chestX = 18;
  const chestZ = 48;
  const chestY = heightAt(chestX, chestZ);
  const chest = makeChest();
  chest.group.position.set(chestX, chestY, chestZ);
  chest.group.rotation.y = -0.6;
  group.add(chest.group);
  colliders.push({ x: chestX, z: chestZ, hw: 0.75, hd: 0.55 });

  const chests = [{
    x: chestX, y: chestY, z: chestZ,
    get opened() { return chest.opened; },
    open: () => chest.open(),
  }];

  // ── Cartel ─────────────────────────────────────────────────────────
  const signTexts = [
    'La escasez nace cuando los deseos superan los recursos disponibles.',
    'El precio de equilibrio aparece cuando la oferta y la demanda coinciden.',
    'La productividad crece cuando el trabajo se divide y se especializa.',
    'Los bienes públicos benefician a todos, aunque nadie pague por ellos.',
  ];
  const signX = -7;
  const signZ = 54;
  const signY = heightAt(signX, signZ);
  const sign = makeSign(signTexts[cfg.index]);
  sign.position.set(signX, signY, signZ);
  sign.rotation.y = 0.35;
  group.add(sign);
  colliders.push({ x: signX, z: signZ, hw: 0.8, hd: 0.2 });

  const signs = [{ x: signX, y: signY, z: signZ, text: signTexts[cfg.index] }];

  // ── Antorchas ──────────────────────────────────────────────────────
  const torches = [];
  const torchSpots = [
    [arena.x - 12, arena.z + 12],
    [arena.x + 12, arena.z + 12],
    [arena.x - 12, arena.z - 12],
    [arena.x + 12, arena.z - 12],
    [-4, 58],
    [4, 58],
  ];
  for (const [tx, tz] of torchSpots) {
    const ty = heightAt(tx, tz);
    const torch = makeTorch();
    torch.group.position.set(tx, ty, tz);
    group.add(torch.group);
    torches.push({ x: tx, y: ty, z: tz, mesh: torch.group });
    colliders.push({ x: tx, z: tz, hw: 0.22, hd: 0.22 });
  }

  // ── Portal ─────────────────────────────────────────────────────────
  const portalX = 0;
  const portalZ = -62;
  const portalY = heightAt(portalX, portalZ);
  const portal = makePortal();
  portal.group.position.set(portalX, portalY, portalZ);
  group.add(portal.group);
  colliders.push({ x: portalX - 1.5, z: portalZ, hw: 0.45, hd: 0.45 });
  colliders.push({ x: portalX + 1.5, z: portalZ, hw: 0.45, hd: 0.45 });

  // ── Lava del volcán (solo Ruinas) ──────────────────────────────────
  if (cfg.index === 3) {
    const lavaY = heightAt(-46, -46) - 1.2;
    const lavaMat = glow(0xff5a1e, { intensity: 2.6, opacity: 0.95, side: THREE.DoubleSide });
    const lava = new THREE.Mesh(new THREE.CircleGeometry(5.5, 24), lavaMat);
    lava.rotation.x = -Math.PI / 2;
    lava.position.set(-46, lavaY, -46);
    group.add(lava);

    const lavaLight = new THREE.PointLight(0xff6a2a, 2.2, 40, 2);
    lavaLight.position.set(-46, lavaY + 3, -46);
    group.add(lavaLight);
  }

  // ── Puntos de aparición de enemigos ────────────────────────────────
  const enemySpawns = [];
  const eRnd = rng(5000 + cfg.index * 251);
  let eGuard = 0;
  const wanted = 8;
  while (enemySpawns.length < wanted && eGuard < wanted * 40) {
    eGuard++;
    const x = (eRnd() - 0.5) * (SIZE - 30);
    const z = (eRnd() - 0.5) * (SIZE - 30);
    if (Math.hypot(x, z - 62) < 22) continue;
    if (Math.hypot(x - arena.x, z - arena.z) < arena.r + 6) continue;
    let nearShrine = false;
    for (const s of shrines) {
      if (Math.hypot(x - s.x, z - s.z) < 7) { nearShrine = true; break; }
    }
    if (nearShrine) continue;
    const h = heightAt(x, z);
    if (water !== null && water !== undefined && h < water + 0.1) continue;
    enemySpawns.push({ type: cfg.enemyType, x, z });
  }

  // ── Punto de entrada ───────────────────────────────────────────────
  const spawn = { x: 0, y: heightAt(0, 62), z: 62 };

  // ── Tema ───────────────────────────────────────────────────────────
  setTheme(cfg.theme, cfg.index === 0);

  // ── API de la región ───────────────────────────────────────────────
  const region = {
    index: cfg.index,
    name: cfg.name,
    biome: cfg.biome,
    theme: cfg.theme,
    group,
    terrain: { mesh: terrain, heightAt },
    colliders,
    cylinders,
    spawn,
    bounds: { minX: -HALF + 4, maxX: HALF - 4, minZ: -HALF + 4, maxZ: HALF - 4 },
    shrines,
    chests,
    signs,
    torches,
    portal: {
      x: portalX, y: portalY, z: portalZ,
      mesh: portal.group,
      activate: () => portal.activate(),
      get active() { return portal.active; },
    },
    bossArena: { x: arena.x, z: arena.z, r: arena.r },
    enemySpawns,
    waterLevel: water,
    waterMesh,
    dispose() {
      for (const stop of stops) {
        try { stop(); } catch (e) { /* ya detenido */ }
      }
      stops.length = 0;
      scene.remove(group);
      disposeObject(group);
      group.clear();
    },
  };

  return region;
}
