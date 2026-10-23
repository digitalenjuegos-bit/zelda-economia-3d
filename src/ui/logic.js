/* Lógica pura de evaluación (sin DOM): réplica de la versión de referencia.
   Se puede probar con Node (qa/ui/logic-test.mjs). */

export const LETTERS = ['A', 'B', 'C', 'D'];
export const HINT_COST = 2;          /* monedas por pista (igual que la referencia) */
export const DEFAULT_POINTS = 0.5;   /* 20 preguntas → nota sobre 10 */

/* ─── Normalización del banco ─── */
export function normalizeBank(raw) {
  if (!raw) return null;
  let obj = raw;
  if (Array.isArray(raw)) {
    if (raw.length === 0) return null;
    if (raw[0] && typeof raw[0] === 'object' && Array.isArray(raw[0].worlds)) obj = raw[0];
    else if (raw.every(x => x && typeof x === 'object' && Array.isArray(x.questions))) obj = { worlds: raw };
    else return null;
  }
  if (!obj || !Array.isArray(obj.worlds)) return null;
  const worlds = obj.worlds.filter(w => w && Array.isArray(w.questions) && w.questions.length > 0);
  if (!worlds.length) return null;
  return Object.assign({}, obj, { worlds });
}

export function totalQuestions(worlds) {
  return worlds.reduce((s, w) => s + (w.questions ? w.questions.length : 0), 0);
}
export function pointsPerQuestion(total) {
  return total > 0 ? 10 / total : DEFAULT_POINTS;
}
/* Nota sobre 10, redondeada a 1 decimal (igual que endGame de la referencia). */
export function computeGrade(correct, total) {
  return Math.round(Math.min(10, Math.max(0, correct * pointsPerQuestion(total))) * 10) / 10;
}

/* ─── Utilidades ─── */
export function shuffle(arr, rnd = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}
/* Baraja las opciones y devuelve el nuevo índice de la respuesta correcta. */
export function shuffleWithOptions(opts, correctIdx, rnd = Math.random) {
  const order = shuffle(opts.map((_, i) => i), rnd);
  return { options: order.map(i => opts[i]), answerIdx: order.indexOf(correctIdx), order };
}
export function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
export function normalizeName(s) { return String(s || '').toUpperCase().trim().replace(/\s+/g, ' '); }

/* Separación de apellidos y nombres (igual que la referencia). */
export function parseName(fullName) {
  const s = String(fullName).trim();
  if (s.includes(',')) {
    const parts = s.split(',').map(x => x.trim());
    if (parts.length === 2) return { lastname: parts[0], name: parts[1] };
  }
  const tokens = s.split(/\s+/);
  let split = 2;
  if (tokens.length <= 2) split = 1;
  else if (tokens.length === 3) split = 2;
  else if (tokens.length === 5) split = 3;
  else if (tokens.length >= 6) split = 3;
  else split = 2;
  return { lastname: tokens.slice(0, split).join(' '), name: tokens.slice(split).join(' ') };
}

/* Render de la explicación con etiquetas explícitas (Mecanismo, Límite 1, ...). */
export function renderExplanation(text) {
  if (!text) return '';
  const lines = String(text).split(/\n+/).map(s => s.trim()).filter(Boolean);
  return lines.map(line => {
    const m = line.match(/^(Mecanismo|Límite\s*\d+|Limite\s*\d+|Explicación|Explicacion|Concepto|Tema|Dato|Causa|Efecto)\s*:\s*(.+)$/i);
    if (m) return '<div class="exp-row"><span class="exp-label">' + escapeHtml(m[1]) + '</span><span class="exp-text">' + escapeHtml(m[2]) + '</span></div>';
    return '<div class="exp-row"><span class="exp-text">' + escapeHtml(line) + '</span></div>';
  }).join('');
}

/* ─── Plan de preguntas (prepareAllQuestions) ───
   Por cada mundo: baraja el orden de sus preguntas y las opciones de cada una.
   Se guarda solo como índices para que quepa en localStorage y la reanudación sea consistente. */
export function correctIndexOf(q) {
  return (q.answer != null) ? Number(q.answer) : Number(q.correct);
}
export function buildPlan(worlds, rnd = Math.random) {
  return worlds.map(w => shuffle((w.questions || []).map((_, i) => i), rnd).map(qi => {
    const q = w.questions[qi];
    const sh = shuffleWithOptions(q.options || [], correctIndexOf(q), rnd);
    return { qi, order: sh.order, answerIdx: sh.answerIdx };
  }));
}
export function isValidPlan(plan, worlds) {
  if (!Array.isArray(plan) || plan.length !== worlds.length) return false;
  return plan.every((p, wi) => Array.isArray(p) && p.length === worlds[wi].questions.length &&
    p.every(e => e && Number.isInteger(e.qi) && Array.isArray(e.order) && e.order.length === (worlds[wi].questions[e.qi] || {options: []}).options.length));
}
export function emptySlotMap(n) { return Array.from({ length: n }, () => ({})); }

