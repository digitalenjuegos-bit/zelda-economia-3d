// =============================================================================
//  Super Economía Bros. 3D — audio.js
//  Chip de sonido estilo NES (2A03) emulado con WebAudio puro, sin archivos.
//    · 2 canales de pulso (duty 12.5 / 25 / 50 % mediante PeriodicWave)
//    · 1 triángulo (bajos, bombo y toms)
//    · 1 canal de ruido (LFSR de 15 bits, modo largo y modo corto "metálico")
//  Música ORIGINAL compuesta para este juego (no son melodías de Nintendo).
//  Secuenciador con look-ahead (setInterval 25 ms + 0.12 s de ventana).
// =============================================================================

const LS_MUTE = 'seb3d_muted';

// ----------------------------------------------------------------------------
//  Utilidades musicales
// ----------------------------------------------------------------------------
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

function noteToMidi(s) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(s);
  if (!m) throw new Error('Nota inválida: ' + s);
  return 12 * (+m[3] + 1) + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
function pcOf(s) {
  return (PC[s[0]] + (s[1] === '#' ? 1 : s[1] === 'b' ? -1 : 0) + 12) % 12;
}

const QUALITIES = {
  '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11],
  dim: [0, 3, 6], dim7: [0, 3, 6, 9], m7b5: [0, 3, 6, 10], aug: [0, 4, 8],
  sus4: [0, 5, 7], sus2: [0, 2, 7], '6': [0, 4, 7, 9], m6: [0, 3, 7, 9],
};
function parseChordSym(sym) {
  const m = /^([A-G][#b]?)([a-z0-9]*)(?:\/([A-G][#b]?))?$/.exec(sym);
  if (!m || !(m[2] in QUALITIES)) throw new Error('Acorde inválido: ' + sym);
  const root = pcOf(m[1]);
  return { sym, root, tones: QUALITIES[m[2]], bass: m[3] ? pcOf(m[3]) : root };
}

// "E5:2 G5:1 r:2 | ..." → notas (en pasos de semicorchea). Valida compases.
function parseNotes(str, barLen, label) {
  const notes = [];
  let pos = 0, barStart = 0, barNo = 1;
  for (const tok of str.trim().split(/\s+/)) {
    if (!tok) continue;
    if (tok === '|') {
      if (barLen && pos - barStart !== barLen)
        throw new Error(`${label}: compás ${barNo} tiene ${pos - barStart} pasos (esperado ${barLen})`);
      barStart = pos; barNo++; continue;
    }
    const m = /^(r|[A-G][#b]?-?\d)(?::(\d+))?$/.exec(tok);
    if (!m) throw new Error(`${label}: token inválido "${tok}"`);
    const len = m[2] ? +m[2] : 2;
    if (m[1] !== 'r') notes.push({ s: pos, len, midi: noteToMidi(m[1]) });
    pos += len;
  }
  if (barLen && str.includes('|') && pos - barStart !== barLen && pos !== barStart)
    throw new Error(`${label}: último compás tiene ${pos - barStart} pasos (esperado ${barLen})`);
  return { notes, total: pos };
}

// "C:4 G7:2 Am" → acordes (duración en tiempos; por defecto 4)
function parseChords(str, spb) {
  const out = [];
  let pos = 0;
  for (const tok of str.trim().split(/\s+/)) {
    if (!tok || tok === '|') continue;
    const [sym, beats] = tok.split(':');
    const len = (beats ? +beats : 4) * spb;
    out.push({ s: pos, len, ...parseChordSym(sym) });
    pos += len;
  }
  return { list: out, total: pos };
}
const isExplicit = (s) => typeof s === 'string' && /^\s*([A-G][#b]?-?\d|r(:|\s|$))/.test(s);

// ----------------------------------------------------------------------------
//  Patrones de bajo (triángulo). R=fundamental 3=tercera 5=quinta 7=séptima
//  8=octava L=quinta abajo A=aproximación cromática al siguiente acorde
//  '.' = sostiene, '-' = silencio. [patrón 16 pasos, patrón 8 pasos]
// ----------------------------------------------------------------------------
const BASS_STYLES = {
  bounce: ['R.-5.-8-R.-5.-A-', 'R.-5.-A-'],
  walk:   ['R.-.3.-.5.-.A.-.', 'R.-.A.-.'],
  stacc:  ['R-R-8-R-5-R-8-A-', 'R-8-R-A-'],
  pedal:  ['R-R-R-R-8-R-R-A-', 'R-R-8-A-'],
  gallop: ['R-RR8-88R-RR5-A-', 'R-RR5-A-'],
  oct:    ['R-8-R-8-R-8-A-8-', 'R-8-A-8-'],
  title:  ['R...5...8.5.R.A.', 'R.5.A...'],
  drive:  ['R.R8R.R8R.R85.A.', 'R.R8A.5.'],
};

function placeRoot(pc, lo = 40) { // E2..D#3
  let m = 12 * 3 + pc; // octava 2
  while (m < lo) m += 12;
  while (m >= lo + 12) m -= 12;
  return m;
}

// ----------------------------------------------------------------------------
//  Compilador de canciones → eventos por paso
// ----------------------------------------------------------------------------
function swingWarp(spb, s) {
  const w = [];
  for (let k = 0; k <= spb; k++) {
    const p = k / spb;
    w.push(p < 0.5 ? p * (1 + 2 * s) : 0.5 + s + (p - 0.5) * (1 - 2 * s));
  }
  return w;
}

function compileSong(def) {
  const spb = def.spb || 4, bar = spb * (def.bpb || 4);
  const byStep = [];
  const add = (s, ev) => { (byStep[s] || (byStep[s] = [])).push(ev); };
  let pos = 0, loopStart = 0, secIndex = 0;

  for (const name of def.form) {
    if (name === '|:') { loopStart = pos; continue; }
    const sec = def.sections[name];
    if (!sec) throw new Error(`${def.name}: sección ${name} no existe`);
    const label = `${def.name}.${name}`;
    const lead = parseNotes(sec.lead, def.jingle ? 0 : bar, label + '.lead');
    const L = lead.total;
    const chords = sec.chords ? parseChords(sec.chords, spb) : null;
    if (chords && chords.total !== L) throw new Error(`${label}: acordes ${chords.total} ≠ melodía ${L}`);
    const chordAt = (s) => chords && (chords.list.find((c) => s >= c.s && s < c.s + c.len) || chords.list[chords.list.length - 1]);

    // --- melodía
    for (const n of lead.notes) add(pos + n.s, { ch: 'lead', midi: n.midi, len: n.len });

    // --- armonía (pulso 2) y contracanto (pulso 3, ampliación)
    const voices = [['harm', sec.harm !== undefined ? sec.harm : (def.harm || 'none')],
                    ['counter', sec.counter !== undefined ? sec.counter : (def.counter || 'none')]];
    for (const [CH, hm] of voices) {
    if (!hm || hm === 'none') continue;
    if (isExplicit(hm)) {
      const h = parseNotes(hm, def.jingle ? 0 : bar, label + '.' + CH);
      if (h.total !== L) throw new Error(`${label}: armonía ${h.total} ≠ ${L}`);
      for (const n of h.notes) add(pos + n.s, { ch: CH, midi: n.midi, len: n.len });
    } else if (hm.startsWith('third')) {
      if (!chords) throw new Error(label + ': "third" requiere acordes');
      for (const n of lead.notes) {
        const c = chordAt(n.s);
        const pcs = c.tones.map((i) => (c.root + i) % 12);
        let hmidi = n.midi - 12;
        for (let m = n.midi - 3; m >= n.midi - 9; m--) if (pcs.includes(((m % 12) + 12) % 12)) { hmidi = m; break; }
        add(pos + n.s, { ch: CH, midi: hmidi, len: n.len });
      }
    } else if (hm.startsWith('echo')) {
      const d = +(hm.split(':')[1] || 3);
      for (const n of lead.notes) if (n.s + d < L) add(pos + n.s + d, { ch: CH, midi: n.midi, len: Math.min(n.len, L - n.s - d) });
    } else if (hm.startsWith('arp')) {
      if (!chords) throw new Error(label + ': "arp" requiere acordes');
      const [, type = 'up', rate = '1', base = '60'] = hm.split(':');
      const r = +rate;
      for (const c of chords.list) {
        let root = c.root + +base; while (root >= +base + 12) root -= 12;
        const t = c.tones.slice(0, 3).map((i) => root + i);
        const seq = type === 'trem' ? [t[1], t[2]]
          : type === 'down' ? [root + 12, t[2], t[1], t[0]]
          : type === 'updown' ? [t[0], t[1], t[2], root + 12, t[2], t[1]]
          : [t[0], t[1], t[2], root + 12];
        for (let k = 0; k * r < c.len; k++) add(pos + c.s + k * r, { ch: CH, midi: seq[k % seq.length], len: r });
      }
    } else if (hm.startsWith('comp')) {
      if (!chords) throw new Error(label + ': "comp" requiere acordes');
      const pat = hm.split(':')[1] || '--x---x---x---x-';
      for (let i = 0; i < L; i++) {
        if (pat[i % pat.length] !== 'x') continue;
        let len = 1; while (i + len < L && pat[(i + len) % pat.length] === '.') len++;
        const c = chordAt(i);
        let root = c.root + 64; while (root >= 76) root -= 12;
        add(pos + i, { ch: CH, midi: root, len, arp: c.tones.slice(0, 3).map((k) => root + k) });
      }
    }
    }

    // --- bajo (triángulo)
    const bm = sec.bass !== undefined ? sec.bass : (def.bass || 'none');
    if (isExplicit(bm)) {
      const b = parseNotes(bm, def.jingle ? 0 : bar, label + '.bass');
      if (b.total !== L) throw new Error(`${label}: bajo ${b.total} ≠ ${L}`);
      for (const n of b.notes) add(pos + n.s, { ch: 'bass', midi: n.midi, len: n.len });
    } else if (bm !== 'none' && chords) {
      chords.list.forEach((c, ci) => {
        const next = chords.list[ci + 1] || def._nextChord || chords.list[0];
        const r = placeRoot(c.bass);
        if (bm === 'hold') { add(pos + c.s, { ch: 'bass', midi: r, len: c.len }); return; }
        const st = BASS_STYLES[bm];
        if (!st) throw new Error(`${label}: estilo de bajo ${bm}`);
        const pat = c.len >= 16 ? st[0] : st[1];
        const tone = (code, i) => {
          switch (code) {
            case 'R': return r;
            case '3': return r + c.tones[1];
            case '5': return r + c.tones[2];
            case '7': return r + (c.tones[3] || 12);
            case '8': return r + 12;
            case 'L': return r - 5 < 36 ? r + 7 : r - 5;
            case 'A': {
              const tgtPc = (i + 2 >= c.len) ? next.bass : c.bass;
              let T = placeRoot(tgtPc, r - 6);
              return T - 1 === r ? T + 1 : T - 1;
            }
          }
          return r;
        };
        for (let i = 0; i < c.len; i++) {
          const ch = pat[i % pat.length];
          if (ch === '.' || ch === '-') continue;
          let len = 1; while (i + len < c.len && pat[(i + len) % pat.length] === '.') len++;
          const code = (ch === 'A' && c.len < 8) ? '5' : ch;
          add(pos + c.s + i, { ch: 'bass', midi: tone(code, i), len });
        }
      });
    }

    // --- batería (ruido + triángulo)
    const dm = (sec.drums !== undefined ? sec.drums : (def.drums || '')).replace(/\s+/g, '');
    if (dm) {
      const fill = sec.fill === false ? null : (def.fill || null);
      for (let i = 0; i < L; i++) {
        let c = dm[i % dm.length];
        if (fill && L >= 32 && i >= L - bar) c = fill[(i - (L - bar)) % fill.length];
        if (i === 0 && def.crash && !def.jingle) add(pos, { ch: 'drum', drum: 'c', len: 1 });
        if ('kshocTt'.includes(c)) add(pos + i, { ch: 'drum', drum: c, len: 1 });
      }
    }
    pos += L; secIndex++;
  }

  const warp = swingWarp(spb, def.swing || 0);
  const beat = 60 / def.bpm;
  let totalTime = 0;
  for (let i = 0; i < pos; i++) totalTime += beat * (warp[(i % spb) + 1] - warp[i % spb]);
  return { name: def.name, bpm: def.bpm, beat, spb, warp, length: pos, loopStart, byStep, inst: def.inst, totalTime, echo: def.echo || null };
}

// ----------------------------------------------------------------------------
//  Instrumentos por defecto
// ----------------------------------------------------------------------------
const I = {
  lead25: { duty: 'p25', vol: 0.15, sus: 0.72, decay: 0.09, gate: 0.88, vib: 18, vibDelay: 0.16 },
  lead50: { duty: 'p50', vol: 0.13, sus: 0.7, decay: 0.09, gate: 0.88, vib: 18, vibDelay: 0.16 },
  harm50: { duty: 'p50', vol: 0.075, sus: 0.6, decay: 0.07, gate: 0.78 },
  harm25: { duty: 'p25', vol: 0.08, sus: 0.6, decay: 0.07, gate: 0.78 },
  harm12: { duty: 'p12', vol: 0.085, sus: 0.65, decay: 0.06, gate: 0.75 },
  bass:   { wave: 'tri', vol: 0.34, gate: 0.82, rel: 0.02 },
  bassSt: { wave: 'tri', vol: 0.36, gate: 0.5, rel: 0.015 },
};
const inst = (lead, harm, bass, drums = 1, extra = {}) => ({
  lead: { ...lead, ...(extra.lead || {}) }, harm: { ...harm, ...(extra.harm || {}) }, bass: { ...bass, ...(extra.bass || {}) }, drums: { vol: drums },
  counter: { duty: 'p12', vol: 0.05, sus: 0.6, decay: 0.05, gate: 0.6, ...(extra.counter || {}) },
});

// ----------------------------------------------------------------------------
//  PISTAS (composición original)
// ----------------------------------------------------------------------------
const SONGS = {
  // ---------------------------------------------------------------- OVERWORLD
  overworld: {
    name: 'overworld', bpm: 180, swing: 0.08, bass: 'bounce', harm: 'third',
    drums: 'k-h-s-h-k-hks-h-', fill: 'k-h-s-h-ksssT-t-', crash: true,
    inst: inst(I.lead25, I.harm50, I.bass, 0.85),
    form: ['I', '|:', 'A', 'A2', 'B', 'C', 'A2'],
    sections: {
      I: {
        chords: 'C G7', drums: 'k---k---k---k-ss', fill: false,
        lead: 'C5:2 E5:2 G5:2 C6:2 r:2 G5:2 C6:4 | B5:2 G5:2 D5:2 B4:2 G4:2 r:2 G4:1 A4:1 B4:2',
      },
      A: {
        chords: 'C C F C Am D7 G G7',
        lead: 'G5:2 E5:1 G5:3 C6:2 r:2 B5:2 G5:2 r:2 | A5:2 G5:2 E5:2 C5:2 D5:3 E5:3 r:2 | ' +
              'F5:2 A5:1 C6:3 A5:2 F5:2 r:2 A5:2 G5:2 | E5:3 C5:3 G4:2 r:4 E5:1 F5:1 G5:2 | ' +
              'A5:2 r:1 A5:1 C6:2 A5:2 E5:3 A5:3 r:2 | F#5:2 A5:2 C6:2 D6:2 C6:2 A5:2 F#5:2 D5:2 | ' +
              'G5:3 F5:1 r:2 D5:2 B4:2 D5:2 G5:4 | F5:2 E5:2 D5:2 B4:2 G4:4 r:4',
      },
      A2: {
        chords: 'C C F C Am D7 G7 C',
        lead: 'G5:2 E5:1 G5:3 C6:2 r:2 B5:2 G5:2 r:2 | A5:2 G5:2 E5:2 C5:2 D5:3 E5:3 r:2 | ' +
              'F5:2 A5:1 C6:3 A5:2 F5:2 r:2 A5:2 G5:2 | E5:3 C5:3 G4:2 r:4 E5:1 F5:1 G5:2 | ' +
              'A5:2 r:1 A5:1 C6:2 A5:2 E5:3 A5:3 r:2 | F#5:2 A5:2 C6:2 D6:2 C6:2 A5:2 F#5:2 D5:2 | ' +
              'G5:2 A5:1 G5:1 F5:2 D5:2 B4:2 D5:2 F5:2 A5:2 | C6:3 G5:3 E5:2 C5:4 r:4',
      },
      B: {
        chords: 'F G Em Am Dm7 G7 C C7', harm: 'comp:--x.--x.--x.--x.',
        lead: 'r:2 C6:1 C6:1 r:2 A5:2 r:2 C6:2 A5:2 F5:2 | r:2 D6:1 D6:1 r:2 B5:2 r:2 D6:2 B5:2 G5:2 | ' +
              'E5:2 G5:2 B5:2 E6:2 D6:3 B5:3 G5:2 | A5:4 r:2 E5:2 A5:2 B5:2 C6:4 | ' +
              'D6:2 C6:2 A5:2 F5:2 C6:2 A5:2 F5:2 D5:2 | G5:3 B5:3 D6:2 F6:4 E6:2 D6:2 | ' +
              'E6:3 C6:3 G5:2 E5:2 G5:2 C6:2 E6:2 | Bb5:2 r:2 Bb5:2 A5:2 G5:2 E5:2 C5:2 r:2',
      },
      C: {
        chords: 'Ab Bb C C Ab Bb G7 G7',
        lead: 'Eb5:2 Ab5:2 C6:2 Eb6:4 C6:2 Ab5:2 r:2 | D6:3 Bb5:3 F5:2 D6:2 F6:4 r:2 | ' +
              'G6:2 E6:1 C6:1 r:2 E6:2 G6:3 A6:1 G6:2 E6:2 | G6:6 r:2 E6:1 D6:1 C6:2 G5:4 | ' +
              'C6:2 Ab5:2 Eb5:2 Ab5:2 C6:2 Eb6:2 C6:2 Ab5:2 | D6:2 Bb5:2 F5:2 Bb5:2 D6:2 F6:2 D6:2 Bb5:2 | ' +
              'B5:3 D6:3 F6:2 G6:2 F6:2 D6:2 B5:2 | G5:2 r:2 G5:2 A5:1 B5:1 C6:2 D6:2 r:4',
      },
    },
  },

  // ---------------------------------------------------------------- TITLE
  title: {
    name: 'title', bpm: 138, swing: 0, bass: 'title', harm: 'arp:updown:1:60',
    drums: 'k---s---k-k-s---', fill: 'k---s---k-s-sTtT', crash: true,
    inst: inst(I.lead50, { ...I.harm12, vol: 0.06, gate: 0.6 }, I.bass, 0.7),
    form: ['A', 'B'],
    sections: {
      A: {
        chords: 'G Em C D G Em Am7 D7',
        lead: 'D5:2 G5:2 B5:4 A5:2 G5:2 D5:4 | E5:2 G5:2 B5:4 D6:4 B5:4 | C6:3 B5:3 A5:2 G5:2 E5:2 C5:4 | ' +
              'D5:2 F#5:2 A5:2 D6:2 C6:4 A5:4 | B5:4 D6:2 B5:2 G5:4 A5:2 B5:2 | C6:4 B5:2 A5:2 G5:4 E5:4 | ' +
              'A5:2 C6:2 E6:2 D6:2 C6:2 A5:2 G5:2 E5:2 | F#5:4 A5:4 D5:8',
      },
      B: {
        chords: 'C D Bm Em C D G G',
        lead: 'E5:2 G5:2 C6:3 B5:1 A5:2 G5:2 E5:4 | F#5:2 A5:2 D6:3 C6:1 B5:2 A5:2 F#5:4 | ' +
              'B5:3 A5:3 G5:2 F#5:2 G5:2 A5:4 | B5:4 G5:4 E5:4 G5:4 | E6:4 D6:2 C6:2 B5:4 A5:4 | ' +
              'A5:2 B5:2 C6:2 D6:2 F#5:4 A5:4 | G5:8 B5:4 D6:4 | G6:8 r:8',
      },
    },
  },

  // ---------------------------------------------------------------- FOREST
  forest: {
    name: 'forest', bpm: 150, swing: 0.12, bass: 'walk', harm: 'echo:3',
    drums: 'k--hs-h-k-hks--h', fill: 'k--hs-h-ksTsTtTt', crash: true,
    inst: inst({ ...I.lead50, vib: 22 }, { ...I.harm25, vol: 0.06 }, I.bass, 0.75),
    form: ['A', 'B', 'A', 'B'],
    sections: {
      A: {
        chords: 'F C/E Dm Bb F Gm7 C7 C7',
        lead: 'C5:2 F5:2 A5:3 G5:1 F5:2 A5:2 C6:4 | Bb5:3 A5:1 G5:4 E5:2 G5:2 C5:4 | ' +
              'D5:2 F5:2 A5:2 D6:2 C6:3 A5:3 F5:2 | G5:6 F5:2 D5:4 Bb4:4 | ' +
              'A4:2 C5:2 F5:3 G5:1 A5:2 C6:2 F6:4 | D6:3 C6:1 Bb5:2 A5:2 G5:4 Bb5:4 | ' +
              'A5:2 G5:2 F5:2 E5:2 G5:2 C6:2 Bb5:4 | G5:4 E5:4 C5:4 r:4',
      },
      B: {
        chords: 'Bb C Am Dm Gm C F F:2 C7:2', harm: 'third',
        lead: 'F5:2 Bb5:2 D6:4 C6:2 Bb5:2 F5:4 | G5:2 C6:2 E6:4 D6:2 C6:2 G5:4 | ' +
              'A5:3 C6:3 E6:2 D6:2 C6:2 A5:4 | D6:6 C6:2 A5:4 F5:4 | ' +
              'G5:2 Bb5:2 D6:2 G6:2 F6:3 D6:3 Bb5:2 | C6:4 E6:4 G6:4 E6:4 | ' +
              'F6:3 C6:3 A5:2 C6:2 F5:2 A5:4 | G5:2 A5:2 Bb5:2 C6:2 E5:2 G5:2 Bb5:4',
      },
    },
  },

  // ---------------------------------------------------------------- UNDERGROUND
  underground: {
    name: 'underground', bpm: 132, swing: 0, bass: 'stacc', harm: 'echo:2',
    drums: 'k-------s---k-h-', fill: 'k-------s-k-sTtt', crash: false,
    inst: inst({ ...I.lead50, gate: 0.55, sus: 0.5, decay: 0.05, vib: 0 }, { ...I.harm12, vol: 0.05, gate: 0.5 }, I.bassSt, 0.7),
    form: ['A', 'B', 'A', 'B'],
    sections: {
      A: {
        chords: 'Em Em C B7 Em Am Bb B7',
        lead: 'E5:1 r:1 E5:1 r:1 B4:1 r:1 E5:1 r:3 G5:1 r:1 F#5:1 r:1 E5:1 r:1 | D5:1 r:1 E5:1 r:1 B4:2 r:2 r:8 | ' +
              'C5:1 r:1 C5:1 r:1 G4:1 r:1 C5:1 r:3 E5:1 r:1 D5:1 r:1 C5:1 r:1 | ' +
              'B4:1 r:1 D#5:1 r:1 F#5:2 r:2 A5:1 r:1 G5:1 r:1 F#5:1 r:1 D#5:1 r:1 | ' +
              'E5:1 r:1 E5:1 r:1 B4:1 r:1 E5:1 r:3 G5:1 r:1 F#5:1 r:1 E5:1 r:1 | ' +
              'A4:1 r:1 C5:1 r:1 E5:1 r:1 A5:1 r:3 G5:1 r:1 E5:1 r:1 C5:1 r:1 | ' +
              'Bb4:1 r:1 D5:1 r:1 F5:1 r:1 Bb5:1 r:3 A5:1 r:1 F5:1 r:1 D5:1 r:1 | ' +
              'B4:2 r:2 F#5:2 r:2 B5:1 r:1 A5:1 r:1 F#5:1 r:1 D#5:1 r:1',
      },
      B: {
        chords: 'Cmaj7 B7 Em Em Am F#dim B7 B7',
        lead: 'G5:2 r:2 F#5:2 r:2 G5:1 r:1 E5:1 r:1 C5:4 | F#5:2 r:2 F5:2 r:2 F#5:1 r:1 D#5:1 r:1 B4:4 | ' +
              'E5:1 G5:1 B5:1 E6:1 r:4 D6:1 r:1 B5:1 r:1 G5:2 r:2 | r:8 E4:1 r:1 F#4:1 r:1 G4:1 r:1 A4:1 B4:1 | ' +
              'C6:2 r:2 B5:2 r:2 C6:1 r:1 A5:1 r:1 E5:4 | A5:2 r:2 C6:2 r:2 A5:1 r:1 F#5:1 r:1 C5:4 | ' +
              'B4:1 r:1 B4:1 r:1 C5:1 r:1 C#5:1 r:1 D5:1 r:1 D#5:1 r:1 E5:1 r:1 F#5:1 r:1 | B5:2 r:6 r:4 F#4:1 r:1 B4:1 r:1',
      },
    },
  },

  // ---------------------------------------------------------------- CASTLE
  castle: {
    name: 'castle', bpm: 140, swing: 0, bass: 'pedal', harm: 'arp:trem:1:60',
    drums: 'k-hhs-hhk-hhs-hh', fill: 'k-hhs-hhkTsTtTtt', crash: true,
    inst: inst({ ...I.lead25, sus: 0.8, vib: 26 }, { ...I.harm12, vol: 0.055, gate: 0.6 }, { ...I.bass, gate: 0.6 }, 0.7),
    form: ['A', 'B', 'A', 'B'],
    sections: {
      A: {
        chords: 'Cm Cm Db Db Cm Cm Bdim7 G7',
        lead: 'C5:4 Eb5:4 D5:2 Db5:2 C5:4 | G5:6 F#5:2 G5:2 Ab5:2 G5:4 | Db5:4 F5:4 E5:2 Eb5:2 Db5:4 | ' +
              'Ab5:6 G5:2 Ab5:2 A5:2 Bb5:4 | C6:4 B5:2 Bb5:2 A5:4 Ab5:4 | G5:4 F#5:2 F5:2 E5:4 Eb5:4 | ' +
              'D5:2 F5:2 Ab5:2 B5:2 D6:4 B5:4 | G5:2 r:2 G5:2 r:2 G5:1 Ab5:1 G5:1 F#5:1 G5:4',
      },
      B: {
        chords: 'Ab G Fm G7 Ab Bbm Db G7',
        lead: 'Eb6:4 C6:4 Ab5:4 C6:4 | D6:4 B5:4 G5:4 B5:4 | C6:3 Ab5:3 F5:2 Ab5:2 C6:2 F6:4 | ' +
              'F6:2 Eb6:2 D6:2 C6:2 B5:4 G5:4 | C6:2 Eb6:2 Ab6:4 G6:2 F6:2 Eb6:4 | ' +
              'Db6:2 F6:2 Bb5:4 A5:4 Ab5:4 | F5:4 Ab5:4 Db6:4 C6:4 | B5:2 D6:2 F6:2 Ab6:2 G6:8',
      },
    },
  },

  // ---------------------------------------------------------------- BOSS
  boss: {
    name: 'boss', bpm: 168, swing: 0, bass: 'gallop', harm: 'third',
    drums: 'k-hks-hkk-hks-ss', fill: 'k-hks-hkkTsTtTss', crash: true,
    inst: inst({ ...I.lead25, vol: 0.14, vib: 14 }, I.harm50, { ...I.bass, gate: 0.7 }, 0.8),
    form: ['A', 'B', 'A', 'B'],
    sections: {
      A: {
        chords: 'Am F G E7 Am F G E7',
        lead: 'A5:2 A5:1 A5:1 C6:2 A5:2 E6:3 D6:3 C6:2 | F5:2 F5:1 F5:1 A5:2 F5:2 C6:3 Bb5:3 A5:2 | ' +
              'G5:2 G5:1 G5:1 B5:2 G5:2 D6:3 C6:3 B5:2 | G#5:2 B5:2 D6:2 E6:2 F6:2 E6:2 D6:2 B5:2 | ' +
              'E6:2 r:1 E6:1 D6:2 C6:2 B5:2 C6:2 A5:4 | F6:2 r:1 F6:1 E6:2 D6:2 C6:2 D6:2 A5:4 | ' +
              'G6:2 F6:2 E6:2 D6:2 B5:2 D6:2 G5:4 | E6:1 D#6:1 E6:1 F6:1 E6:1 D#6:1 E6:1 G#6:1 B6:4 E6:4',
      },
      B: {
        chords: 'Dm Am Bb E7', harm: 'arp:trem:1:62',
        lead: 'D6:3 A5:3 F5:2 D6:3 E6:3 F6:2 | E6:3 C6:3 A5:2 E6:3 F6:3 E6:2 | ' +
              'D6:3 Bb5:3 F5:2 D6:2 F6:2 Bb6:4 | G#6:4 F6:2 D6:2 B5:2 G#5:2 E5:4',
      },
    },
  },

  // ---------------------------------------------------------------- STAR
  star: {
    name: 'star', bpm: 200, swing: 0, bass: 'oct', harm: 'third',
    drums: 'k-h-s-hkk-h-s-hs', fill: 'k-h-s-hkkTsTtTss', crash: true,
    inst: inst({ ...I.lead25, vib: 0, gate: 0.8 }, { ...I.harm50, vol: 0.07 }, { ...I.bass, gate: 0.6 }, 0.8),
    form: ['A', 'B'],
    sections: {
      A: {
        chords: 'F Eb Db C F Eb Db C7',
        lead: 'F5:1 A5:1 C6:2 A5:1 C6:1 F6:2 E6:1 F6:1 r:1 C6:1 A5:2 C6:2 | ' +
              'Eb5:1 G5:1 Bb5:2 G5:1 Bb5:1 Eb6:2 D6:1 Eb6:1 r:1 Bb5:1 G5:2 Bb5:2 | ' +
              'Db5:1 F5:1 Ab5:2 F5:1 Ab5:1 Db6:2 C6:1 Db6:1 r:1 Ab5:1 F5:2 Ab5:2 | ' +
              'C6:2 E6:2 G6:2 r:1 G6:1 F6:2 E6:2 D6:2 Bb5:2 | ' +
              'F5:1 A5:1 C6:2 A5:1 C6:1 F6:2 E6:1 F6:1 r:1 C6:1 A5:2 C6:2 | ' +
              'Eb5:1 G5:1 Bb5:2 G5:1 Bb5:1 Eb6:2 D6:1 Eb6:1 r:1 Bb5:1 G5:2 Bb5:2 | ' +
              'Db5:1 F5:1 Ab5:2 F5:1 Ab5:1 Db6:2 C6:1 Db6:1 r:1 Ab5:1 F5:2 Ab5:2 | ' +
              'C6:1 r:1 C6:1 r:1 E6:1 r:1 G6:4 Bb6:2 G6:2 E6:2',
      },
      B: {
        chords: 'Bb C Bb C Dm C Bb C',
        lead: 'D6:2 F6:2 r:1 D6:1 Bb5:2 F6:3 D6:3 Bb5:2 | E6:2 G6:2 r:1 E6:1 C6:2 G6:3 E6:3 C6:2 | ' +
              'D6:2 F6:2 r:1 D6:1 Bb5:2 F6:3 D6:3 Bb5:2 | E6:2 G6:2 C7:4 Bb6:2 G6:2 E6:4 | ' +
              'F6:2 E6:2 D6:2 A5:2 F6:2 E6:2 D6:4 | E6:2 D6:2 C6:2 G5:2 E6:2 D6:2 C6:4 | ' +
              'D6:2 C6:2 Bb5:2 F5:2 D6:2 C6:2 Bb5:4 | C6:1 r:1 C6:1 r:1 C6:1 r:1 C6:1 r:1 E6:2 F6:2 G6:4',
      },
    },
  },
};

// ----------------------------------------------------------------------------
//  PISTAS DE KARTS (ampliación) — composición original, chip enriquecido:
//  3 pulsos (melodía, armonía, contracanto) + triángulo + ruido, panorama y eco.
// ----------------------------------------------------------------------------
const KART_RACE_DRUMS = 'k-h-s-hkk-hks-hh';
const KART_SONGS = {
  // ------------------------------------------------------------ RACE OVERWORLD
  raceOverworld: {
    name: 'raceOverworld', bpm: 160, swing: 0.04, bass: 'drive', harm: 'third', counter: 'arp:up:2:62',
    drums: KART_RACE_DRUMS, fill: 'k-h-s-hkTsTsTtss', crash: true,
    echo: { beats: 0.75, fb: 0.22, mix: 0.14 },
    inst: inst({ ...I.lead25, vol: 0.14, pan: 0.08, layers: [{ duty: 'p12', oct: 12, vol: 0.18 }] },
      { ...I.harm50, vol: 0.07, pan: -0.3 }, { ...I.bass, gate: 0.7 }, 0.85, { counter: { duty: 'p12', vol: 0.045, pan: 0.35, gate: 0.5 } }),
    form: ['I', '|:', 'A', 'A2', 'B', 'C', 'A2'],
    sections: {
      I: { chords: 'D A7', drums: 'k---k---k---ksss', fill: false, counter: 'none',
        lead: 'D5:1 r:1 D5:1 r:1 D5:1 r:3 D5:1 F#5:1 A5:1 D6:1 r:4 | A5:1 r:1 A5:1 r:1 A5:1 r:3 C#6:1 E6:1 G6:1 A6:1 r:4' },
      A: { chords: 'D Bm G A D Bm Em7 A7',
        lead: 'A5:2 D6:2 F#6:3 E6:1 D6:2 A5:2 F#5:2 A5:2 | B5:3 A5:1 F#5:2 D5:2 F#5:2 B5:2 D6:4 | ' +
              'G5:2 B5:2 D6:2 G6:2 F#6:2 E6:2 D6:2 B5:2 | C#6:3 E6:3 A6:2 G6:2 F#6:2 E6:4 | ' +
              'F#6:2 r:1 F#6:1 E6:2 D6:2 A5:3 D6:3 F#6:2 | D6:2 r:1 D6:1 C#6:2 B5:2 F#5:3 B5:3 D6:2 | ' +
              'E6:2 G6:2 B6:2 A6:2 G6:2 E6:2 D6:2 B5:2 | C#6:2 E6:2 A5:2 C#6:2 E6:4 r:4' },
      A2: { chords: 'D Bm G A D Bm Em7:2 A7:2 D',
        lead: 'A5:2 D6:2 F#6:3 E6:1 D6:2 A5:2 F#5:2 A5:2 | B5:3 A5:1 F#5:2 D5:2 F#5:2 B5:2 D6:4 | ' +
              'G5:2 B5:2 D6:2 G6:2 F#6:2 E6:2 D6:2 B5:2 | C#6:3 E6:3 A6:2 G6:2 F#6:2 E6:4 | ' +
              'F#6:2 r:1 F#6:1 E6:2 D6:2 A5:3 D6:3 F#6:2 | D6:2 r:1 D6:1 C#6:2 B5:2 F#5:3 B5:3 D6:2 | ' +
              'E6:2 G6:2 B6:2 A6:2 G6:2 E6:2 C#6:2 E6:2 | D6:6 A5:2 D6:2 F#6:2 A6:4' },
      B: { chords: 'G A F#m Bm Em F#7 Bm A7', harm: 'comp:--x.--x.--x.-xx.',
        lead: 'r:2 B5:1 D6:1 r:2 G6:2 r:2 F#6:2 E6:2 D6:2 | r:2 C#6:1 E6:1 r:2 A6:2 r:2 G6:2 F#6:2 E6:2 | ' +
              'F#6:3 C#6:3 A5:2 C#6:2 F#6:2 A6:4 | B6:4 A6:2 F#6:2 D6:4 B5:4 | ' +
              'G6:2 F#6:2 E6:2 B5:2 G5:2 B5:2 E6:4 | A#5:2 C#6:2 E6:2 F#6:2 A#6:4 F#6:4 | ' +
              'B6:3 F#6:3 D6:2 B5:2 D6:2 F#6:4 | E6:2 C#6:2 A5:2 G5:2 A5:1 B5:1 C#6:2 E6:4' },
      C: { chords: 'Bb C D D Bb C E7 A7', counter: 'arp:updown:1:62',
        lead: 'D6:4 F6:4 Bb6:6 A6:2 | G6:4 E6:4 C6:6 E6:2 | F#6:3 A6:3 D7:10 | r:4 A6:2 F#6:2 D6:2 A5:2 D6:2 F#6:2 | ' +
              'F6:2 D6:2 Bb5:2 D6:2 F6:2 Bb6:2 A6:2 F6:2 | G6:2 E6:2 C6:2 E6:2 G6:2 C7:2 Bb6:2 G6:2 | ' +
              'G#6:3 B6:3 E7:4 D7:2 B6:2 G#6:2 | A6:2 r:2 A6:1 r:1 A6:1 r:1 G6:2 E6:2 C#6:4' },
    },
  },

  // ------------------------------------------------------------ RACE FOREST
  raceForest: {
    name: 'raceForest', bpm: 150, swing: 0.14, bass: 'walk', harm: 'third', counter: 'comp:--x.--x.--x.--x.',
    drums: 'k--hs-h-k-hks--h', fill: 'k--hs-h-ksTsTtTt', crash: true,
    echo: { beats: 0.75, fb: 0.28, mix: 0.16 },
    inst: inst({ ...I.lead50, vol: 0.13, vib: 22, pan: 0.05 }, { ...I.harm25, vol: 0.065, pan: -0.3 }, I.bass, 0.75,
      { counter: { duty: 'p25', vol: 0.045, gate: 0.6, pan: 0.35 } }),
    form: ['A', 'B', 'A', 'C', 'B'],
    sections: {
      A: { chords: 'G D/F# Em C G D/F# C D',
        lead: 'D5:2 G5:2 B5:4 A5:2 B5:1 A5:1 G5:4 | F#5:2 A5:2 D6:4 C6:2 B5:2 A5:4 | G5:3 B5:3 E6:2 D6:3 B5:3 G5:2 | ' +
              'E5:2 G5:2 C6:2 E6:2 D6:4 C6:4 | B5:2 D6:2 G6:4 F#6:2 E6:2 D6:4 | A5:2 D6:2 F#6:4 E6:2 D6:2 A5:4 | ' +
              'C6:2 E6:2 G6:3 F#6:1 E6:2 C6:2 E6:4 | D6:4 C6:2 A5:2 F#5:4 D5:4' },
      B: { chords: 'Em C G D Em C Am7 D7',
        lead: 'B5:2 r:1 B5:1 G5:2 E5:2 G5:2 B5:2 E6:4 | C6:2 r:1 C6:1 G5:2 E5:2 G5:2 C6:2 E6:4 | ' +
              'D6:3 B5:3 G5:2 B5:2 D6:2 G6:4 | F#6:6 E6:2 D6:4 A5:4 | E6:2 F#6:2 G6:4 F#6:2 E6:2 B5:4 | ' +
              'C6:2 D6:2 E6:4 D6:2 C6:2 G5:4 | A5:2 C6:2 E6:2 G6:2 F#6:2 E6:2 C6:4 | D6:3 C6:3 A5:2 F#5:4 A5:2 C6:2' },
      C: { chords: 'Eb F G G Eb F Am D7', counter: 'arp:up:1:62',
        lead: 'G5:2 Bb5:2 Eb6:4 D6:2 Eb6:2 G6:4 | A5:2 C6:2 F6:4 E6:2 F6:2 A6:4 | B6:6 A6:2 G6:4 D6:4 | ' +
              'B5:2 D6:2 G6:2 B6:2 D7:8 | Bb6:3 G6:3 Eb6:2 Bb5:2 Eb6:2 G6:4 | C7:3 A6:3 F6:2 C6:2 F6:2 A6:4 | ' +
              'C7:2 B6:2 A6:2 E6:2 C6:2 E6:2 A6:4 | F#6:2 r:2 F#6:2 A6:2 D7:4 C7:4' },
    },
  },

  // ------------------------------------------------------------ RACE CAVE
  raceCave: {
    name: 'raceCave', bpm: 140, swing: 0, bass: 'stacc', harm: 'echo:3', counter: 'arp:updown:1:72',
    drums: 'k--h--h-s--h-kh-', fill: 'k--h--h-s-TsTtTt', crash: true,
    echo: { beats: 0.75, fb: 0.42, mix: 0.3, lp: 3000 },
    inst: inst({ ...I.lead50, vol: 0.13, sus: 0.8, vib: 24, pan: -0.05 }, { ...I.harm25, vol: 0.05, pan: 0.4 }, I.bassSt, 0.7,
      { counter: { duty: 'p12', vol: 0.04, gate: 0.45, pan: -0.4 } }),
    form: ['A', 'B', 'C', 'A', 'B'],
    sections: {
      A: { chords: 'Am Fmaj7 Dm7 E7 Am Fmaj7 Bm7b5 E7',
        lead: 'E5:4 A5:4 B5:2 C6:2 B5:4 | A5:6 G5:2 E5:4 C5:4 | D5:4 F5:4 A5:2 C6:2 A5:4 | G#5:6 B5:2 D6:4 B5:4 | ' +
              'E6:4 C6:4 D6:2 E6:2 A5:4 | F6:6 E6:2 C6:4 A5:4 | D6:4 F6:4 A6:2 F6:2 D6:4 | B5:4 G#5:4 E5:8' },
      B: { chords: 'Fmaj7 G Em7 Am Dm7 G Cmaj7 E7',
        lead: 'C6:2 r:2 A5:2 r:2 E6:4 C6:4 | D6:2 r:2 B5:2 r:2 G6:4 D6:4 | B5:3 D6:3 G6:2 F#6:4 E6:4 | E6:8 r:4 C6:2 B5:2 | ' +
              'A5:2 r:2 F5:2 r:2 C6:4 A5:4 | B5:2 r:2 G5:2 r:2 D6:4 B5:4 | E6:3 G6:3 B6:2 A6:4 G6:4 | G#6:4 E6:4 D6:2 B5:2 G#5:4' },
      C: { chords: 'Bb C Bb C Dm Bb Esus4 E7', counter: 'arp:up:1:74',
        lead: 'F5:2 Bb5:2 D6:4 F6:4 D6:4 | G5:2 C6:2 E6:4 G6:4 E6:4 | F6:3 D6:3 Bb5:2 D6:2 F6:2 Bb6:4 | ' +
              'G6:3 E6:3 C6:2 E6:2 G6:2 C7:4 | A6:6 G6:2 F6:4 D6:4 | D6:2 F6:2 Bb6:4 A6:4 F6:4 | ' +
              'A6:4 E6:4 B5:4 A5:4 | G#5:2 B5:2 D6:2 E6:2 G#6:8' },
    },
  },

  // ------------------------------------------------------------ RACE CASTLE
  raceCastle: {
    name: 'raceCastle', bpm: 156, swing: 0, bass: 'gallop', harm: 'third', counter: 'arp:up:1:62',
    drums: 'k-hks-hkk-hks-hh', fill: 'k-hks-hkkTsTtTss', crash: true,
    echo: { beats: 0.5, fb: 0.25, mix: 0.15 },
    inst: inst({ ...I.lead25, vol: 0.12, sus: 0.85, vib: 20, pan: 0.05, layers: [{ duty: 'p50', oct: -12, vol: 0.55 }, { duty: 'p12', oct: 12, detune: 6, vol: 0.25 }] },
      { ...I.harm50, vol: 0.06, sus: 0.8, gate: 0.85, pan: -0.3, layers: [{ duty: 'p25', oct: -12, vol: 0.4 }] },
      { ...I.bass, gate: 0.7 }, 0.8, { counter: { duty: 'p12', vol: 0.04, gate: 0.55, pan: 0.4 } }),
    form: ['A', 'B', 'A', 'C', 'B'],
    sections: {
      A: { chords: 'Dm Bb C A7 Dm Bb Gm A7',
        lead: 'D5:2 F5:2 A5:2 D6:6 C6:2 A5:2 | Bb5:4 F5:2 D5:2 F5:2 Bb5:2 D6:4 | C6:3 G5:3 E5:2 G5:2 C6:2 E6:4 | ' +
              'C#6:2 E6:2 G6:2 A6:6 G6:2 E6:2 | F6:4 E6:2 D6:2 A5:4 D6:4 | D6:4 C6:2 Bb5:2 F5:4 Bb5:4 | ' +
              'G5:2 Bb5:2 D6:2 G6:2 F6:2 E6:2 D6:2 Bb5:2 | A5:2 C#6:2 E6:2 G6:2 A6:8' },
      B: { chords: 'Gm Dm Bb A Gm Dm E7 A7',
        lead: 'G6:3 F6:1 D6:2 Bb5:2 G5:2 Bb5:2 D6:4 | F6:3 E6:1 D6:2 A5:2 F5:2 A5:2 D6:4 | D6:2 F6:2 Bb6:4 A6:2 G6:2 F6:4 | ' +
              'E6:6 C#6:2 A5:4 E5:4 | Bb5:2 D6:2 G6:2 Bb6:2 A6:2 G6:2 D6:4 | A5:2 D6:2 F6:2 A6:2 G6:2 F6:2 D6:4 | ' +
              'G#6:3 E6:3 B5:2 D6:2 E6:2 G#6:4 | A6:2 G6:2 E6:2 C#6:2 A5:2 C#6:2 E6:2 G6:2' },
      C: { chords: 'F C Bb A F C Bb:2 Gm:2 A7', counter: 'arp:trem:1:62',
        lead: 'A6:6 G6:2 F6:4 C6:4 | G6:6 F6:2 E6:4 C6:4 | F6:4 D6:4 Bb5:4 D6:4 | C#6:4 E6:4 A6:8 | ' +
              'C7:3 A6:3 F6:2 A6:2 C7:4 A6:2 | G6:3 E6:3 C6:2 E6:2 G6:4 E6:2 | F6:2 D6:2 Bb5:2 D6:2 G6:2 D6:2 Bb5:2 G5:2 | ' +
              'A5:1 r:1 A5:1 r:1 A5:1 r:1 C#6:1 E6:1 G6:2 A6:6' },
    },
  },

  // ------------------------------------------------------------ KART TITLE (himno)
  kartTitle: {
    name: 'kartTitle', bpm: 120, swing: 0, bass: 'title', harm: 'third', counter: 'arp:updown:2:60',
    drums: 'k---s---k-k-s---', fill: 'k---s---k-s-sTtT', crash: true,
    echo: { beats: 0.75, fb: 0.3, mix: 0.18 },
    inst: inst({ ...I.lead50, vol: 0.12, sus: 0.85, vib: 20, pan: 0.05, layers: [{ duty: 'p25', oct: 12, detune: 5, vol: 0.3 }] },
      { ...I.harm25, vol: 0.065, sus: 0.8, gate: 0.9, pan: -0.3 }, I.bass, 0.75, { counter: { duty: 'p12', vol: 0.045, pan: 0.35 } }),
    form: ['A', 'B', 'C', 'A'],
    sections: {
      A: { chords: 'C G/B Am F C G/B F G',
        lead: 'G5:4 C6:4 E6:6 D6:2 | D6:4 B5:4 G5:6 A5:2 | C6:4 E6:4 A6:6 G6:2 | F6:6 E6:2 C6:4 A5:4 | ' +
              'G5:2 C6:2 E6:4 G6:4 E6:4 | D6:2 G6:2 B6:4 A6:2 G6:2 D6:4 | C6:2 F6:2 A6:4 G6:2 F6:2 C6:4 | D6:8 G5:4 B5:4' },
      B: { chords: 'F G Em Am F G C C',
        lead: 'A6:4 G6:2 F6:2 C6:4 F6:4 | B6:4 A6:2 G6:2 D6:4 G6:4 | G6:3 E6:3 B5:2 E6:4 G6:4 | A6:8 E6:4 C6:4 | ' +
              'F6:2 A6:2 C7:4 B6:2 A6:2 F6:4 | G6:2 B6:2 D7:4 C7:2 B6:2 G6:4 | C7:6 B6:2 G6:4 E6:4 | C6:4 E6:4 G6:4 C7:4' },
      C: { chords: 'Ab Bb C C Ab Bb G G7',
        lead: 'C6:4 Eb6:4 Ab6:6 G6:2 | F6:4 D6:4 Bb5:6 C6:2 | E6:4 G6:4 C7:8 | B6:2 C7:2 D7:2 C7:2 G6:4 E6:4 | ' +
              'Eb6:3 C6:3 Ab5:2 C6:2 Eb6:2 Ab6:4 | F6:3 D6:3 Bb5:2 D6:2 F6:2 Bb6:4 | B6:4 A6:2 G6:2 D6:4 B5:4 | D6:2 r:2 D6:2 E6:2 F6:4 G6:4' },
    },
  },

  // ------------------------------------------------------------ SELECT (personaje)
  select: {
    name: 'select', bpm: 132, swing: 0.16, bass: 'bounce', harm: 'comp:--x.--x.--x.--x.', counter: 'none',
    drums: 'k-h-s-h-k-hks-h-', fill: 'k-h-s-h-ksssT-t-', crash: false,
    inst: inst({ ...I.lead25, vol: 0.14, gate: 0.75, vib: 0, pan: 0.05 }, { ...I.harm50, vol: 0.06, pan: -0.3 }, { ...I.bass, gate: 0.6 }, 0.7),
    form: ['A', 'B'],
    sections: {
      A: { chords: 'F Dm Gm7 C7 F Dm Gm7:2 C7:2 F',
        lead: 'C6:1 r:1 A5:1 r:1 F5:2 A5:2 C6:3 D6:1 C6:2 A5:2 | D6:1 r:1 A5:1 r:1 F5:2 A5:2 D6:3 E6:1 D6:2 A5:2 | ' +
              'Bb5:2 A5:2 G5:2 F5:2 D5:2 F5:2 G5:4 | E5:2 G5:2 Bb5:2 C6:2 E6:4 r:4 | ' +
              'C6:1 r:1 A5:1 r:1 F5:2 A5:2 C6:3 D6:1 C6:2 A5:2 | D6:1 r:1 A5:1 r:1 F5:2 A5:2 D6:3 E6:1 D6:2 A5:2 | ' +
              'Bb5:2 D6:2 G6:2 F6:2 E6:2 C6:2 Bb5:2 G5:2 | A5:2 r:2 F5:2 r:2 F6:4 r:4' },
      B: { chords: 'Bb Bbm F/A D7 Gm7 C7 F C7', harm: 'third', counter: 'echo:2',
        lead: 'D6:2 F6:2 D6:2 Bb5:2 F5:4 D6:4 | Db6:2 F6:2 Db6:2 Bb5:2 F5:4 Db6:4 | C6:2 A5:2 F5:2 A5:2 C6:2 F6:4 E6:2 | ' +
              'F#6:2 r:2 F#6:2 E6:2 D6:2 C6:2 A5:4 | Bb5:3 D6:3 F6:2 E6:2 D6:2 Bb5:4 | G5:3 Bb5:3 E6:2 D6:2 C6:2 Bb5:4 | ' +
              'A5:2 C6:2 F6:2 A6:2 G6:2 F6:2 C6:4 | Bb5:2 G5:2 E5:2 C5:2 E5:2 G5:2 Bb5:4' },
    },
  },

  // ------------------------------------------------------------ RESULTS (celebración)
  results: {
    name: 'results', bpm: 140, swing: 0.06, bass: 'oct', harm: 'third', counter: 'arp:up:1:60',
    drums: 'k-h-s-hkk-h-s-hs', fill: 'k-h-s-hkkTsTtTss', crash: true,
    echo: { beats: 0.75, fb: 0.2, mix: 0.12 },
    inst: inst({ ...I.lead25, vol: 0.14, pan: 0.05, layers: [{ duty: 'p12', oct: 12, vol: 0.2 }] }, { ...I.harm50, vol: 0.065, pan: -0.3 },
      { ...I.bass, gate: 0.6 }, 0.8, { counter: { duty: 'p12', vol: 0.04, gate: 0.5, pan: 0.35 } }),
    form: ['A', 'B'],
    sections: {
      A: { chords: 'C Am F G C Am F:2 G:2 C',
        lead: 'E6:2 G6:2 E6:2 C6:2 G5:2 C6:2 E6:4 | C6:2 E6:2 C6:2 A5:2 E5:2 A5:2 C6:4 | A5:2 C6:2 F6:3 E6:1 D6:2 C6:2 A5:4 | ' +
              'B5:2 D6:2 G6:6 F6:2 D6:4 | E6:2 G6:2 E6:2 C6:2 G5:2 C6:2 E6:4 | C6:2 E6:2 C6:2 A5:2 E5:2 A5:2 C6:4 | ' +
              'F6:2 A6:2 F6:2 C6:2 G6:2 B6:2 D7:4 | C7:6 G6:2 E6:2 G6:2 C7:4' },
      B: { chords: 'F G Em Am Dm7 G7 C C',
        lead: 'r:2 A6:1 A6:1 r:2 F6:2 r:2 C6:2 F6:4 | r:2 B6:1 B6:1 r:2 G6:2 r:2 D6:2 G6:4 | G6:3 E6:3 B5:2 E6:2 G6:2 B6:4 | ' +
              'A6:6 G6:2 E6:4 C6:4 | F6:2 E6:2 D6:2 C6:2 A5:2 C6:2 F6:4 | D6:2 F6:2 G6:2 B6:2 D7:4 B6:4 | ' +
              'C7:4 G6:2 E6:2 C6:4 E6:4 | G6:2 r:2 G6:1 A6:1 B6:2 C7:4 r:4' },
    },
  },
};
Object.assign(SONGS, KART_SONGS);

// ----------------------------------------------------------------------------
//  JINGLES (canciones de una sola pasada)
// ----------------------------------------------------------------------------
const J = (name, bpm, sec, instObj, extra = {}) => ({
  name, bpm, jingle: true, inst: instObj, form: ['J'], sections: { J: sec }, ...extra,
});
const JINGLES = {
  die: J('die', 140, {
    lead: 'E6:1 D#6:1 D6:1 C#6:1 r:4 G5:3 Ab5:3 F5:2 r:2 E5:2 Db5:2 C5:6',
    harm: 'r:8 E5:3 F5:3 D5:2 r:2 Bb4:2 G4:2 E4:6',
    bass: 'r:8 C4:3 Db4:3 Bb3:2 r:2 G3:4 C3:6',
  }, inst({ ...I.lead50, vol: 0.15, vib: 20 }, I.harm25, { ...I.bass, gate: 0.9 })),
  gameover: J('gameover', 112, {
    lead: 'E5:4 C5:4 A4:4 B4:2 C5:2 D5:3 B4:3 G4:2 Ab4:4 F4:4 D4:4 Eb4:2 D4:2 C4:8',
    harm: 'C5:4 A4:4 E4:4 G4:4 G4:3 D4:3 D4:2 F4:4 D4:4 B3:4 C4:2 B3:2 G3:8',
    bass: 'A2:12 G2:8 r:4 F2:12 G2:4 C2:8',
  }, inst({ ...I.lead50, vol: 0.15, vib: 24, vibDelay: 0.2 }, I.harm25, { ...I.bass, gate: 0.95 })),
  stageClear: J('stageClear', 160, {
    chords: 'C:4 F:2 G:2 Ab:2 Bb:2 C:4',
    lead: 'C5:1 E5:1 G5:1 C6:3 B5:2 C6:2 D6:2 E6:4 A5:2 C6:2 F6:4 G5:2 B5:2 D6:4 ' +
          'Ab5:2 C6:2 Eb6:4 Bb5:2 D6:2 F6:4 G6:2 r:1 G6:1 C7:12',
    harm: 'third', bass: 'hold',
    drums: 'k-h-s-h-k-h-s-h- k-h-s-h-k-h-s-h- k-h-s-h-k-sss-s- c---------------',
  }, inst({ ...I.lead25, vol: 0.15, vib: 22 }, I.harm50, { ...I.bass, gate: 0.92 }, 0.8)),
  worldClear: J('worldClear', 168, {
    chords: 'C:4 Am:4 F:4 G:4 Ab:2 Bb:2 C:4',
    lead: 'G5:2 G5:1 G5:1 C6:4 E6:2 D6:2 C6:4 E6:2 E6:1 E6:1 A6:4 G6:2 E6:2 C6:4 ' +
          'F6:2 E6:2 D6:2 C6:2 A5:2 C6:2 F6:4 D6:2 E6:2 F6:2 D6:2 G6:4 r:4 ' +
          'Eb6:2 Ab6:2 C7:4 F6:2 Bb6:2 D7:4 C7:1 G6:1 C7:1 G6:1 C7:1 G6:1 C7:10',
    harm: 'third', bass: 'hold',
    drums: 'k-h-s-h-k-h-s-h- k-h-s-h-k-h-s-h- k-h-s-h-k-h-s-h- k-h-s-h-k-h-s-h- k-s-s-k-s-ssT-t- c---------------',
  }, inst({ ...I.lead25, vol: 0.15, vib: 22 }, I.harm50, { ...I.bass, gate: 0.92 }, 0.8)),
  fanfare: J('fanfare', 160, {
    chords: 'C:5',
    lead: 'C5:1 E5:1 G5:1 C6:2 E5:1 G5:1 C6:1 E6:2 G5:1 C6:1 E6:1 G6:7',
    harm: 'third', bass: 'hold', drums: 'k---k---k---k---c---',
  }, inst({ ...I.lead25, vol: 0.15, vib: 20 }, I.harm50, I.bass, 0.8)),
  correct: J('correct', 200, {
    lead: 'G5:1 C6:1 E6:1 G6:1 C7:6',
    harm: 'E5:1 G5:1 C6:1 E6:1 E6:6',
    bass: 'C3:4 C4:6', drums: 'k---s-----',
  }, inst({ ...I.lead25, vol: 0.16, vib: 25, vibDelay: 0.1 }, { ...I.harm12, vol: 0.09 }, I.bass, 0.8)),
  hurryUp: J('hurryUp', 150, {
    lead: 'E6:1 D#6:1 E6:1 r:1 G6:1 F#6:1 G6:1 r:1 Bb6:1 A6:1 Bb6:1 r:1 D7:1 C#7:1 D7:1 r:1 E7:6 r:2',
    harm: 'E5:1 D#5:1 E5:1 r:1 G5:1 F#5:1 G5:1 r:1 Bb5:1 A5:1 Bb5:1 r:1 D6:1 C#6:1 D6:1 r:1 E6:6 r:2',
    bass: 'C3:2 r:2 Eb3:2 r:2 Gb3:2 r:2 A3:2 r:2 C3:6 r:2', drums: 'k---k---k---k---c-------',
  }, inst({ ...I.lead25, vol: 0.15 }, I.harm50, I.bass, 0.8)),
};
// Jingles de karts (ampliación)
Object.assign(JINGLES, {
  finalLap: J('finalLap', 160, {
    chords: 'A:3 Bm:1 E:2',
    lead: 'E5:1 A5:1 C#6:1 E6:1 A6:3 E6:1 A6:2 B6:2 C#7:2 D7:2 E7:8',
    harm: 'third', bass: 'A2:4 A3:4 A2:4 B2:4 E3:8',
    drums: 'k-s-k-s-k-s-ksss c-------',
  }, inst({ ...I.lead25, vol: 0.15, vib: 24, layers: [{ duty: 'p12', oct: 12, vol: 0.2 }] }, I.harm50, I.bass, 0.85)),
  raceFinish: J('raceFinish', 150, {
    chords: 'C F Ab:2 Bb:2 C',
    lead: 'C5:1 E5:1 G5:1 C6:1 E6:2 G6:2 C7:4 G6:2 E6:2 F5:1 A5:1 C6:1 F6:1 A6:4 G6:2 F6:2 A6:4 ' +
          'Ab6:2 Eb6:2 C6:2 Eb6:2 Bb6:2 F6:2 D6:2 F6:2 C7:2 r:1 C7:1 C7:2 D7:2 E7:8',
    harm: 'third', bass: 'hold', counter: 'arp:up:1:60',
    drums: 'k-h-s-h-k-h-s-h- k-h-s-h-k-h-s-h- k-s-k-s-k-s-ksss c---------------',
  }, inst({ ...I.lead25, vol: 0.14, vib: 22, layers: [{ duty: 'p12', oct: 12, vol: 0.2 }] }, I.harm50, { ...I.bass, gate: 0.92 }, 0.8)),
});
const SONG_SFX = {
  die: { stop: true }, gameover: { stop: true }, stageClear: { stop: true }, worldClear: { stop: true },
  fanfare: {}, correct: {}, hurryUp: { gate: true },
  finalLap: { gate: true }, raceFinish: { stop: true },
};

const _compiled = {};
function getCompiled(def) {
  return _compiled[def.name] || (_compiled[def.name] = compileSong(def));
}

// ----------------------------------------------------------------------------
//  Formas de onda y ruido del 2A03
// ----------------------------------------------------------------------------
function makePulseWave(ctx, duty) {
  const N = 64, re = new Float32Array(N), im = new Float32Array(N);
  for (let n = 1; n < N; n++) re[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
  return ctx.createPeriodicWave(re, im);
}
function lfsrBuffer(ctx, shortMode, seconds) {
  const sr = ctx.sampleRate, len = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
  let reg = 1; const tap = shortMode ? 6 : 1;
  for (let i = 0; i < len; i++) {
    const fb = (reg & 1) ^ ((reg >> tap) & 1);
    reg = (reg >> 1) | (fb << 14);
    d[i] = (reg & 1) ? 0.8 : -0.8;
  }
  return buf;
}
// compensación de volumen percibido por duty (la normalización iguala picos)
const DUTY_COMP = { p12: 1.3, p25: 1.05, p50: 0.85 };

// ----------------------------------------------------------------------------
//  Sintetizador (recibe cualquier BaseAudioContext → sirve en tiempo real y offline)
// ----------------------------------------------------------------------------
class Synth {
  constructor(ctx) {
    this.ctx = ctx;
    this.waves = { p12: makePulseWave(ctx, 0.125), p25: makePulseWave(ctx, 0.25), p50: makePulseWave(ctx, 0.5) };
    this.noiseBuf = lfsrBuffer(ctx, false, 1);
    this.metalBuf = lfsrBuffer(ctx, true, 0.5);

    const g = (v) => { const n = ctx.createGain(); n.gain.value = v; return n; };
    this.master = g(0.62);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 30; hp.Q.value = 0.6;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 13500; lp.Q.value = 0.5;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 3;
    comp.attack.value = 0.004; comp.release.value = 0.2;
    this.out = g(1);           // mute
    this.master.connect(hp); hp.connect(lp); lp.connect(comp); comp.connect(this.out); this.out.connect(ctx.destination);

    this.musicIn = g(0.78);
    this.duckGain = g(1);
    this.gateGain = g(1);
    this.musicIn.connect(this.duckGain); this.duckGain.connect(this.gateGain); this.gateGain.connect(this.master);
    this.sfxIn = g(1.5);
    this.sfxIn.connect(this.master);
    this.jingleIn = g(0.85);   // jingles: nivel de música, sin duck
    this.jingleIn.connect(this.master);
    this.engineIn = g(0.55);   // motores de kart
    this.engineIn.connect(this.master);
  }

  setMuted(m, instant) {
    const p = this.out.gain, t = this.ctx.currentTime;
    p.cancelScheduledValues(t);
    if (instant) p.setValueAtTime(m ? 0 : 1, t); else { p.setValueAtTime(p.value, t); p.setTargetAtTime(m ? 0 : 1, t, 0.03); }
  }
  duck(on) {
    const p = this.duckGain.gain, t = this.ctx.currentTime;
    p.cancelScheduledValues(t); p.setValueAtTime(p.value, t); p.setTargetAtTime(on ? 0.25 : 1, t, 0.12);
    const e = this.engineIn.gain;
    e.cancelScheduledValues(t); e.setValueAtTime(e.value, t); e.setTargetAtTime(on ? 0.2 : 0.55, t, 0.12);
  }
  gate(t0, dur) {
    const p = this.gateGain.gain;
    p.cancelScheduledValues(t0); p.setTargetAtTime(0, t0, 0.02); p.setTargetAtTime(1, t0 + dur, 0.06);
  }

  _env(param, t, env, scale = 1) {
    param.setValueAtTime(0, t);
    let end = t;
    for (const [dt, v, mode] of env) {
      const val = v * scale;
      if (mode === 'e') param.exponentialRampToValueAtTime(Math.max(val, 1e-4), t + dt);
      else param.linearRampToValueAtTime(val, t + dt);
      end = t + dt;
    }
    param.linearRampToValueAtTime(0, end + 0.008);
    return end + 0.01;
  }
  _freqs(fq, t, o) {
    if (typeof o.f === 'number') fq.setValueAtTime(o.f, t);
    else if (Array.isArray(o.f)) for (const [dt, f] of o.f) fq.setValueAtTime(f, t + dt);
    if (o.glide) o.glide.forEach(([dt, f], i) => (i === 0 ? fq.setValueAtTime(f, t + dt) : fq.exponentialRampToValueAtTime(f, t + dt)));
  }

  // Voz de efecto: { wave, f | glide, env:[[dt,gain,'e'?]...], vib:{rate,depth,delay}, detune, out }
  voice(t, o) {
    const ctx = this.ctx, w = o.wave || 'p50';
    const osc = ctx.createOscillator();
    if (w === 'tri') osc.type = 'triangle'; else osc.setPeriodicWave(this.waves[w]);
    this._freqs(osc.frequency, t, o);
    if (o.detune) osc.detune.setValueAtTime(o.detune, t);
    const g = ctx.createGain();
    const end = this._env(g.gain, t, o.env, DUTY_COMP[w] || 1);
    if (o.vib) {
      const l = ctx.createOscillator(), lg = ctx.createGain();
      l.frequency.value = o.vib.rate || 6;
      lg.gain.setValueAtTime(0, t);
      lg.gain.linearRampToValueAtTime(o.vib.depth || 30, t + (o.vib.delay || 0) + 0.02);
      l.connect(lg); lg.connect(osc.detune); l.start(t); l.stop(end + 0.02);
    }
    osc.connect(g); g.connect(o.out || this.sfxIn);
    osc.start(t); osc.stop(end + 0.02);
    return end;
  }

  // Ruido LFSR filtrado: { env, rate, rateGlide, hp, bp, lp, lpGlide, q, short, out }
  noise(t, o) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = o.short ? this.metalBuf : this.noiseBuf; src.loop = true;
    if (o.rateGlide) o.rateGlide.forEach(([dt, r], i) => (i === 0 ? src.playbackRate.setValueAtTime(r, t + dt) : src.playbackRate.exponentialRampToValueAtTime(r, t + dt)));
    else src.playbackRate.setValueAtTime(o.rate || 1, t);
    let node = src;
    const filt = (type, f, q) => {
      const b = ctx.createBiquadFilter(); b.type = type; b.Q.value = q;
      if (Array.isArray(f)) f.forEach(([dt, v], i) => (i === 0 ? b.frequency.setValueAtTime(v, t + dt) : b.frequency.exponentialRampToValueAtTime(v, t + dt)));
      else b.frequency.setValueAtTime(f, t);
      node.connect(b); node = b;
    };
    if (o.hp) filt('highpass', o.hp, o.q || 0.7);
    if (o.bp) filt('bandpass', o.bp, o.q || 1);
    if (o.lp || o.lpGlide) filt('lowpass', o.lpGlide || o.lp, 0.7);
    const g = ctx.createGain();
    const end = this._env(g.gain, t, o.env);
    node.connect(g); g.connect(o.out || this.sfxIn);
    src.start(t, Math.random() * 0.4); src.stop(end + 0.02);
    return end;
  }

  // Nota musical de pulso/triángulo
  note(t, midi, dur, o, out) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    if (o.wave === 'tri') osc.type = 'triangle'; else osc.setPeriodicWave(this.waves[o.duty || 'p50']);
    if (o.arp) {
      const st = o.arpRate || 0.034; let k = 0;
      for (let tt = t; tt < t + dur; tt += st, k++) osc.frequency.setValueAtTime(mtof(o.arp[k % o.arp.length]), tt);
    } else osc.frequency.setValueAtTime(mtof(midi), t);
    const g = ctx.createGain(), gp = g.gain;
    const vol = (o.vol || 0.15) * (DUTY_COMP[o.duty] || 1) * (o.wave === 'tri' ? 1 : 1);
    const a = o.a != null ? o.a : 0.004, rel = o.rel != null ? o.rel : 0.025;
    const on = Math.max(a + 0.012, dur * (o.gate != null ? o.gate : 0.9));
    gp.setValueAtTime(0, t);
    gp.linearRampToValueAtTime(vol, t + a);
    if (o.sus != null && o.sus < 1) gp.setTargetAtTime(vol * o.sus, t + a, o.decay || 0.08);
    gp.setTargetAtTime(0, t + on, rel / 4);
    const end = t + on + rel * 2.2;
    if (o.vib && on > (o.vibDelay || 0.16) + 0.08) {
      const l = ctx.createOscillator(), lg = ctx.createGain();
      l.frequency.value = 5.8;
      const vd = t + (o.vibDelay || 0.16);
      lg.gain.setValueAtTime(0, t); lg.gain.setValueAtTime(0, vd); lg.gain.linearRampToValueAtTime(o.vib, vd + 0.15);
      l.connect(lg); lg.connect(osc.detune); l.start(t); l.stop(end);
    }
    osc.connect(g); g.connect(out);
    osc.start(t); osc.stop(end);
    // capas extra (órgano / pulso grueso): osciladores adicionales en la misma envolvente
    if (o.layers) for (const ly of o.layers) {
      const o2 = ctx.createOscillator(), g2 = ctx.createGain();
      if (ly.wave === 'tri') o2.type = 'triangle'; else o2.setPeriodicWave(this.waves[ly.duty || 'p50']);
      const sh = ly.oct || 0;
      if (o.arp) { const st = o.arpRate || 0.034; let k = 0; for (let tt = t; tt < t + dur; tt += st, k++) o2.frequency.setValueAtTime(mtof(o.arp[k % o.arp.length] + sh), tt); }
      else o2.frequency.setValueAtTime(mtof(midi + sh), t);
      if (ly.detune) o2.detune.setValueAtTime(ly.detune, t);
      g2.gain.value = ly.vol != null ? ly.vol : 0.5;
      o2.connect(g2); g2.connect(g); o2.start(t); o2.stop(end);
    }
  }

  drum(c, t, vol, out) {
    switch (c) {
      case 'k':
        this.voice(t, { wave: 'tri', glide: [[0, 170], [0.09, 46]], env: [[0.002, 0.62 * vol], [0.16, 1e-4, 'e']], out });
        this.noise(t, { lp: 3000, env: [[0.001, 0.12 * vol], [0.02, 1e-4, 'e']], out });
        break;
      case 's':
        this.noise(t, { hp: 800, lp: 9000, env: [[0.001, 0.3 * vol], [0.13, 1e-4, 'e']], out });
        this.voice(t, { wave: 'tri', glide: [[0, 240], [0.06, 150]], env: [[0.002, 0.3 * vol], [0.07, 1e-4, 'e']], out });
        break;
      case 'h': this.noise(t, { hp: 7000, env: [[0.001, 0.13 * vol], [0.035, 1e-4, 'e']], out }); break;
      case 'o': this.noise(t, { hp: 6000, env: [[0.001, 0.12 * vol], [0.17, 1e-4, 'e']], out }); break;
      case 'c': this.noise(t, { hp: 2500, env: [[0.002, 0.17 * vol], [1.0, 1e-4, 'e']], out }); break;
      case 'T': this.voice(t, { wave: 'tri', glide: [[0, 280], [0.14, 160]], env: [[0.002, 0.45 * vol], [0.16, 1e-4, 'e']], out }); break;
      case 't': this.voice(t, { wave: 'tri', glide: [[0, 190], [0.15, 100]], env: [[0.002, 0.45 * vol], [0.17, 1e-4, 'e']], out }); break;
    }
  }

  playEvent(ev, t, dur, song, out) {
    const dest = out.connect ? out : (out[ev.ch] || out.main);
    if (ev.ch === 'drum') return this.drum(ev.drum, t, song.inst.drums.vol, dest);
    const o = song.inst[ev.ch];
    this.note(t, ev.midi, dur, ev.arp ? { ...o, arp: ev.arp } : o, dest);
  }

  // Salida de una pista: ganancia principal + panorama por canal + eco (delay con realimentación)
  trackOut(song, dest) {
    const ctx = this.ctx, main = ctx.createGain();
    main.connect(dest);
    const outs = { main, extra: [] };
    for (const ch of ['lead', 'harm', 'counter', 'bass', 'drums']) {
      const o = song.inst[ch];
      if (o && o.pan && ctx.createStereoPanner) {
        const p = ctx.createStereoPanner(); p.pan.value = o.pan; p.connect(main);
        outs[ch === 'drums' ? 'drum' : ch] = p; outs.extra.push(p);
      }
    }
    if (song.echo) {
      const e = song.echo;
      const d = ctx.createDelay(2); d.delayTime.value = Math.min(1.9, e.beats * song.beat);
      const fb = ctx.createGain(); fb.gain.value = e.fb;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = e.lp || 3800;
      const wet = ctx.createGain(); wet.gain.value = e.mix;
      main.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d);
      if (ctx.createStereoPanner) { const sp = ctx.createStereoPanner(); sp.pan.value = e.pan != null ? e.pan : -0.35; lp.connect(sp); sp.connect(wet); outs.extra.push(sp); }
      else lp.connect(wet);
      wet.connect(dest);
      outs.wet = wet; outs.extra.push(d, fb, lp);
    }
    return outs;
  }

  // Reproduce una canción completa de una pasada (jingles). Devuelve duración (s).
  playOnce(def, t0, out) {
    const song = getCompiled(def);
    const p = new Player(this, song, out || this.jingleIn, t0, false, 1);
    p.pump(Infinity);
    return song.totalTime + 0.35;
  }

  // Efecto por nombre en el instante t. Devuelve duración (s).
  sfx(name, t) {
    if (JINGLES[name]) return this.playOnce(JINGLES[name], t);
    const fn = SFX[name];
    if (!fn) throw new Error('SFX desconocido: ' + name);
    return Math.max(0, fn(this, t) - t);
  }
}

// ----------------------------------------------------------------------------
//  Reproductor con look-ahead
// ----------------------------------------------------------------------------
class Player {
  constructor(syn, song, out, t0, loop, speed) {
    this.syn = syn; this.song = song; this.out = out; this.time = t0;
    this.loop = loop; this.speed = speed || 1; this.step = 0; this.done = false;
  }
  stepDur(step) {
    const s = this.song, k = step % s.spb;
    return (s.beat / this.speed) * (s.warp[k + 1] - s.warp[k]);
  }
  pump(until) {
    const s = this.song;
    while (!this.done && this.time < until) {
      if (this.step >= s.length) {
        if (!this.loop) { this.done = true; break; }
        this.step = s.loopStart;
      }
      const evs = s.byStep[this.step];
      if (evs) for (const ev of evs) {
        let d = 0; for (let i = 0; i < ev.len; i++) d += this.stepDur(this.step + i);
        this.syn.playEvent(ev, this.time, d, s, this.out);
      }
      this.time += this.stepDur(this.step);
      this.step++;
    }
  }
}

// ----------------------------------------------------------------------------
//  EFECTOS DE SONIDO (diseño estilo NES, originales)
// ----------------------------------------------------------------------------
const E = 1e-4;
const SFX = {
  jump: (s, t) => s.voice(t, { wave: 'p25', glide: [[0, 290], [0.15, 1020]], env: [[0.004, 0.2], [0.1, 0.15], [0.2, E, 'e']] }),
  jumpBig: (s, t) => s.voice(t, { wave: 'p50', glide: [[0, 185], [0.21, 640]], env: [[0.004, 0.19], [0.14, 0.14], [0.27, E, 'e']] }),
  coin: (s, t) => s.voice(t, {
    wave: 'p25', f: [[0, mtof(83)], [0.07, mtof(88)]],
    env: [[0.003, 0.18], [0.07, 0.18], [0.08, 0.17], [0.6, E, 'e']],
  }),
  bump: (s, t) => {
    s.voice(t, { wave: 'p50', glide: [[0, 150], [0.09, 80]], env: [[0.003, 0.22], [0.11, E, 'e']] });
    s.voice(t, { wave: 'tri', glide: [[0, 130], [0.1, 50]], env: [[0.002, 0.35], [0.12, E, 'e']] });
    return s.noise(t, { lp: 900, env: [[0.002, 0.18], [0.06, E, 'e']] });
  },
  break: (s, t) => {
    s.voice(t, { wave: 'tri', glide: [[0, 200], [0.15, 55]], env: [[0.002, 0.38], [0.17, E, 'e']] });
    for (const d of [0.04, 0.1, 0.17, 0.25]) s.noise(t + d, { hp: 1800, rate: 0.7, env: [[0.001, 0.13], [0.035, E, 'e']] });
    return s.noise(t, { lp: 2800, rateGlide: [[0, 1], [0.4, 0.35]], env: [[0.002, 0.34], [0.42, E, 'e']] });
  },
  powerup: (s, t) => {
    const ns = []; for (const r of [60, 62, 64, 66, 68, 70, 72]) for (const iv of [0, 4, 7, 12]) ns.push(r + iv);
    const st = 0.032, T = ns.length * st;
    s.voice(t, { wave: 'p25', f: ns.map((m, i) => [i * st, mtof(m)]), env: [[0.004, 0.16], [T, 0.14], [T + 0.14, E, 'e']] });
    return s.voice(t + 0.016, { wave: 'p12', f: ns.map((m, i) => [i * st, mtof(m + 7)]), env: [[0.004, 0.06], [T, 0.05], [T + 0.12, E, 'e']] });
  },
  sprout: (s, t) => {
    const ns = [55, 57, 59, 60, 62, 64, 66, 67, 69, 71, 72, 74, 76, 78, 79], st = 0.045;
    const env = []; ns.forEach((_, i) => { env.push([i * st + 0.004, 0.15]); env.push([i * st + st - 0.006, 0.07]); });
    env.push([ns.length * st + 0.05, E, 'e']);
    s.voice(t, { wave: 'p12', f: ns.map((m, i) => [i * st, mtof(m)]), env });
    return s.voice(t, { wave: 'tri', f: ns.map((m, i) => [i * st, mtof(m - 12)]), env: env.map(([a, b, c]) => [a, b * 1.6, c]) });
  },
  stomp: (s, t) => {
    s.noise(t, { lp: 1200, env: [[0.002, 0.2], [0.05, E, 'e']] });
    s.voice(t, { wave: 'p50', glide: [[0, 800], [0.09, 160]], env: [[0.003, 0.22], [0.1, E, 'e']] });
    return s.voice(t + 0.07, { wave: 'p25', glide: [[0, 520], [0.06, 880]], env: [[0.003, 0.12], [0.07, E, 'e']] });
  },
  kick: (s, t) => {
    s.noise(t, { hp: 1200, env: [[0.001, 0.22], [0.05, E, 'e']] });
    return s.voice(t, { wave: 'p25', glide: [[0, 1400], [0.05, 700]], env: [[0.002, 0.16], [0.06, E, 'e']] });
  },
  pipe: (s, t) => {
    let e = t;
    for (let i = 0; i < 3; i++) e = s.voice(t + i * 0.13, { wave: 'p50', glide: [[0, 300], [0.1, 120]], env: [[0.003, 0.2], [0.11, E, 'e']] });
    return e;
  },
  shrink: (s, t) => {
    let e = t;
    for (let i = 0; i < 8; i++) {
      const b = 900 * Math.pow(0.82, i);
      e = s.voice(t + i * 0.075, { wave: 'p25', glide: [[0, b], [0.07, b * 0.6]], env: [[0.003, 0.17], [0.072, 0.02, 'e']] });
    }
    return e;
  },
  die: null, gameover: null, stageClear: null, worldClear: null, fanfare: null, correct: null, hurryUp: null,
  flagpole: (s, t) => {
    const fs = []; for (let i = 0; i < 45; i++) fs.push([i * 0.026, mtof(96 - i * 0.8)]);
    s.voice(t, { wave: 'p12', f: fs.map(([d, f]) => [d, f * 1.006]), env: [[0.005, 0.06], [1.1, 0.05], [1.25, E, 'e']] });
    return s.voice(t, { wave: 'p25', f: fs, env: [[0.005, 0.16], [1.1, 0.13], [1.25, E, 'e']] });
  },
  wrong: (s, t) => {
    const f = [[0, 311.13], [0.2, 207.65]];
    const env = [[0.004, 0.17], [0.16, 0.15], [0.19, 0.02], [0.205, 0.17], [0.55, 0.12], [0.62, E, 'e']];
    s.voice(t, { wave: 'p25', f, detune: 12, env: env.map(([a, b, c]) => [a, b * 0.6, c]), vib: { rate: 9, depth: 18 } });
    return s.voice(t, { wave: 'p50', f, detune: -8, env, vib: { rate: 9, depth: 18 } });
  },
  oneUp: (s, t) => {
    const ns = [74, 78, 81, 86, 83, 90], st = 0.085, T = ns.length * st;
    s.voice(t + 0.04, { wave: 'p12', f: ns.map((m, i) => [i * st, mtof(m)]), env: [[0.004, 0.06], [T, 0.05], [T + 0.2, E, 'e']] });
    return s.voice(t, { wave: 'p25', f: ns.map((m, i) => [i * st, mtof(m)]), env: [[0.004, 0.17], [T - st, 0.15], [T + 0.25, E, 'e']] });
  },
  fireball: (s, t) => {
    s.noise(t, { hp: 2500, env: [[0.001, 0.08], [0.05, E, 'e']] });
    return s.voice(t, { wave: 'p12', glide: [[0, 1500], [0.07, 350]], env: [[0.002, 0.2], [0.08, E, 'e']] });
  },
  pause: (s, t) => s.voice(t, { wave: 'p25', f: [[0, 1568], [0.075, 1175], [0.15, 1568], [0.225, 1175]], env: [[0.003, 0.16], [0.28, 0.12], [0.34, E, 'e']] }),
  select: (s, t) => s.voice(t, { wave: 'p25', f: [[0, 1047], [0.045, 1568]], env: [[0.002, 0.14], [0.08, 0.1], [0.12, E, 'e']] }),
  tick: (s, t) => s.voice(t, { wave: 'p50', f: 2093, env: [[0.001, 0.2], [0.02, 0.18], [0.05, E, 'e']] }),
  bossHit: (s, t) => {
    s.noise(t, { lp: 2200, rateGlide: [[0, 1], [0.3, 0.3]], env: [[0.002, 0.36], [0.3, E, 'e']] });
    s.voice(t, { wave: 'tri', glide: [[0, 150], [0.2, 45]], env: [[0.002, 0.4], [0.22, E, 'e']] });
    return s.voice(t, { wave: 'p50', glide: [[0, 420], [0.25, 70]], env: [[0.003, 0.2], [0.28, E, 'e']] });
  },
  bossDie: (s, t) => {
    for (let i = 0; i < 12; i++) {
      const b = 1000 * Math.pow(0.9, i);
      s.voice(t + i * 0.11, { wave: 'p25', glide: [[0, b], [0.1, b * 0.5]], env: [[0.003, 0.15], [0.1, E, 'e']] });
    }
    s.voice(t + 1.3, { wave: 'tri', glide: [[0, 90], [0.6, 30]], env: [[0.004, 0.45], [0.65, E, 'e']] });
    return s.noise(t, { lp: 900, rateGlide: [[0, 0.7], [1.9, 0.12]], env: [[0.05, 0.28], [1.2, 0.24], [1.9, E, 'e']] });
  },
  questionOpen: (s, t) => {
    const ns = [72, 76, 80, 84, 88, 92], st = 0.055, T = ns.length * st;
    s.voice(t, { wave: 'tri', f: mtof(60), env: [[0.03, 0.2], [0.8, E, 'e']] });
    s.voice(t, { wave: 'p12', f: ns.map((m, i) => [i * st, mtof(m)]), env: [[0.004, 0.13], [T, 0.1], [T + 0.08, E, 'e']] });
    s.voice(t + 0.11, { wave: 'p25', f: ns.map((m, i) => [i * st, mtof(m)]), env: [[0.004, 0.06], [T, 0.05], [T + 0.08, E, 'e']] });
    const tr = []; for (let i = 0; i < 12; i++) tr.push([i * 0.035, mtof(i % 2 ? 100 : 96)]);
    return s.voice(t + T, { wave: 'p12', f: tr, env: [[0.005, 0.1], [0.42, E, 'e']] });
  },
  fireworks: (s, t) => {
    s.voice(t, { wave: 'tri', glide: [[0, 110], [0.25, 38]], env: [[0.003, 0.42], [0.3, E, 'e']] });
    for (const d of [0.32, 0.41, 0.47, 0.58, 0.66, 0.74, 0.83]) s.noise(t + d, { hp: 4000, env: [[0.001, 0.09], [0.02, E, 'e']] });
    return s.noise(t, { lpGlide: [[0, 7000], [0.8, 700]], rateGlide: [[0, 1], [0.9, 0.4]], env: [[0.004, 0.45], [0.95, E, 'e']] });
  },
  bowserFall: (s, t) => {
    s.voice(t, { wave: 'p25', glide: [[0, 1400], [1.6, 110]], env: [[0.01, 0.07], [1.5, 0.06], [1.65, E, 'e']], vib: { rate: 7, depth: 60 } });
    s.voice(t, { wave: 'p50', glide: [[0, 700], [1.6, 55]], env: [[0.01, 0.18], [1.5, 0.16], [1.65, E, 'e']], vib: { rate: 7, depth: 60 } });
    s.voice(t + 1.6, { wave: 'tri', glide: [[0, 80], [0.6, 30]], env: [[0.004, 0.45], [0.7, E, 'e']] });
    return s.noise(t + 1.6, { lp: 700, rate: 0.5, env: [[0.01, 0.4], [0.9, E, 'e']] });
  },
};

// ---------- SFX de karts (ampliación) ----------
let _seed = 12345;
const rnd = () => ((_seed = (_seed * 16807) % 2147483647) / 2147483647);
Object.assign(SFX, {
  countdownBeep: (s, t) => {
    s.voice(t, { wave: 'p12', f: mtof(57), env: [[0.004, 0.08], [0.3, 0.07], [0.42, E, 'e']] });
    return s.voice(t, { wave: 'p25', f: mtof(69), env: [[0.004, 0.2], [0.3, 0.17], [0.42, E, 'e']] });
  },
  countdownGo: (s, t) => {
    s.voice(t, { wave: 'tri', f: mtof(57), env: [[0.004, 0.35], [0.8, 0.25], [1.0, E, 'e']] });
    s.voice(t, { wave: 'p50', f: mtof(76), env: [[0.004, 0.1], [0.8, 0.08], [1.0, E, 'e']], vib: { rate: 6, depth: 15, delay: 0.25 } });
    return s.voice(t, { wave: 'p25', f: mtof(81), env: [[0.004, 0.2], [0.8, 0.16], [1.0, E, 'e']], vib: { rate: 6, depth: 15, delay: 0.25 } });
  },
  drift: (s, t) => {
    s.voice(t, { wave: 'p12', f: 1900, env: [[0.03, 0.04], [0.35, 0.035], [0.5, E, 'e']], vib: { rate: 9, depth: 40 } });
    return s.noise(t, { bp: 2800, q: 5, env: [[0.02, 0.3], [0.35, 0.25], [0.5, E, 'e']] });
  },
  miniTurbo: (s, t) => {
    s.voice(t, { wave: 'p25', glide: [[0, 300], [0.25, 1200]], env: [[0.004, 0.15], [0.25, 0.12], [0.36, E, 'e']] });
    return s.noise(t, { lpGlide: [[0, 800], [0.3, 5000]], rate: 0.8, env: [[0.02, 0.25], [0.5, E, 'e']] });
  },
  boost: (s, t) => {
    s.voice(t, { wave: 'tri', glide: [[0, 90], [0.3, 45]], env: [[0.004, 0.35], [0.35, E, 'e']] });
    s.voice(t, { wave: 'p50', glide: [[0, 150], [0.35, 600]], env: [[0.01, 0.12], [0.6, 0.08], [0.9, E, 'e']] });
    s.voice(t, { wave: 'p25', glide: [[0, 300], [0.35, 1200]], env: [[0.01, 0.06], [0.6, 0.04], [0.9, E, 'e']] });
    return s.noise(t, { lpGlide: [[0, 600], [0.3, 4000], [1.0, 1200]], env: [[0.03, 0.35], [0.5, 0.25], [1.1, E, 'e']] });
  },
  itemBox: (s, t) => {
    for (let i = 0; i < 6; i++) s.noise(t + i * 0.022, { hp: 5000, env: [[0.001, 0.14], [0.03, E, 'e']] });
    s.voice(t, { wave: 'tri', f: [[0, mtof(72)], [0.05, mtof(79)]], env: [[0.003, 0.2], [0.25, E, 'e']] });
    return s.voice(t, { wave: 'p12', f: [96, 91, 88, 84, 88, 91].map((m, i) => [i * 0.03, mtof(m)]), env: [[0.003, 0.13], [0.18, 0.1], [0.32, E, 'e']] });
  },
  itemRoulette: (s, t) => {
    let d = 0, e = t; const ns = [84, 88, 91, 86];
    for (let i = 0; i < 24; i++) {
      e = s.voice(t + d, { wave: i % 2 ? 'p12' : 'p25', f: mtof(ns[i % 4]), env: [[0.002, 0.11], [0.03, E, 'e']] });
      d += 0.045 * (1 + i * 0.05);
    }
    return e;
  },
  itemGet: (s, t) => {
    const ar = [72, 76, 79, 84];
    s.voice(t, { wave: 'p50', f: ar.map((m, i) => [i * 0.04, mtof(m - 5)]), env: [[0.003, 0.08], [0.2, 0.07], [0.5, E, 'e']] });
    s.voice(t, { wave: 'p12', f: ar.map((m, i) => [i * 0.04, mtof(m + 4)]), env: [[0.003, 0.06], [0.2, 0.05], [0.5, E, 'e']] });
    return s.voice(t, { wave: 'p25', f: ar.map((m, i) => [i * 0.04, mtof(m)]), env: [[0.003, 0.17], [0.2, 0.15], [0.55, E, 'e']], vib: { rate: 7, depth: 15, delay: 0.2 } });
  },
  throw: (s, t) => {
    s.noise(t, { bp: 1500, q: 1.2, env: [[0.01, 0.2], [0.14, E, 'e']] });
    return s.voice(t, { wave: 'p12', glide: [[0, 900], [0.12, 300]], env: [[0.003, 0.14], [0.14, E, 'e']] });
  },
  shellHit: (s, t) => {
    s.voice(t, { wave: 'tri', glide: [[0, 160], [0.25, 40]], env: [[0.002, 0.45], [0.3, E, 'e']] });
    s.voice(t, { wave: 'p50', glide: [[0, 600], [0.25, 100]], env: [[0.003, 0.18], [0.27, E, 'e']] });
    s.noise(t, { hp: 3000, env: [[0.002, 0.15], [0.6, E, 'e']] });
    return s.noise(t, { lp: 3000, rateGlide: [[0, 1], [0.35, 0.4]], env: [[0.002, 0.42], [0.35, E, 'e']] });
  },
  spinOut: (s, t) => {
    s.noise(t, { bp: 2500, q: 3, env: [[0.02, 0.18], [0.7, 0.12], [0.85, E, 'e']] });
    return s.voice(t, { wave: 'p25', glide: [[0, 900], [0.9, 200]], env: [[0.005, 0.16], [0.8, 0.12], [0.95, E, 'e']], vib: { rate: 11, depth: 220 } });
  },
  bananaSlip: (s, t) => {
    s.noise(t + 0.05, { bp: 2800, q: 4, env: [[0.02, 0.22], [0.4, 0.15], [0.5, E, 'e']] });
    return s.voice(t, { wave: 'p50', glide: [[0, 400], [0.12, 1200], [0.45, 250]], env: [[0.004, 0.16], [0.4, 0.12], [0.5, E, 'e']] });
  },
  lap: (s, t) => {
    s.voice(t, { wave: 'p12', f: [[0, mtof(72)], [0.12, mtof(79)]], env: [[0.003, 0.07], [0.12, 0.06], [0.65, E, 'e']] });
    return s.voice(t, { wave: 'p25', f: [[0, mtof(84)], [0.12, mtof(91)]], env: [[0.003, 0.18], [0.11, 0.14], [0.125, 0.18], [0.7, E, 'e']] });
  },
  gateOpen: (s, t) => {
    const ns = [72, 74, 76, 78, 80, 82, 84, 86, 88, 90, 92], st = 0.04, T = ns.length * st;
    s.voice(t, { wave: 'tri', glide: [[0, 110], [1.0, 220]], env: [[0.05, 0.25], [1.0, 0.2], [1.25, E, 'e']] });
    s.noise(t, { lpGlide: [[0, 400], [0.9, 6000]], rate: 0.6, env: [[0.2, 0.12], [0.9, 0.1], [1.2, E, 'e']] });
    s.voice(t, { wave: 'p12', f: ns.map((m, i) => [i * st, mtof(m)]), env: [[0.004, 0.12], [T, 0.1], [T + 0.06, E, 'e']] });
    const tr = []; for (let i = 0; i < 16; i++) tr.push([i * 0.035, mtof([84, 88, 91, 95][i % 4])]);
    return s.voice(t + T, { wave: 'p25', f: tr, env: [[0.005, 0.12], [0.3, 0.1], [0.6, E, 'e']] });
  },
  wallBump: (s, t) => {
    s.voice(t, { wave: 'tri', glide: [[0, 90], [0.15, 40]], env: [[0.002, 0.45], [0.17, E, 'e']] });
    s.voice(t, { wave: 'p50', glide: [[0, 140], [0.1, 70]], env: [[0.003, 0.12], [0.12, E, 'e']] });
    return s.noise(t, { lp: 600, env: [[0.002, 0.42], [0.14, E, 'e']] });
  },
  offroad: (s, t) => {
    const env = [[0.02, 0.2]]; for (let i = 1; i < 10; i++) env.push([0.02 + i * 0.04, i % 2 ? 0.1 : 0.22]);
    env.push([0.5, E, 'e']);
    s.voice(t, { wave: 'tri', f: 62, env: env.map(([a, b, c]) => [a, b * 1.4, c]) });
    return s.noise(t, { lp: 500, rate: 0.4, env });
  },
  hop: (s, t) => {
    s.voice(t + 0.13, { wave: 'tri', glide: [[0, 120], [0.06, 60]], env: [[0.002, 0.25], [0.07, E, 'e']] });
    return s.voice(t, { wave: 'p25', glide: [[0, 400], [0.06, 720]], env: [[0.003, 0.14], [0.08, E, 'e']] });
  },
  starPower: (s, t) => {
    const ns = []; for (let k = 0; k < 2; k++) for (const m of [72, 76, 79, 84, 88, 91, 96, 91, 88, 84, 79, 76]) ns.push(m + (k ? 2 : 0));
    const st = 0.04, T = ns.length * st;
    s.voice(t, { wave: 'tri', f: [[0, mtof(48)], [T / 2, mtof(50)]], env: [[0.01, 0.25], [T, 0.2], [T + 0.1, E, 'e']] });
    s.voice(t + 0.06, { wave: 'p25', f: ns.map((m, i) => [i * st, mtof(m)]), env: [[0.004, 0.05], [T, 0.04], [T + 0.1, E, 'e']] });
    return s.voice(t, { wave: 'p12', f: ns.map((m, i) => [i * st, mtof(m)]), env: [[0.004, 0.13], [T, 0.11], [T + 0.12, E, 'e']] });
  },
  cheer: (s, t) => {
    _seed = 777;
    const D = 2.6;
    for (const bp of [650, 1000, 1400, 2200, 3200]) {
      const env = [[0.15, 0.12]];
      for (let x = 0.25; x < D - 0.5; x += 0.06 + rnd() * 0.08) env.push([x, 0.06 + rnd() * 0.12]);
      env.push([D, E, 'e']);
      s.noise(t, { bp, q: 1.6, rate: 0.5 + rnd() * 0.5, env: env.map(([a, b, c]) => [a, b * (bp > 2000 ? 0.6 : 1), c]) });
    }
    for (const d of [0.2, 0.9, 1.5]) s.voice(t + d, { wave: 'p12', glide: [[0, 1800 + rnd() * 400], [0.25, 2600 + rnd() * 300]], env: [[0.02, 0.05], [0.25, 0.04], [0.35, E, 'e']], vib: { rate: 12, depth: 30 } });
    return t + D + 0.05;
  },
});
for (const k of Object.keys(SFX)) if (SFX[k] === null) delete SFX[k];

// ----------------------------------------------------------------------------
//  MOTOR DE KART continuo (ampliación)
//  sierra + sub-pulso + sierra desafinada → filtro paso bajo dependiente de rpm/carga,
//  "putt-putt" (AM a la frecuencia de encendido), siseo de admisión (ruido),
//  chirrido de derrape (ruido resonante + tono con vibrato), rugido de turbo.
// ----------------------------------------------------------------------------
class Engine {
  constructor(syn, t) {
    const ctx = syn.ctx; this.ctx = ctx; this.syn = syn;
    const G = (v) => { const g = ctx.createGain(); g.gain.value = v; return g; };
    this.out = G(0); this.out.connect(syn.engineIn);
    this.out.gain.setValueAtTime(0, t);
    this.nodes = [];
    const osc = (type, wave) => { const o = ctx.createOscillator(); if (wave) o.setPeriodicWave(wave); else o.type = type; o.start(t); this.nodes.push(o); return o; };
    // cuerpo del motor
    this.saw = osc('sawtooth'); this.saw2 = osc('sawtooth'); this.sub = osc(null, syn.waves.p25);
    this.saw2.detune.value = 14;
    this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.Q.value = 2.2; this.lp.frequency.value = 500;
    this.body = G(0.7);
    const sG = G(0.45), s2G = G(0.22), subG = G(0.4);
    this.saw.connect(sG); this.saw2.connect(s2G); this.sub.connect(subG);
    sG.connect(this.lp); s2G.connect(this.lp); subG.connect(this.lp);
    this.lp.connect(this.body); this.body.connect(this.out);
    // AM "putt-putt"
    this.lfo = osc(null, syn.waves.p50); this.lfoG = G(0.2);
    this.lfo.connect(this.lfoG); this.lfoG.connect(this.body.gain);
    // ruido de admisión/escape
    const nsrc = (buf) => { const n = ctx.createBufferSource(); n.buffer = buf; n.loop = true; n.start(t, Math.random() * 0.5); this.nodes.push(n); return n; };
    this.nbp = ctx.createBiquadFilter(); this.nbp.type = 'bandpass'; this.nbp.Q.value = 0.9; this.nbp.frequency.value = 900;
    this.nG = G(0.03); nsrc(syn.noiseBuf).connect(this.nbp); this.nbp.connect(this.nG); this.nG.connect(this.out);
    // derrape
    this.sqbp = ctx.createBiquadFilter(); this.sqbp.type = 'bandpass'; this.sqbp.Q.value = 7; this.sqbp.frequency.value = 2600;
    this.sqG = G(0); nsrc(syn.noiseBuf).connect(this.sqbp); this.sqbp.connect(this.sqG); this.sqG.connect(this.out);
    this.sqTone = osc(null, syn.waves.p12); this.sqTone.frequency.value = 1850;
    const vib = osc('sine'); vib.frequency.value = 8; const vibG = G(45); vib.connect(vibG); vibG.connect(this.sqTone.detune);
    this.sqTG = G(0); this.sqTone.connect(this.sqTG); this.sqTG.connect(this.out);
    // turbo
    this.blp = ctx.createBiquadFilter(); this.blp.type = 'lowpass'; this.blp.frequency.value = 1400;
    this.bG = G(0); nsrc(syn.noiseBuf).connect(this.blp); this.blp.connect(this.bG); this.bG.connect(this.out);
    this.p = { rpm: 0, load: 0, drift: false, boost: false, gain: 1 };
    this.update({}, t, 0.08);
  }
  update(np, t, tc = 0.05) {
    const p = Object.assign(this.p, np || {});
    const rpm = Math.max(0, Math.min(1, +p.rpm || 0)), load = Math.max(0, Math.min(1, +p.load || 0));
    const boost = !!p.boost, drift = !!p.drift, gain = Math.max(0, Math.min(1.5, p.gain != null ? +p.gain : 1));
    const f = 42 + rpm * 150 + (boost ? 18 : 0);
    const T = (param, v, c = tc) => param.setTargetAtTime(v, t, c);
    T(this.saw.frequency, f); T(this.saw2.frequency, f); T(this.sub.frequency, f / 2);
    T(this.lfo.frequency, f / 2);
    T(this.lfoG.gain, 0.08 + (1 - rpm) * 0.22);
    T(this.lp.frequency, 380 + rpm * 1500 + load * 1500 + (boost ? 1500 : 0));
    T(this.nG.gain, 0.02 + load * 0.05 + (boost ? 0.04 : 0));
    T(this.nbp.frequency, 700 + rpm * 1800);
    T(this.sqG.gain, drift ? 0.12 : 0, drift ? 0.04 : 0.08);
    T(this.sqTG.gain, drift ? 0.02 : 0, drift ? 0.04 : 0.08);
    T(this.sqbp.frequency, 2300 + rpm * 700);
    T(this.sqTone.frequency, 1700 + rpm * 400);
    T(this.bG.gain, boost ? 0.22 : 0, boost ? 0.03 : 0.15);
    T(this.out.gain, 0.8 * gain, 0.06);
  }
  stop(t) {
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setTargetAtTime(0, t, 0.05);
    for (const n of this.nodes) { try { n.stop(t + 0.45); } catch (e) { /* ya detenido */ } }
    this.stopped = true;
  }
}

const TRACKS = Object.keys(SONGS);
const SFX_NAMES = ['jump', 'jumpBig', 'coin', 'bump', 'break', 'powerup', 'sprout', 'stomp', 'kick', 'pipe', 'die', 'gameover',
  'flagpole', 'stageClear', 'worldClear', 'correct', 'wrong', 'oneUp', 'fireball', 'pause', 'select',
  'shrink', 'hurryUp', 'tick', 'bossHit', 'bossDie', 'fanfare', 'questionOpen', 'fireworks', 'bowserFall',
  // karts
  'countdownBeep', 'countdownGo', 'drift', 'miniTurbo', 'boost', 'itemBox', 'itemRoulette', 'itemGet', 'throw', 'shellHit',
  'spinOut', 'bananaSlip', 'lap', 'finalLap', 'raceFinish', 'gateOpen', 'wallBump', 'offroad', 'hop', 'starPower', 'cheer'];
const KART_TRACKS = Object.keys(KART_SONGS);

// Escenario de prueba del motor: ralentí → acelera con carga → derrape → turbo → suelta → apaga
function engineScenario(syn, n, secs) {
  for (let k = 0; k < n; k++) {
    const e = new Engine(syn, 0.02 + k * 0.1), g = k === 0 ? 1 : 0.6 / k;
    for (let tt = 0.05; tt < secs - 0.6; tt += 1 / 30) {
      const x = tt / (secs - 0.6);
      const rpm = x < 0.15 ? 0.05 : Math.min(1, 0.05 + (x - 0.15) * 2.5 + Math.sin(tt * (3 + k)) * 0.05);
      e.update({ rpm, load: x < 0.6 ? 0.9 : 0.2, drift: x > 0.4 && x < 0.6, boost: x > 0.6 && x < 0.75, gain: g }, tt);
    }
    e.stop(secs - 0.55);
  }
}

function readMuted() {
  try { return localStorage.getItem(LS_MUTE) === '1'; } catch (e) { return false; }
}
function writeMuted(m) {
  try { localStorage.setItem(LS_MUTE, m ? '1' : '0'); } catch (e) { /* sin almacenamiento */ }
}

function encodeWav(buffer, mono = true) {
  const ch = mono ? 1 : buffer.numberOfChannels, sr = buffer.sampleRate, n = buffer.length;
  const data = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const w = (o, s) => { for (let i = 0; i < s.length; i++) data.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); data.setUint32(4, 36 + n * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, ch, true);
  data.setUint32(24, sr, true); data.setUint32(28, sr * ch * 2, true); data.setUint16(32, ch * 2, true);
  data.setUint16(34, 16, true); w(36, 'data'); data.setUint32(40, n * ch * 2, true);
  const chans = []; for (let c = 0; c < buffer.numberOfChannels; c++) chans.push(buffer.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) {
    let v = mono ? chans.reduce((a, d) => a + d[i], 0) / chans.length : chans[c][i];
    v = Math.max(-1, Math.min(1, v));
    data.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2;
  }
  return data.buffer;
}

// ----------------------------------------------------------------------------
//  API pública
// ----------------------------------------------------------------------------
export const Sound = {
  TRACKS, SFX_NAMES, KART_TRACKS, _engines: new Map(),
  _ctx: null, _syn: null, _player: null, _track: null, _pending: null,
  _speed: 1, _muted: readMuted(), _ducked: false, _timer: null, _warned: {},

  init() {
    if (!this._ctx) {
      const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
      if (!AC) return this;
      try { this._ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { return this; }
      this._syn = new Synth(this._ctx);
      this._syn.setMuted(this._muted, true);
      if (this._ducked) this._syn.duck(true);
      this._timer = setInterval(() => this._tick(), 25);
      if (this._pending) { const p = this._pending; this._pending = null; this.playMusic(p); }
    }
    this._resume();
    return this;
  },
  _resume() {
    const c = this._ctx;
    if (c && c.state !== 'running' && c.resume) c.resume().catch(() => {});
  },
  _tick() {
    const p = this._player; if (!p || !this._ctx) return;
    const now = this._ctx.currentTime;
    if (p.time < now - 0.03) p.time = now + 0.03; // pestaña en segundo plano: re-sincroniza sin ráfagas
    p.pump(now + 0.12);
  },

  playMusic(track, opts = {}) {
    const def = SONGS[track];
    if (!def) { console.warn('[audio] pista desconocida:', track); return; }
    if (!this._ctx) { this._pending = track; return; }
    this._resume();
    if (this._player && this._track === track && !opts.restart) return;
    this._stopPlayer();
    this._speed = 1;
    const ctx = this._ctx, song = getCompiled(def);
    const outs = this._syn.trackOut(song, this._syn.musicIn);
    this._player = new Player(this._syn, song, outs, ctx.currentTime + 0.06, true, this._speed);
    this._player.gainNode = outs.main;
    this._track = track;
    this._tick();
  },
  _stopPlayer() {
    const p = this._player; if (!p) return;
    const t = this._ctx.currentTime, gp = p.gainNode.gain;
    gp.cancelScheduledValues(t); gp.setValueAtTime(gp.value, t); gp.setTargetAtTime(0, t, 0.015);
    setTimeout(() => { try { p.gainNode.disconnect(); } catch (e) { /* ya desconectado */ } }, 400);
    if (p.out && p.out.extra) setTimeout(() => { for (const n of p.out.extra) { try { n.disconnect(); } catch (e) { /* */ } } try { p.out.wet && p.out.wet.disconnect(); } catch (e) { /* */ } }, 4000);
    this._player = null; this._track = null;
  },
  stopMusic() { this._pending = null; if (this._ctx) this._stopPlayer(); },
  currentTrack() { return this._track || this._pending; },

  setMusicSpeed(mult) {
    this._speed = Math.max(0.25, Math.min(4, +mult || 1));
    if (this._player) this._player.speed = this._speed;
  },

  sfx(name) {
    if (!SFX[name] && !JINGLES[name]) {
      if (!this._warned[name]) { this._warned[name] = 1; console.warn('[audio] sfx desconocido:', name); }
      return 0;
    }
    const jinfo = SONG_SFX[name];
    if (!this._ctx) return jinfo ? getCompiled(JINGLES[name]).totalTime + 0.35 : 0;
    this._resume();
    if (jinfo && jinfo.stop) this.stopMusic();
    const t = this._ctx.currentTime + 0.02;
    let dur = 0;
    try { dur = this._syn.sfx(name, t); } catch (e) { console.warn('[audio]', e); }
    if (jinfo && jinfo.gate) this._syn.gate(t, dur - 0.2);
    return dur;
  },
  sfxAsync(name) {
    const d = this.sfx(name);
    return new Promise((res) => setTimeout(res, Math.max(0, d * 1000)));
  },

  setMuted(m) {
    this._muted = !!m; writeMuted(this._muted);
    if (this._syn) this._syn.setMuted(this._muted);
  },
  isMuted() { return this._muted; },
  toggleMute() { this.setMuted(!this._muted); return this._muted; },

  duck(on) {
    this._ducked = !!on;
    if (this._syn) this._syn.duck(this._ducked);
  },

  // ---------- Motor continuo de kart (ampliación) ----------
  engineStart(id = 'player', params) {
    if (!this._ctx) return;
    this._resume();
    if (this._engines.has(id)) { if (params) this.engineUpdate(id, params); return; }
    const e = new Engine(this._syn, this._ctx.currentTime);
    this._engines.set(id, e);
    if (params) e.update(params, this._ctx.currentTime);
  },
  engineUpdate(id = 'player', params = {}) {
    if (!this._ctx) return;
    const e = this._engines.get(id);
    if (!e) return this.engineStart(id, params);
    e.update(params, this._ctx.currentTime);
  },
  engineStop(id = 'player') {
    const e = this._engines.get(id); if (!e) return;
    e.stop(this._ctx.currentTime); this._engines.delete(id);
  },
  engineStopAll() { for (const id of [...this._engines.keys()]) this.engineStop(id); },

  // ---------- QA: render offline con contexto inyectado ----------
  async _renderOffline(name, seconds, { sampleRate = 44100, channels = 2, speed = 1, overlay = [], duck = false, engines = 0, kind } = {}) {
    const Off = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
    let secs = seconds;
    const asMusic = SONGS[name] && kind !== 'sfx';
    if (secs == null) secs = asMusic ? 8 : (JINGLES[name] ? getCompiled(JINGLES[name]).totalTime + 0.6 : 3);
    const ctx = new Off(channels, Math.ceil(secs * sampleRate), sampleRate);
    const syn = new Synth(ctx);
    if (asMusic) {
      const song = getCompiled(SONGS[name]);
      const p = new Player(syn, song, syn.trackOut(song, syn.musicIn), 0.02, true, speed);
      p.pump(secs);
    } else if (name === 'engine' || name === 'engines4') {
      engineScenario(syn, name === 'engines4' ? 4 : 1, secs);
    } else if (SFX[name] || JINGLES[name]) syn.sfx(name, 0.02);
    else throw new Error('desconocido: ' + name);
    if (engines) engineScenario(syn, engines, secs);
    for (const [n, t] of overlay) syn.sfx(n, t);   // [[sfx, segundo], ...] para pruebas de mezcla
    if (duck) syn.duck(true);
    return ctx.startRendering();
  },
  _analyze(buffer) {
    let sum = 0, peak = 0, clip = 0, n = 0;
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const d = buffer.getChannelData(c);
      for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); sum += v * v; if (v > peak) peak = v; if (v >= 0.999) clip++; n++; }
    }
    return { rms: Math.sqrt(sum / n), peak, clipped: clip, seconds: buffer.duration };
  },
  _encodeWav: encodeWav,
  _compileAll() {
    const r = {};
    for (const k of Object.keys(SONGS)) { const s = getCompiled(SONGS[k]); r[k] = { bars: s.length / 16, loopBars: (s.length - s.loopStart) / 16, seconds: +s.totalTime.toFixed(2) }; }
    for (const k of Object.keys(JINGLES)) { const s = getCompiled(JINGLES[k]); r[k] = { steps: s.length, seconds: +s.totalTime.toFixed(2) }; }
    return r;
  },
};

export default Sound;
