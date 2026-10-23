/**
 * src/engine/core.js — renderer, escena, cámara, cielo, luces y post-proceso.
 *
 * API (ver SPEC.md, Anexo A):
 *   initCore(canvas)   -> { renderer, scene, camera, composer }
 *   setTheme(theme)       transición suave de luz, cielo y niebla
 *   setExposure(v)
 *   onFrame(cb)           cb(dt) después de cada render
 *   renderFrame(dt)
 *   core                  refs vivas
 *
 * Cadena de post-proceso (r160):
 *   RenderPass (lineal HDR) -> UnrealBloom -> OutputPass (ACES + sRGB) -> SMAA
 * El tone mapping se aplica sÓlo al final: al renderizar a un render target,
 * three r160 no lo aplica en cada material, así que no hay doble exposición.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';

// ---------------------------------------------------------------------
//  Estado público
// ---------------------------------------------------------------------
export const core = {
  ready: false,
  renderer: null,
  scene: null,
  camera: null,
  composer: null,
  sun: null,
  hemi: null,
  fill: null,
  sky: null,
  bloom: null,
  time: 0,
  fitShadows: () => {},
};

const frameCbs = [];

// Tema por defecto: Pradera de la Escasez (Anexo B).
const DEFAULT_THEME = {
  sunColor: 0xfff7e4,
  sunIntensity: 1.6,
  hemiSky: 0xa8ddff,
  hemiGround: 0x5c7f46,
  hemiIntensity: 0.66,
  skyTop: 0x74b9ff,
  skyHorizon: 0xfdf3d6,
  fogColor: 0xfdf3d6,
  fogNear: 80,
  fogFar: 190,
  exposure: 1.26,
  sunDir: [0.42, 0.62, 0.34],
};

// Estado actual (se interpola) y objetivo.
const cur = {
  sunColor: new THREE.Color(DEFAULT_THEME.sunColor),
  hemiSky: new THREE.Color(DEFAULT_THEME.hemiSky),
  hemiGround: new THREE.Color(DEFAULT_THEME.hemiGround),
  skyTop: new THREE.Color(DEFAULT_THEME.skyTop),
  skyHorizon: new THREE.Color(DEFAULT_THEME.skyHorizon),
  fogColor: new THREE.Color(DEFAULT_THEME.fogColor),
  sunIntensity: DEFAULT_THEME.sunIntensity,
  hemiIntensity: DEFAULT_THEME.hemiIntensity,
  fogNear: DEFAULT_THEME.fogNear,
  fogFar: DEFAULT_THEME.fogFar,
  exposure: DEFAULT_THEME.exposure,
};

const tgt = {
  sunColor: new THREE.Color(DEFAULT_THEME.sunColor),
  hemiSky: new THREE.Color(DEFAULT_THEME.hemiSky),
  hemiGround: new THREE.Color(DEFAULT_THEME.hemiGround),
  skyTop: new THREE.Color(DEFAULT_THEME.skyTop),
  skyHorizon: new THREE.Color(DEFAULT_THEME.skyHorizon),
  fogColor: new THREE.Color(DEFAULT_THEME.fogColor),
  sunIntensity: DEFAULT_THEME.sunIntensity,
  hemiIntensity: DEFAULT_THEME.hemiIntensity,
  fogNear: DEFAULT_THEME.fogNear,
  fogFar: DEFAULT_THEME.fogFar,
  exposure: DEFAULT_THEME.exposure,
};

let sunDir = new THREE.Vector3().fromArray(DEFAULT_THEME.sunDir).normalize();
let shadowFocus = new THREE.Vector3(0, 0, 0);
let shadowRadius = 60;
let themeBlend = 1; // 1 = ya en el objetivo

// ---------------------------------------------------------------------
//  Cielo
// ---------------------------------------------------------------------
const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vDir = wp.xyz - cameraPosition;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const SKY_FRAG = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  uniform float uSunSize;
  uniform float uTime;
  varying vec3 vDir;

  void main() {
    vec3 dir = normalize(vDir);

    // Degradado vertical: el horizonte ocupa más banda que el cenit, que es
    // lo que da la sensación de aire limpio de las vistas abiertas.
    float up = clamp(dir.y, 0.0, 1.0);
    float t = pow(up, 0.30);
    vec3 col = mix(uHorizon, uTop, t);

    // Bajo el horizonte: el mismo color un poco apagado, nunca negro.
    float below = smoothstep(0.0, -0.18, dir.y);
    col = mix(col, uHorizon * 0.82, below);

    // Disco solar y halo.
    float d = max(dot(dir, normalize(uSunDir)), 0.0);
    float disk = smoothstep(1.0 - uSunSize, 1.0 - uSunSize * 0.35, d);
    float halo = pow(d, 22.0) * 0.55 + pow(d, 5.0) * 0.10;
    col += uSunColor * (disk * 1.9 + halo);

    // Franja de calima pegada al horizonte: funde cielo y niebla.
    col += uHorizon * 0.12 * exp(-abs(dir.y) * 16.0);

    // Nubes muy tenues y lentas (dos capas de seno, coste despreciable).
    float band = exp(-abs(dir.y - 0.22) * 5.5);
    float n = sin(dir.x * 2.4 + uTime * 0.015) * sin(dir.z * 2.1 - uTime * 0.011);
    col += vec3(0.05, 0.05, 0.045) * band * smoothstep(0.2, 1.0, n);

    gl_FragColor = vec4(col, 1.0);
  }
`;

// ---------------------------------------------------------------------
//  initCore
// ---------------------------------------------------------------------
export function initCore(canvas) {
  if (!canvas) throw new Error('initCore: se requiere un <canvas>');

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,          // SMAA hace el trabajo, más barato y más limpio
    alpha: false,
    powerPreference: 'high-performance',
    stencil: false,
    depth: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = DEFAULT_THEME.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(DEFAULT_THEME.fogColor, DEFAULT_THEME.fogNear, DEFAULT_THEME.fogFar);

  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 700);
  camera.position.set(0, 12, 14);
  camera.lookAt(0, 1.2, 0);

  // ── Cielo ─────────────────────────────────────────────────────────
  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: cur.skyTop.clone() },
      uHorizon: { value: cur.skyHorizon.clone() },
      uSunColor: { value: cur.sunColor.clone() },
      uSunDir: { value: sunDir.clone() },
      uSunSize: { value: 0.011 },
      uTime: { value: 0 },
    },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    toneMapped: false,
  });

  const sky = new THREE.Mesh(new THREE.SphereGeometry(480, 32, 20), skyMat);
  sky.name = 'cielo';
  sky.frustumCulled = false;
  sky.renderOrder = -1000;
  scene.add(sky);

  // ── Luces ─────────────────────────────────────────────────────────
  const hemi = new THREE.HemisphereLight(cur.hemiSky, cur.hemiGround, cur.hemiIntensity);
  hemi.name = 'luz_cielo';
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(cur.sunColor, cur.sunIntensity);
  sun.name = 'sol';
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 260;
  sun.shadow.camera.left = -60;
  sun.shadow.camera.right = 60;
  sun.shadow.camera.top = 60;
  sun.shadow.camera.bottom = -60;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 2;
  scene.add(sun);
  scene.add(sun.target);

  // Relleno frío muy bajo: separa los volúmenes en sombra sin lavar el contraste.
  const fill = new THREE.DirectionalLight(0xa8c8e8, 0.18);
  fill.name = 'relleno';
  fill.position.set(-40, 26, -46);
  scene.add(fill);

  const placeSun = () => {
    sun.target.position.copy(shadowFocus);
    sun.position.copy(shadowFocus).addScaledVector(sunDir, 150);
    sun.target.updateMatrixWorld();
    sun.updateMatrixWorld();
  };
  placeSun();

  core.fitShadows = (center, radius = 60) => {
    if (center) shadowFocus.set(center.x, center.y || 0, center.z);
    shadowRadius = Math.max(12, Math.min(120, radius));
    const c = sun.shadow.camera;
    c.left = -shadowRadius;
    c.right = shadowRadius;
    c.top = shadowRadius;
    c.bottom = -shadowRadius;
    c.far = shadowRadius * 3 + 160;
    c.updateProjectionMatrix();
    placeSun();
  };

  // ── Post-proceso ──────────────────────────────────────────────────
  const size = new THREE.Vector2();
  renderer.getSize(size);
  const w = Math.max(1, size.x);
  const h = Math.max(1, size.y);

  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(w, h);

  const renderPass = new RenderPass(scene, camera);
  // Umbral por encima de 1.0: el cielo (emisivo, ~1.0 en el azul) no debe
  // florecer; solo el disco solar y las emisivas de las runas.
  const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.38, 0.62, 1.05);
  // Levantamiento de negros: sube solo la cola baja de la curva, antes del
  // ACES. Sin esto, las caras en sombra y la albedo oscura (corteza, roca)
  // se perciben como manchas negras planas en lugar de sombra con color.
  const lift = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uLift: { value: 0.018 },
      uKnee: { value: 0.22 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform float uLift;
      uniform float uKnee;
      varying vec2 vUv;
      void main() {
        vec4 tex = texture2D(tDiffuse, vUv);
        float lum = dot(tex.rgb, vec3(0.2126, 0.7152, 0.0722));
        // Peso 1 en negro puro, 0 al llegar al umbral: los blancos no se tocan.
        float w = 1.0 - smoothstep(0.0, uKnee, lum);
        // Tinte frío: la sombra de un día soleado es azul, nunca gris neutro.
        vec3 tint = vec3(0.62, 0.88, 1.0);
        gl_FragColor = vec4(tex.rgb + uLift * w * tint, tex.a);
      }
    `,
  });
  const outputPass = new OutputPass();
  const smaa = new SMAAPass(w, h);

  composer.addPass(renderPass);
  composer.addPass(bloom);
  composer.addPass(lift);
  composer.addPass(outputPass);
  composer.addPass(smaa);

  Object.assign(core, {
    ready: true,
    renderer,
    scene,
    camera,
    composer,
    sun,
    hemi,
    fill,
    sky,
    bloom,
    lift,
    time: 0,
  });

  // ── Tamaño ────────────────────────────────────────────────────────
  const resize = () => {
    const parent = canvas.parentElement;
    let cw = canvas.clientWidth || (parent ? parent.clientWidth : 0);
    let ch = canvas.clientHeight || (parent ? parent.clientHeight : 0);
    if (!cw || !ch) {
      cw = window.innerWidth;
      ch = window.innerHeight;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(cw, ch, false);
    composer.setPixelRatio(dpr);
    composer.setSize(cw, ch);
    bloom.setSize(cw, ch);
    if (smaa.setSize) smaa.setSize(cw, ch);
    camera.aspect = cw / ch;
    camera.updateProjectionMatrix();
  };
  resize();

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  if (window.ResizeObserver && canvas.parentElement) {
    new ResizeObserver(resize).observe(canvas.parentElement);
  }

  // Primer render: deja el canvas con imagen aunque main tarde un tick.
  renderer.compile(scene, camera);
  return { renderer, scene, camera, composer };
}

// ---------------------------------------------------------------------
//  Tema
// ---------------------------------------------------------------------
/**
 * Cambia el ambiente de la región. La transición se interpola en renderFrame,
 * así el salto entre biomas nunca es un corte seco.
 * theme = { sunColor, sunIntensity, hemiSky, hemiGround, hemiIntensity,
 *           skyTop, skyHorizon, fogColor, fogNear, fogFar, exposure, sunDir }
 */
