// =====================================================================
//  Super Economía Bros. 3D — textures.js
//  Pixel-art procedural (canvas) + sprites (mapas de píxeles) por tema.
//  Todo el arte es original, dibujado por código "al estilo" NES/SMB.
//  Convención: todos los sprites miran a la DERECHA (el motor espeja).
// =====================================================================
import * as THREE from 'three';

export const PX = 16;
export const THEMES = ['overworld', 'forest', 'underground', 'castle'];

// ---------------------------------------------------------------------
//  Utilidades
// ---------------------------------------------------------------------
const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
const bayer = (x, y) => B4[((y & 3) << 2) + (x & 3)];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function hash(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 982451653) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function hexToRgb(h) {
  h = h.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
}
function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}
/** elige un color de una rampa (oscuro→claro) con dithering ordenado */
function ramp(cols, v, x, y) {
  v = clamp(v, 0, 0.9999);
  const f = v * (cols.length - 1);
  let i = Math.floor(f);
  if (f - i > bayer(x, y)) i++;
  return cols[Math.min(i, cols.length - 1)];
}

function makeCanvas(w, h) {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  throw new Error('textures.js: no hay canvas disponible');
}

// Grilla de colores (null = transparente)
class Pix {
  constructor(w, h) { this.w = w; this.h = h; this.d = new Array(w * h).fill(null); }
  get(x, y) { return (x < 0 || y < 0 || x >= this.w || y >= this.h) ? undefined : this.d[y * this.w + x]; }
  set(x, y, c) { if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[y * this.w + x] = c; }
  map(rows, pal, ox = 0, oy = 0) {
    for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) {
      const ch = rows[y][x];
      if (ch === '.' || ch === ' ') continue;
      const c = pal[ch];
      if (c) this.set(ox + x, oy + y, c);
    }
    return this;
  }
  toCanvas(scale = 1) {
    const c = makeCanvas(this.w * scale, this.h * scale);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const col = this.d[y * this.w + x];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
    return c;
  }
  /** contorno exterior: píxeles vacíos con vecino 4-conexo opaco */
  outline(col, { skipBottom = false, diag = false } = {}) {
    const add = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.get(x, y)) continue;
      const n = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      if (diag) n.push([1, 1], [-1, 1], [1, -1], [-1, -1]);
      for (const [dx, dy] of n) {
        if (skipBottom && dy === -1 && y === this.h - 1) continue;
        if (this.get(x + dx, y + dy)) { add.push([x, y]); break; }
      }
    }
    for (const [x, y] of add) this.set(x, y, col);
    return this;
  }
}

function tex(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

// Glifos (1 = relleno)
const GLYPH = {
  q: [
    '.1111.',
    '11..11',
    '11..11',
    '....11',
    '...11.',
    '..11..',
    '..11..',
    '......',
    '..11..',
  ],
  dollar: [
    '...11...',
    '.111111.',
    '11.11.11',
    '11.11...',
    '.11111..',
    '..11111.',
    '...11.11',
    '11.11.11',
    '.111111.',
    '...11...',
  ],
  dollarS: [
    '.1.',
    '111',
    '1..',
    '111',
    '..1',
    '111',
    '.1.',
  ],
};
function stampGlyph(p, g, ox, oy, fill, shadow, outline) {
  const on = (x, y) => y >= 0 && y < g.length && x >= 0 && x < g[0].length && g[y][x] === '1';
  if (outline) {
    for (let y = -1; y <= g.length; y++) for (let x = -1; x <= g[0].length; x++) {
      if (on(x, y)) continue;
      let near = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (on(x + dx, y + dy)) near = true;
      if (near) p.set(ox + x, oy + y, outline);
    }
  }
  if (shadow) for (let y = 0; y < g.length; y++) for (let x = 0; x < g[0].length; x++)
    if (on(x, y) && !on(x + 1, y + 1)) p.set(ox + x + 1, oy + y + 1, shadow);
  for (let y = 0; y < g.length; y++) for (let x = 0; x < g[0].length; x++)
    if (on(x, y)) p.set(ox + x, oy + y, typeof fill === 'function' ? fill(x, y) : fill);
}

// ---------------------------------------------------------------------
//  Paletas de tiles por tema
// ---------------------------------------------------------------------
const TILE_PAL = {
  overworld: {
    ground: { k: '#3a1204', d: '#8e3a0c', m: '#c8682a', l: '#f2a462', h: '#ffd6a0' },
    grass: { k: '#0b3a0d', d: '#1a8a22', m: '#38c83a', l: '#9aee6a', h: '#e2ffb4' },
    topStyle: 'grass',
    brick: { k: '#2e0c04', d: '#963810', m: '#d0662a', l: '#faa86e', h: '#ffd8b0' },
    solid: { k: '#3a1204', d: '#86380e', m: '#c0662a', l: '#eea064', h: '#ffd6a8' },
    used: { k: '#2a0e04', d: '#5e2a0e', m: '#8e4c1c', l: '#bc7a42', h: '#dca070' },
  },
  forest: {
    ground: { k: '#2a1006', d: '#683418', m: '#985a2e', l: '#c88a52', h: '#f0c084' },
    grass: { k: '#1c2806', d: '#4a6a10', m: '#7aa222', l: '#c0d444', h: '#f6f29a' },
    topStyle: 'moss',
    brick: { k: '#320a0c', d: '#86281e', m: '#c04a30', l: '#f08a5e', h: '#ffc0a0' },
    solid: { k: '#2a1006', d: '#6a3a1a', m: '#a0663a', l: '#d49a62', h: '#f8cc98' },
    used: { k: '#200c06', d: '#4e2a14', m: '#7a4a26', l: '#a87a4c', h: '#c89a6c' },
  },
  underground: {
    ground: { k: '#03122a', d: '#0c4a82', m: '#1a7cc0', l: '#5cc0f0', h: '#b4f2ff' },
    grass: { k: '#03122a', d: '#147aa8', m: '#3ab0e0', l: '#8ae4fa', h: '#e4ffff' },
    topStyle: 'rim',
    brick: { k: '#020e28', d: '#0a467e', m: '#1a82c4', l: '#62d0f8', h: '#c0f4ff' },
    solid: { k: '#03122a', d: '#0c4478', m: '#1c74b4', l: '#56b4e8', h: '#ace8ff' },
    used: { k: '#020c1e', d: '#0c2c50', m: '#164878', l: '#2c70a4', h: '#4c94c8' },
  },
  castle: {
    ground: { k: '#121218', d: '#46465a', m: '#76768c', l: '#aeaec0', h: '#e2e2ec' },
    grass: { k: '#121218', d: '#5a5a70', m: '#8c8ca2', l: '#c0c0d0', h: '#f0f0f8' },
    topStyle: 'rim',
    brick: { k: '#101016', d: '#4a4a5c', m: '#7a7a8e', l: '#b2b2c4', h: '#dcdce8' },
    solid: { k: '#121218', d: '#4c4c60', m: '#80809a', l: '#b8b8cc', h: '#e8e8f4' },
    used: { k: '#0c0c10', d: '#30303c', m: '#4c4c5c', l: '#6e6e80', h: '#90909e' },
  },
};
const CASTLE_BRICK = { k: '#17161c', d: '#55525e', m: '#86828e', l: '#bab6c2', h: '#e4e0ea' };
const PIPE = { k: '#0a2c0c', d: '#13781c', m: '#26ac30', l: '#78e45c', w: '#d4ffb4' };
const LAVA = { k: '#6a0800', d: '#c02400', m: '#f45c0c', l: '#ff9a1c', y: '#ffe050', w: '#fffcc8' };
const BRIDGE = { k: '#3a1200', d: '#8a3a08', m: '#c86a1c', l: '#f4a04c', h: '#ffd090', c: '#5c5c6c', C: '#a8a8b8' };

// ---------------------------------------------------------------------
//  Tiles
// ---------------------------------------------------------------------
// Piedras (Voronoi periódico) para el suelo
const STONE_SEEDS = [[3, 3], [12, 2], [8, 9], [1, 12], [14, 12], [6, 15]];
function stoneField() {
  const out = [];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    let d1 = 1e9, d2 = 1e9, id = -1;
    STONE_SEEDS.forEach(([sx, sy], i) => {
      for (let oy = -16; oy <= 16; oy += 16) for (let ox = -16; ox <= 16; ox += 16) {
        const dx = x + 0.5 - (sx + ox + 0.5), dy = (y + 0.5 - (sy + oy + 0.5)) * 1.15;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < d1) { d2 = d1; d1 = d; id = i; } else if (d < d2) d2 = d;
      }
    });
    out.push({ edge: d2 - d1 < 1.25, id });
  }
  return out;
}
const STONES = stoneField();
const isEdge = (x, y) => STONES[(((y % 16) + 16) % 16) * 16 + (((x % 16) + 16) % 16)].edge;

function drawGround(p, pal, oy = 0, moss = null) {
  for (let y = oy; y < 16; y++) for (let x = 0; x < 16; x++) {
    let c;
    if (isEdge(x, y)) c = pal.k;
    else {
      const up = isEdge(x, y - 1), lf = isEdge(x - 1, y);
      const dn = isEdge(x, y + 1), rt = isEdge(x + 1, y);
      if (up && lf) c = pal.h;
      else if (up || lf) c = pal.l;
      else if (dn || rt) c = pal.d;
      else {
        const n = hash(x, y, 7);
        c = n < 0.08 ? pal.d : n > 0.94 ? pal.l : pal.m;
      }
      if (moss && (up || isEdge(x, y - 2) && hash(x, y, 3) > 0.5) && hash(x, 0, 9) > 0.35) c = up ? moss.l : moss.m;
    }
    p.set(x, y, c);
  }
}

function tileGround(T) {
  const p = new Pix(16, 16);
  drawGround(p, T.ground, 0, T.topStyle === 'moss' ? T.grass : null);
  return p;
}
const GRASS_DEPTH = [4, 5, 5, 4, 3, 4, 5, 6, 5, 4, 4, 3, 4, 5, 4, 3];
function tileGroundTop(T) {
  const p = tileGround(T);
  const g = T.grass, gr = T.ground;
  if (T.topStyle === 'rim') {
    for (let x = 0; x < 16; x++) {
      p.set(x, 0, g.h); p.set(x, 1, g.l);
      p.set(x, 2, (x + 1) % 4 === 0 ? g.d : g.m);
      p.set(x, 3, g.d);
      p.set(x, 4, gr.k);
      if (hash(x, 1, 5) > 0.6) p.set(x, 5, gr.k);
    }
    return p;
  }
  for (let x = 0; x < 16; x++) {
    const dep = GRASS_DEPTH[x];
    for (let y = 0; y < dep; y++) {
      let c;
      if (y === 0) c = (x % 3 === 1) ? g.h : g.l;
      else if (y === 1) c = ramp([g.m, g.l], 0.45, x, y);
      else if (y === dep - 1) c = g.d;
      else c = (hash(x, y, 2) > 0.8) ? g.l : g.m;
      p.set(x, y, c);
    }
    p.set(x, dep, g.k);
    if (gr.d && !isEdge(x, dep + 1)) p.set(x, dep + 1, gr.d);
  }
  // pequeñas florecitas / brotes
  if (T.topStyle === 'grass') { p.set(3, 1, '#ffffff'); p.set(11, 2, '#ffe14a'); }
  else { p.set(5, 1, '#ffd24a'); p.set(12, 1, '#ff8a5a'); }
  return p;
}
function tileGrassFace(T) { // cara superior (vista desde arriba)
  const p = new Pix(16, 16), g = T.grass;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const n = hash(x, y, 11);
    p.set(x, y, n > 0.86 ? g.l : n < 0.14 ? g.d : (n > 0.78 ? g.h : g.m));
  }
  return p;
}

function tileBrick(pal, bw = 8, bh = 4) {
  const p = new Pix(16, 16);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const row = Math.floor(y / bh), ry = y % bh;
    const off = (row % 2) * (bw / 2);
    const xx = (x + off) % 16, rx = xx % bw;
    let c;
    if (ry === bh - 1 || rx === bw - 1) c = pal.k;
    else if (ry === 0 && rx === 0) c = pal.h;
    else if (ry === 0 || rx === 0) c = pal.l;
    else if (ry === bh - 2 || rx === bw - 2) c = pal.d;
    else c = hash(x, y, row) > 0.9 ? pal.d : pal.m;
    p.set(x, y, c);
  }
  return p;
}

function blockBase(p, pal, rivets = true) {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    let c;
    if (x === 0 || y === 0 || x === 15 || y === 15) c = pal.k;
    else if (x === 1 && y === 1) c = pal.h || pal.l;
    else if (y === 1 || x === 1) c = pal.l;
    else if (y === 14 || x === 14) c = pal.d;
    else c = pal.m;
    p.set(x, y, c);
  }
  // esquinas redondeadas
  p.set(0, 0, null); p.set(15, 0, null); p.set(0, 15, null); p.set(15, 15, null);
  p.set(0, 0, pal.d); p.set(15, 0, pal.d); p.set(0, 15, pal.d); p.set(15, 15, pal.d);
  if (rivets) for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13]]) {
    p.set(x, y, pal.k); p.set(x + (x < 8 ? 1 : -1), y, pal.d);
  }
}

const Q_FRAMES = [
  { m: '#ffb414', l: '#fff08a', d: '#d26e00', h: '#ffffff', k: '#4a1a00', g: '#fffbe6', s: '#7a3600' },
  { m: '#f29a0c', l: '#ffd25a', d: '#b45600', h: '#fff4c0', k: '#461800', g: '#fff2cc', s: '#6c2e00' },
  { m: '#c87406', l: '#eea83a', d: '#8a3c00', h: '#ffd88a', k: '#3e1400', g: '#ffe6a8', s: '#5a2400' },
  { m: '#f29a0c', l: '#ffd25a', d: '#b45600', h: '#fff4c0', k: '#461800', g: '#fff2cc', s: '#6c2e00' },
];
function tileQuestion(f) {
  const pal = Q_FRAMES[f];
  const p = new Pix(16, 16);
  blockBase(p, pal);
  // destello diagonal que recorre el bloque en f0
  if (f === 0) for (let i = 0; i < 16; i++) { const x = i, y = 12 - i; if (y > 1 && y < 14 && x > 1 && x < 14) p.set(x, y, pal.l); }
  stampGlyph(p, GLYPH.q, 5, 3, pal.g, pal.s);
  return p;
}