/* Mapeo slot→pregunta: el bloque 'E' número `slot` del mundo `wi` recibe la siguiente
   pregunta del plan que aún no esté asignada. Si ya tenía una, se reutiliza. */
export function assignSlot(slotMap, plan, wi, slot) {
  if (!plan[wi]) return null;
  if (!slotMap[wi]) slotMap[wi] = {};
  const map = slotMap[wi];
  if (map[slot] != null) return map[slot];
  const used = new Set(Object.values(map).map(Number));
  for (let p = 0; p < plan[wi].length; p++) {
    if (!used.has(p)) { map[slot] = p; return p; }
  }
  return null;
}
/* Vista de una pregunta del plan: enunciado, opciones ya barajadas, índice correcto. */
export function questionView(worlds, plan, wi, pos) {
  const w = worlds[wi]; const e = plan[wi][pos]; const q = w.questions[e.qi];
  return {
    id: q.id, q: q.q, options: e.order.map(i => q.options[i]), answerIdx: e.answerIdx,
    subtopic: q.subtopic || w.subtopic || '', explanation: q.explanation || '', difficulty: q.difficulty || 1
  };
}

/* ─── Intentos (gate de un solo intento) ─── */
export function recordMatches(rec, normFull, course) {
  const a = normalizeName(((rec.student_lastname || '') + ' ' + (rec.student_name || '')).trim());
  const b = normalizeName(((rec.student_name || '') + ' ' + (rec.student_lastname || '')).trim());
  const c = normalizeName(((rec.student_lastname || '') + ', ' + (rec.student_name || '')).trim());
  if (!(a === normFull || b === normFull || c === normFull)) return false;
  if (course && rec.course && normalizeName(rec.course) !== normalizeName(course)) return false;
  return true;
}
export function isCompletedRow(r) {
  return !!(r && r.answers && r.answers.completed === true);
}

/* ─── Fila de Supabase (mismo esquema que la referencia + score_game) ─── */
export function buildResultRow({ studentName, studentLastname, course, examId, answered, total, coins, scoreGame, worlds, grade, timestamp, extra }) {
  const correct = answered.filter(a => a.ok).length;
  return {
    student_name: studentName,
    student_lastname: studentLastname,
    course: course,
    exam_id: examId,
    score: correct,
    total: total,
    grade: parseFloat(grade != null ? grade : computeGrade(correct, total)),
    timestamp: timestamp || new Date().toISOString(),
    attempt: 1,
    answers: Object.assign({}, extra || {}, {
      completed: true,
      coins: coins,
      score_game: scoreGame,
      items: answered.map(a => ({
        qi: a.qi, wi: a.wi, slot: a.slot, id: a.id,
        world: (worlds[a.wi] && worlds[a.wi].code) || '',
        question: a.q, options: a.options, correct: a.correctIdx, selected: a.selectedIdx,
        ok: a.ok, topic: a.subtopic, difficulty: a.difficulty, hint: !!a.hint
      }))
    })
  };
}

/* ─── Panel docente: promedios y CSV ─── */
export function courseAverages(rows) {
  const acc = {};
  rows.forEach(r => {
    const c = r.course || '1BGU';
    if (!acc[c]) acc[c] = { course: c, n: 0, sum: 0 };
    acc[c].n++; acc[c].sum += Number(r.grade || 0);
  });
  return Object.values(acc).sort((a, b) => a.course.localeCompare(b.course))
    .map(x => ({ course: x.course, n: x.n, avg: Math.round((x.sum / x.n) * 100) / 100 }));
}
export function toCSV(rows) {
  const header = ['Nombre', 'Apellido', 'Curso', 'Correctas', 'Total', 'Nota /10', 'Puntos GP', 'Personaje', 'Fecha'];
  const esc = v => { const s = String(v == null ? '' : v); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const lines = [header.join(',')];
  rows.forEach(r => {
    lines.push([
      esc(r.student_name || ''), esc(r.student_lastname || ''), esc(r.course || '1BGU'),
      r.score || 0, r.total || 0, Number(r.grade || 0).toFixed(1),
      (r.answers && r.answers.score_game) || 0,
      esc((r.answers && r.answers.character) || ''),
      esc(r.timestamp ? new Date(r.timestamp).toLocaleString('es-EC') : '')
    ].join(','));
  });
  return '﻿' + lines.join('\r\n');
}