export function setTheme(theme = {}, instant = false) {
  if (!theme) return;

  const setCol = (target, key, value) => {
    if (value === undefined || value === null) return;
    target[key].set(value);
  };

  setCol(tgt, 'sunColor', theme.sunColor);
  setCol(tgt, 'hemiSky', theme.hemiSky);
  setCol(tgt, 'hemiGround', theme.hemiGround);
  setCol(tgt, 'skyTop', theme.skyTop);
  setCol(tgt, 'skyHorizon', theme.skyHorizon);
  setCol(tgt, 'fogColor', theme.fogColor);

  if (typeof theme.sunIntensity === 'number') tgt.sunIntensity = theme.sunIntensity;
  if (typeof theme.hemiIntensity === 'number') tgt.hemiIntensity = theme.hemiIntensity;
  if (typeof theme.fogNear === 'number') tgt.fogNear = theme.fogNear;
  if (typeof theme.fogFar === 'number') tgt.fogFar = theme.fogFar;
  if (typeof theme.exposure === 'number') tgt.exposure = theme.exposure;

  if (theme.sunDir) {
    const arr = Array.isArray(theme.sunDir)
      ? theme.sunDir
      : [theme.sunDir.x, theme.sunDir.y, theme.sunDir.z];
    sunDir.fromArray(arr).normalize();
    if (core.sun) core.fitShadows(shadowFocus, shadowRadius);
  }

  if (instant) {
    themeBlend = 0;
    smoothTheme(10);
    themeBlend = 1;
  } else {
    themeBlend = 0;
  }
}