const ECO_FRAMES = [
  { gold: ['#c87a00', '#ffb800', '#ffe04a', '#fff6b0'], glint: 2, spark: 0, gl: '#ffffff' },
  { gold: ['#c07000', '#f4a800', '#ffd83a', '#fff09a'], glint: 7, spark: 1, gl: '#f4fff0' },
  { gold: ['#b86800', '#eaa000', '#ffd02e', '#ffe888'], glint: 12, spark: 2, gl: '#eaffea' },
  { gold: ['#c07000', '#f4a800', '#ffd83a', '#fff09a'], glint: 17, spark: 3, gl: '#f4fff0' },
];
const ECO_GREEN = { k: '#032a12', d: '#0e7a2c', m: '#1cb848', l: '#6af07a', h: '#d4ffd4' };
function tileEco(f) {
  const F = ECO_FRAMES[f], G = ECO_GREEN;
  const p = new Pix(16, 16);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    let c;
    const e = Math.min(x, y, 15 - x, 15 - y);
    if (e === 0) c = G.k;
    else if (e === 1) c = (x === 1 || y === 1) ? ((x + y) % 2 ? G.l : G.h) : G.d;
    else if (e === 2) c = (x === 2 || y === 2) ? G.m : G.d;
    else {
      // interior dorado con degradado vertical + destello diagonal
      let v = 1 - (y - 3) / 10 * 0.75;
      const dg = (x + y) - F.glint;
      if (dg >= 0 && dg < 3) v = 1.15;
      c = ramp(F.gold, v * 0.95, x, y);
    }
    p.set(x, y, c);
  }
  p.set(0, 0, G.d); p.set(15, 0, G.d); p.set(0, 15, G.d); p.set(15, 15, G.d);
  // "$" grande con contorno verde oscuro y sombra
  stampGlyph(p, GLYPH.dollar, 4, 3, (x, y) => (y < 2 || x < 2 ? F.gl : (y > 7 ? '#d8ffd0' : '#ffffff')), null, G.k);
  for (let y = 0; y < 10; y++) for (let x = 0; x < 8; x++) if (GLYPH.dollar[y][x] === '1' && (x === 7 || GLYPH.dollar[y][x + 1] !== '1') && y > 0) p.set(4 + x, 3 + y, '#9ef0a0');
  // chispa de 4 puntas que recorre las esquinas
  const SP = [[3, 3], [12, 3], [12, 12], [3, 12]][F.spark];
  const [sx, sy] = SP;
  p.set(sx, sy, '#ffffff'); p.set(sx - 1, sy, '#fff8c0'); p.set(sx + 1, sy, '#fff8c0'); p.set(sx, sy - 1, '#fff8c0'); p.set(sx, sy + 1, '#fff8c0');
  return p;
}

function tileUsed(pal) {
  const p = new Pix(16, 16);
  blockBase(p, pal);
  // marca de golpe sutil
  for (let x = 4; x < 12; x++) p.set(x, 7, pal.d);
  for (let x = 5; x < 11; x++) p.set(x, 8, pal.l);
  return p;
}

function tileSolid(pal) {
  const p = new Pix(16, 16);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    let c;
    if (x === 0 || y === 0 || x === 15 || y === 15) c = pal.k;
    else {
      const t = y - 1, l = x - 1, b = 14 - y, r = 14 - x;
      const m = Math.min(t, l, b, r);
      if (m >= 4) c = (x + y) % 7 === 0 ? pal.l : pal.m;                 // cara central
      else if (m === t) c = t === 0 ? pal.h : pal.l;                       // bisel superior
      else if (m === l) c = (l === 0 ? pal.l : ramp([pal.m, pal.l], 0.55, x, y)); // izquierdo
      else if (m === r) c = r === 0 ? pal.k : pal.d;                       // derecho
      else c = b === 0 ? pal.k : mix(pal.d, pal.k, 0.35);                  // inferior
      if (m === 4 && (t === 4 || l === 4)) c = pal.d;                      // arista interior
    }
    p.set(x, y, c);
  }
  p.set(1, 1, pal.h); p.set(2, 2, pal.h);
  return p;
}

// Tubo: perfil cilíndrico de 32 px (izquierda + derecha)
const PIPE_PROFILE = 'klmmlwwwllmmmmmmmmmmmMdMdddddddk';
function pipeCol(x, y) {
  const ch = PIPE_PROFILE[x];
  if (ch === 'M') return (x + y) % 2 ? PIPE.m : PIPE.d;
  return PIPE[ch];
}
function tilePipe(half, lip) {
  const p = new Pix(16, 16);
  for (let y = 0; y < 16; y++) for (let lx = 0; lx < 16; lx++) {
    const x = lx + (half === 'R' ? 16 : 0);
    let c = pipeCol(x, y);
    if (lip) {
      if (y === 0 || y === 15) c = PIPE.k;
      else if (y === 1 && x > 0 && x < 31) c = mixPipeTop(x);
      else if (y === 14 && x > 0 && x < 31) c = PIPE.d;
    } else {
      // franjas verticales sutiles en el cuerpo
      if (x === 16 && y % 4 === 0) c = PIPE.l;
    }
    p.set(lx, y, c);
  }
  return p;
}
function mixPipeTop(x) { return x < 22 ? PIPE.w : PIPE.l; }

function tileLava(f) {
  const p = new Pix(16, 16), L = LAVA;
  for (let x = 0; x < 16; x++) {
    const wave = 3 + Math.round(1.6 * Math.sin((x + f * 4) / 16 * Math.PI * 2) + 0.6 * Math.sin((x * 2 - f * 4) / 16 * Math.PI * 2));
    for (let y = 0; y < 16; y++) {
      let c;
      if (y < wave - 1) c = L.d;
      else if (y === wave - 1) c = L.y;
      else if (y === wave) c = L.w;
      else if (y === wave + 1) c = L.y;
      else {
        const v = 0.85 - (y - wave) / 16 * 0.7 + 0.15 * Math.sin((x + y * 0.5 + f * 3) * 0.9);
        c = ramp([L.d, L.m, L.l, L.y], v, x, y);
      }
      p.set(x, y, c);
    }
  }
  // burbujas que suben
  const bubbles = [[3, 13], [10, 9], [13, 14], [6, 6]];
  for (const [bx, by0] of bubbles) {
    const by = ((by0 - f * 3) % 16 + 16) % 16;
    if (by < 5) continue;
    p.set(bx, by, L.w); p.set(bx + 1, by, L.y); p.set(bx, by + 1, L.y); p.set(bx + 1, by + 1, L.l);
  }
  return p;
}

function tileBridge() {
  const p = new Pix(16, 16), b = BRIDGE;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    let c;
    if (y <= 3) {
      // cadena superior
      const lx = x % 4;
      if (y === 0 || y === 3) c = (lx === 1 || lx === 2) ? b.c : null;
      else c = (lx === 0 || lx === 3) ? (y === 1 ? b.C : b.c) : null;
      if (y === 1 && lx === 0) c = b.C;
    } else if (y === 4 || y === 15) c = b.k;
    else {
      const bx = x % 8;
      if (bx === 7) c = b.k;
      else if (y === 5) c = b.h;
      else if (bx === 0) c = b.l;
      else if (y === 14 || bx === 6) c = b.d;
      else c = (hash(x, y, 8) > 0.85 || (y === 9 && bx > 1 && bx < 5)) ? b.d : b.m;
      if ((bx === 2 || bx === 4) && (y === 7 || y === 12)) c = b.k; // clavos
    }
    p.set(x, y, c);
  }
  return p;
}

function tileFlagCloth() {
  const p = new Pix(16, 16);
  const W = ['#b8c4d0', '#e4ecf2', '#ffffff'];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const v = 0.55 + 0.45 * Math.sin((x - y * 0.25) / 16 * Math.PI * 4);
    let c = ramp(W, v, x, y);
    if (y === 0) c = '#ffffff';
    if (y === 15 || x === 15) c = '#8a96a6';
    p.set(x, y, c);
  }
  // emblema: moneda verde con "$"
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const dx = x + 0.5 - 8, dy = y + 0.5 - 8, d = Math.sqrt(dx * dx + dy * dy);
    if (d < 5.6) p.set(x, y, d > 4.6 ? '#0a4a1c' : (dx + dy < -2 ? '#3ad05a' : '#1ca23e'));
  }
  stampGlyph(p, GLYPH.dollarS, 7, 5, '#ffffff', '#0a4a1c');
  return p;
}

function tilePole() {
  const p = new Pix(16, 16);
  const prof = 'kdmmlwwlmmmmmddk';
  const P = { k: '#0a2c0c', d: '#167a20', m: '#2cb236', l: '#80e46a', w: '#e0ffd0' };
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, P[prof[x]]);
  return p;
}

function tileCoinFace() {
  const p = new Pix(16, 16);
  const C = { k: '#5a2a00', d: '#c07800', m: '#f8b800', l: '#ffe048', h: '#fffbd0' };
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const dx = x + 0.5 - 8, dy = y + 0.5 - 8, d = Math.sqrt(dx * dx + dy * dy);
    if (d > 7.6) continue;
    let c;
    if (d > 6.7) c = C.k;
    else if (d > 5.6) c = (dx + dy < 0) ? C.l : C.d;
    else c = (dx + dy < -5) ? C.h : (dx + dy < 1 ? C.l : C.m);
    p.set(x, y, c);
  }
  stampGlyph(p, GLYPH.dollarS, 6, 4, C.d, C.l);
  // retoca: "$" hundido = oscuro con luz abajo-derecha
  return p;
}

function tileCastleBrick() { return tileBrick(CASTLE_BRICK, 8, 4); }

const _tileCache = {};
export function getTileTextures(theme = 'overworld') {
  if (!TILE_PAL[theme]) theme = 'overworld';
  if (_tileCache[theme]) return _tileCache[theme];
  const T = TILE_PAL[theme];
  const C = p => tex(p.toCanvas());
  const brick = theme === 'castle' ? tileBrick(T.brick, 8, 4) : tileBrick(T.brick, 8, 4);
  const res = {
    groundTop: C(tileGroundTop(T)),
    ground: C(tileGround(T)),
    grass: C(tileGrassFace(T)),            // extra: cara superior vista desde arriba
    brick: C(brick),
    question: [0, 1, 2, 3].map(f => C(tileQuestion(f))),
    eco: [0, 1, 2, 3].map(f => C(tileEco(f))),
    used: C(tileUsed(T.used)),
    solid: C(tileSolid(T.solid)),
    pipeTopL: C(tilePipe('L', true)),
    pipeTopR: C(tilePipe('R', true)),
    pipeL: C(tilePipe('L', false)),
    pipeR: C(tilePipe('R', false)),
    castleBrick: C(tileCastleBrick()),
    lava: [0, 1, 2, 3].map(f => C(tileLava(f))),
    bridge: C(tileBridge()),
    flagCloth: C(tileFlagCloth()),
    pole: C(tilePole()),
    coinFace: C(tileCoinFace()),
  };
  _tileCache[theme] = res;
  return res;
}

// ---------------------------------------------------------------------
//  Fondos (parallax)
// ---------------------------------------------------------------------
const BG_PAL = {
  overworld: {
    sky: [[0, '#4a86f8'], [0.55, '#6ea4fc'], [1, '#bcdcff']],
    cloud: { ramp: ['#8cb8f0', '#cfe6ff', '#ffffff', '#ffffff'], out: '#1d2c74', L: [-0.4, -0.75, 0.55] },
    hill: { ramp: ['#16802a', '#22a036', '#3cc046', '#7ae064'], out: '#0a3412', spot: '#0e6420', spotHi: '#62d058' },
    bush: { ramp: ['#1c9a2a', '#34bc3c', '#6ae05a', '#b8fa8c'], out: '#0a3412' },
    tree: { ramp: ['#14742a', '#209a34', '#40c044', '#94ea6a'], out: '#0a3012', trunk: ['#4a2408', '#7a4418', '#a86a30'] },
    castle: { ramp: ['#5a6aa6', '#7486c0', '#93a6dc'], out: '#3c4a86', win: '#2a3466', lit: null },
    mount: { ramp: ['#6080c8', '#7a9ae0', '#9cb8f4'], out: '#4c68b0', cap: '#f2f8ff', capD: '#c8d8f4' },
    stars: null,
  },
  forest: {
    sky: [[0, '#2c1e6a'], [0.35, '#8a3a8e'], [0.62, '#ec6a6a'], [0.85, '#ffa848'], [1, '#ffd884']],
    cloud: { ramp: ['#7a3474', '#d05a86', '#ff9a86', '#ffdca0'], out: '#3c1440', L: [0.5, 0.55, 0.65] },
    hill: { ramp: ['#33401a', '#4e5e1e', '#7a7c28', '#c49a3a'], out: '#181e08', spot: '#283212', spotHi: '#a08a30' },
    bush: { ramp: ['#3a5414', '#5a7a1c', '#92a42c', '#e0c048'], out: '#181e08' },
    tree: { ramp: ['#1e3a12', '#2e5a18', '#5a8424', '#d4b040'], out: '#0e1a06', trunk: ['#2a1206', '#5a2e12', '#8a5428'] },
    castle: { ramp: ['#3c2050', '#4e2a64', '#643878'], out: '#24102e', win: '#24102e', lit: '#ffb43c' },
    mount: { ramp: ['#5a2c6c', '#7a3c7e', '#a85a8c'], out: '#3c1a4c', cap: '#ff9a7a', capD: '#d06a7a' },
    stars: { cols: ['#fff2d0', '#ffd0e0'], density: 0.004 },
  },
  underground: {
    sky: [[0, '#000004'], [0.6, '#040c22'], [1, '#0c2244']],
    cloud: { ramp: ['#0a2236', '#10324c', '#1a4664', '#28607e'], out: '#040e18', L: [-0.3, -0.8, 0.5] },
    hill: { ramp: ['#08243c', '#0e3a5e', '#185a88', '#2e86b6'], out: '#020a14', spot: '#4ae6ff', spotHi: '#d4ffff', crystal: true },
    bush: { ramp: ['#24206a', '#3c48b4', '#6a8cec', '#c4e4ff'], out: '#08081e' },
    tree: { ramp: ['#0a5a6a', '#12889a', '#2cc4cc', '#a0fff0'], out: '#021418', trunk: ['#6a6a88', '#a0a0bc', '#d8d8ec'], mushroom: true },
    castle: { ramp: ['#0a1c34', '#10284a', '#183a60'], out: '#040c18', win: '#040c18', lit: '#4ae6ff' },
    mount: { ramp: ['#040e20', '#081a34', '#0e2a4c'], out: '#02060e', cap: '#1e5a84', capD: '#123c5c', spiky: true },
    stars: { cols: ['#4ae6ff', '#7aff9a', '#2a8ab4'], density: 0.006 },
  },
  castle: {
    sky: [[0, '#04040e'], [0.5, '#120c2a'], [0.82, '#2c1230'], [1, '#5a1a1a']],
    cloud: { ramp: ['#221c36', '#342c4c', '#4e4468', '#7c72a0'], out: '#0a0814', L: [-0.5, -0.7, 0.5] },
    hill: { ramp: ['#16101a', '#261c26', '#3c2a30', '#5e3c38'], out: '#060306', spot: '#ff5a10', spotHi: '#ffd040', lava: true },
    bush: { ramp: ['#241414', '#3c1e1a', '#5e2a1e', '#a0482a'], out: '#080404' },
    tree: { ramp: ['#1a1220', '#2a1c30', '#3e2a44', '#5c4060'], out: '#08040a', trunk: ['#140c10', '#2a1a1e', '#44302e'], dead: true },
    castle: { ramp: ['#141020', '#201a30', '#302844'], out: '#06040c', win: '#06040c', lit: '#ff9a2a' },
    mount: { ramp: ['#120a12', '#1c1018', '#281820'], out: '#060306', cap: '#ff5a14', capD: '#a02a0a', volcano: true },
    stars: { cols: ['#ffffff', '#fff2b0', '#b0c8ff'], density: 0.008 },
  },
};

function lightVec(L) { const n = Math.hypot(L[0], L[1], L[2]); return [L[0] / n, L[1] / n, L[2] / n]; }

/** Formas de elipses sombreadas como esferas con dithering + contorno */
function blobArt(w, h, ells, { ramp: R, out, L = [-0.4, -0.75, 0.55], bottomOpen = false, speck = 0, bias = 0 }) {
  const p = new Pix(w, h);
  const Lv = lightVec(L);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let best = null, bd = 1;
    for (const e of ells) {
      const nx = (x + 0.5 - e[0]) / e[2], ny = (y + 0.5 - e[1]) / e[3];
      const d = nx * nx + ny * ny;
      if (d < bd) { bd = d; best = [nx, ny, Math.sqrt(Math.max(0, 1 - d))]; }
    }
    if (!best) continue;
    let v = best[0] * Lv[0] + best[1] * Lv[1] + best[2] * Lv[2];
    v = clamp((v + 0.35) / 1.25 + bias, 0, 1);
    if (speck && hash(x, y, 21) < speck) v -= 0.3;
    p.set(x, y, ramp(R, v, x, y));
  }
  if (out) p.outline(out, { skipBottom: bottomOpen });
  if (bottomOpen && out) { // el fondo abierto: borrar contorno en la fila inferior
    for (let x = 0; x < w; x++) if (p.get(x, h - 1) === out && p.get(x, h - 2) && p.get(x, h - 2) !== out) p.set(x, h - 1, R[0]);
  }
  return p;
}

