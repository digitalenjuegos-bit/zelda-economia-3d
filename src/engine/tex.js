// =====================================================================
//  src/engine/tex.js — Texturas procedurales para «El Reino de la Economía»
//  Todo se dibuja en <canvas>: cero assets externos (SPEC §1).
//
//  Técnicas: ruido de valor (value noise) con rejilla periódica para que
//  las texturas sean repetibles sin costuras, FBM de 2-5 octavas, paletas
//  de 3-5 tonos, pinceladas con envoltura para que las briznas crucen el
//  borde sin cortarse. Nada de ruido blanco puro.
//  Resolución base 512x512, RepeatWrapping, anisotropía 8, sRGB.
// =====================================================================
import * as THREE from 'three';

// ---------------------------------------------------------------------
//  Utilidades numéricas
// ---------------------------------------------------------------------
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;

function mixArr(a, b, t, out) {
  out[0] = lerp(a[0], b[0], t);
  out[1] = lerp(a[1], b[1], t);
  out[2] = lerp(a[2], b[2], t);
  return out;
}

// Mezcla una paleta [[t, [r,g,b]], ...] en out
function palAt(stops, t, out) {
  t = clamp01(t);
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (t <= b[0] || i === stops.length - 2) {
      const span = b[0] - a[0] || 1e-6;
      return mixArr(a[1], b[1], clamp01((t - a[0]) / span), out);
    }
  }
  out[0] = stops[stops.length - 1][1][0];
  out[1] = stops[stops.length - 1][1][1];
  out[2] = stops[stops.length - 1][1][2];
  return out;
}