export function setExposure(v) {
  if (typeof v !== 'number') return;
  tgt.exposure = v;
  if (core.renderer) core.renderer.toneMappingExposure = v;
}

// ---------------------------------------------------------------------
//  Compensación ACES del cielo
// ---------------------------------------------------------------------
// El OutputPass aplica ACESFilmic a toda la imagen, también al domo del
// cielo (que es ShaderMaterial sin tone mapping propio). Consecuencia: un
// tema que pide 0x74b9ff se ve casi blanco. Estas funciones invierten la
// curva para que el color escrito en el tema sea el que aparece en pantalla.
// Solo se usan en el cielo y su horizonte; el resto de materiales se rige
// por la iluminación de la escena.
const ACES_IN = [0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777];
const ACES_OUT = [1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602];

function acesMul(m, r, g, b, out) {
  out[0] = m[0] * r + m[3] * g + m[6] * b;
  out[1] = m[1] * r + m[4] * g + m[7] * b;
  out[2] = m[2] * r + m[5] * g + m[8] * b;
  return out;
}

const _a = [0, 0, 0];
const _b = [0, 0, 0];

function acesForward(r, g, b, exposure, out) {
  const e = exposure / 0.6;
  acesMul(ACES_IN, r * e, g * e, b * e, _a);
  for (let i = 0; i < 3; i++) {
    const v = _a[i];
    const num = v * (v + 0.0245786) - 0.000090537;
    const den = v * (0.983729 * v + 0.4329510) + 0.238081;
    _b[i] = num / den;
  }
  acesMul(ACES_OUT, _b[0], _b[1], _b[2], _a);
  out[0] = Math.min(1, Math.max(0, _a[0]));
  out[1] = Math.min(1, Math.max(0, _a[1]));
  out[2] = Math.min(1, Math.max(0, _a[2]));
  return out;
}