function bgCloud(P) {
  const c = P.cloud;
  return blobArt(48, 24, [[12, 15, 9, 7], [24, 11, 11, 9.5], [36, 14.5, 9.5, 7.5], [18, 18, 10, 4.5], [31, 18, 10, 4.5]], { ramp: c.ramp, out: c.out, L: c.L });
}

function hillSpots(p, P, spots) {
  const H = P.hill;
  for (const [sx, sy, big] of spots) {
    if (H.crystal) { // cristales
      const hh = big ? 6 : 4;
      for (let i = 0; i < hh; i++) for (let j = -1; j <= 1; j++) {
        const wdt = Math.max(0, Math.floor((hh - i) / 2));
        if (Math.abs(j) > wdt) continue;
        p.set(sx + j, sy - i, j < 0 ? H.spotHi : H.spot);
      }
      p.set(sx, sy - hh, H.spotHi);
      continue;
    }
    if (H.lava) { // grietas de lava
      let x = sx, y = sy;
      for (let i = 0; i < (big ? 7 : 4); i++) { p.set(x, y, i % 2 ? H.spot : H.spotHi); y++; x += (hash(i, sx, 3) > 0.5 ? 1 : -1); }
      continue;
    }
    const rx = big ? 2 : 1.5, ry = big ? 3.5 : 2.5;
    for (let y = -4; y <= 4; y++) for (let x = -3; x <= 3; x++) {
      const d = (x / (rx + 0.6)) ** 2 + (y / (ry + 0.6)) ** 2;
      const d2 = (x / rx) ** 2 + (y / ry) ** 2;
      if (d2 <= 1) p.set(sx + x, sy + y, (x === -1 && y === -1) ? H.spotHi : H.spot);
      else if (d <= 1) p.set(sx + x, sy + y, H.out);
    }
  }
}
function bgHillBig(P) {
  const H = P.hill;
  const p = blobArt(80, 40, [[40, 42, 38, 40]], { ramp: H.ramp, out: H.out, bottomOpen: true });
  hillSpots(p, P, [[32, 18, 1], [48, 14, 0], [54, 27, 1], [24, 30, 0], [40, 31, 0]]);
  return p;
}
function bgHillSmall(P) {
  const H = P.hill;
  const p = blobArt(48, 24, [[24, 25, 22.5, 23.5]], { ramp: H.ramp, out: H.out, bottomOpen: true });
  hillSpots(p, P, [[20, 12, 0], [30, 16, 0]]);
  return p;
}
function bgBush(P) {
  const B = P.bush;
  return blobArt(48, 16, [[10, 13, 9, 9], [24, 10, 11, 10], [38, 13, 9, 9]], { ramp: B.ramp, out: B.out, bottomOpen: true, L: P.cloud.L });
}

function bgTree(P) {
  const T = P.tree;
  const w = 32, h = 48;
  let p;
  if (T.mushroom) {
    p = new Pix(w, h);
    // tallo
    for (let y = 18; y < h; y++) for (let x = 12; x <= 19; x++) {
      const t = (x - 12) / 7; p.set(x, y, ramp(T.trunk, 1 - Math.abs(t - 0.3) * 1.3, x, y));
    }
    const cap = blobArt(w, h, [[16, 18, 15, 12]], { ramp: T.ramp, out: null, L: [-0.4, -0.8, 0.45] });
    for (let y = 0; y < 19; y++) for (let x = 0; x < w; x++) { const c = cap.get(x, y); if (c) p.set(x, y, c); }
    for (let x = 2; x < 30; x++) if (p.get(x, 18)) p.set(x, 18, T.ramp[0]);
    for (const [sx, sy] of [[9, 10], [17, 7], [23, 12], [13, 14]]) { p.set(sx, sy, '#e8fff8'); p.set(sx + 1, sy, '#a0fff0'); p.set(sx, sy + 1, '#a0fff0'); }
    p.outline(T.out, { skipBottom: true });
    return p;
  }
  p = new Pix(w, h);
  // tronco
  for (let y = 26; y < h; y++) for (let x = 13; x <= 18; x++) {
    const t = (x - 13) / 5;
    let c = ramp(T.trunk, 1 - t * 0.9, x, y);
    if (x === 15 && y % 5 === 2) c = T.trunk[0];
    p.set(x, y, c);
  }
  if (T.dead) { // ramas secas
    const br = [[16, 26, -1, -1, 9], [16, 30, 1, -1, 8], [14, 22, -1, -1, 5], [17, 20, 1, -1, 6], [16, 18, 0, -1, 8]];
    for (let y = 10; y < 27; y++) for (let x = 15; x <= 16; x++) p.set(x, y, T.trunk[1]);
    for (const [x0, y0, dx, dy, n] of br) { let x = x0, y = y0; for (let i = 0; i < n; i++) { p.set(x, y, T.trunk[i % 2 ? 1 : 2]); x += dx; if (i % 2) y += dy; } }
    p.outline(T.out, { skipBottom: true });
    return p;
  }
  const can = blobArt(w, h, [[16, 15, 13, 12], [8, 22, 7.5, 7], [24, 22, 7.5, 7], [16, 7, 9, 7]], { ramp: T.ramp, out: null, speck: 0.07, L: P.cloud.L[1] > 0 ? [0.5, -0.4, 0.6] : [-0.4, -0.75, 0.55] });
  for (let i = 0; i < w * h; i++) if (can.d[i]) p.d[i] = can.d[i];
  p.outline(T.out, { skipBottom: true });
  return p;
}

function bgCastle(P) {
  const C = P.castle, w = 64, h = 64;
  const p = new Pix(w, h);
  const parts = [[4, 18, 16, 63], [47, 18, 59, 63], [10, 30, 53, 63], [23, 8, 40, 63]];
  const inPart = (x, y) => parts.some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!inPart(x, y)) continue;
    const row = Math.floor(y / 4), off = (row % 2) * 4;
    let c = C.ramp[1];
    if (y % 4 === 3 || (x + off) % 8 === 7) c = C.ramp[0];
    else if (y % 4 === 0) c = C.ramp[2];
    p.set(x, y, c);
  }
  // almenas
  for (const [x0, y0, x1] of [[4, 18, 16], [47, 18, 59], [10, 30, 53], [23, 8, 40]]) {
    for (let x = x0; x <= x1; x++) if (((x - x0) >> 1) % 2 === 0) { p.set(x, y0 - 1, C.ramp[2]); p.set(x, y0 - 2, C.ramp[2]); p.set(x, y0 - 3, C.ramp[1]); }
  }
  // ventanas y puerta
  const win = (x, y, lit) => {
    const col = lit || C.win;
    for (let j = 0; j < 4; j++) for (let i = 0; i < 2; i++) p.set(x + i, y + j, col);
    if (lit) { p.set(x, y, mix(lit, '#ffffff', 0.4)); }
  };
  win(9, 26, C.lit); win(52, 26, C.lit); win(31, 16, C.lit); win(27, 24, null); win(35, 24, C.lit);
  win(18, 40, null); win(44, 40, C.lit);
  for (let y = 50; y < 64; y++) for (let x = 28; x <= 35; x++) {
    const dx = x + 0.5 - 32, dy = y - 54;
    if (dy >= 0 || dx * dx + dy * dy * 2 < 18) p.set(x, y, C.win);
  }
  // bandera en la torre central
  for (let y = 0; y < 6; y++) p.set(31, y, C.ramp[0]);
  for (let y = 0; y < 3; y++) for (let x = 32; x < 32 + 4 - y; x++) p.set(x, y, C.lit || '#e83030');
  p.outline(C.out, { skipBottom: true });
  return p;
}

function bgMountains(P) {
  const M = P.mount, w = 128, h = 48;
  const p = new Pix(w, h);
  const peaks = M.spiky
    ? [[6, 40, 3], [18, 30, 2.2], [27, 44, 3.4], [40, 26, 2.4], [52, 38, 3], [64, 22, 2], [76, 40, 3.2], [90, 30, 2.4], [103, 42, 3], [116, 28, 2.2]]
    : [[12, 34, 1.15], [44, 24, 1.0], [74, 42, 1.25], [104, 30, 1.1]];
  const H = new Array(w).fill(0);
  for (let x = 0; x < w; x++) {
    let m = 0;
    for (const [px, ph, sl] of peaks) {
      let dx = Math.abs(x - px); dx = Math.min(dx, w - dx);
      m = Math.max(m, ph - dx * sl);
    }
    m += (hash(x, 0, 31) - 0.5) * 1.6;
    if (M.volcano) m = Math.min(m, 36);
    H[x] = Math.round(clamp(m, 4, h - 1));
  }
  const lit = new Array(w).fill(false);
  for (let x = 0; x < w; x++) {
    let best = -1e9, side = false;
    for (const [px, ph, sl] of peaks) {
      let dx = x - px; if (dx > w / 2) dx -= w; if (dx < -w / 2) dx += w;
      const v = ph - Math.abs(dx) * sl;
      if (v > best) { best = v; side = dx < 0; }
    }
    lit[x] = side;
  }
  for (let x = 0; x < w; x++) {
    const top = h - H[x];
    for (let y = top; y < h; y++) {
      const depth = y - top;
      const base = lit[x] ? 2 : 1, fade = (y - h * 0.7) / (h * 0.3);
      let c = M.ramp[base];
      if (fade > 0 && bayer(x, y) < fade) c = M.ramp[base - 1];
      if (M.volcano && H[x] >= 35 && depth < 2) c = depth === 0 ? M.cap : M.capD;
      else if (M.volcano && depth === 0) c = mix(M.ramp[2], M.cap, 0.35);
      else if (!M.volcano && !M.spiky && H[x] > 25 && y < h - 26 - (hash(x, 3, 5) > 0.5 ? 1 : 0) - (lit[x] ? 0 : 2)) c = lit[x] ? M.cap : M.capD;
      else if (M.spiky && depth < 2 && H[x] > 28) c = M.cap;
      else if (depth === 0 && lit[x]) c = mix(M.ramp[2], '#ffffff', 0.25);
      p.set(x, y, c);
    }
    p.set(x, top - 1, M.out);
  }
  return p;
}

function bgStars(P) {
  const S = P.stars; if (!S) return null;
  const w = 128, h = 128, p = new Pix(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const n = hash(x, y, 77);
    if (n < S.density) {
      const col = S.cols[Math.floor(hash(x, y, 78) * S.cols.length)];
      p.set(x, y, col);
      if (n < S.density * 0.15) { // estrella cruzada
        const dim = mix(col, '#000000', 0.45);
        p.set(x - 1, y, dim); p.set(x + 1, y, dim); p.set(x, y - 1, dim); p.set(x, y + 1, dim);
      }
    }
  }
  return p;
}

function bgSun(theme) {
  const p = new Pix(32, 32);
  const cols = theme === 'castle' ? ['#b8b8d0', '#dcdcf0', '#f8f8ff'] : ['#ff8a2a', '#ffc24a', '#fff2a0'];
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const dx = x + 0.5 - 16, dy = y + 0.5 - 16, d = Math.hypot(dx, dy);
    if (d > 14) continue;
    if (theme === 'castle') { // luna creciente con cráteres
      const d2 = Math.hypot(dx - 6, dy + 4);
      if (d2 < 11.5) continue;
      p.set(x, y, ramp(cols, 1 - d / 16 + (dx < 0 ? 0.2 : 0), x, y));
    } else p.set(x, y, ramp(cols, 1.05 - d / 14, x, y));
  }
  return p;
}

function skyCanvas(stops) {
  const c = makeCanvas(2, 256);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  for (const [t, col] of stops) g.addColorStop(t, col);
  ctx.fillStyle = g; ctx.fillRect(0, 0, 2, 256);
  return c;
}

const _bgCache = {};
export function getBackdropTextures(theme = 'overworld') {
  if (!BG_PAL[theme]) theme = 'overworld';
  if (_bgCache[theme]) return _bgCache[theme];
  const P = BG_PAL[theme];
  const C = p => (p ? tex(p.toCanvas()) : null);
  const res = {
    sky: tex(skyCanvas(P.sky)),
    cloud: C(bgCloud(P)),
    hillBig: C(bgHillBig(P)),
    hillSmall: C(bgHillSmall(P)),
    bush: C(bgBush(P)),
    tree: C(bgTree(P)),
    castleBack: C(bgCastle(P)),
    mountains: C(bgMountains(P)),
    stars: C(bgStars(P)),
    sun: (theme === 'forest' || theme === 'castle') ? C(bgSun(theme)) : null, // sol (forest) / luna (castle)
    skyColors: P.sky.map(s => s[1]),       // por si el motor quiere niebla/fondo del color del cielo
  };
  // mountains se repite horizontalmente
  if (res.mountains) { res.mountains.wrapS = THREE.RepeatWrapping; }
  if (res.stars) { res.stars.wrapS = THREE.RepeatWrapping; res.stars.wrapT = THREE.RepeatWrapping; }
  _bgCache[theme] = res;
  return res;
}

// =====================================================================
//  SPRITES (mapas de píxeles) — miran a la derecha. '.' = transparente
// =====================================================================

// --- Editor de grilla de caracteres (para sprites dibujados por código)
class CG {
  constructor(w, h) { this.w = w; this.h = h; this.a = Array.from({ length: h }, () => Array(w).fill('.')); }
  get(x, y) { return (x < 0 || y < 0 || x >= this.w || y >= this.h) ? '.' : this.a[y][x]; }
  set(x, y, c) { if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.a[y][x] = c; return this; }
  ellipse(cx, cy, rx, ry, c, test) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
      if (nx * nx + ny * ny <= 1 && (!test || test(x, y))) this.set(x, y, c);
    }
    return this;
  }
  rect(x0, y0, x1, y1, c) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, c); return this; }
  tri(pts, c) {
    const [[ax, ay], [bx, by], [cx, cy]] = pts;
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const px = x + 0.5, py = y + 0.5;
      const w0 = ((bx - px) * (cy - py) - (by - py) * (cx - px)) / area;
      const w1 = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 >= -0.02 && w1 >= -0.02 && w2 >= -0.02) this.set(x, y, c);
    }
    return this;
  }
  stamp(rows, ox, oy) { rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '.') this.set(ox + x, oy + y, ch); })); return this; }
  replace(from, to) { for (const r of this.a) for (let i = 0; i < r.length; i++) if (r[i] === from) r[i] = to; return this; }
  /** sombreado automático: borde inferior/derecho → dark; superior/izquierdo → light */
  shade(base, dark, light, { dx = 1, dy = 1 } = {}) {
    const fam = new Set([base, dark, light]);
    const src = this.a.map(r => r.slice());
    const g = (x, y) => (x < 0 || y < 0 || x >= this.w || y >= this.h) ? '.' : src[y][x];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (src[y][x] !== base) continue;
      if (dark && (!fam.has(g(x, y + dy)) || !fam.has(g(x + dx, y)))) this.a[y][x] = dark;
      else if (light && (!fam.has(g(x, y - 1)) || !fam.has(g(x - 1, y)))) this.a[y][x] = light;
    }
    return this;
  }
  outline(c = 'k', diag = false) {
    const add = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.a[y][x] !== '.') continue;
      const n = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      if (diag) n.push([1, 1], [-1, 1], [1, -1], [-1, -1]);
      if (n.some(([dx, dy]) => { const v = this.get(x + dx, y + dy); return v !== '.' && v !== c; })) add.push([x, y]);
    }
    for (const [x, y] of add) this.a[y][x] = c;
    return this;
  }
  rows() { return this.a.map(r => r.join('')); }
}
const flipRows = rows => rows.map(r => [...r].reverse().join(''));
const subst = (rows, map) => rows.map(r => [...r].map(ch => map[ch] || ch).join(''));
function rotRows(rows) { // 90° horario (cuadrado)
  const h = rows.length, w = rows[0].length, out = [];
  for (let x = 0; x < w; x++) { let s = ''; for (let y = h - 1; y >= 0; y--) s += rows[y][x]; out.push(s); }
  return out;
}

