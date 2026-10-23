/**
 * src/engine/particles.js — polvo, hojas, chispas, salpicaduras, curación,
 * rupias, runas y humo.
 *
 * API (ver SPEC.md, Anexo A):
 *   createParticles(scene) -> particles
 *   particles: { burst(kind, pos, opts), update(dt), setVisible(b) }
 *
 * Un solo ShaderMaterial dibuja las cinco siluetas (círculo suave, hoja,
 * chispa, rombo y anillo) y la rotación se resuelve en el fragment shader, así
 * que no hacen falta sprites ni texturas: cero assets, ocho draw calls como
 * máximo y ningún objeto nuevo por frame (pooling con arrays tipados).
 */
import * as THREE from 'three';

// ---------------------------------------------------------------------
//  Catálogo
// ---------------------------------------------------------------------
const KINDS = {
  dust: {
    count: 160, shape: 0, additive: false,
    grav: 0.55, drag: 1.9, spin: 1.2,
    life: [0.55, 1.05], size: [0.30, 0.95], color: [0.78, 0.70, 0.55],
    alpha: 0.62,
  },
  leaf: {
    count: 120, shape: 1, additive: false,
    grav: 1.5, drag: 0.9, spin: 7.0,
    life: [1.1, 1.9], size: [0.17, 0.22], color: [0.55, 0.76, 0.30],
    alpha: 0.95,
  },
  spark: {
    count: 200, shape: 2, additive: true,
    grav: 5.0, drag: 3.2, spin: 2.0,
    life: [0.22, 0.45], size: [0.13, 0.02], color: [1.0, 0.86, 0.52],
    alpha: 1.0,
  },
  splash: {
    count: 180, shape: 2, additive: false,
    grav: 9.8, drag: 0.5, spin: 0.0,
    life: [0.4, 0.75], size: [0.10, 0.05], color: [0.80, 0.93, 1.0],
    alpha: 0.9,
  },
  heal: {
    count: 120, shape: 2, additive: true,
    grav: -0.9, drag: 1.4, spin: 1.5,
    life: [0.7, 1.25], size: [0.16, 0.05], color: [0.55, 1.0, 0.62],
    alpha: 1.0,
  },
  rupee: {
    count: 120, shape: 3, additive: false,
    grav: 4.2, drag: 1.0, spin: 3.4,
    life: [0.55, 0.95], size: [0.19, 0.12], color: [0.30, 1.0, 0.55],
    alpha: 1.0,
  },
  rune: {
    count: 140, shape: 4, additive: true,
    grav: 0.0, drag: 1.1, spin: 0.35,
    life: [0.6, 1.1], size: [0.55, 2.10], color: [0.30, 0.95, 1.0],
    alpha: 1.0,
  },
  smoke: {
    count: 140, shape: 0, additive: false,
    grav: -0.35, drag: 1.1, spin: 0.6,
    life: [1.4, 2.4], size: [0.55, 2.00], color: [0.42, 0.44, 0.46],
    alpha: 0.42,
  },
};

// ---------------------------------------------------------------------
//  Shader compartido
// ---------------------------------------------------------------------
const VERT = /* glsl */ `
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aAlpha;
  attribute float aRot;

  uniform float uScale;

  varying vec3 vColor;
  varying float vAlpha;
  varying float vRot;

  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;

    float depth = max(-mv.z, 0.08);
    gl_PointSize = clamp(aSize * uScale / depth, 1.0, 240.0);

    vColor = aColor;
    vAlpha = aAlpha;
    vRot = aRot;
  }
`;

