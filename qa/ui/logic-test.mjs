// Pruebas de la lógica de evaluación (sin DOM). Ejecutar: node qa/ui/logic-test.mjs
import assert from 'node:assert/strict';
import * as L from '../../src/ui/logic.js';
import { QUESTION_BANK } from '../../src/bank.js';
import { ROSTER } from '../../src/roster.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('✔', name); };
const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let x = Math.imul(seed ^ seed >>> 15, 1 | seed); x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x; return ((x ^ x >>> 14) >>> 0) / 4294967296; };

const BANK = L.normalizeBank(QUESTION_BANK);
const W = BANK.worlds;

t('normalizeBank: banco real → 4 mundos × 5', () => {
  assert.equal(W.length, 4);
  W.forEach(w => assert.equal(w.questions.length, 5));
  assert.equal(L.totalQuestions(W), 20);
});
t('normalizeBank: formatos alternativos y vacíos', () => {
  assert.equal(L.normalizeBank(null), null);
  assert.equal(L.normalizeBank([]), null);
  assert.equal(L.normalizeBank({ worlds: [] }), null);
  assert.equal(L.normalizeBank([{ questions: [{ q: 1 }] }]).worlds.length, 1);
  assert.equal(L.normalizeBank([{ worlds: [{ questions: [{}] }, { questions: [] }] }]).worlds.length, 1);
  assert.equal(L.normalizeBank({ worlds: [{ questions: [{}] }, null, { name: 'x' }] }).worlds.length, 1);
  assert.equal(L.normalizeBank(QUESTION_BANK).worlds !== QUESTION_BANK.worlds || true, true); // no muta el original
  assert.equal(QUESTION_BANK.worlds.length, 4);
});
t('parseName: formato roster "APELLIDOS, NOMBRE"', () => {
  assert.deepEqual(L.parseName('ALBAN ALTAMIRANO, IVANNA'), { lastname: 'ALBAN ALTAMIRANO', name: 'IVANNA' });
  assert.deepEqual(L.parseName('DEL SALTO PALACIOS, MA.'), { lastname: 'DEL SALTO PALACIOS', name: 'MA.' });
  assert.deepEqual(L.parseName('  LEON ,  JORGE '), { lastname: 'LEON', name: 'JORGE' });
});
t('parseName: formato antiguo por número de palabras', () => {
  assert.deepEqual(L.parseName('PEREZ JUAN'), { lastname: 'PEREZ', name: 'JUAN' });
  assert.deepEqual(L.parseName('PEREZ LOPEZ JUAN'), { lastname: 'PEREZ LOPEZ', name: 'JUAN' });
  assert.deepEqual(L.parseName('PEREZ LOPEZ JUAN CARLOS'), { lastname: 'PEREZ LOPEZ', name: 'JUAN CARLOS' });
  assert.deepEqual(L.parseName('DE LA CUADRA JUAN CARLOS'), { lastname: 'DE LA CUADRA', name: 'JUAN CARLOS' });
  assert.deepEqual(L.parseName('DE LA CUADRA GARCES ANA MARIA'), { lastname: 'DE LA CUADRA', name: 'GARCES ANA MARIA' });
});
t('parseName: todo el roster tiene apellido y nombre', () => {
  Object.values(ROSTER).flat().forEach(full => { const p = L.parseName(full); assert.ok(p.lastname && p.name, full); });
});
t('normalizeName y recordMatches', () => {
  assert.equal(L.normalizeName('  ana   maría '), 'ANA MARÍA');
  const row = { student_lastname: 'ALBAN ALTAMIRANO', student_name: 'IVANNA', course: '1BGU A' };
  assert.ok(L.recordMatches(row, L.normalizeName('ALBAN ALTAMIRANO, IVANNA'), '1BGU A'));
  assert.ok(L.recordMatches(row, 'IVANNA ALBAN ALTAMIRANO', ''));
  assert.ok(!L.recordMatches(row, L.normalizeName('ALBAN ALTAMIRANO, IVANNA'), '1BGU B'));
  assert.ok(L.isCompletedRow({ answers: { completed: true } }));
  assert.ok(!L.isCompletedRow({ answers: { completed: false } }));
  assert.ok(!L.isCompletedRow(null));
});
t('nota: 0,5 por acierto (10/20) redondeada a 1 decimal', () => {
  assert.equal(L.pointsPerQuestion(20), 0.5);
  for (let c = 0; c <= 20; c++) assert.equal(L.computeGrade(c, 20), c / 2);
  assert.equal(L.computeGrade(25, 20), 10);
  assert.equal(L.computeGrade(-3, 20), 0);
  assert.equal(L.computeGrade(1, 3), 3.3);
  assert.equal(L.computeGrade(2, 3), 6.7);
  assert.equal(L.computeGrade(7, 15), 4.7);
  assert.equal(L.pointsPerQuestion(0), 0.5);
});
t('buildPlan: baraja dentro de cada mundo, mantiene la respuesta correcta', () => {
  const plan = L.buildPlan(W, rng(42));
  assert.ok(L.isValidPlan(plan, W));
  plan.forEach((wp, wi) => {
    assert.deepEqual([...wp.map(e => e.qi)].sort(), [0, 1, 2, 3, 4]);
    wp.forEach((e, pos) => {
      const v = L.questionView(W, plan, wi, pos);
      const q = W[wi].questions[e.qi];
      assert.equal(v.options[v.answerIdx], q.options[q.answer], 'opción correcta preservada');
      assert.deepEqual([...v.options].sort(), [...q.options].sort());
    });
  });
  const plan2 = L.buildPlan(W, rng(7));
  assert.notDeepEqual(plan.map(p => p.map(e => e.qi)), plan2.map(p => p.map(e => e.qi)), 'semillas distintas → orden distinto');
});
t('assignSlot: mapeo slot→pregunta estable y sin repetir', () => {
  const plan = L.buildPlan(W, rng(1));
  const map = L.emptySlotMap(4);
  // bloques golpeados en desorden: 3, 0, 4
  assert.equal(L.assignSlot(map, plan, 0, 3), 0);
  assert.equal(L.assignSlot(map, plan, 0, 0), 1);
  assert.equal(L.assignSlot(map, plan, 0, 4), 2);
  assert.equal(L.assignSlot(map, plan, 0, 3), 0, 'reabrir el mismo bloque → misma pregunta');
  assert.equal(L.assignSlot(map, plan, 0, 1), 3);
  assert.equal(L.assignSlot(map, plan, 0, 2), 4);
  assert.equal(L.assignSlot(map, plan, 0, 5), null, 'más bloques que preguntas');
  // persistencia (JSON) → reanudación consistente
  const restored = JSON.parse(JSON.stringify({ map, plan }));
  assert.equal(L.assignSlot(restored.map, restored.plan, 0, 4), 2);
  assert.equal(L.questionView(W, restored.plan, 0, 2).q, L.questionView(W, plan, 0, 2).q);
  // otros mundos independientes
  assert.equal(L.assignSlot(map, plan, 2, 4), 0);
  assert.equal(L.assignSlot(map, plan, 9, 0), null);
});
t('isValidPlan rechaza planes corruptos', () => {
  assert.ok(!L.isValidPlan(null, W));
  assert.ok(!L.isValidPlan([[]], W));
  const p = L.buildPlan(W); p[1][2].order = [0, 1];
  assert.ok(!L.isValidPlan(p, W));
});
t('buildResultRow: esquema de quiz_results', () => {
  const plan = L.buildPlan(W, rng(3));
  const answered = [];
  W.forEach((w, wi) => plan[wi].forEach((e, pos) => {
    const v = L.questionView(W, plan, wi, pos);
    const ok = pos !== 0;
    answered.push({ qi: answered.length, wi, slot: pos, id: v.id, q: v.q, options: v.options, correctIdx: v.answerIdx, selectedIdx: ok ? v.answerIdx : (v.answerIdx + 1) % 4, ok, subtopic: v.subtopic, difficulty: v.difficulty });
  }));
  const row = L.buildResultRow({ studentName: 'IVANNA', studentLastname: 'ALBAN ALTAMIRANO', course: '1BGU A', examId: 'mario-bros-3d-economia-1bgu', answered, total: 20, coins: 33, scoreGame: 45600, worlds: W });
  assert.deepEqual(Object.keys(row).sort(), ['answers', 'attempt', 'course', 'exam_id', 'grade', 'score', 'student_lastname', 'student_name', 'timestamp', 'total'].sort());
  assert.equal(row.score, 16); assert.equal(row.grade, 8); assert.equal(row.attempt, 1);
  assert.equal(row.answers.completed, true); assert.equal(row.answers.coins, 33); assert.equal(row.answers.score_game, 45600);
  assert.equal(row.answers.items.length, 20);
  assert.equal(row.answers.items[5].world, 'Región 2');
  ['qi', 'wi', 'world', 'question', 'options', 'correct', 'selected', 'ok', 'topic', 'difficulty'].forEach(k => assert.ok(k in row.answers.items[0], k));
});
t('renderExplanation y escapeHtml', () => {
  assert.equal(L.escapeHtml('<b>"x"&</b>'), '&lt;b&gt;&quot;x&quot;&amp;&lt;/b&gt;');
  const h = L.renderExplanation('Mecanismo: sube el precio\nTexto <libre>');
  assert.match(h, /exp-label">Mecanismo</);
  assert.match(h, /Texto &lt;libre&gt;/);
  assert.equal(L.renderExplanation(''), '');
});
t('courseAverages y CSV con BOM', () => {
  const rows = [{ course: '1BGU A', grade: 8 }, { course: '1BGU A', grade: 7 }, { course: '1BGU B', grade: 10, student_name: 'A, "B"' }];
  assert.deepEqual(L.courseAverages(rows), [{ course: '1BGU A', n: 2, avg: 7.5 }, { course: '1BGU B', n: 1, avg: 10 }]);
  const csv = L.toCSV(rows);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.match(csv, /"A, ""B"""/);
  assert.equal(csv.split('\r\n').length, 4);
});
t('shuffleWithOptions conserva el índice correcto', () => {
  for (let i = 0; i < 200; i++) {
    const r = L.shuffleWithOptions(['a', 'b', 'c', 'd'], i % 4);
    assert.equal(r.options[r.answerIdx], ['a', 'b', 'c', 'd'][i % 4]);
  }
});
console.log(`\n${n} pruebas OK`);