// ---------------------------------------------------------------------
//  Héroe: "Tito Tubería" — fontanero original con gorra emblema-moneda
// ---------------------------------------------------------------------
const HERO_PAL = {
  k: '#2a1206', // contorno
  R: '#e8301c', r: '#a8160c', q: '#ff8a6a', // rojo gorra/camisa
  E: '#ffffff', Y: '#ffd21e', y: '#c88a00', // emblema moneda + botones
  S: '#ffc68c', s: '#de8a58',             // piel
  H: '#5c2a0a', M: '#3a1806', e: '#141430', // pelo, bigote, ojo
  W: '#ffffff', w: '#c4cce4',             // guantes
  B: '#2c5cf0', b: '#1a32a8', c: '#7aa2ff', // overol
  O: '#8a4414', o: '#4c2208',             // zapatos
};
const HERO_FIRE_PAL = Object.assign({}, HERO_PAL, {
  R: '#fff6ee', r: '#d2c4bc', q: '#ffffff', E: '#e8301c',
  B: '#e8301c', b: '#a8160c', c: '#ff8a6a',
  O: '#6a2a0a', o: '#3a1404',
});

const HS_HEAD = [
  '....kkkkkk......',
  '...kRRqqEEkk....',
  '..kRqRRREYERRk..',
  '..krrrrrrRRRRRRk',
  '..kHHHSSeSkkkkk.',
  '.kHSHSSSeSSSSk..',
  '.kHSHHSSSSSSSSSk',
  '.kHHSSSSSMMMMMk.',
  '...kkSSSSSSkk...',
];
const HERO_SMALL = {
  idle: [...HS_HEAD,
    '...kRRBRRRBRk...',
    '..kRRRBBBBBRRk..',
    '.kWWRBYBBBYBRWWk',
    '.kWWBBBBBBBBBWWk',
    '..kkBBBkkkBBBkk.',
    '..kOOOk...kOOOk.',
    '.kooook...kooook'],
  walk1: [...HS_HEAD,
    '...kRRBRRRBk....',
    '..kRRRBBBBBRk...',
    '.kWWRRBYBBYBWWk.',
    '.kWWkBBBBBBBkk..',
    '.kkBBBBk.kBBBBk.',
    'kOOOOkk...kkOOOk',
    'kooook....kooook'],
  walk2: [...HS_HEAD,
    '...kRRBRRRBk....',
    '..kRRRRBBBBk....',
    '..kRRRBYBBYBk...',
    '..kWWBBBBBBBk...',
    '...kWWBBBBBk....',
    '....kOOOOOOk....',
    '...kooooooook...'],
  walk3: [...HS_HEAD,
    '...kRRBRRRBk....',
    '..kRRRBBBBBRk...',
    '.kRRRBYBBYBWWk..',
    'kWWkBBBBBBBWWk..',
    'kWWkBBBkBBBBk...',
    '.kkOOOk.kOOOOk..',
    '..kooook.kooook.'],
  jump: [...HS_HEAD.slice(0, 8),
    '...kkSSSSSSkkWWk',
    '..kRRRBRRRBRRWWk',
    '.kRRRRBBBBBRRkk.',
    'kWWRRBYBBYBBk...',
    'kWWkBBBBBBBBBkk.',
    '.kkBBBBBkBBBBOOk',
    '.kOOOBBk..kkkOOk',
    'kooook..........'],
  skid: [...HS_HEAD,
    '.kWWkRBRRRBRk...',
    '.kWWRRBBBBBRRk..',
    '..kkRBYBBYBRWWk.',
    '..kBBBBBBBBkWWk.',
    '.kBBBBkBBBBBkk..',
    'kOOOk...kOOOOk..',
    'kooook..kooooook'],
  die: [
    '.kk.kkkkkkkk.kk.',
    'kWWkRRRRRRRRkWWk',
    'kWWkRRRREEERkWWk',
    '.kRkRRREYYERkRk.',
    '.kRkrrrrrrrrkRk.',
    '.kRkHSSSSSSHkRk.',
    '.kRkSWeSSeWSkRk.',
    '..kSSWeSSeWSSk..',
    '..kSSSSSSSSSSk..',
    '..kSSMMMMMMSSk..',
    '...kSMkkkkMSk...',
    '....kkRBBRkk....',
    '...kRRBYYBRRk...',
    '...kBBBBBBBBk...',
    '..kOOOk..kOOOk..',
    '..kooook.kooook.'],
};

const HB_HEAD = [
  '.....kkkkkk.....',
  '....kRRqqEEEk...',
  '...kRqRRREYERk..',
  '...kRRRRREEERRk.',
  '..krrrrrrRRRRRRk',
  '..kHHHSSSeSkkkk.',
  '.kHHSHSSSeSSSk..',
  '.kHSSHSSSSSSSSk.',
  '.kHSSHHSSSSSSSSk',
  '.kHHSSSSSSMMMMMk',
  '..kHSSSSSSSMMMk.',
  '...kkSSSSSSSSk..',
  '.....kkSSSkk....',
];
const HERO_BIG = {
  idle: [...HB_HEAD,
    '...kRRRBRRBRRk..',
    '..kRRRRBRRBRRRk.',
    '.kRRRRRBBBBRRRRk',
    '.kRRRRBYBBYBRRRk',
    'kRRkBBBBBBBBkRRk',
    'kRRkBBBBBBBBkRRk',
    'kWWkBBBBBBBBkWWk',
    'kWWkBBBBBBBBkWWk',
    '.kkBBBBBBBBBBkk.',
    '..kBBBBBBBBBBk..',
    '..kBBBBkkBBBBk..',
    '..kBBBk..kBBBk..',
    '..kBBBk..kBBBk..',
    '..kBBBk..kBBBk..',
    '.kOOOk...kOOOk..',
    'kOOOOOk.kOOOOOk.',
    'kOOOOOOkkOOOOOOk',
    'kooooookkooooook',
    '.kkkkkk..kkkkkk.'],
  walk1: [...HB_HEAD,
    '...kRRRBRRBRRk..',
    '..kRRRRBRRBRRk..',
    '.kRRRRRBBBBRRk..',
    '.kRRRRBYBBYBWWk.',
    '.kWWkBBBBBBBWWk.',
    '.kWWkBBBBBBBkk..',
    '..kkBBBBBBBBk...',
    '..kBBBBBBBBBBk..',
    '.kBBBBBkkBBBBBk.',
    '.kBBBBk..kBBBBk.',
    'kBBBBk....kBBBBk',
    'kBBBk......kBBBk',
    'kBBBk......kBBBk',
    'kOOOk.....kOOOOk',
    'kOOOOk....kOOOOk',
    'kOOOOOk..kOOOOOk',
    'kooooook.koooook',
    '.kkkkkk..kkkkkk.'],
  walk2: [...HB_HEAD,
    '...kRRRBRRBRk...',
    '...kRRRBRRBRk...',
    '..kRRRRBBBBRk...',
    '..kRRRBYBBYBk...',
    '..kRRRBBBBBBk...',
    '..kWWWBBBBBBk...',
    '..kWWWBBBBBBk...',
    '...kkBBBBBBBk...',
    '...kBBBBBBBk....',
    '...kBBBBBBBk....',
    '....kBBBBBk.....',
    '....kBBBBBk.....',
    '....kBBBBBk.....',
    '...kOOOOOOk.....',
    '..kOOOOOOOOk....',
    '..kOOOOOOOOOk...',
    '..kooooooooook..',
    '...kkkkkkkkkk...'],
  walk3: [...HB_HEAD,
    '...kRRRBRRBRRk..',
    '..kRRRRBRRBRRRk.',
    '..kRRRRBBBBRRRRk',
    '.kWWRRBYBBYBRRRk',
    '.kWWkBBBBBBBkRRk',
    '..kkBBBBBBBBkWWk',
    '...kBBBBBBBBkWWk',
    '...kBBBBBBBBBkk.',
    '..kBBBBBkBBBBk..',
    '..kBBBBk.kBBBBk.',
    '.kBBBBk...kBBBk.',
    '.kOOOk....kBBBk.',
    'kOOOOk....kBBBk.',
    'koooOk...kOOOOk.',
    '.kkkk...kOOOOOk.',
    '........kooooook',
    '.........kkkkkk.'],
  jump: [
    '.....kkkkkk.....',
    '....kRRqqEEEk...',
    '...kRqRRREYERk..',
    '...kRRRRREEERRk.',
    '..krrrrrrRRRRRRk',
    '..kHHHSSSeSkkkk.',
    '.kHHSHSSSeSSSk..',
    '.kHSSHSSSSSSSSk.',
    '.kHSSHHSSSSSSSSk',
    '.kHHSSSSSSMMMMMk',
    '..kHSSSSSSSMMMk.',
    '...kkSSSSSSSSkkk',
    '.....kkSSSkkkWWk',
    '...kRRRBRRBRRWWk',
    '..kRRRRBRRBRRkk.',
    '.kRRRRRBBBBRk...',
    'kWWRRRBYBBYBk...',
    'kWWWkBBBBBBBBk..',
    '.kkkBBBBBBBBBBk.',
    '...kBBBBBBBBBBBk',
    '..kBBBBBBkkBBBBk',
    '.kBBBBBBk.kBBBBk',
    'kBBBBBk...kOOOOk',
    'kBBBBk....kOOOOk',
    'kOOOk.....kooook',
    'kOOOOk.....kkkk.',
    'koooook.........',
    '.kkkkk..........'],
  skid: [...HB_HEAD,
    '..kWWkRBRRBRk...',
    '.kWWWkRBRRBRRk..',
    '.kWWkRRBBBBRRRk.',
    '..kkRRBYBBYBRRRk',
    '...kBBBBBBBBkRRk',
    '...kBBBBBBBBkWWk',
    '...kBBBBBBBBkWWk',
    '..kBBBBBBBBBBkk.',
    '.kBBBBBkkBBBBk..',
    'kBBBBBk..kBBBBk.',
    'kBBBBk....kBBBk.',
    'kBBBk.....kBBBk.',
    'kOOOOk....kOOOOk',
    'kOOOOOk..kOOOOOk',
    'koooook..koooook',
    '.kkkkk....kkkkk.'],
  crouch: [...HB_HEAD,
    '..kRRRBRRBRRk...',
    '.kRRRRBBBBRRRk..',
    'kWWRRBYBBYBRWWk.',
    'kWWkBBBBBBBkWWk.',
    '.kOOOOBBBBOOOOk.',
    'kooooooOOooooook',
    '.kkkkkkkkkkkkkk.'],
  die: [
    '.....kkkkkk.....',
    '....kRRRRRRk....',
    '...kRRRRRRRRk...',
    '..kRRRREERRRRk..',
    '..kRRREYYERRRk..',
    '..kRRRREERRRRk..',
    '.kkrrrrrrrrrrkk.',
    '.kHHSSSSSSSSHHk.',
    'kHSSWWeSSeWWSSHk',
    'kHSSWWeSSeWWSSHk',
    '.kSSSSSSSSSSSSk.',
    '.kSSMMMMMMMMSSk.',
    '..kSMMkkkkMMSk..',
    '...kSSkRRkSSk...',
    'kk..kkSSSSkk..kk',
    'kWk.kRRBBRRk.kWk',
    'kWWkRRRBBRRRkWWk',
    '.kRRRRRBBRRRRRk.',
    '..kRRRBYYBRRRk..',
    '...kRBBBBBBRk...',
    '...kBBBBBBBBk...',
    '...kBYBBBBYBk...',
    '...kBBBBBBBBk...',
    '...kBBBkkBBBk...',
    '...kBBBk.kBBBk..',
    '...kBBBk.kBBBk..',
    '..kOOOOk.kOOOOk.',
    '.kOOOOOk.kOOOOOk',
    '.kooooook.kooook',
    '.kkkkkkk..kkkkkk'],
};
// rellenar hasta 32 filas, pies abajo
function padTop(rows, h) { const w = rows[0].length; const out = rows.slice(); while (out.length < h) out.unshift('.'.repeat(w)); return out.slice(out.length - h); }
for (const k of Object.keys(HERO_BIG)) HERO_BIG[k] = padTop(HERO_BIG[k], 32);

// ---------------------------------------------------------------------
//  Gastón Gasto (hongo malo enojado)
// ---------------------------------------------------------------------
const GOOMBA_PAL = {
  k: '#240c02', D: '#6e2c0c', M: '#b0561e', L: '#e48a44', T: '#f8d0a0', t: '#d49a68',
  W: '#ffffff', e: '#1a0a04', F: '#3a1606', f: '#6a3416', G: '#ffd21e',
};
const GOOMBA_HEAD = [
  '......kkkk......',
  '....kkLLMMkk....',
  '...kLLMMMMMMk...',
  '..kLMMMMMMMMMk..',
  '.kLMkkMMMMkkMMk.',
  '.kMMMkkMMkkMMMk.',
  'kMMMWWkMMkWWMMMk',
  'kMMMWeWMMWeWMMMk',
  'kMMMWeWTTWeWMMMk',
  'kDMMMWTTTTWMMMDk',
  '.kDDTkkkkkkTDDk.',
  '..kkTWTTTTWTkk..',
];
const GOOMBA = {
  walk1: [...GOOMBA_HEAD,
    '...kTTTTTTTk....',
    '..kFFFkTTTkk....',
    '.kFFFFFkkFFFk...',
    '.kffffk.kfffk...'],
  walk2: [...GOOMBA_HEAD,
    '....kTTTTTTTk...',
    '....kkTTTkFFFk..',
    '...kFFFkkFFFFFk.',
    '...kfffk.kffffk.'],
  flat: [
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '....kkkkkkkk....',
    '..kkLLMMMMMMkk..',
    '.kLMkkMMMMkkMMk.',
    'kMMMWekMMkeWMMMk',
    'kDMMMMTTTTMMMMDk',
    '.kkTTkkkkkkTTkk.',
    '.kFFFkkkkkkFFFk.',
    'kffffk....kffffk'],
};