// ---------------------------------------------------------------------
//  RNG determinista (mulberry32)
// ---------------------------------------------------------------------
export function rng(seed = 1) {
  let a = (seed >>> 0) || 0x9e3779b9;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------
//  Ruido de valor + FBM
// ---------------------------------------------------------------------
function hash2(ix, iy, seed) {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iy | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const wrapC = (v, p) => (p > 0 ? ((v % p) + p) % p : v);

// Ruido de valor 2D. Si period > 0 la rejilla se repite cada `period`
// celdas: eso hace que la textura resultante sea repetible.
function vnoise(x, y, seed = 1, period = 0) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const x0 = wrapC(ix, period);
  const x1 = wrapC(ix + 1, period);
  const y0 = wrapC(iy, period);
  const y1 = wrapC(iy + 1, period);
  const a = hash2(x0, y0, seed);
  const b = hash2(x1, y0, seed);
  const c = hash2(x0, y1, seed);
  const d = hash2(x1, y1, seed);
  const top = a + (b - a) * sx;
  const bot = c + (d - c) * sx;
  return top + (bot - top) * sy;
}

export function fbm(x, y, octaves = 4, seed = 1) {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  const oct = Math.max(1, Math.min(8, octaves | 0));
  for (let i = 0; i < oct; i++) {
    sum += amp * vnoise(x * freq, y * freq, seed + i * 131);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / (norm || 1);
}

// FBM repetible: la octava 1 se repite cada (px,py) celdas y las
// siguientes duplican el periodo para conservar la continuidad.
function fbmT(x, y, octaves = 4, seed = 1, px = 4, py = 4) {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  const oct = Math.max(1, Math.min(8, octaves | 0));
  for (let i = 0; i < oct; i++) {
    sum += amp * vnoise(x * freq, y * freq, seed + i * 131, Math.max(1, Math.round(px * freq)), Math.max(1, Math.round(py * freq)));
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / (norm || 1);
}

// ---------------------------------------------------------------------
//  Pintura por píxeles y pinceles con envoltura
// ---------------------------------------------------------------------
function paint(ctx, w, h, shade) {
  const img = ctx.createImageData(w, h);
  const data = img.data;
  const px = [0, 0, 0, 255];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      px[0] = 0; px[1] = 0; px[2] = 0; px[3] = 255;
      shade(x, y, x / w, y / h, px);
      const o = (y * w + x) << 2;
      data[o] = px[0] < 0 ? 0 : px[0] > 255 ? 255 : px[0];
      data[o + 1] = px[1] < 0 ? 0 : px[1] > 255 ? 255 : px[1];
      data[o + 2] = px[2] < 0 ? 0 : px[2] > 255 ? 255 : px[2];
      data[o + 3] = px[3] < 0 ? 0 : px[3] > 255 ? 255 : px[3];
    }
  }
  ctx.putImageData(img, 0, 0);
}

// Offsets para dibujar una pincelada que cruce el borde sin costura
function offsetsFor(x, y, w, h, pad) {
  const xs = [0];
  const ys = [0];
  if (x < pad) xs.push(w);
  else if (x > w - pad) xs.push(-w);
  if (y < pad) ys.push(h);
  else if (y > h - pad) ys.push(-h);
  const out = [];
  for (let i = 0; i < xs.length; i++) {
    for (let j = 0; j < ys.length; j++) out.push([xs[i], ys[j]]);
  }
  return out;
}

function strokeWrapped(ctx, w, h, x, y, len, ang, bend, width) {
  const dx = Math.cos(ang);
  const dy = Math.sin(ang);
  const offs = offsetsFor(x, y, w, h, 40);
  ctx.lineWidth = width;
  for (let i = 0; i < offs.length; i++) {
    const ox = x + offs[i][0];
    const oy = y + offs[i][1];
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.quadraticCurveTo(ox + dx * len * 0.45 + bend, oy + dy * len * 0.45, ox + dx * len, oy + dy * len);
    ctx.stroke();
  }
}

function blobWrapped(ctx, w, h, x, y, rx, ry, rot) {
  const offs = offsetsFor(x, y, w, h, Math.max(rx, ry) + 2);
  for (let i = 0; i < offs.length; i++) {
    ctx.save();
    ctx.translate(x + offs[i][0], y + offs[i][1]);
    ctx.rotate(rot);
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// ---------------------------------------------------------------------
//  canvasTex
// ---------------------------------------------------------------------
export function canvasTex(w = 512, h = 512, draw = null, opts = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (draw) draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = opts.wrap === false ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  tex.wrapT = tex.wrapS;
  if (opts.repeat) tex.repeat.set(opts.repeat[0], opts.repeat[1]);
  tex.anisotropy = typeof opts.aniso === 'number' ? opts.aniso : 8;
  tex.colorSpace = opts.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  if (opts.magFilter) tex.magFilter = opts.magFilter;
  if (opts.minFilter) tex.minFilter = opts.minFilter;
  tex.needsUpdate = true;
  tex.userData.canvas = canvas;
  return tex;
}

// =====================================================================
//  HIERBA / PRADO
// =====================================================================
function paintGrass(ctx, w, h) {
  const PAL = [
    [0.0, [54, 86, 46]],
    [0.35, [80, 128, 62]],
    [0.62, [106, 162, 76]],
    [0.85, [138, 192, 98]],
    [1.0, [162, 208, 118]],
  ];
  const c = [0, 0, 0];
  paint(ctx, w, h, (x, y, u, v, o) => {
    const patch = fbmT(u * 4, v * 4, 4, 11, 4, 4);
    const fine = fbmT(u * 26, v * 26, 4, 23, 26, 26);
    const damp = fbmT(u * 6 + 3.1, v * 6 + 1.7, 3, 51, 6, 6);
    let t = clamp01(patch * 0.66 + fine * 0.34);
    // Zonas húmedas tiran a verde azulado; las secas, a verde oliva.
    t = clamp01(t + (0.5 - damp) * 0.18);
    palAt(PAL, t, c);
    const grain = hash2(x, y, 7) * 15 + hash2(x, y, 9) * 6;
    o[0] = c[0] - grain * 0.75 + damp * 6;
    o[1] = c[1] - grain * 0.55;
    o[2] = c[2] - grain * 0.65 + damp * 14;
    o[3] = 255;
  });

  const r = rng(9127);
  for (let i = 0; i < 340; i++) {
    ctx.fillStyle = 'rgba(28,52,26,' + (0.05 + r() * 0.07).toFixed(3) + ')';
    blobWrapped(ctx, w, h, r() * w, r() * h, 10 + r() * 34, 8 + r() * 26, r() * Math.PI);
  }
  ctx.lineCap = 'round';
  for (let i = 0; i < 4600; i++) {
    const x = r() * w;
    const y = r() * h;
    const len = 5 + r() * 14;
    const ang = -Math.PI / 2 + (r() - 0.5) * 0.9;
    if (r() > 0.42) {
      ctx.strokeStyle = 'rgba(' + ((150 + r() * 45) | 0) + ',' + ((196 + r() * 40) | 0) + ',' + ((92 + r() * 40) | 0) + ',' + (0.18 + r() * 0.34).toFixed(3) + ')';
    } else {
      ctx.strokeStyle = 'rgba(' + ((34 + r() * 22) | 0) + ',' + ((66 + r() * 28) | 0) + ',' + ((30 + r() * 20) | 0) + ',' + (0.2 + r() * 0.32).toFixed(3) + ')';
    }
    strokeWrapped(ctx, w, h, x, y, len, ang, (r() - 0.5) * 4, 0.8 + r() * 1.4);
  }
  // Espigas secas: rompen la uniformidad
  for (let i = 0; i < 140; i++) {
    ctx.strokeStyle = 'rgba(' + ((176 + r() * 40) | 0) + ',' + ((168 + r() * 30) | 0) + ',' + ((96 + r() * 30) | 0) + ',' + (0.25 + r() * 0.3).toFixed(3) + ')';
    strokeWrapped(ctx, w, h, r() * w, r() * h, 6 + r() * 10, -Math.PI / 2 + (r() - 0.5) * 0.5, (r() - 0.5) * 2, 0.9);
  }
  // Flores minúsculas
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = r() > 0.5 ? 'rgba(244,236,190,0.7)' : 'rgba(226,206,238,0.55)';
    blobWrapped(ctx, w, h, r() * w, r() * h, 1.1 + r() * 0.9, 1.1 + r() * 0.9, 0);
  }
}

// =====================================================================
//  TIERRA
// =====================================================================
function paintDirt(ctx, w, h) {
  const PAL = [
    [0.0, [46, 32, 22]],
    [0.4, [82, 58, 38]],
    [0.72, [112, 84, 56]],
    [1.0, [140, 108, 74]],
  ];
  const c = [0, 0, 0];
  paint(ctx, w, h, (x, y, u, v, o) => {
    const big = fbmT(u * 3, v * 3, 4, 61, 3, 3);
    const mid = fbmT(u * 12, v * 12, 4, 71, 12, 12);
    const fine = fbmT(u * 40, v * 40, 3, 81, 40, 40);
    const t = clamp01(big * 0.4 + mid * 0.38 + fine * 0.22);
    palAt(PAL, t, c);
    const grain = hash2(x, y, 13) * 18;
    o[0] = c[0] - grain * 0.7;
    o[1] = c[1] - grain * 0.7;
    o[2] = c[2] - grain * 0.6;
    o[3] = 255;
  });

  const r = rng(4411);
  for (let i = 0; i < 420; i++) {
    const x = r() * w;
    const y = r() * h;
    const rad = 1.2 + r() * 5.5;
    ctx.fillStyle = 'rgba(' + ((52 + r() * 40) | 0) + ',' + ((44 + r() * 34) | 0) + ',' + ((38 + r() * 28) | 0) + ',0.55)';
    blobWrapped(ctx, w, h, x + 0.8, y + 0.9, rad, rad * (0.7 + r() * 0.5), r() * 3);
    ctx.fillStyle = 'rgba(' + ((150 + r() * 60) | 0) + ',' + ((132 + r() * 52) | 0) + ',' + ((108 + r() * 44) | 0) + ',0.5)';
    blobWrapped(ctx, w, h, x, y, rad * 0.8, rad * 0.6, r() * 3);
  }
  ctx.lineCap = 'round';
  for (let i = 0; i < 26; i++) {
    let x = r() * w;
    let y = r() * h;
    let a = r() * Math.PI * 2;
    ctx.strokeStyle = 'rgba(36,26,18,' + (0.18 + r() * 0.2).toFixed(3) + ')';
    ctx.lineWidth = 1 + r() * 1.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let j = 0; j < 5; j++) {
      a += (r() - 0.5) * 1.3;
      x += Math.cos(a) * (8 + r() * 16);
      y += Math.sin(a) * (8 + r() * 16);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

// =====================================================================
//  ROCA
// =====================================================================
function paintRock(ctx, w, h) {
  const PAL = [
    [0.0, [58, 62, 70]],
    [0.32, [92, 97, 106]],
    [0.6, [132, 137, 146]],
    [0.84, [172, 176, 184]],
    [1.0, [198, 202, 208]],
  ];
  const c = [0, 0, 0];
  paint(ctx, w, h, (x, y, u, v, o) => {
    const big = fbmT(u * 3, v * 3, 5, 33, 3, 3);
    const med = fbmT(u * 11, v * 11, 4, 43, 11, 11);
    const grain = fbmT(u * 55, v * 55, 3, 53, 55, 55);
    const t = clamp01(big * 0.52 + med * 0.33 + grain * 0.15);
    palAt(PAL, t, c);
    const vein = Math.sin((u * 9 + v * 4) * Math.PI * 2 + big * 6.0) * 0.5 + 0.5;
    const spec = hash2(x, y, 17) * 12;
    o[0] = c[0] - spec + vein * 7;
    o[1] = c[1] - spec + vein * 7;
    o[2] = c[2] - spec + vein * 10;
    o[3] = 255;
  });

  const r = rng(7733);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let i = 0; i < 34; i++) {
    let x = 40 + r() * (w - 80);
    let y = 40 + r() * (h - 80);
    let a = r() * Math.PI * 2;
    const pts = [[x, y]];
    const segs = 4 + ((r() * 8) | 0);
    for (let j = 0; j < segs; j++) {
      a += (r() - 0.5) * 1.15;
      x += Math.cos(a) * (7 + r() * 16);
      y += Math.sin(a) * (7 + r() * 16);
      pts.push([x, y]);
    }
    const wdt = 0.9 + r() * 2.1;
    ctx.strokeStyle = 'rgba(32,34,40,' + (0.35 + r() * 0.35).toFixed(3) + ')';
    ctx.lineWidth = wdt;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let j = 1; j < pts.length; j++) ctx.lineTo(pts[j][0], pts[j][1]);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(222,226,232,0.16)';
    ctx.lineWidth = wdt * 0.8;
    ctx.beginPath();
    ctx.moveTo(pts[0][0] + 1.4, pts[0][1] + 1.4);
    for (let j = 1; j < pts.length; j++) ctx.lineTo(pts[j][0] + 1.4, pts[j][1] + 1.4);
    ctx.stroke();
    if (r() > 0.45) {
      const p = pts[(pts.length * 0.6) | 0];
      ctx.strokeStyle = 'rgba(38,40,46,0.3)';
      ctx.lineWidth = wdt * 0.6;
      ctx.beginPath();
      ctx.moveTo(p[0], p[1]);
      ctx.lineTo(p[0] + (r() - 0.5) * 40, p[1] + (r() - 0.5) * 40);
      ctx.stroke();
    }
  }
  for (let i = 0; i < 120; i++) {
    ctx.fillStyle = 'rgba(' + ((186 + r() * 30) | 0) + ',' + ((190 + r() * 28) | 0) + ',' + ((196 + r() * 26) | 0) + ',0.12)';
    blobWrapped(ctx, w, h, r() * w, r() * h, 3 + r() * 12, 2 + r() * 8, r() * 3);
  }
  for (let i = 0; i < 46; i++) {
    ctx.fillStyle = 'rgba(' + ((74 + r() * 30) | 0) + ',' + ((104 + r() * 34) | 0) + ',' + ((54 + r() * 26) | 0) + ',' + (0.08 + r() * 0.1).toFixed(3) + ')';
    blobWrapped(ctx, w, h, r() * w, r() * h, 6 + r() * 18, 4 + r() * 12, r() * 3);
  }
}

// =====================================================================
//  ARENA
// =====================================================================
function paintSand(ctx, w, h) {
  const PAL = [
    [0.0, [180, 156, 112]],
    [0.45, [220, 198, 152]],
    [0.75, [238, 222, 182]],
    [1.0, [250, 240, 208]],
  ];
  const c = [0, 0, 0];
  paint(ctx, w, h, (x, y, u, v, o) => {
    const warp = fbmT(u * 4, v * 4, 3, 91, 4, 4);
    const rippleA = Math.sin((v * 26 + warp * 4.2) * Math.PI) * 0.5 + 0.5;
    const rippleB = Math.sin((u * 5 + v * 24 + warp * 3.0) * Math.PI) * 0.5 + 0.5;
    const grain = fbmT(u * 60, v * 60, 2, 101, 60, 60);
    const t = clamp01(0.3 + rippleA * 0.34 + rippleB * 0.18 + grain * 0.18);
    palAt(PAL, t, c);
    const spec = hash2(x, y, 19);
    o[0] = c[0] - spec * 16;
    o[1] = c[1] - spec * 15;
    o[2] = c[2] - spec * 12;
    o[3] = 255;
  });

  const r = rng(2711);
  for (let i = 0; i < 1400; i++) {
    ctx.fillStyle = r() > 0.5 ? 'rgba(255,250,230,0.32)' : 'rgba(150,126,88,0.26)';
    blobWrapped(ctx, w, h, r() * w, r() * h, 0.7 + r() * 0.9, 0.7 + r() * 0.9, 0);
  }
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = 'rgba(' + ((120 + r() * 50) | 0) + ',' + ((110 + r() * 40) | 0) + ',' + ((96 + r() * 30) | 0) + ',0.5)';
    blobWrapped(ctx, w, h, r() * w, r() * h, 1 + r() * 2.4, 1 + r() * 2, r() * 3);
  }
}

// =====================================================================
//  CORTEZA
// =====================================================================
function paintBark(ctx, w, h) {
  const PAL = [
    [0.0, [42, 28, 20]],
    [0.35, [70, 48, 32]],
    [0.65, [102, 74, 48]],
    [0.85, [130, 100, 66]],
    [1.0, [156, 126, 88]],
  ];
  const c = [0, 0, 0];
  paint(ctx, w, h, (x, y, u, v, o) => {
    const v1 = fbmT(u * 7, v * 1.2, 4, 121, 7, 1);
    const v2 = fbmT(u * 22, v * 2.4, 3, 131, 22, 2);
    const fine = fbmT(u * 48, v * 6, 2, 141, 48, 6);
    const t = clamp01(v1 * 0.5 + v2 * 0.32 + fine * 0.18);
    palAt(PAL, t, c);
    const grain = hash2(x, y, 23) * 16;
    o[0] = c[0] - grain * 0.7;
    o[1] = c[1] - grain * 0.7;
    o[2] = c[2] - grain * 0.6;
    o[3] = 255;
  });

  const r = rng(6109);
  ctx.lineCap = 'round';
  for (let i = 0; i < 150; i++) {
    const x = r() * w;
    let y = r() * h;
    const len = 60 + r() * 200;
    const dark = r() > 0.45;
    ctx.strokeStyle = dark
      ? 'rgba(' + ((30 + r() * 18) | 0) + ',' + ((20 + r() * 14) | 0) + ',' + ((14 + r() * 10) | 0) + ',' + (0.25 + r() * 0.35).toFixed(3) + ')'
      : 'rgba(' + ((170 + r() * 40) | 0) + ',' + ((140 + r() * 34) | 0) + ',' + ((100 + r() * 30) | 0) + ',' + (0.12 + r() * 0.2).toFixed(3) + ')';
    ctx.lineWidth = 0.8 + r() * 3.2;
    const wob = (r() - 0.5) * 10;
    const off = offsetsFor(x, y, w, h, 30);
    for (let m = 0; m < off.length; m++) {
      ctx.beginPath();
      ctx.moveTo(x + off[m][0], y + off[m][1]);
      ctx.quadraticCurveTo(x + off[m][0] + wob, y + off[m][1] + len * 0.5, x + off[m][0] + wob * 0.4, y + off[m][1] + len);
      ctx.stroke();
    }
  }
  for (let i = 0; i < 4; i++) {
    const x = r() * w;
    const y = r() * h;
    for (let k = 0; k < 4; k++) {
      ctx.strokeStyle = 'rgba(' + ((34 + r() * 16) | 0) + ',' + ((22 + r() * 12) | 0) + ',' + ((14 + r() * 10) | 0) + ',' + (0.2 + k * 0.12).toFixed(3) + ')';
      ctx.lineWidth = 1 + r() * 1.6;
      ctx.beginPath();
      ctx.ellipse(x, y, 5 + k * 4.5, 12 + k * 6, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(26,18,12,0.55)';
    blobWrapped(ctx, w, h, x, y, 3.4, 6.5, 0);
  }
}

// =====================================================================
//  HOJA (follaje denso)
// =====================================================================
function paintLeaf(ctx, w, h) {
  const c = [0, 0, 0];
  paint(ctx, w, h, (x, y, u, v, o) => {
    const n = fbmT(u * 5, v * 5, 4, 151, 5, 5);
    const m = fbmT(u * 16, v * 16, 3, 161, 16, 16);
    const t = clamp01(n * 0.6 + m * 0.4);
    palAt(
      [
        [0.0, [22, 48, 22]],
        [0.4, [40, 82, 34]],
        [0.72, [62, 116, 44]],
        [1.0, [96, 152, 64]],
      ],
      t,
      c
    );
    o[0] = c[0];
    o[1] = c[1];
    o[2] = c[2];
    o[3] = 255;
  });

  const r = rng(3312);
  for (let i = 0; i < 210; i++) {
    const x = r() * w;
    const y = r() * h;
    const L = 10 + r() * 22;
    const A = r() * Math.PI * 2;
    const g = 70 + r() * 90;
    const off = offsetsFor(x, y, w, h, 40);
    for (let k = 0; k < off.length; k++) {
      const px = x + off[k][0];
      const py = y + off[k][1];
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(A);
      ctx.fillStyle = 'rgba(' + ((30 + r() * 26) | 0) + ',' + (g | 0) + ',' + ((28 + r() * 26) | 0) + ',' + (0.4 + r() * 0.4).toFixed(3) + ')';
      ctx.beginPath();
      ctx.moveTo(-L * 0.5, 0);
      ctx.quadraticCurveTo(0, L * 0.32, L * 0.5, 0);
      ctx.quadraticCurveTo(0, -L * 0.32, -L * 0.5, 0);
      ctx.fill();
      ctx.strokeStyle = 'rgba(' + ((120 + r() * 40) | 0) + ',' + ((170 + r() * 40) | 0) + ',' + ((80 + r() * 30) | 0) + ',0.35)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(-L * 0.42, 0);
      ctx.lineTo(L * 0.44, 0);
      ctx.stroke();
      ctx.restore();
    }
  }
  for (let i = 0; i < 120; i++) {
    ctx.fillStyle = 'rgba(12,26,12,0.18)';
    blobWrapped(ctx, w, h, r() * w, r() * h, 4 + r() * 14, 3 + r() * 10, r() * 3);
  }
}

// =====================================================================
//  AGUA
// =====================================================================
function paintWater(ctx, w, h) {
  const PAL = [
    [0.0, [16, 54, 78]],
    [0.35, [28, 88, 114]],
    [0.62, [48, 124, 148]],
    [0.85, [92, 170, 186]],
    [1.0, [150, 210, 214]],
  ];
  const c = [0, 0, 0];
  paint(ctx, w, h, (x, y, u, v, o) => {
    const warp = fbmT(u * 3, v * 3, 3, 181, 3, 3);
    const w1 = Math.sin((v * 10 + warp * 5.5 + u * 2) * Math.PI * 2) * 0.5 + 0.5;
    const w2 = Math.sin((u * 7 - v * 6 + warp * 4.0) * Math.PI * 2) * 0.5 + 0.5;
    const tide = fbmT(u * 8, v * 8, 4, 191, 8, 8);
    const t = clamp01(0.18 + w1 * 0.3 + w2 * 0.2 + tide * 0.32);
    palAt(PAL, t, c);
    const shine = Math.pow(clamp01(w1 * 0.7 + w2 * 0.5 - 0.45), 2.2) * 90;
    o[0] = c[0] + shine * 0.7;
    o[1] = c[1] + shine * 0.85;
    o[2] = c[2] + shine;
    o[3] = 255;
  });

  const r = rng(8811);
  ctx.lineCap = 'round';
  for (let i = 0; i < 260; i++) {
    ctx.strokeStyle = 'rgba(226,246,250,' + (0.05 + r() * 0.16).toFixed(3) + ')';
    strokeWrapped(ctx, w, h, r() * w, r() * h, 6 + r() * 26, (r() - 0.5) * 0.6, (r() - 0.5) * 5, 0.8 + r() * 2);
  }
  for (let i = 0; i < 160; i++) {
    ctx.fillStyle = 'rgba(235,252,255,' + (0.15 + r() * 0.3).toFixed(3) + ')';
    blobWrapped(ctx, w, h, r() * w, r() * h, 0.8 + r() * 1.8, 0.7 + r() * 1.4, 0);
  }
}

// =====================================================================
//  MURO DE PIEDRA (sillares)
// =====================================================================
function paintStoneWall(ctx, w, h) {
  const base = [0, 0, 0];
  paint(ctx, w, h, (x, y, u, v, o) => {
    const n = fbmT(u * 10, v * 10, 4, 211, 10, 10);
    palAt(
      [
        [0.0, [74, 72, 68]],
        [0.45, [112, 108, 102]],
        [0.8, [148, 142, 134]],
        [1.0, [172, 166, 156]],
      ],
      n,
      base
    );
    const grain = hash2(x, y, 29) * 14;
    o[0] = base[0] - grain;
    o[1] = base[1] - grain;
    o[2] = base[2] - grain;
    o[3] = 255;
  });

  const r = rng(5511);
  const rows = 5;
  const rh = h / rows;
  const cols = 3;
  const bw = w / cols;
  for (let row = 0; row < rows; row++) {
    const off = (row % 2) * 0.5;
    for (let col = -1; col < cols; col++) {
      const x = (col + off) * bw;
      const y = row * rh;
      ctx.strokeStyle = 'rgba(26,26,28,0.85)';
      ctx.lineWidth = 5;
      ctx.strokeRect(x + 2, y + 2, bw - 4, rh - 4);
      ctx.strokeStyle = 'rgba(214,210,200,0.22)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 5, y + 5);
      ctx.lineTo(x + bw - 5, y + 5);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(20,20,22,0.4)';
      ctx.beginPath();
      ctx.moveTo(x + 5, y + rh - 5);
      ctx.lineTo(x + bw - 5, y + rh - 5);
      ctx.stroke();
      for (let k = 0; k < 8; k++) {
        ctx.fillStyle = 'rgba(' + ((200 + r() * 40) | 0) + ',' + ((196 + r() * 36) | 0) + ',' + ((186 + r() * 30) | 0) + ',0.06)';
        blobWrapped(ctx, w, h, x + r() * bw, y + r() * rh, 3 + r() * 10, 2 + r() * 8, r() * 3);
      }
      if (r() > 0.55) {
        ctx.fillStyle = 'rgba(' + ((64 + r() * 30) | 0) + ',' + ((96 + r() * 34) | 0) + ',' + ((48 + r() * 24) | 0) + ',0.16)';
        blobWrapped(ctx, w, h, x + r() * bw, y + rh - 4, 6 + r() * 16, 2 + r() * 6, 0);
      }
    }
  }
}

// =====================================================================
//  MADERA (tablones)
// =====================================================================
function paintWood(ctx, w, h) {
  const c = [0, 0, 0];
  paint(ctx, w, h, (x, y, u, v, o) => {
    const grain = fbmT(u * 3, v * 22, 4, 221, 3, 22);
    const fine = fbmT(u * 10, v * 70, 3, 231, 10, 70);
    const t = clamp01(grain * 0.6 + fine * 0.4);
    palAt(
      [
        [0.0, [72, 46, 24]],
        [0.4, [108, 72, 38]],
        [0.72, [140, 100, 58]],
        [1.0, [170, 132, 84]],
      ],
      t,
      c
    );
    const g = hash2(x, y, 31) * 13;
    o[0] = c[0] - g;
    o[1] = c[1] - g;
    o[2] = c[2] - g * 0.8;
    o[3] = 255;
  });

  const r = rng(1919);
  const planks = 4;
  const ph = h / planks;
  for (let p = 0; p < planks; p++) {
    const y0 = p * ph;
    ctx.fillStyle = 'rgba(30,18,8,0.85)';
    ctx.fillRect(0, y0, w, 4);
    ctx.fillStyle = 'rgba(255,226,180,0.14)';
    ctx.fillRect(0, y0 + 4, w, 2);
    for (let i = 0; i < 26; i++) {
      const y = y0 + 8 + r() * (ph - 12);
      const amp = 1 + r() * 3;
      ctx.strokeStyle = 'rgba(' + ((56 + r() * 24) | 0) + ',' + ((34 + r() * 18) | 0) + ',' + ((18 + r() * 12) | 0) + ',' + (0.12 + r() * 0.22).toFixed(3) + ')';
      ctx.lineWidth = 0.7 + r() * 1.6;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 16) {
        const yy = y + Math.sin((x / w) * Math.PI * 2 + i) * amp;
        if (x === 0) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    if (r() > 0.5) {
      const kx = r() * w;
      const ky = y0 + ph * 0.5;
      for (let k = 0; k < 4; k++) {
        ctx.strokeStyle = 'rgba(58,34,16,' + (0.18 + k * 0.1).toFixed(3) + ')';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.ellipse(kx, ky, 6 + k * 4, 4 + k * 2.6, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }
}

// =====================================================================
//  TELA (trama de tejido)
// =====================================================================
function paintCloth(ctx, w, h) {
  const c = [0, 0, 0];
  paint(ctx, w, h, (x, y, u, v, o) => {
    const dye = fbmT(u * 5, v * 5, 4, 241, 5, 5);
    const fuzz = fbmT(u * 70, v * 70, 2, 251, 70, 70);
    palAt(
      [
        [0.0, [120, 96, 64]],
        [0.45, [156, 130, 92]],
        [0.8, [184, 158, 118]],
        [1.0, [204, 180, 142]],
      ],
      dye * 0.7 + fuzz * 0.3,
      c
    );
    // Trama: hilos de 8 px alternando luz según el cruce (over/under)
    const warp = (x & 7) < 4 ? 1 : 0;
    const weft = (y & 7) < 4 ? 1 : 0;
    const over = ((x >> 3) + (y >> 3)) % 2 === 0;
    const shade = (over ? warp : weft) - (over ? weft : warp);
    const m = 0.9 + shade * 0.12;
    o[0] = c[0] * m;
    o[1] = c[1] * m;
    o[2] = c[2] * m;
    o[3] = 255;
  });

  const r = rng(6600);
  ctx.strokeStyle = 'rgba(92,70,44,0.35)';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 5]);
  for (let i = 0; i < 3; i++) {
    const y = 40 + r() * (h - 80);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y + (r() - 0.5) * 10);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = 'rgba(70,52,32,0.08)';
    blobWrapped(ctx, w, h, r() * w, r() * h, 4 + r() * 14, 3 + r() * 10, r() * 3);
  }
}

// =====================================================================
//  RUNA (piedra oscura con glifo cian brillante)
// =====================================================================
function paintRune(ctx, w, h) {
  paint(ctx, w, h, (x, y, u, v, o) => {
    const n = fbmT(u * 6, v * 6, 4, 301, 6, 6);
    const g = fbmT(u * 24, v * 24, 3, 311, 24, 24);
    const t = clamp01(n * 0.62 + g * 0.38);
    const base = 26 + t * 40;
    const grain = hash2(x, y, 37) * 14;
    o[0] = base * 0.82 - grain;
    o[1] = base * 0.92 - grain;
    o[2] = base * 1.08 - grain * 0.8 + 8;
    o[3] = 255;
  });

  const r = rng(9021);
  const cx = w / 2;
  const cy = h / 2;
  ctx.lineCap = 'round';
  // Halo suave del glifo
  ctx.strokeStyle = 'rgba(120,240,255,0.16)';
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.arc(cx, cy, w * 0.29, 0, Math.PI * 2);
  ctx.stroke();
  // Anillos y brazos del glifo
  ctx.strokeStyle = 'rgba(160,250,255,0.85)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(cx, cy, w * 0.29, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 4;
  for (let i = 0; i < 6; i++) {
    const a0 = (i / 6) * Math.PI * 2 + 0.2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a0) * w * 0.1, cy + Math.sin(a0) * w * 0.1);
    ctx.lineTo(cx + Math.cos(a0) * w * 0.26, cy + Math.sin(a0) * w * 0.26);
    ctx.stroke();
  }
  ctx.lineWidth = 7;
  ctx.beginPath();
  for (let i = 0; i <= 90; i++) {
    const t = i / 90;
    const a = t * Math.PI * 4.5;
    const rad = t * w * 0.19;
    const px = cx + Math.cos(a) * rad;
    const py = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
  // Grietas con luz que se escapa
  for (let i = 0; i < 20; i++) {
    let x = cx + (r() - 0.5) * w * 0.8;
    let y = cy + (r() - 0.5) * h * 0.8;
    let a = r() * Math.PI * 2;
    ctx.strokeStyle = 'rgba(150,238,255,' + (0.12 + r() * 0.22).toFixed(3) + ')';
    ctx.lineWidth = 1 + r() * 1.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let j = 0; j < 4; j++) {
      a += (r() - 0.5) * 1.2;
      x += Math.cos(a) * (7 + r() * 12);
      y += Math.sin(a) * (7 + r() * 12);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

// =====================================================================
//  METAL (acero cepillado)
// =====================================================================
function paintMetal(ctx, w, h) {
  paint(ctx, w, h, (x, y, u, v, o) => {
    const band = fbmT(u * 2, v * 40, 3, 331, 2, 40);
    const fine = fbmT(u * 4, v * 160, 2, 341, 4, 160);
    const dust = fbmT(u * 9, v * 9, 3, 351, 9, 9);
    const t = clamp01(band * 0.5 + fine * 0.34 + dust * 0.16);
    // Céfiro azulado del acero, con brillo alto
    const base = 96 + t * 108;
    const spec = hash2(x, y, 41) * 10;
    o[0] = base * 0.92 - spec;
    o[1] = base * 0.96 - spec;
    o[2] = base * 1.02 + 6 - spec * 0.8;
    o[3] = 255;
  });

  const r = rng(3355);
  ctx.lineCap = 'butt';
  // Cepillado horizontal
  for (let i = 0; i < 420; i++) {
    const y = r() * h;
    const x = r() * w;
    const len = 20 + r() * 180;
    const bright = r() > 0.5;
    ctx.strokeStyle = bright
      ? 'rgba(235,242,250,' + (0.05 + r() * 0.12).toFixed(3) + ')'
      : 'rgba(40,44,52,' + (0.05 + r() * 0.12).toFixed(3) + ')';
    ctx.lineWidth = 0.6 + r() * 1.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y + (r() - 0.5) * 2);
    ctx.stroke();
  }
  // Arañazos diagonales
  for (let i = 0; i < 26; i++) {
    ctx.strokeStyle = 'rgba(250,252,255,' + (0.1 + r() * 0.2).toFixed(3) + ')';
    ctx.lineWidth = 0.7 + r();
    ctx.beginPath();
    ctx.moveTo(r() * w, r() * h);
    ctx.lineTo(r() * w, r() * h);
    ctx.stroke();
  }
}

// =====================================================================
//  TEX — caché: cada textura se genera una sola vez
// =====================================================================
const CACHE = Object.create(null);

function cached(key, painter, opts) {
  return function get() {
    if (!CACHE[key]) CACHE[key] = canvasTex(S, S, painter, opts || {});
    return CACHE[key];
  };
}

const S = 512;

export const TEX = {
  grass: cached('grass', paintGrass),
  dirt: cached('dirt', paintDirt),
  rock: cached('rock', paintRock),
  sand: cached('sand', paintSand),
  bark: cached('bark', paintBark),
  leaf: cached('leaf', paintLeaf),
  water: cached('water', paintWater),
  stoneWall: cached('stoneWall', paintStoneWall),
  wood: cached('wood', paintWood),
  cloth: cached('cloth', paintCloth),
  rune: cached('rune', paintRune),
  metal: cached('metal', paintMetal),
};