const _fwd = [0, 0, 0];

/**
 * Devuelve en `out` (THREE.Color) el valor lineal que, tras ACES, se ve como
 * `color`. Bisección sobre la ganancia: ACES es monótona, así que basta con
 * igualar la luminancia.
 */
function acesInverse(color, exposure, out) {
  const r = color.r, g = color.g, b = color.b;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  if (lum < 1e-5) { out.setRGB(r, g, b); return out; }

  let lo = 0.05;
  let hi = 40;
  for (let i = 0; i < 26; i++) {
    const mid = (lo + hi) * 0.5;
    acesForward(r * mid, g * mid, b * mid, exposure, _fwd);
    const l = 0.2126 * _fwd[0] + 0.7152 * _fwd[1] + 0.0722 * _fwd[2];
    if (l < lum) lo = mid; else hi = mid;
  }
  const k = (lo + hi) * 0.5;
  out.setRGB(r * k, g * k, b * k);
  return out;
}

const _skyTop = new THREE.Color();
const _skyHor = new THREE.Color();

function smoothTheme(dt) {
  if (!core.ready) return;

  themeBlend = Math.min(1, themeBlend + dt * 0.9);
  const k = 1 - Math.exp(-dt * 2.6);

  cur.sunColor.lerp(tgt.sunColor, k);
  cur.hemiSky.lerp(tgt.hemiSky, k);
  cur.hemiGround.lerp(tgt.hemiGround, k);
  cur.skyTop.lerp(tgt.skyTop, k);
  cur.skyHorizon.lerp(tgt.skyHorizon, k);
  cur.fogColor.lerp(tgt.fogColor, k);
  cur.sunIntensity += (tgt.sunIntensity - cur.sunIntensity) * k;
  cur.hemiIntensity += (tgt.hemiIntensity - cur.hemiIntensity) * k;
  cur.fogNear += (tgt.fogNear - cur.fogNear) * k;
  cur.fogFar += (tgt.fogFar - cur.fogFar) * k;
  cur.exposure += (tgt.exposure - cur.exposure) * k;

  core.sun.color.copy(cur.sunColor);
  core.sun.intensity = cur.sunIntensity;
  core.hemi.color.copy(cur.hemiSky);
  core.hemi.groundColor.copy(cur.hemiGround);
  core.hemi.intensity = cur.hemiIntensity;

  if (core.scene.fog) {
    core.scene.fog.color.copy(cur.fogColor);
    core.scene.fog.near = cur.fogNear;
    core.scene.fog.far = cur.fogFar;
  }

  core.renderer.toneMappingExposure = cur.exposure;

  const u = core.sky.material.uniforms;
  // El cielo se compensa contra ACES para que el tema mande en el color visto.
  // Solo el cenit se compensa: el horizonte es casi blanco y ACES lo deja
  // prácticamente igual; invertirlo lo volvía tan luminoso que aplastaba el
  // degradado y el cielo entero salía gris.
  acesInverse(cur.skyTop, cur.exposure, _skyTop);
  u.uTop.value.copy(_skyTop);
  u.uHorizon.value.copy(cur.skyHorizon);
  u.uSunColor.value.copy(cur.sunColor);
  u.uSunDir.value.copy(sunDir);
}

// ---------------------------------------------------------------------
//  Bucle
// ---------------------------------------------------------------------
export function onFrame(cb) {
  if (typeof cb !== 'function') return () => {};
  frameCbs.push(cb);
  return () => {
    const i = frameCbs.indexOf(cb);
    if (i >= 0) frameCbs.splice(i, 1);
  };
}

export function renderFrame(dt = 0.016) {
  if (!core.ready) return;
  const d = Math.min(Math.max(dt, 0), 0.05);

  core.time += d;
  core.sky.material.uniforms.uTime.value = core.time;
  core.sky.position.copy(core.camera.position);

  smoothTheme(d);

  core.composer.render(d);

  for (let i = 0; i < frameCbs.length; i++) {
    try {
      frameCbs[i](d);
    } catch (err) {
      console.error('[core] onFrame:', err);
    }
  }
}