// ---------------------------------------------------------------------
//  Koopa Crédito (tortuga con tarjeta en el caparazón)
// ---------------------------------------------------------------------
const KOOPA_PAL = {
  k: '#14200a', G: '#2eb432', g: '#17781e', h: '#9af27a',
  C: '#fff2c4', c: '#d8b878', Y: '#f8d84a', y: '#c4961e', u: '#fff4a0',
  W: '#ffffff', e: '#101010', O: '#f08a24', o: '#b04e10',
  T: '#ffffff', t: '#3a7ae0', s: '#ffd21e',  // tarjeta de crédito
  w: '#ffffff', x: '#c8d4ec',               // alas
};
function koopaFrame(step) {
  const g = new CG(16, 24);
  // cabeza (mirando a la derecha)
  g.ellipse(11.5, 4.5, 3.6, 3.8, 'Y');
  g.rect(12, 6, 15, 8, 'Y');              // hocico
  g.ellipse(9.5, 9.5, 2, 3, 'Y');         // cuello
  // caparazón
  g.ellipse(7, 14.5, 6.6, 6.2, 'G', (x, y) => y <= 18);
  g.rect(1, 18, 12, 19, 'C');              // borde crema
  // panza
  g.ellipse(11.5, 15.5, 2.6, 4.2, 'C', (x, y) => x >= 10 && y <= 19);
  // brazo
  g.rect(12, 13, 13, 14, 'Y');
  // piernas/pies
  const legs = step === 0
    ? [[4, 20, 6, 21], [10, 20, 12, 21]]
    : [[6, 20, 8, 21], [9, 20, 11, 21]];
  for (const [x0, y0, x1, y1] of legs) g.rect(x0, y0, x1, y1, 'Y');
  const feet = step === 0 ? [[3, 22, 7, 22], [10, 22, 14, 22]] : [[5, 22, 9, 22], [9, 22, 13, 22]];
  for (const [x0, y0, x1] of feet) g.rect(x0, y0, x1, y0, 'O');
  g.shade('G', 'g', 'h');
  g.shade('Y', 'y', 'u');
  g.shade('C', 'c', null);
  g.shade('O', 'o', null);
  // patrón hexagonal del caparazón
  for (const [x, y] of [[4, 12], [8, 11], [3, 16], [7, 16]]) g.set(x, y, 'g');
  // tarjeta de crédito en el caparazón
  g.stamp(['TTTT', 'tttt', 'TsTT'], 5, 13);
  // ojo
  g.set(12, 3, 'W'); g.set(13, 3, 'W'); g.set(12, 4, 'W'); g.set(13, 4, 'e'); g.set(13, 2, 'k');
  g.set(15, 8, 'k'); g.set(14, 7, 'y'); // boca
  g.outline('k');
  return g.rows();
}
function koopaWingFrame(step) {
  const rows = koopaFrame(step);
  const g = new CG(16, 24); g.stamp(rows, 0, 0);
  const wingUp = [
    '...k...',
    '..kwk..',
    '.kwwk..',
    'kwwxk..',
    'kwxwwk.',
    'kxwwwk.',
    '.kxwwk.',
    '..kkk..',
  ];
  const wingDn = [
    '.......',
    '.......',
    '.......',
    '.kkkk..',
    'kwwwwk.',
    'kxwwwwk',
    '.kxxwwk',
    '..kkkk.',
  ];
  const W = step === 0 ? wingUp : wingDn;
  // ala detrás/encima del caparazón (lado izquierdo)
  for (let y = 0; y < W.length; y++) for (let x = 0; x < W[0].length; x++) {
    const ch = W[y][x]; if (ch === '.') continue;
    g.set(x + 1, y + 3, ch);
  }
  // contorno de ala
  const tmp = new CG(16, 24); tmp.stamp(W.map(r => r.replace(/k/g, '.')), 1, 3); tmp.outline('k');
  for (let y = 0; y < 24; y++) for (let x = 0; x < 16; x++) if (tmp.get(x, y) === 'k' && g.get(x, y) === '.') g.set(x, y, 'k');
  return g.rows();
}
function koopaShell() {
  const g = new CG(16, 16);
  g.ellipse(8, 10.5, 6.8, 6.6, 'G', (x, y) => y <= 13);
  g.rect(1, 13, 14, 14, 'C');
  g.shade('G', 'g', 'h');
  g.shade('C', 'c', null);
  for (const [x, y] of [[4, 8], [11, 8], [8, 6]]) g.set(x, y, 'g');
  g.stamp(['TTTT', 'tttt', 'TsTT'], 6, 9);
  g.outline('k');
  return g.rows();
}

// ---------------------------------------------------------------------
//  Objetos
// ---------------------------------------------------------------------
const MUSHROOM_ROWS = [
  '.....kkkkkk.....',
  '...kkqWWRRRkk...',
  '..kqWWWWRRRRRk..',
  '.kRWWWWWRRWWRRk.',
  '.kRRWWWRRWWWWRk.',
  'kRRRRRRRRWWWWRRk',
  'kWWRRRRRRRWWRRrk',
  'kWWWRRRRRRRRRrrk',
  'kWWRRRRRRRRRrrrk',
  'krrkkkkkkkkkkrrk',
  '.kkTTTTTTTTTTkk.',
  '..kTTkTTTTkTTk..',
  '..kTTkTTTTkTtk..',
  '..kTTTTTTTTTtk..',
  '...ktTTTTTTttk..'.slice(0, 16),
  '....kkkkkkkk....',
];
const MUSHROOM_PAL = { k: '#2a0a04', R: '#e82a18', r: '#9c1408', q: '#ff9a7a', W: '#ffffff', T: '#fff0d0', t: '#d8b07a' };
const ONEUP_PAL = { k: '#062a0a', R: '#20b830', r: '#107a1a', q: '#9af27a', W: '#ffffff', T: '#fff0d0', t: '#d8b07a' };

const FLOWER_ROWS = [
  '...kkkkkkkkkk...',
  '.kkOOOOOOOOOOkk.',
  'kOOYYYYYYYYYYOOk',
  'kOYYwwwwwwwwYYOk',
  'kOYwwkwwwwkwwYOk',
  'kOYwwkwwwwkwwYOk',
  'kOYYwwwwwwwwYYOk',
  '.kOOYYYYYYYYOOk.',
  '..kkkOOOOOOkkk..',
  '.....kkGGkk.....',
  '.kkk..kGGk..kkk.',
  'kLLLk.kGGk.kLLLk',
  'kLLLLkkGGkkLLLLk',
  '.kLlLLkGGkLLlLk.',
  '..kkllLGGLllkk..',
  '....kkkkkkkk....',
];
const FLOWER_PAL = {
  k: '#2a0a04', w: '#fffbe8', G: '#2eb432', L: '#3ccc3c', l: '#1a7a20',
  1: '#e8241a', 2: '#ff8a1a', 3: '#ffe03a', 4: '#ffffff', 5: '#ffb0d0',
};
const FLOWER_SEQ = [{ O: '1', Y: '3' }, { O: '2', Y: '4' }, { O: '3', Y: '1' }, { O: '5', Y: '3' }];

const STAR_ROWS = [
  '.......kk.......',
  '......kYYk......',
  '......kYYk......',
  '.....khYYyk.....',
  'kkkkkkhYYYkkkkkk',
  'khhYYYYYYYYYYYyk',
  '.khYYYkYYkYYYyk.',
  '..khYYkYYkYYyk..',
  '...khYkYYkYyk...',
  '....kYYYYYYyk...'.slice(0, 16),
  '....khYYYYYyk...'.slice(0, 16),
  '...khYYYYYYYyk..',
  '...khYYykkhYYyk.'.slice(0, 16),
  '..khYYkk..kkYYyk'.slice(0, 16),
  '..kYkk......kkyk'.slice(0, 16),
  '..kk..........kk'.slice(0, 16),
];
const STAR_PAL = {
  k: '#3a1a00',
  Y: '#ffd21e', y: '#e08a00', h: '#fff6a0',
  A: '#ffffff', a: '#c8e0ff', b: '#ffffff',
  B: '#ff9a2a', c: '#c44a00', d: '#ffd8a0',
  D: '#a8ff5a', e: '#4ab01c', f: '#eaffc8',
};
const STAR_SEQ = [{}, { Y: 'B', y: 'c', h: 'd' }, { Y: 'A', y: 'a', h: 'b' }, { Y: 'D', y: 'e', h: 'f' }];

const COIN_PAL = { k: '#4a2200', d: '#c07a00', m: '#f8b800', l: '#ffe048', h: '#fffbd0' };
const COIN = {
  f0: [
    '................',
    '.....kkkkkk.....',
    '....kllllllk....',
    '...klhmmmmmlk...',
    '...khmmddmmmdk..'.slice(0, 16),
    '...klmmdmmmmdk..'.slice(0, 16),
    '...klmmdddmmdk..'.slice(0, 16),
    '...klmmmmdmmdk..'.slice(0, 16),
    '...klmmdddmmdk..'.slice(0, 16),
    '...klmmmdmmmdk..'.slice(0, 16),
    '...klmmmmmmmdk..'.slice(0, 16),
    '...klmmmmmmmdk..'.slice(0, 16),
    '....kdmmmmmdk...',
    '.....kddddk.....'.padEnd(16, '.'),
    '......kkkk......',
    '................',
  ],
};

const FIREBALL_PAL = { k: '#6a0a00', R: '#e8301a', O: '#ff8a1a', Y: '#ffe04a', W: '#fffce0' };
const FIREBALL_F0 = [
  '.....kk.',
  '..kkkROk',
  '.kROOYk.',
  'kROYWWOk',
  'kOYWWYRk',
  'kRYWYORk',
  '.kROORk.',
  '..kkkk..',
];

// ---------------------------------------------------------------------
//  Rey Inflación (jefe 32×32): tortuga-dragón con corona, cuernos,
//  caparazón con pinchos dorados y un "%" grabado.
// ---------------------------------------------------------------------
const BOSS_PAL = {
  k: '#160610',
  G: '#5cb83a', g: '#2e7a24', h: '#b0ea6a',
  P: '#a8264a', p: '#5e0e2a', q: '#ee6a8a',
  Y: '#ffd21e', y: '#c07c00', u: '#fff6a8',
  C: '#fff0c4', c: '#d6ac6a', v: '#ffffff',
  O: '#ff6a12', o: '#b83206', n: '#ffb04a',
  W: '#ffffff', e: '#1a0010', R: '#ff2a2a', r: '#8a0010', m: '#5a0a1a',
};
function bossFrame(pose) {
  const g = new CG(32, 32);
  const walk = pose === 'walk';
  // cola
  g.tri([[1, 25], [6, 21], [7, 27]], 'G');
  // piernas
  const back = walk ? 5 : 6, front = walk ? 17 : 16;
  g.ellipse(back + 3, 26, 3.6, 3.6, 'G');
  g.ellipse(front + 3, 26, 3.6, 3.6, 'G');
  g.rect(back, 28, back + 6, 29, 'G');
  g.rect(front, walk ? 27 : 28, front + 6, walk ? 28 : 29, 'G');
  // garras
  for (const fx of [back + 5, back + 7, front + 5, front + 7]) g.set(fx, fx > front ? (walk ? 29 : 30) : 30, 'W');
  g.set(back + 6, 30, 'W'); g.set(front + 6, walk ? 29 : 30, 'W');
  // cuerpo/cuello
  g.ellipse(19, 16, 5.5, 8, 'G');
  // panza crema con franjas
  g.ellipse(20.5, 19, 4.4, 6.6, 'C');
  // caparazón: borde crema + domo
  g.ellipse(11, 17, 10.2, 10.2, 'C', (x, y) => x <= 17 && y <= 26);
  g.ellipse(11, 16, 9.2, 9.2, 'P', (x, y) => x <= 17 && y <= 24);
  // pinchos dorados en el borde del caparazón
  for (const a of [200, 230, 260, 290, 320]) {
    const r = a * Math.PI / 180;
    const bx = 11 + Math.cos(r) * 8.5, by = 16 + Math.sin(r) * 8.5;
    const tx = 11 + Math.cos(r) * 13, ty = 16 + Math.sin(r) * 13;
    const px = -Math.sin(r) * 2.2, py = Math.cos(r) * 2.2;
    g.tri([[bx + px, by + py], [bx - px, by - py], [tx, ty]], 'Y');
  }
  // melena de fuego
  g.tri([[17, 4], [12, 6], [18, 9]], 'O');
  g.tri([[17, 8], [12, 11], [18, 12]], 'O');
  g.tri([[17, 13], [13, 15], [18, 15]], 'O');
  // cabeza
  g.ellipse(23.5, 9, 6.2, 5.6, 'G');
  g.rect(24, 9, 30, 13, 'G');           // hocico
  g.ellipse(29, 10.5, 2.4, 2.6, 'G');
  // boca abierta
  g.rect(23, 12, 30, 13, 'm');
  g.rect(24, 14, 29, 14, 'G');
  g.set(30, 14, 'G');
  g.set(25, 12, 'W'); g.set(28, 12, 'W'); g.set(26, 13, 'W'); g.set(29, 13, 'W'); // colmillos
  // brazo con garras
  g.ellipse(24, 19, 3.2, 2.2, 'G');
  g.set(27, 18, 'W'); g.set(27, 20, 'W'); g.set(28, 19, 'W');
  // corona
  g.rect(19, 2, 26, 4, 'Y');
  g.tri([[19, 3], [20, 0], [21, 3]], 'Y');
  g.tri([[21.5, 3], [22.5, -0.5], [23.5, 3]], 'Y');
  g.tri([[24, 3], [25, 0], [26.5, 3]], 'Y');
  // cuernos
  g.tri([[18.5, 6], [15, 0.5], [20.5, 4.5]], 'C');
  // sombreado automático
  g.shade('G', 'g', 'h');
  g.shade('P', 'p', 'q');
  g.shade('Y', 'y', 'u');
  g.shade('C', 'c', 'v');
  g.shade('O', 'o', 'n');
  // franjas de la panza
  for (const y of [15, 18, 21, 24]) for (let x = 17; x <= 25; x++) if (g.get(x, y) === 'C' || g.get(x, y) === 'v') g.set(x, y, 'c');
  // gema de la corona
  g.set(22, 3, 'R'); g.set(23, 3, 'R'); g.set(22, 2, 'W');
  // "%" grabado en el caparazón
  g.stamp([
    'YY...Y',
    'YY..Y.',
    '...Y..',
    '..Y...',
    '.Y..YY',
    'Y...YY',
  ], 6, 12);
  { const src = g.rows(); // contorno grabado oscuro alrededor del "%"
    for (let y = 11; y < 19; y++) for (let x = 5; x < 13; x++) {
      if (src[y][x] !== 'P' && src[y][x] !== 'q' && src[y][x] !== 'p') continue;
      let near = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (src[y + dy] && src[y + dy][x + dx] === 'Y' && y + dy >= 12 && x + dx >= 6 && x + dx <= 11) near = true;
      if (near) g.set(x, y, 'p');
    } }
  // ojo enojado + ceja
  if (pose === 'hurt') {
    g.set(24, 7, 'k'); g.set(26, 7, 'k'); g.set(25, 8, 'k'); g.set(24, 9, 'k'); g.set(26, 9, 'k');
  } else {
    g.rect(24, 7, 26, 9, 'W');
    g.set(25, 8, 'R'); g.set(26, 8, 'e'); g.set(25, 9, 'r'); g.set(26, 9, 'e');
  }
  for (const [x, y] of [[22, 5], [23, 6], [24, 6], [25, 6], [26, 6], [27, 7]]) g.set(x, y, 'k'); // ceja
  g.set(30, 9, 'k');                     // fosa nasal
  g.outline('k');
  let rows = g.rows();
  if (pose === 'hurt') rows = subst(rows, { G: 'h', g: 'G', P: 'q', p: 'P', O: 'n', o: 'O' });
  return rows;
}

// ---------------------------------------------------------------------
//  Registro de SPRITES
// ---------------------------------------------------------------------
function coinFrames() {
  const make = (w) => {
    const g = new CG(16, 16);
    const rx = w / 2;
    g.ellipse(8, 8, Math.max(rx, 0.6), 6.6, 'm');
    g.shade('m', 'd', 'l');
    if (w >= 6) { for (let y = 5; y <= 11; y++) g.set(8, y, w >= 9 ? 'd' : 'l'); if (w >= 9) { g.set(7, 5, 'h'); g.set(9, 11, 'd'); } }
    g.outline('k');
    return g.rows();
  };
  const f0 = make(11);
  // grabado "$" sobre la cara frontal
  const g0 = new CG(16, 16); g0.stamp(f0, 0, 0);
  g0.stamp(['.d.', 'ddd', 'd..', 'ddd', '..d', 'ddd', '.d.'], 7, 5);
  g0.set(5, 4, 'h'); g0.set(5, 5, 'h'); g0.set(4, 6, 'h');
  return { f0: g0.rows(), f1: make(7), f2: make(2), f3: flipRows(make(7)) };
}