const FRAG = /* glsl */ `
  uniform float uShape;
  uniform float uSoft;

  varying vec3 vColor;
  varying float vAlpha;
  varying float vRot;

  void main() {
    vec2 p = gl_PointCoord - 0.5;

    // Rotación por partícula (hojas que giran, rombos que voltean).
    float c = cos(vRot);
    float s = sin(vRot);
    p = mat2(c, -s, s, c) * p;

    float a = 0.0;

    if (uShape < 0.5) {
      // Polvo y humo: mancha blanda.
      a = smoothstep(0.5, 0.10, length(p));
      a *= a;
    } else if (uShape < 1.5) {
      // Hoja: elipse alargada con vena central.
      float e = length(vec2(p.x * 1.55, p.y * 0.78));
      a = smoothstep(0.50, 0.34, e);
      a *= 0.70 + 0.30 * smoothstep(0.030, 0.0, abs(p.x));
    } else if (uShape < 2.5) {
      // Chispa / gota: núcleo brillante con caída suave.
      float r = length(p);
      a = pow(smoothstep(0.5, 0.0, r), 2.0);
      a *= 0.75 + 0.25 * smoothstep(0.18, 0.0, r);
    } else if (uShape < 3.5) {
      // Rombo (rupia).
      float d = abs(p.x) * 1.05 + abs(p.y);
      a = smoothstep(0.52, 0.44, d);
      a *= 0.55 + 0.45 * smoothstep(0.34, 0.05, d);
    } else {
      // Anillo (runa encendida): banda hueca que se expande.
      float r = length(p);
      a = smoothstep(0.50, 0.44, r) * smoothstep(0.26, 0.36, r);
    }

    a *= uSoft;
    if (a < 0.004) discard;

    gl_FragColor = vec4(vColor, a * vAlpha);
  }
`;