const flowerFrames = {}; FLOWER_SEQ.forEach((m, i) => flowerFrames['f' + i] = subst(FLOWER_ROWS, m));
const starFrames = {}; STAR_SEQ.forEach((m, i) => starFrames['f' + i] = subst(STAR_ROWS, m));
const fb = [FIREBALL_F0]; for (let i = 1; i < 4; i++) fb.push(rotRows(fb[i - 1]));

export const SPRITES = {
  heroSmall: { palette: HERO_PAL, frames: HERO_SMALL },
  heroBig: { palette: HERO_PAL, frames: HERO_BIG },
  heroFire: { palette: HERO_FIRE_PAL, framesFrom: 'heroBig' },
  heroFireSmall: { palette: HERO_FIRE_PAL, framesFrom: 'heroSmall' }, // extra
  goomba: { palette: GOOMBA_PAL, frames: GOOMBA },
  koopa: { palette: KOOPA_PAL, frames: { walk1: koopaFrame(0), walk2: koopaFrame(1) } },
  shell: { palette: KOOPA_PAL, frames: { shell: koopaShell() } },
  koopaWing: { palette: KOOPA_PAL, frames: { walk1: koopaWingFrame(0), walk2: koopaWingFrame(1) } },
  mushroom: { palette: MUSHROOM_PAL, frames: { idle: MUSHROOM_ROWS } },
  oneUp: { palette: ONEUP_PAL, frames: { idle: MUSHROOM_ROWS } },
  flower: { palette: FLOWER_PAL, frames: flowerFrames },
  star: { palette: STAR_PAL, frames: starFrames },
  coin: { palette: COIN_PAL, frames: coinFrames() },
  fireball: { palette: FIREBALL_PAL, frames: { f0: fb[0], f1: fb[1], f2: fb[2], f3: fb[3] } },
  boss: { palette: BOSS_PAL, frames: { idle: bossFrame('idle'), walk: bossFrame('walk'), hurt: bossFrame('hurt') } },
};
// La concha también accesible como frame de koopa (SPEC: koopa.shell 16×16)
SPRITES.koopa.frames.shell = SPRITES.shell.frames.shell;

// ---------------------------------------------------------------------
//  Helpers de sprites
// ---------------------------------------------------------------------
function resolveSprite(name) {
  const s = SPRITES[name];
  if (!s) throw new Error('Sprite desconocido: ' + name);
  const frames = s.frames || (s.framesFrom && SPRITES[s.framesFrom].frames);
  return { palette: s.palette, frames };
}
export function getSpriteFrameNames(name) { return Object.keys(resolveSprite(name).frames); }
/** → { w, h, data: Array<Array<string|null>> } (fila 0 = arriba) */
export function getSpriteFrame(name, frame) {
  const { palette, frames } = resolveSprite(name);
  const rows = frames[frame] || frames[Object.keys(frames)[0]];
  const h = rows.length, w = rows[0].length;
  const data = rows.map(r => [...r].map(ch => (ch === '.' ? null : palette[ch] || null)));
  return { w, h, data };
}
const _spriteCanvasCache = new Map();
export function spriteToCanvas(spriteName, frameName, scale = 1) {
  const key = spriteName + '|' + frameName + '|' + scale;
  if (_spriteCanvasCache.has(key)) return _spriteCanvasCache.get(key);
  const { w, h, data } = getSpriteFrame(spriteName, frameName);
  const p = new Pix(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) p.set(x, y, data[y][x]);
  const c = p.toCanvas(scale);
  _spriteCanvasCache.set(key, c);
  return c;
}
export function spriteTexture(spriteName, frameName, scale = 1) { return tex(spriteToCanvas(spriteName, frameName, scale)); }

// =====================================================================
//  KART — texturas de alta resolución (estilizadas tipo Mario Kart 8)
//  Todas tileables (RepeatWrapping), sRGB, mipmaps + anisotropía.
// =====================================================================
let KANISO = 1;
const _kartAll = new Set();
/** Fija la anisotropía para todas las texturas kart (ya creadas y futuras). */
export function setAnisotropy(n) {
  KANISO = Math.max(1, n | 0);
  for (const t of _kartAll) { t.anisotropy = KANISO; t.needsUpdate = true; }
}
function ktex(canvas, { repeat = true, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = KANISO;
  t.needsUpdate = true;
  _kartAll.add(t);
  return t;
}

// --- ruido tileable -------------------------------------------------
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);
function vnoise(x, y, p, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const m = v => ((v % p) + p) % p;
  const h = (a, b) => hash(m(a), m(b), seed);
  const u = smooth(xf), v = smooth(yf);
  return lerp(lerp(h(xi, yi), h(xi + 1, yi), u), lerp(h(xi, yi + 1), h(xi + 1, yi + 1), u), v);
}
/** fbm periódico: (u,v) en [0,1), periodo base p celdas */
function fbm(u, v, p, oct = 5, seed = 0) {
  let a = 0.5, s = 0, n = 0, f = 1;
  for (let i = 0; i < oct; i++) { s += a * vnoise(u * p * f, v * p * f, p * f, seed + i * 17); n += a; a *= 0.5; f *= 2; }
  return s / n;
}
/** Voronoi periódico: devuelve {f1,f2,id,cx,cy} en unidades de celda */
function voronoi(u, v, p, seed = 0) {
  const x = u * p, y = v * p, xi = Math.floor(x), yi = Math.floor(y);
  let f1 = 9, f2 = 9, id = 0, cx = 0, cy = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const gx = xi + i, gy = yi + j, mx = ((gx % p) + p) % p, my = ((gy % p) + p) % p;
    const px = gx + 0.15 + 0.7 * hash(mx, my, seed), py = gy + 0.15 + 0.7 * hash(mx, my, seed + 1);
    const d = Math.hypot(x - px, y - py);
    if (d < f1) { f2 = f1; f1 = d; id = my * p + mx; cx = px - x; cy = py - y; } else if (d < f2) f2 = d;
  }
  return { f1, f2, id, cx, cy };
}
const rgb = h => hexToRgb(h);
const mixA = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
function rampA(stops, t) { // stops: [[t, [r,g,b]]...]
  t = clamp(t, 0, 1);
  for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) {
    const [t0, c0] = stops[i - 1], [t1, c1] = stops[i];
    return mixA(c0, c1, (t - t0) / Math.max(1e-6, t1 - t0));
  }
  return stops[stops.length - 1][1];
}
/** pinta un canvas píxel a píxel: fn(u,v,x,y) → [r,g,b,(a)] ; opcional altura para normal map */
function pixCanvas(w, h, fn) {
  const c = makeCanvas(w, h), ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h), d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const col = fn(x / w, y / h, x, y), i = (y * w + x) * 4;
    d[i] = clamp(col[0], 0, 255); d[i + 1] = clamp(col[1], 0, 255); d[i + 2] = clamp(col[2], 0, 255);
    d[i + 3] = col.length > 3 ? clamp(col[3], 0, 255) : 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
function normalFromHeight(hf, w, h, strength = 2.5) {
  return pixCanvas(w, h, (u, v, x, y) => {
    const H = (xx, yy) => hf[(((yy % h) + h) % h) * w + (((xx % w) + w) % w)];
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength;
    const n = Math.hypot(dx, dy, 1);
    return [(-dx / n * 0.5 + 0.5) * 255, (dy / n * 0.5 + 0.5) * 255, (1 / n * 0.5 + 0.5) * 255];
  });
}
/** dibuja con envoltura (para que formas que cruzan el borde aparezcan del otro lado) */
function wrapDraw(w, h, x, y, r, fn) {
  for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
    if (x + ox + r < 0 || x + ox - r > w || y + oy + r < 0 || y + oy - r > h) continue;
    fn(x + ox, y + oy);
  }
}
const FONT = "'Arial Black', 'Arial Rounded MT Bold', 'Helvetica Neue', Impact, sans-serif";

// --- paletas por tema -------------------------------------------------
const KP = {
  overworld: {
    asphalt: '#5b5f6b', grain: 1, curb: ['#e52521', '#f4f4f4'], curbStyle: 'paint',
    grass: { base: ['#2f8f2a', '#49b234', '#7ad24a'], blades: ['#2a7d22', '#3fa52c', '#5cc23a', '#8ee05a', '#b6f07a'], flowers: ['#ffffff', '#ffe23a', '#ff6f9c', '#ff4040'] },
    sand: ['#d9b46a', '#ecd093', '#fff0c4'], rock: ['#6c6a72', '#8d8a90', '#b6b2b4'], dirt: ['#6a4426', '#8c5a32', '#b07a48'],
    crystal: ['#2bc8ff', '#7a5cff', '#c8f4ff'],
    sky: [[0, '#2f7cf0'], [0.55, '#64b2ff'], [1, '#d6f0ff']], fog: '#bfe2ff', sun: '#fff6d8',
    crowdShirts: ['#e52521', '#049cd8', '#43b047', '#fbd000', '#ffffff', '#ff8a1a', '#a050d8'],
  },
  forest: {
    asphalt: '#5e5550', grain: 1, curb: ['#8a5428', '#43b047'], curbStyle: 'wood',
    grass: { base: ['#4a6a1e', '#6a8a26', '#9aa83a'], blades: ['#3c5a16', '#56781e', '#7c9a2a', '#b4b23a', '#e0c050'], flowers: ['#ffb040', '#ff6a3a', '#ffe070', '#f0a0ff'] },
    sand: ['#c49058', '#dcae74', '#f2d4a0'], rock: ['#5e5048', '#7e6a5c', '#a88e78'], dirt: ['#5a3418', '#7a4a24', '#a0683a'],
    crystal: ['#ffb43c', '#e0506a', '#fff0b0'],
    sky: [[0, '#2c1e6a'], [0.35, '#8a3a8e'], [0.62, '#ec6a6a'], [0.85, '#ffa848'], [1, '#ffd884']], fog: '#f0a070', sun: '#ffb050',
    crowdShirts: ['#e85a1a', '#ffd040', '#8a3a8e', '#43b047', '#ffffff', '#d03040', '#ff9a60'],
  },
  underground: {
    asphalt: '#3e4a5e', grain: 1.1, curb: ['#16d6f0', '#e8fbff'], curbStyle: 'glow',
    grass: { base: ['#0e4a5a', '#16707a', '#22a0a0'], blades: ['#0c3e4c', '#126474', '#1a9098', '#36c8c0', '#8af0e0'], flowers: ['#7af0ff', '#c08cff', '#ffffff', '#5affb0'] },
    sand: ['#5a6a80', '#7a8ca2', '#a8bccc'], rock: ['#222c44', '#34446a', '#566c9a'], dirt: ['#2c3448', '#3e4a62', '#5a6a86'],
    crystal: ['#18d8ff', '#8a4cff', '#e0fbff'],
    sky: [[0, '#02030a'], [0.6, '#081430'], [1, '#14305a']], fog: '#0e2a4a', sun: '#7af0ff',
    crowdShirts: ['#16d6f0', '#8a4cff', '#ffffff', '#5affb0', '#049cd8', '#ff6ad0', '#fbd000'],
  },
  castle: {
    asphalt: '#3c3638', grain: 1.2, curb: ['#6e6a74', '#ff7a14'], curbStyle: 'stone',
    grass: { base: ['#2a2224', '#3a2e2c', '#4e3a32'], blades: ['#241c1e', '#3a2c2a', '#523a30', '#6a4632', '#8a5a34'], flowers: ['#ff5a10', '#ffb030', '#ff2a10', '#ffe060'] },
    sand: ['#2a2426', '#3e3434', '#5a4a46'], rock: ['#2a2630', '#423c48', '#6a6070'], dirt: ['#2e221e', '#44302a', '#5e4236'],
    crystal: ['#ff3a2a', '#a01aff', '#ffd0a0'],
    sky: [[0, '#04040e'], [0.5, '#140c2c'], [0.82, '#3a1430'], [1, '#7a2414']], fog: '#2a1424', sun: '#ff6a2a',
    crowdShirts: ['#ff7a14', '#a8264a', '#6e6a74', '#ffd21e', '#ffffff', '#5a2a8a', '#e52521'],
  },
};

// --- texturas -----------------------------------------------------------
function kAsphalt(P, normal) {
  const S = 512, base = rgb(P.asphalt), hf = new Float32Array(S * S);
  const col = pixCanvas(S, S, (u, v, x, y) => {
    const big = fbm(u, v, 4, 4, 3);            // manchas grandes
    const mid = fbm(u, v, 32, 3, 9);           // textura media
    const g = hash(x, y, 41);                   // grano fino
    let k = 0.84 + (big - 0.5) * 0.28 + (mid - 0.5) * 0.18 + (g - 0.5) * 0.16 * P.grain;
    let c = base.map(ch => ch * k);
    let ht = mid * 0.7 + fbm(u, v, 96, 2, 44) * 0.3;
    if (g > 0.985) { c = mixA(c, [215, 215, 220], 0.55); ht += 0.25; }         // áridos claros
    else if (g < 0.02) { c = c.map(ch => ch * 0.6); ht -= 0.2; }               // poros
    const stain = fbm(u, v, 3, 3, 77);
    if (stain > 0.62) c = c.map(ch => ch * (1 - (stain - 0.62) * 0.9));       // manchas de aceite
    hf[y * S + x] = ht;
    return c;
  });
  return { asphalt: col, asphaltNormal: normal ? normalFromHeight(hf, S, S, 6) : null };
}

function kCurb(P) {
  const W = 256, H = 128, A = rgb(P.curb[0]), B = rgb(P.curb[1]);
  return pixCanvas(W, H, (u, v, x, y) => {
    const blk = Math.floor(x / 64) % 2, lx = x % 64;
    let c = blk ? B : A;
    const n = fbm(u, v, 8, 4, 5);
    if (P.curbStyle === 'wood') {
      const grain = Math.sin((y * 0.35 + fbm(u, v, 4, 3, 2) * 18) * 1.3) * 0.5 + 0.5;
      c = blk ? mixA(B, [255, 255, 255], 0.08) : mixA(A.map(q => q * 0.8), A.map(q => Math.min(255, q * 1.25)), grain);
      if (!blk && (lx === 6 || lx === 57) && (y % 32 > 12 && y % 32 < 18)) c = [60, 40, 30];      // clavos
    } else if (P.curbStyle === 'stone') {
      if (!blk) { const vv = voronoi(u, v, 6, 8); c = mixA(A.map(q => q * 0.8), A, vv.f1); if (vv.f2 - vv.f1 < 0.08) c = A.map(q => q * 0.5); }
      else c = mixA(B, [255, 220, 120], Math.max(0, n - 0.5) * 1.4);                               // piedra incandescente
    } else if (P.curbStyle === 'glow') {
      c = blk ? B : mixA(A, [200, 255, 255], Math.pow(Math.max(0, 1 - Math.abs(lx - 32) / 32), 3) * 0.6);
    }
    // bisel cilíndrico: luz arriba, sombra abajo
    const s = 0.72 + 0.42 * Math.sin(Math.PI * (y + 6) / (H + 12)) - (y > H - 10 ? (y - (H - 10)) * 0.04 : 0);
    c = c.map(q => q * s);
    if (y < 10) c = mixA(c, [255, 255, 255], (10 - y) / 10 * 0.35);                           // brillo superior
    if (lx === 0 || lx === 63) c = c.map(q => q * 0.55);                                        // junta
    c = c.map(q => q * (0.94 + (n - 0.5) * 0.18));                                              // desgaste
    return c;
  });
}

function kStartGrid() {
  const W = 512, H = 128, sq = 32;
  return pixCanvas(W, H, (u, v, x, y) => {
    const on = (Math.floor(x / sq) + Math.floor(y / sq)) % 2 === 0;
    const n = fbm(u, v, 16, 4, 12), g = hash(x, y, 3);
    let c = on ? [236, 236, 232] : [26, 26, 30];
    c = c.map(q => q * (0.9 + (n - 0.5) * 0.25 + (g - 0.5) * 0.08));
    if (on && n < 0.36) c = mixA(c, [90, 92, 100], 0.55);                       // pintura gastada
    if (x % sq === 0 || y % sq === 0) c = c.map(q => q * 0.8);
    return c;
  });
}

function kGrass(P) {
  const S = 512, G = P.grass, b = G.base.map(rgb);
  const c = pixCanvas(S, S, (u, v, x, y) => {
    const n = fbm(u, v, 6, 5, 21), m = fbm(u, v, 24, 3, 22);
    const col = rampA([[0, b[0]], [0.5, b[1]], [1, b[2]]], n * 0.8 + m * 0.35 - 0.1);
    return col.map(q => q * (0.9 + hash(x, y, 2) * 0.15));
  });
  const ctx = c.getContext('2d');
  ctx.lineCap = 'round';
  for (let i = 0; i < 9000; i++) {
    const x = hash(i, 1, 51) * S, y = hash(i, 2, 51) * S, len = 5 + hash(i, 3, 51) * 9;
    const ang = -Math.PI / 2 + (hash(i, 4, 51) - 0.5) * 1.1;
    const shade = fbm(x / S, y / S, 6, 3, 21);
    const ci = clamp(Math.floor(shade * 3 + hash(i, 5, 51) * 2.5), 0, G.blades.length - 1);
    ctx.strokeStyle = G.blades[ci]; ctx.lineWidth = 1.2 + hash(i, 6, 51) * 1.2;
    wrapDraw(S, S, x, y, len, (X, Y) => { ctx.beginPath(); ctx.moveTo(X, Y); ctx.quadraticCurveTo(X + Math.cos(ang) * len * 0.5 + 2, Y + Math.sin(ang) * len * 0.5, X + Math.cos(ang) * len, Y + Math.sin(ang) * len); ctx.stroke(); });
  }
  for (let i = 0; i < 26; i++) { // grupos de flores
    const cx = hash(i, 7, 52) * S, cy = hash(i, 8, 52) * S, col = G.flowers[i % G.flowers.length];
    for (let j = 0; j < 5; j++) {
      const fx = cx + (hash(i, j, 53) - 0.5) * 30, fy = cy + (hash(j, i, 54) - 0.5) * 30, r = 2.6 + hash(i, j, 55) * 1.6;
      wrapDraw(S, S, fx, fy, r * 3, (X, Y) => {
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.arc(X + 1.5, Y + 1.5, r * 1.7, 0, 7); ctx.fill();
        ctx.fillStyle = col;
        for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; ctx.beginPath(); ctx.arc(X + Math.cos(a) * r, Y + Math.sin(a) * r, r * 0.85, 0, 7); ctx.fill(); }
        ctx.fillStyle = '#ffd21e'; ctx.beginPath(); ctx.arc(X, Y, r * 0.6, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.arc(X - r * 0.2, Y - r * 0.25, r * 0.25, 0, 7); ctx.fill();
      });
    }
  }
  return c;
}

function kSand(P) {
  const s = P.sand.map(rgb);
  return pixCanvas(512, 512, (u, v, x, y) => {
    const w = fbm(u, v, 4, 4, 31);
    const rip = Math.sin((v * 22 + w * 3.2 + fbm(u, v, 8, 2, 32) * 0.8) * Math.PI * 2) * 0.5 + 0.5;
    let c = rampA([[0, s[0]], [0.55, s[1]], [1, s[2]]], 0.25 + rip * 0.45 + (w - 0.5) * 0.5);
    const g = hash(x, y, 33);
    c = c.map(q => q * (0.93 + g * 0.12));
    if (g > 0.996) c = [255, 255, 245];
    return c;
  });
}

function kRock(P) {
  const r = P.rock.map(rgb);
  return pixCanvas(512, 512, (u, v) => {
    const vo = voronoi(u, v, 6, 61), n = fbm(u, v, 16, 5, 62);
    const tone = hash(vo.id, 3, 63);
    const light = clamp(0.55 + (vo.cx * -0.6 + vo.cy * -0.8) * 0.9, 0, 1);  // facetas iluminadas arriba-izq
    let c = rampA([[0, r[0]], [0.5, r[1]], [1, r[2]]], light * 0.6 + tone * 0.25 + (n - 0.5) * 0.5);
    const e = vo.f2 - vo.f1;
    if (e < 0.06) c = r[0].map(q => q * 0.45);
    else if (e < 0.12) c = c.map(q => q * 0.78);
    return c;
  });
}

function kLava() {
  const stops = [[0, [30, 6, 4]], [0.35, [70, 14, 6]], [0.55, [190, 30, 4]], [0.72, [255, 110, 10]], [0.88, [255, 210, 60]], [1, [255, 250, 210]]];
  return pixCanvas(512, 512, (u, v) => {
    const wx = fbm(u, v, 3, 4, 71), wy = fbm(u, v, 3, 4, 72);
    const n = fbm((u + wx * 0.35) % 1, (v + wy * 0.35) % 1, 4, 5, 73);
    const vo = voronoi(u, v, 5, 74);
    const crack = clamp(1 - (vo.f2 - vo.f1) * 5, 0, 1);              // ríos brillantes entre placas de costra
    const t = clamp(n * 0.75 + crack * 0.6 - 0.12, 0, 1);
    return rampA(stops, t);
  });
}

function kCrystal(P) {
  const k = P.crystal.map(rgb);
  return pixCanvas(512, 512, (u, v) => {
    const vo = voronoi(u, v, 5, 81);
    const h = hash(vo.id, 1, 82), a = hash(vo.id, 2, 82) * Math.PI * 2;
    const lit = clamp(0.5 + (vo.cx * Math.cos(a) + vo.cy * Math.sin(a)) * 1.4, 0, 1);
    let c = mixA(k[0], k[1], h);
    c = mixA(c.map(q => q * 0.45), mixA(c, k[2], 0.35), lit);
    const e = vo.f2 - vo.f1;
    if (e < 0.04) c = k[2];
    else if (e < 0.1) c = mixA(c, k[2], (0.1 - e) / 0.06 * 0.6);
    const sp = fbm(u, v, 32, 2, 83);
    if (sp > 0.7) c = mixA(c, [255, 255, 255], (sp - 0.7) * 1.5);
    return c;
  });
}

function kDirt(P) {
  const d = P.dirt.map(rgb);
  const c = pixCanvas(512, 512, (u, v, x, y) => {
    const n = fbm(u, v, 5, 5, 91), m = fbm(u, v, 40, 2, 92);
    let col = rampA([[0, d[0]], [0.5, d[1]], [1, d[2]]], n * 0.9 + (m - 0.5) * 0.4);
    // surcos de neumáticos a lo largo de V
    const rut = Math.abs(((u * 4) % 1) - 0.5);
    if (rut < 0.06) col = col.map(q => q * (0.82 + rut * 2));
    return col.map(q => q * (0.92 + hash(x, y, 93) * 0.14));
  });
  const ctx = c.getContext('2d');
  for (let i = 0; i < 160; i++) { // guijarros
    const x = hash(i, 1, 94) * 512, y = hash(i, 2, 94) * 512, r = 1.5 + hash(i, 3, 94) * 3.5;
    wrapDraw(512, 512, x, y, r * 2, (X, Y) => {
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(X + 1, Y + 1.2, r * 1.2, r, 0, 0, 7); ctx.fill();
      ctx.fillStyle = P.rock[1]; ctx.beginPath(); ctx.ellipse(X, Y, r * 1.2, r, 0, 0, 7); ctx.fill();
      ctx.fillStyle = P.rock[2]; ctx.beginPath(); ctx.ellipse(X - r * 0.3, Y - r * 0.3, r * 0.5, r * 0.4, 0, 0, 7); ctx.fill();
    });
  }
  return c;
}

function kBoostPad() {
  const S = 256, c = makeCanvas(S, S), g = c.getContext('2d');
  const bg = g.createLinearGradient(0, 0, S, 0);
  bg.addColorStop(0, '#1a1d2e'); bg.addColorStop(0.5, '#2c3350'); bg.addColorStop(1, '#1a1d2e');
  g.fillStyle = bg; g.fillRect(0, 0, S, S);
  // placa metálica con remaches
  for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(255,255,255,${hash(i, 1, 5) * 0.05})`; g.fillRect(hash(i, 2, 5) * S, hash(i, 3, 5) * S, 2, 1); }
  // bordes laterales con franjas
  for (const x0 of [0, S - 18]) {
    g.fillStyle = '#ffb000'; g.fillRect(x0, 0, 18, S);
    g.save(); g.beginPath(); g.rect(x0, 0, 18, S); g.clip(); g.fillStyle = '#1a1a1a';
    for (let y = -40; y < S + 40; y += 32) { g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + 18, y - 14); g.lineTo(x0 + 18, y + 2); g.lineTo(x0, y + 16); g.fill(); }
    g.restore();
  }
  // tres chevrones (apuntan hacia -V = hacia delante); periodo S/2 para tileado vertical
  const chevron = (cy) => {
    g.save();
    const path = () => { g.beginPath(); g.moveTo(40, cy + 34); g.lineTo(128, cy - 30); g.lineTo(216, cy + 34); g.lineTo(216, cy + 64); g.lineTo(128, cy); g.lineTo(40, cy + 64); g.closePath(); };
    g.shadowColor = '#ff8a00'; g.shadowBlur = 22; path();
    const gr = g.createLinearGradient(0, cy - 30, 0, cy + 64); gr.addColorStop(0, '#fff3a0'); gr.addColorStop(0.35, '#ffc21a'); gr.addColorStop(1, '#ff6a00');
    g.fillStyle = gr; g.fill(); g.shadowBlur = 0;
    g.lineWidth = 4; g.strokeStyle = '#a03a00'; g.stroke();
    g.beginPath(); g.moveTo(52, cy + 36); g.lineTo(128, cy - 18); g.lineTo(204, cy + 36);
    g.lineWidth = 5; g.strokeStyle = 'rgba(255,255,255,0.75)'; g.stroke();
    g.restore();
  };
  for (const cy of [-96, 32, 160]) chevron(cy);
  return c;
}

function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function shadeHex(hex, f) { const c = rgb(hex); return rgbToHex(...(f >= 0 ? mixA(c, [255, 255, 255], f) : c.map(q => q * (1 + f)))); }

const lum0 = h => { const c = rgb(h); return 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]; };
const _gateCache = new Map();
/** Cartel/arco con letra gigante biselada. color = '#e52521' (A), '#049cd8' (B), '#43b047' (C), '#fbd000' (D) */
export function gateBanner(letter = 'A', color = '#e52521') {
  const key = letter + color;
  if (_gateCache.has(key)) return _gateCache.get(key);
  const W = 512, H = 256, c = makeCanvas(W, H), g = c.getContext('2d');
  // marco dorado
  roundRect(g, 4, 4, W - 8, H - 8, 34);
  let gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#fff2a0'); gr.addColorStop(0.45, '#ffc21a'); gr.addColorStop(1, '#b86a00');
  g.fillStyle = gr; g.fill(); g.lineWidth = 6; g.strokeStyle = '#5a3000'; g.stroke();
  // panel de color
  roundRect(g, 20, 20, W - 40, H - 40, 24);
  gr = g.createLinearGradient(0, 20, 0, H - 20);
  gr.addColorStop(0, shadeHex(color, 0.35)); gr.addColorStop(0.5, color); gr.addColorStop(1, shadeHex(color, -0.45));
  g.fillStyle = gr; g.fill();
  g.save(); g.clip();
  // rayos radiales sutiles
  g.globalAlpha = 0.12; g.fillStyle = '#ffffff';
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; g.beginPath(); g.moveTo(W / 2, H / 2); g.arc(W / 2, H / 2, 400, a, a + 0.12); g.fill(); }
  g.globalAlpha = 1;
  // damero en los costados
  for (const x0 of [20, W - 68]) for (let y = 20; y < H - 20; y += 16) for (let x = 0; x < 48; x += 16) {
    g.fillStyle = ((x + y) / 16) % 2 ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.55)'; g.fillRect(x0 + x, y, 16, 16);
  }
  g.restore();
  g.lineWidth = 5; g.strokeStyle = 'rgba(255,255,255,0.8)'; roundRect(g, 26, 26, W - 52, H - 52, 20); g.stroke();
  // letra con extrusión 3D
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `900 210px ${FONT}`;
  const cx = W / 2, cy = H / 2 + 12;
  for (let i = 12; i > 0; i--) { g.fillStyle = lum0(color) > 150 ? '#5a3000' : shadeHex(color, -0.65 + i * 0.01); g.fillText(letter, cx + i * 0.6, cy + i); }
  const lum = (c => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2])(rgb(color));
  g.lineJoin = 'round'; g.lineWidth = lum > 150 ? 22 : 18; g.strokeStyle = lum > 150 ? '#5a3000' : shadeHex(color, -0.7); g.strokeText(letter, cx, cy);
  gr = g.createLinearGradient(0, cy - 90, 0, cy + 90);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.5, '#ffffff'); gr.addColorStop(0.52, '#e8eef8'); gr.addColorStop(1, '#c4d0e4');
  g.fillStyle = gr; g.fillText(letter, cx, cy);
  g.lineWidth = 4; g.strokeStyle = 'rgba(255,255,255,0.9)'; g.strokeText(letter, cx - 1, cy - 2);
  // brillo vidriado superior
  g.save(); roundRect(g, 20, 20, W - 40, H - 40, 24); g.clip();
  gr = g.createLinearGradient(0, 20, 0, H * 0.55); gr.addColorStop(0, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.beginPath(); g.ellipse(W / 2, 10, W * 0.62, H * 0.42, 0, 0, 7); g.fill();
  g.restore();
  // remaches del marco
  for (const [x, y] of [[14, 14], [W - 14, 14], [14, H - 14], [W - 14, H - 14]]) {
    gr = g.createRadialGradient(x - 2, y - 2, 1, x, y, 7); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#8a5a00');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill();
  }
  const t = ktex(c, { repeat: false });
  _gateCache.set(key, t);
  return t;
}

function kItemBoxFace() {
  const S = 256, c = makeCanvas(S, S), g = c.getContext('2d');
  roundRect(g, 6, 6, S - 12, S - 12, 36); g.save(); g.clip();
  const gr = g.createLinearGradient(0, 0, S, S);
  ['#ff3a6a', '#ff9a2a', '#ffe23a', '#5aea5a', '#3ac8ff', '#9a6aff', '#ff5ad0'].forEach((col, i, a) => gr.addColorStop(i / (a.length - 1), col));
  g.globalAlpha = 0.55; g.fillStyle = gr; g.fillRect(0, 0, S, S);
  g.globalAlpha = 1;
  const rg = g.createRadialGradient(S * 0.5, S * 0.5, 10, S * 0.5, S * 0.5, S * 0.75);
  rg.addColorStop(0, 'rgba(255,255,255,0.35)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg; g.fillRect(0, 0, S, S);
  // reflejo diagonal
  g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.moveTo(0, 70); g.lineTo(70, 0); g.lineTo(110, 0); g.lineTo(0, 110); g.fill();
  g.restore();
  // borde blanco brillante
  g.lineWidth = 12; g.strokeStyle = 'rgba(255,255,255,0.95)'; g.shadowColor = '#ffffff'; g.shadowBlur = 14;
  roundRect(g, 10, 10, S - 20, S - 20, 32); g.stroke(); g.shadowBlur = 0;
  // "?"
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 170px ${FONT}`;
  g.lineJoin = 'round'; g.lineWidth = 14; g.strokeStyle = 'rgba(40,20,90,0.55)'; g.strokeText('?', S / 2 + 4, S / 2 + 18);
  g.shadowColor = 'rgba(255,255,255,0.9)'; g.shadowBlur = 16; g.fillStyle = '#ffffff'; g.fillText('?', S / 2, S / 2 + 12); g.shadowBlur = 0;
  // destellos
  const star = (x, y, r) => { g.fillStyle = '#ffffff'; g.beginPath(); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, rr = i % 2 ? r * 0.25 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.fill(); };
  star(196, 58, 14); star(60, 200, 10); star(210, 196, 7);
  return c;
}