// ---------------------------------------------------------------------
//  Pool
// ---------------------------------------------------------------------
class Pool {
  constructor(kind, cfg) {
    this.kind = kind;
    this.cfg = cfg;
    this.cap = cfg.count;
    this.n = 0;

    const cap = this.cap;
    this.px = new Float32Array(cap);
    this.py = new Float32Array(cap);
    this.pz = new Float32Array(cap);
    this.vx = new Float32Array(cap);
    this.vy = new Float32Array(cap);
    this.vz = new Float32Array(cap);
    this.age = new Float32Array(cap);
    this.life = new Float32Array(cap);
    this.s0 = new Float32Array(cap);
    this.s1 = new Float32Array(cap);
    this.r = new Float32Array(cap);
    this.g = new Float32Array(cap);
    this.b = new Float32Array(cap);
    this.rot = new Float32Array(cap);
    this.spin = new Float32Array(cap);
    this.drag = new Float32Array(cap);
    this.grav = new Float32Array(cap);
    this.wob = new Float32Array(cap);
    this.alpha0 = new Float32Array(cap);

    this.aPos = new Float32Array(cap * 3);
    this.aCol = new Float32Array(cap * 3);
    this.aSize = new Float32Array(cap);
    this.aAlpha = new Float32Array(cap);
    this.aRot = new Float32Array(cap);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.aPos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.aCol, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.aSize, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.aAlpha, 1));
    geo.setAttribute('aRot', new THREE.BufferAttribute(this.aRot, 1));
    geo.setDrawRange(0, 0);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uShape: { value: cfg.shape },
        uSoft: { value: 1.0 },
        uScale: { value: 780.0 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: cfg.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      toneMapped: false,
    });

    const points = new THREE.Points(geo, mat);
    points.name = 'particulas_' + kind;
    points.frustumCulled = false;
    points.renderOrder = 6;
    points.userData.isParticles = true;

    this.points = points;
    this.geo = geo;
    this.mat = mat;
  }

  reset(i) {
    const last = --this.n;
    if (i === last) return;
    const pa = this;
    pa.px[i] = pa.px[last]; pa.py[i] = pa.py[last]; pa.pz[i] = pa.pz[last];
    pa.vx[i] = pa.vx[last]; pa.vy[i] = pa.vy[last]; pa.vz[i] = pa.vz[last];
    pa.age[i] = pa.age[last]; pa.life[i] = pa.life[last];
    pa.s0[i] = pa.s0[last]; pa.s1[i] = pa.s1[last];
    pa.r[i] = pa.r[last]; pa.g[i] = pa.g[last]; pa.b[i] = pa.b[last];
    pa.rot[i] = pa.rot[last]; pa.spin[i] = pa.spin[last];
    pa.drag[i] = pa.drag[last]; pa.grav[i] = pa.grav[last];
    pa.wob[i] = pa.wob[last]; pa.alpha0[i] = pa.alpha0[last];
  }

  spawn(p) {
    const i = this.n < this.cap ? this.n++ : (Math.random() * this.cap) | 0;
    this.px[i] = p.x; this.py[i] = p.y; this.pz[i] = p.z;
    this.vx[i] = p.vx; this.vy[i] = p.vy; this.vz[i] = p.vz;
    this.age[i] = 0;
    this.life[i] = p.life;
    this.s0[i] = p.s0;
    this.s1[i] = p.s1;
    this.r[i] = p.r; this.g[i] = p.g; this.b[i] = p.b;
    this.rot[i] = p.rot;
    this.spin[i] = p.spin;
    this.drag[i] = p.drag;
    this.grav[i] = p.grav;
    this.wob[i] = p.wob;
    this.alpha0[i] = p.alpha0;
  }

  update(dt) {
    const cfg = this.cfg;
    let i = 0;
    while (i < this.n) {
      this.age[i] += dt;
      const t = this.age[i] / this.life[i];
      if (t >= 1) {
        this.reset(i);
        continue;
      }

      const dragK = Math.exp(-this.drag[i] * dt);
      this.vy[i] -= this.grav[i] * dt;
      this.vx[i] *= dragK;
      this.vy[i] *= dragK;
      this.vz[i] *= dragK;

      // Vaivén lateral: hojas y humo no suben en línea recta.
      if (this.wob[i] > 0) {
        const w = this.wob[i];
        this.vx[i] += Math.sin(this.age[i] * 5.1 + i * 1.7) * w * dt;
        this.vz[i] += Math.cos(this.age[i] * 4.3 + i * 2.3) * w * dt;
      }

      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      this.rot[i] += this.spin[i] * dt;

      i++;
    }

    // Subida a los buffers.
    const aPos = this.aPos;
    const aCol = this.aCol;
    for (let k = 0, j = 0; k < this.n; k++, j += 3) {
      const t = this.age[k] / this.life[k];

      aPos[j] = this.px[k];
      aPos[j + 1] = this.py[k];
      aPos[j + 2] = this.pz[k];

      aCol[j] = this.r[k];
      aCol[j + 1] = this.g[k];
      aCol[j + 2] = this.b[k];

      this.aSize[k] = this.s0[k] + (this.s1[k] - this.s0[k]) * t;

      // Curva de opacidad propia de cada tipo.
      const fadeIn = Math.min(1, t * (cfg.fadeIn || 8));
      const fadeOut = Math.pow(1 - t, cfg.fadePow || 1.1);
      this.aAlpha[k] = this.alpha0[k] * fadeIn * fadeOut;

      this.aRot[k] = this.rot[k];
    }

    this.geo.setDrawRange(0, this.n);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
    this.geo.attributes.aRot.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------
//  Fábrica pública
// ---------------------------------------------------------------------
export function createParticles(scene) {
  if (!scene) throw new Error('createParticles: se requiere la escena');

  const pools = {};
  const group = new THREE.Group();
  group.name = 'particulas';

  for (const kind of Object.keys(KINDS)) {
    const pool = new Pool(kind, KINDS[kind]);
    pools[kind] = pool;
    group.add(pool.points);
  }
  scene.add(group);

  // Escala de píxeles: tamaño de la partícula en metros a tamaño real.
  const updateScale = () => {
    const h = (window.innerHeight || 720) * Math.min(window.devicePixelRatio || 1, 2);
    const fov = 50 * Math.PI / 180;
    const scale = h / (2 * Math.tan(fov / 2));
    for (const k of Object.keys(pools)) pools[k].mat.uniforms.uScale.value = scale;
  };
  updateScale();
  window.addEventListener('resize', updateScale);

  let visible = true;

  // ── Emisión ───────────────────────────────────────────────────────
  function emit(kind, x, y, z, opt) {
    const pool = pools[kind];
    if (!pool) return;
    const cfg = KINDS[kind];
    const c = opt.color || cfg.color;
    const sizeMul = opt.sizeMul !== undefined ? opt.sizeMul : 1;
    const lifeMul = opt.lifeMul !== undefined ? opt.lifeMul : 1;
    const rnd = Math.random;

    const vx = opt.vx || 0;
    const vy = opt.vy || 0;
    const vz = opt.vz || 0;

    pool.spawn({
      x: x + (opt.jx ? (rnd() - 0.5) * opt.jx : 0),
      y: y + (opt.jy ? (rnd() - 0.5) * opt.jy : 0),
      z: z + (opt.jz ? (rnd() - 0.5) * opt.jz : 0),
      vx, vy, vz,
      life: (cfg.life[0] + rnd() * (cfg.life[1] - cfg.life[0])) * lifeMul,
      s0: cfg.size[0] * sizeMul * (0.8 + rnd() * 0.4),
      s1: cfg.size[1] * sizeMul * (0.8 + rnd() * 0.4),
      r: c[0], g: c[1], b: c[2],
      rot: rnd() * Math.PI * 2,
      spin: (rnd() - 0.5) * cfg.spin,
      drag: cfg.drag,
      grav: cfg.grav,
      wob: opt.wob !== undefined ? opt.wob : 0,
      alpha0: cfg.alpha,
    });
  }

  function ringDir(i, n, out) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.35;
    out.x = Math.cos(a);
    out.z = Math.sin(a);
    return out;
  }

  const tmp = { x: 0, z: 0 };

  function burst(kind, pos, opts = {}) {
    if (!visible) return;
    const x = pos ? pos.x : 0;
    const y = pos ? pos.y : 0;
    const z = pos ? pos.z : 0;
    const speed = opts.speed !== undefined ? opts.speed : 1;
    const count = Math.max(1, Math.round(opts.count || 14));
    const sizeMul = opts.scale !== undefined ? opts.scale : 1;
    const lifeMul = opts.life !== undefined ? opts.life : 1;

    switch (kind) {
      case 'dust': {
        for (let i = 0; i < count; i++) {
          const d = ringDir(i, count, tmp);
          const sp = (0.5 + Math.random() * 1.5) * speed;
          emit('dust', x, y, z, {
            vx: d.x * sp, vy: 0.25 + Math.random() * 0.7, vz: d.z * sp,
            jx: 0.35, jz: 0.35, jy: 0.08,
            sizeMul, lifeMul, wob: 0.5,
          });
        }
        break;
      }
      case 'leaf': {
        for (let i = 0; i < count; i++) {
          const d = ringDir(i, count, tmp);
          const sp = (0.6 + Math.random() * 1.2) * speed;
          emit('leaf', x, y + 0.6 + Math.random() * 0.9, z, {
            vx: d.x * sp, vy: 0.4 + Math.random() * 0.8, vz: d.z * sp,
            jx: 1.1, jz: 1.1, jy: 0.9,
            sizeMul, lifeMul, wob: 1.6,
          });
        }
        break;
      }
      case 'spark': {
        for (let i = 0; i < count; i++) {
          const a = Math.random() * Math.PI * 2;
          const u = Math.random() * 2 - 1;
          const s = Math.sqrt(1 - u * u);
          const sp = (2.2 + Math.random() * 3.4) * speed;
          emit('spark', x, y, z, {
            vx: Math.cos(a) * s * sp,
            vy: u * sp * 0.7 + 1.1,
            vz: Math.sin(a) * s * sp,
            jx: 0.12, jy: 0.12, jz: 0.12,
            sizeMul, lifeMul,
          });
        }
        break;
      }
      case 'splash': {
        for (let i = 0; i < count; i++) {
          const d = ringDir(i, count, tmp);
          const sp = (0.7 + Math.random() * 1.9) * speed;
          emit('splash', x, y, z, {
            vx: d.x * sp, vy: 1.9 + Math.random() * 1.8, vz: d.z * sp,
            jx: 0.3, jz: 0.3, jy: 0.05,
            sizeMul, lifeMul,
          });
        }
        break;
      }
      case 'heal': {
        for (let i = 0; i < count; i++) {
          const d = ringDir(i, count, tmp);
          const rr = 0.15 + Math.random() * 0.55;
          emit('heal', x + d.x * rr, y + Math.random() * 0.5, z + d.z * rr, {
            vx: d.x * 0.25 * speed,
            vy: (0.9 + Math.random() * 1.4) * speed,
            vz: d.z * 0.25 * speed,
            sizeMul, lifeMul, wob: 0.7,
          });
        }
        break;
      }
      case 'rupee': {
        for (let i = 0; i < count; i++) {
          const d = ringDir(i, count, tmp);
          const sp = (0.5 + Math.random() * 1.4) * speed;
          emit('rupee', x, y + 0.1, z, {
            vx: d.x * sp, vy: 2.4 + Math.random() * 2.1, vz: d.z * sp,
            jx: 0.2, jz: 0.2,
            sizeMul, lifeMul,
          });
        }
        break;
      }
      case 'rune': {
        // Onda de choque: un anillo grande y plano que se abre.
        emit('rune', x, y + 0.15, z, {
          vx: 0, vy: 0, vz: 0,
          sizeMul: sizeMul * 1.0, lifeMul: lifeMul * 1.15,
        });
        emit('rune', x, y + 1.0, z, {
          vx: 0, vy: 0.6, vz: 0,
          sizeMul: sizeMul * 0.65, lifeMul: lifeMul * 0.8,
        });
        for (let i = 0; i < count; i++) {
          const d = ringDir(i, count, tmp);
          emit('spark', x + d.x * 0.4, y + 0.3 + Math.random() * 0.8, z + d.z * 0.4, {
            vx: d.x * 0.9 * speed,
            vy: 1.2 + Math.random() * 1.5,
            vz: d.z * 0.9 * speed,
            sizeMul: sizeMul * 0.8, lifeMul,
            color: [0.42, 0.98, 1.0],
          });
        }
        break;
      }
      case 'smoke': {
        for (let i = 0; i < count; i++) {
          const d = ringDir(i, count, tmp);
          emit('smoke', x + d.x * 0.25, y, z + d.z * 0.25, {
            vx: d.x * 0.35 * speed, vy: 0.5 + Math.random() * 0.6, vz: d.z * 0.35 * speed,
            sizeMul, lifeMul, wob: 0.8,
          });
        }
        break;
      }
      default:
        break;
    }
  }

  function update(dt) {
    if (!visible) return;
    const d = Math.min(Math.max(dt, 0), 0.05);
    for (const k of Object.keys(pools)) {
      if (pools[k].n > 0) pools[k].update(d);
    }
  }

  function setVisible(b) {
    visible = !!b;
    group.visible = visible;
  }

  function clear() {
    for (const k of Object.keys(pools)) {
      pools[k].n = 0;
      pools[k].geo.setDrawRange(0, 0);
    }
  }

  /** Ajuste fino del tamaño en píxeles si la cámara cambia de campo de visión. */
  function setFov(deg) {
    const h = (window.innerHeight || 720) * Math.min(window.devicePixelRatio || 1, 2);
    const fov = (deg || 50) * Math.PI / 180;
    const scale = h / (2 * Math.tan(fov / 2));
    for (const k of Object.keys(pools)) pools[k].mat.uniforms.uScale.value = scale;
  }

  return { burst, update, setVisible, clear, setFov, group };
}