// --- patrocinadores (marcas inventadas) ---------------------------------
const SPONSORS = [
  { name: 'BANCO CHAMPIÑÓN', tag: 'Ahorra hoy, crece mañana', bg: ['#e52521', '#8a0c0a'], fg: '#ffffff', icon: 'mushroom' },
  { name: 'SEGUROS KOOPA', tag: 'Tu caparazón financiero', bg: ['#43b047', '#14601c'], fg: '#fff6c8', icon: 'shell' },
  { name: 'OFERTA & DEMANDA', tag: 'El precio justo', bg: ['#049cd8', '#06386e'], fg: '#ffffff', icon: 'curves' },
  { name: 'TASA CERO', tag: 'Crédito 0% de interés*', bg: ['#fbd000', '#c07800'], fg: '#2a1400', icon: 'zero' },
  { name: 'BOLSA ESTRELLA', tag: 'Invierte con cabeza', bg: ['#7a3cd8', '#2c1066'], fg: '#ffe23a', icon: 'star' },
  { name: 'PIB+', tag: 'Producción que suma', bg: ['#ff8a1a', '#a03a00'], fg: '#ffffff', icon: 'bars' },
  { name: 'COSTO DE OPORTUNIDAD', tag: 'Elige bien, elige ya', bg: ['#1c2440', '#06080e'], fg: '#7af0ff', icon: 'scale' },
  { name: 'MONEDA DE ORO', tag: 'Casa de cambio', bg: ['#ffffff', '#c8d0e0'], fg: '#1c2a5a', icon: 'coin' },
];
function drawIcon(g, kind, x, y, r, fg) {
  g.save(); g.translate(x, y); g.lineJoin = 'round'; g.lineCap = 'round';
  // disco base
  g.fillStyle = '#ffffff'; g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill();
  g.lineWidth = 5; g.strokeStyle = 'rgba(0,0,0,0.35)'; g.stroke();
  const k = r / 40;
  g.scale(k, k);
  switch (kind) {
    case 'mushroom':
      g.fillStyle = '#e52521'; g.beginPath(); g.arc(0, 2, 30, Math.PI, 0); g.closePath(); g.fill();
      g.fillStyle = '#ffffff'; for (const [a, b, c] of [[-14, -12, 8], [12, -14, 7], [0, -24, 5]]) { g.beginPath(); g.arc(a, b, c, 0, 7); g.fill(); }
      g.fillStyle = '#fff0d0'; roundRect(g, -14, 2, 28, 24, 8); g.fill(); g.strokeStyle = '#2a0a04'; g.lineWidth = 3; g.stroke();
      g.fillStyle = '#2a0a04'; g.fillRect(-7, 8, 4, 9); g.fillRect(4, 8, 4, 9); break;
    case 'shell':
      g.fillStyle = '#fff2c4'; g.beginPath(); g.ellipse(0, 12, 32, 10, 0, 0, 7); g.fill();
      g.fillStyle = '#2eb432'; g.beginPath(); g.arc(0, 10, 28, Math.PI, 0); g.fill();
      g.strokeStyle = '#14601c'; g.lineWidth = 4; g.beginPath(); g.moveTo(-10, 10); g.lineTo(-6, -8); g.lineTo(6, -8); g.lineTo(10, 10); g.moveTo(-6, -8); g.lineTo(-18, -2); g.moveTo(6, -8); g.lineTo(18, -2); g.stroke(); break;
    case 'curves':
      g.lineWidth = 7; g.strokeStyle = '#049cd8'; g.beginPath(); g.moveTo(-26, -24); g.quadraticCurveTo(-4, 14, 26, 24); g.stroke();
      g.strokeStyle = '#e52521'; g.beginPath(); g.moveTo(-26, 24); g.quadraticCurveTo(4, 14, 26, -24); g.stroke();
      g.fillStyle = '#fbd000'; g.beginPath(); g.arc(0, 8, 7, 0, 7); g.fill(); g.strokeStyle = '#2a1400'; g.lineWidth = 3; g.stroke(); break;
    case 'zero':
      g.fillStyle = '#c07800'; g.font = `900 34px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('0%', 0, 3); break;
    case 'star':
      g.fillStyle = '#ffd21e'; g.strokeStyle = '#a06000'; g.lineWidth = 4; g.beginPath();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? 13 : 32; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr + 3); }
      g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#2a1400'; g.fillRect(-7, -4, 4, 9); g.fillRect(3, -4, 4, 9); break;
    case 'bars':
      [[-24, 10, '#43b047'], [-8, -4, '#049cd8'], [8, -16, '#fbd000']].forEach(([bx, by, col]) => { g.fillStyle = col; g.fillRect(bx, by, 14, 28 - by); });
      g.strokeStyle = '#e52521'; g.lineWidth = 6; g.beginPath(); g.moveTo(-26, 4); g.lineTo(-2, -12); g.lineTo(24, -28); g.stroke();
      g.fillStyle = '#e52521'; g.beginPath(); g.moveTo(28, -32); g.lineTo(14, -30); g.lineTo(24, -20); g.fill(); break;
    case 'scale':
      g.strokeStyle = '#1c2440'; g.lineWidth = 5; g.beginPath(); g.moveTo(0, -26); g.lineTo(0, 26); g.moveTo(-28, -14); g.lineTo(28, -14); g.moveTo(-14, 26); g.lineTo(14, 26); g.stroke();
      g.fillStyle = '#7af0ff'; g.beginPath(); g.arc(-22, 2, 11, 0, Math.PI); g.fill(); g.fillStyle = '#ffd21e'; g.beginPath(); g.arc(22, 2, 11, 0, Math.PI); g.fill();
      g.beginPath(); g.moveTo(-28, -14); g.lineTo(-33, 2); g.moveTo(-28, -14); g.lineTo(-11, 2); g.moveTo(28, -14); g.lineTo(11, 2); g.moveTo(28, -14); g.lineTo(33, 2); g.lineWidth = 2; g.stroke(); break;
    case 'coin':
      g.fillStyle = '#ffc21a'; g.beginPath(); g.ellipse(0, 0, 26, 32, 0, 0, 7); g.fill(); g.strokeStyle = '#a06000'; g.lineWidth = 5; g.stroke();
      g.fillStyle = '#a06000'; g.font = `900 40px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('$', 0, 2); break;
  }
  g.restore();
}
function kSponsor(sp) {
  const W = 512, H = 128, c = makeCanvas(W, H), g = c.getContext('2d');
  let gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, sp.bg[0]); gr.addColorStop(1, sp.bg[1]);
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  // franjas diagonales decorativas
  g.save(); g.globalAlpha = 0.14; g.fillStyle = '#ffffff';
  for (let x = -60; x < W; x += 46) { g.beginPath(); g.moveTo(x, H); g.lineTo(x + 22, H); g.lineTo(x + 82, 0); g.lineTo(x + 60, 0); g.fill(); }
  g.restore();
  // ribete
  g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(0, 6, W, 4); g.fillRect(0, H - 10, W, 4);
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 0, W, 6); g.fillRect(0, H - 6, W, 6);
  drawIcon(g, sp.icon, 66, H / 2, 42, sp.fg);
  // nombre (ajustado al ancho)
  const maxW = W - 140;
  let size = 52; g.font = `italic 900 ${size}px ${FONT}`;
  while (g.measureText(sp.name).width > maxW && size > 20) { size -= 2; g.font = `italic 900 ${size}px ${FONT}`; }
  g.textBaseline = 'alphabetic'; g.textAlign = 'left';
  const tx = 122, ty = H / 2 + size * 0.3 - 8;
  g.lineJoin = 'round'; g.lineWidth = 8; g.strokeStyle = 'rgba(0,0,0,0.45)'; g.strokeText(sp.name, tx + 3, ty + 3);
  g.fillStyle = sp.fg; g.fillText(sp.name, tx, ty);
  g.font = `700 18px ${FONT}`; g.fillStyle = sp.fg; g.globalAlpha = 0.85; g.fillText(sp.tag, tx + 2, H - 22); g.globalAlpha = 1;
  // brillo superior
  gr = g.createLinearGradient(0, 0, 0, H / 2); gr.addColorStop(0, 'rgba(255,255,255,0.28)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, W, H / 2);
  return c;
}

function kCrowd(P) {
  const W = 512, H = 256, c = makeCanvas(W, H), g = c.getContext('2d');
  let gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#2a2e3e'); gr.addColorStop(1, '#4a5068');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  const skins = ['#ffd8b0', '#f0b888', '#c88858', '#8a5a3a', '#ffe0c8', '#b8f0a0', '#a0d0ff'];
  const rows = 4, rowH = H / rows;
  for (let r = 0; r < rows; r++) {
    const baseY = (r + 1) * rowH;
    g.fillStyle = r % 2 ? '#5a6078' : '#646a84'; g.fillRect(0, baseY - 12, W, 12);   // grada
    g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(0, baseY - 12, W, 2);
    const n = 13, step = W / n;
    for (let i = 0; i < n; i++) {
      const seed = r * 31 + i;
      const x = i * step + step / 2 + (hash(seed, 1, 101) - 0.5) * 10 + (r % 2) * step / 2;
      const scale = 0.85 + hash(seed, 2, 101) * 0.3;
      const shirt = P.crowdShirts[Math.floor(hash(seed, 3, 101) * P.crowdShirts.length)];
      const skin = skins[Math.floor(hash(seed, 4, 101) * skins.length)];
      const armsUp = hash(seed, 5, 101) > 0.5;
      const flag = hash(seed, 6, 101) > 0.82;
      wrapDraw(W, H, x, baseY, 40, (X) => {
        const by = baseY - 12, bw = 22 * scale, bh = 30 * scale;
        // brazos
        g.strokeStyle = shadeHex(shirt, -0.15); g.lineWidth = 6 * scale; g.lineCap = 'round';
        g.beginPath();
        if (armsUp) { g.moveTo(X - bw * 0.4, by - bh * 0.8); g.lineTo(X - bw * 0.75, by - bh * 1.55); g.moveTo(X + bw * 0.4, by - bh * 0.8); g.lineTo(X + bw * 0.75, by - bh * 1.55); }
        else { g.moveTo(X - bw * 0.45, by - bh * 0.8); g.lineTo(X - bw * 0.6, by - bh * 0.25); g.moveTo(X + bw * 0.45, by - bh * 0.8); g.lineTo(X + bw * 0.6, by - bh * 0.25); }
        g.stroke();
        if (armsUp) { g.fillStyle = '#ffffff'; for (const s of [-1, 1]) { g.beginPath(); g.arc(X + s * bw * 0.75, by - bh * 1.58, 3.6 * scale, 0, 7); g.fill(); } }
        // cuerpo
        const sg = g.createLinearGradient(X - bw / 2, 0, X + bw / 2, 0); sg.addColorStop(0, shadeHex(shirt, 0.25)); sg.addColorStop(1, shadeHex(shirt, -0.3));
        g.fillStyle = sg; roundRect(g, X - bw / 2, by - bh, bw, bh, 9 * scale); g.fill();
        // cabeza
        const hy = by - bh - 9 * scale;
        const hg = g.createRadialGradient(X - 3, hy - 3, 1, X, hy, 11 * scale); hg.addColorStop(0, shadeHex(skin, 0.3)); hg.addColorStop(1, shadeHex(skin, -0.2));
        g.fillStyle = hg; g.beginPath(); g.arc(X, hy, 10 * scale, 0, 7); g.fill();
        // gorra / pelo
        g.fillStyle = hash(seed, 7, 101) > 0.5 ? shirt : '#3a2414';
        g.beginPath(); g.arc(X, hy - 2 * scale, 10 * scale, Math.PI * 1.05, Math.PI * 1.95); g.fill();
        // ojos
        g.fillStyle = '#1a1020'; g.fillRect(X - 4 * scale, hy, 2 * scale, 3 * scale); g.fillRect(X + 2 * scale, hy, 2 * scale, 3 * scale);
        if (flag) {
          g.strokeStyle = '#dddddd'; g.lineWidth = 2; g.beginPath(); g.moveTo(X + bw * 0.75, by - bh * 1.55); g.lineTo(X + bw * 0.75, by - bh * 2.6); g.stroke();
          g.fillStyle = P.crowdShirts[(i + r) % P.crowdShirts.length]; g.beginPath(); g.moveTo(X + bw * 0.75, by - bh * 2.6); g.lineTo(X + bw * 0.75 + 22, by - bh * 2.35); g.lineTo(X + bw * 0.75, by - bh * 2.1); g.fill();
        }
      });
    }
  }
  return c;
}

function kSkyTop(P) {
  const c = makeCanvas(4, 512), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 512);
  for (const [t, col] of P.sky) gr.addColorStop(t, col);
  g.fillStyle = gr; g.fillRect(0, 0, 4, 512);
  return c;
}

const _kartCache = {};
/**
 * Texturas para el juego de karts. `renderer` opcional: si se pasa, usa su anisotropía máxima.
 * Devuelve { asphalt, asphaltNormal, curb, startGrid, grass, sand, rock, lava, crystal, dirt, boostPad,
 *            gateBanner(letter,color), itemBoxFace, sponsorBanners:[...], crowd, skyTop, skyColors }
 */
export function getKartTextures(theme = 'overworld', renderer = null) {
  if (renderer && renderer.capabilities) setAnisotropy(renderer.capabilities.getMaxAnisotropy());
  if (!KP[theme]) theme = 'overworld';
  if (_kartCache[theme]) return _kartCache[theme];
  const P = KP[theme];
  const a = kAsphalt(P, true);
  const res = {
    asphalt: ktex(a.asphalt),
    asphaltNormal: ktex(a.asphaltNormal, { srgb: false }),   // normal map: datos lineales (NoColorSpace)
    curb: ktex(kCurb(P)),
    startGrid: ktex(kStartGrid()),
    grass: ktex(kGrass(P)),
    sand: ktex(kSand(P)),
    rock: ktex(kRock(P)),
    lava: ktex(kLava()),                    // animar con lava.offset.x/y += dt*k
    crystal: ktex(kCrystal(P)),
    dirt: ktex(kDirt(P)),
    boostPad: ktex(kBoostPad()),
    gateBanner,
    itemBoxFace: ktex(kItemBoxFace(), { repeat: false }),
    sponsorBanners: SPONSORS.map(sp => ktex(kSponsor(sp))),
    sponsorNames: SPONSORS.map(sp => sp.name),
    crowd: ktex(kCrowd(P)),
    skyTop: ktex(kSkyTop(P), { repeat: false }),
    skyColors: { stops: P.sky.map(s => s[1]), top: P.sky[0][1], horizon: P.sky[P.sky.length - 1][1], fog: P.fog, sun: P.sun },
  };
  _kartCache[theme] = res;
  return res;
}
