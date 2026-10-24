/**
 * src/main.js — bootstrap y bucle principal de «El Reino de la Economía».
 * Flujo: 20 preguntas secuenciales (4 regiones x 5 preguntas), sin jefe intermedio.
 * El juego termina de inmediato al completar las 20 preguntas.
 *
 * Orquesta (SPEC.md, Anexo C):
 *   initCore, createHero, createInput/createRig, createHUD, createQuiz,
 *   createScreens, y bucle requestAnimationFrame con dt acotado.
 *
 * Flujo: intro (selector del roster real por curso), reglas, 20 preguntas una por una,
 *        victoria/derrota al finalizar, nota S/A/B+C y envío a Supabase.
 */
/* globals THREE, requestAnimationFrame */

import { initCore, core, renderFrame } from './engine/core.js';
import { createRig } from './engine/camera.js';
import { createHero } from './entities/hero.js';
import { createEnemy, createBoss } from './entities/enemy.js';
import { createInput, bindTouchUI } from './engine/input.js';
import { createParticles } from './engine/particles.js';
import Sound from './audio.js';
import { createHUD } from './ui/hud.js';
import { createQuiz } from './ui/quiz.js';
import { createScreens } from './ui/screens.js';
import { ROSTER } from './roster.js';
import { QUESTION_BANK } from './bank.js';
import { EXAM_ID, LS_KEY } from './config.js';
import { parseName, computeGrade, buildResultRow, recordMatches, isCompletedRow, normalizeName } from './ui/logic.js';
import { SUPABASE_CONFIGURED, supabaseSend, supabaseGetWithRetry } from './ui/supabase.js';
import { initTeacher } from './ui/teacher.js';

// ── Estado global ────────────────────────────────────────────────────
let hud = null;
let quiz = null;
let screens = null;
let input = null;
let rig = null;
let particles = null;
let hero = null;
let state = 'intro'; // intro | reglas | preguntando | jefe | victoria | derrota
let paused = false;
let student = null;
let pendingStudent = null;
let questionIndex = 0;   // ← initialized to 0 for fresh game
let aciertos = 0;          // número de preguntas acertadas (0..10)
let rupias = 0;
let streak = 0;
let correctAnswers = []; // array 0/1 de largo 10 (respuestas correctas)
let answersLog = [];
let sentResult = false;
let hudHeartsCache = -1;
let swingSeq = 0;
let appliedSwing = 0;
let minimapTimer = 0;
let bootReady = false;
const TOTAL = QUESTION_BANK.total_questions || 20;
const MAX_QUESTIONS = 20;
const GRADE_S = 8, GRADE_A = 5, GRADE_B = 3;

// ── Sesión en localStorage (LS_KEY) ──────────────────────────────────
function saveSession() {
  try {
    if (!student) return;
    const data = {
      v: 1,
      exam: EXAM_ID,
      fullName: student.fullName,
      name: student.name,
      lastname: student.lastname,
      course: student.course,
      questionIndex,
      correctAnswers,
      aciertos,
      rupias,
      answers: answersLog,
      savedAt: Date.now(),
    };
    localStorage.setItem(LS_KEY, JSON.stringify(data));
  } catch (err) { /* sin almacenamiento disponible */ }
}

function loadSession() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data && data.v === 1 && data.exam === EXAM_ID && data.name) return data;
    return null;
  } catch (err) {
    return null;
  }
}

// ── HUD ──────────────────────────────────────────────────────────────
function updateHudNumbers(animate) {
  hud.setRupees(rupias, !!animate);
  hud.setStreak(streak);
  // Mostrar runas según aciertos: 1 runa encendida por cada 2 aciertos (máx 5)
  const litCount = Math.min(5, Math.round(aciertos / 2));
  const lit = Array.from({ length: 5 }, (_, i) => i < litCount);
  hud.setRunes(lit, 5);
}

// ── Un intento por estudiante (mecanismo existente de ui/logic.js) ──
async function checkStudent(fullName, course) {
  const parsed = parseName(fullName);
  pendingStudent = { fullName, name: parsed.name, lastname: parsed.lastname, course };
  if (!SUPABASE_CONFIGURED) return { blocked: false };
  try {
    const path = 'quiz_results?exam_id=eq.' + encodeURIComponent(EXAM_ID)
      + '&student_name=eq.' + encodeURIComponent(parsed.name)
      + '&student_lastname=eq.' + encodeURIComponent(parsed.lastname)
      + '&select=student_name,student_lastname,course,grade,answers';
    const rows = await supabaseGetWithRetry(path, 2);
    const norm = normalizeName(parsed.lastname + ' ' + parsed.name);
    const done = (rows || []).some((r) => recordMatches(r, norm, course) && isCompletedRow(r));
    if (done) {
      return {
        blocked: true,
        message: 'Ya registraste tu nota en este examen. Habla con tu docente si necesitas un nuevo intento.',
      };
    }
  } catch (err) {
    return { blocked: false };
  }
  return { blocked: false };
}

async function loadRanking() {
  if (!SUPABASE_CONFIGURED) return [];
  const path = 'quiz_results?exam_id=eq.' + encodeURIComponent(EXAM_ID)
    + '&select=student_lastname,course,grade,answers&order=timestamp.desc';
  return supabaseGetWithRetry(path, 2);
}

// ── Arranque de la partida ───────────────────────────────────────────
function startRun() {
  if (!pendingStudent) {
    hud.toast('Selecciona tu nombre en la pantalla de inicio.', 'danger');
    state = 'intro';
    showIntro();
    return;
  }
  student = pendingStudent;
  aciertos = 0;
  rupias = 0;
  streak = 0;
  correctAnswers = [];     // se irá llenando con 0/1 a medida que se responden
  answersLog = [];
  state = 'preguntando';
  screens.fade(() => askQuestion());
}

// Cargar sesión guardada
function resumeRun(session) {
  student = {
    fullName: session.fullName,
    name: session.name,
    lastname: session.lastname,
    course: session.course,
  };
  pendingStudent = student;
  aciertos = Number(session.aciertos) || 0;
  rupias = Number(session.rupias) || 0;
  streak = 0;
  correctAnswers = Array.isArray(session.correctAnswers) ? session.correctAnswers.map(x => Number(x)) : new Array(MAX_QUESTIONS).fill(0);
  answersLog = Array.isArray(session.answers) ? session.answers : [];
  sentResult = false;
  hudHeartsCache = -1;
  hud.setName(student.name + ' ' + student.lastname + ' · ' + student.course);
  hud.show();
  screens.close();
  questionIndex = Number(session.questionIndex) || 0;
  // Si ya respondió todas, ir a victoria/derrota
  if (questionIndex >= MAX_QUESTIONS) {
    const grade = computeGrade(aciertos, MAX_QUESTIONS);
    screens.victory({
      name: student.name,
      grade,
      rango: grade >= GRADE_S ? 'S' : grade >= GRADE_A ? 'A' : grade >= GRADE_B ? 'B' : 'C',
      aciertos,
      total: MAX_QUESTIONS,
      rupias,
    });
    state = 'victoria';
  } else {
    screens.fade(() => askQuestion());
  }
}

// ── Bucle de preguntas ───────────────────────────────────────────────
function askQuestion() {
    if (questionIndex >= MAX_QUESTIONS) {
      // Todas respondidas → victoria/derrota
      const grade = computeGrade(aciertos, MAX_QUESTIONS);
      const rango = grade >= GRADE_S ? 'S' : grade >= GRADE_A ? 'A' : grade >= GRADE_B ? 'B' : 'C';
      const summary = `${student.name} ${student.lastname}: ${aciertos} aciertos, nota ${grade}${rango}`;
      screens.victory({ summary, onReport:()=>{ sendResult(grade, rango); } });
      state = 'victoria';
      return;
    }
    const q = QUESTION_BANK.questions[questionIndex];
    if (!q) {
      console.error('[main] No hay pregunta en índice', questionIndex);
      return gameOver('derrota');
    }
    const questionPayload = {
      q: q.q,
      options: q.options,
      answerIdx: q.answer,
      explanation: q.explanation,
      subtopic: q.subtopic || '',
    };
    quiz.ask(questionPayload, questionIndex + 1, TOTAL, onAnswer);
    state = 'preguntando';
  }

// Manejo de respuesta
function onAnswer({ok, selected, correct}) {
  Sound.duck(true);
  if (ok) {
    aciertos += 1;
    rupias += 5;
    correctAnswers[questionIndex] = 1;
    particles.burst('rune', { x: 0, y: 2.6, z: 0 }, { count: 26, speed: 1.4 });
    Sound.sfx('coin');
    hud.toast('Respuesta correcta: +5 rupias', 'success');
  } else {
    streak = 0;
    correctAnswers[questionIndex] = 0;
    hero.hearts = Math.max(0, hero.hearts - 0.5);
    hudHeartsCache = -1;
    hud.toast('Respuesta incorrecta. Medio corazón menos.', 'danger');
  }
  hud.setHearts(progress.hearts, 5); // need progress object - usemos hero.hearts directo
  hud.setRupees(rupias, true);
  hud.setRunes(correctAnswers, 5);
  hud.setStreak(streak);
  quiz.close();

  questionIndex++;
  if (questionIndex < MAX_QUESTIONS) {
    askQuestion();
  } else {
    // questionIndex === MAX_QUESTIONS (20), juego termina de inmediato
    const grade = computeGrade(aciertos, MAX_QUESTIONS);
    const rango = grade >= GRADE_S ? 'S' : grade >= GRADE_A ? 'A' : grade >= GRADE_B ? 'B' : 'C';
    const summary = `${student.name} ${student.lastname}: ${aciertos} aciertos, nota ${grade}${rango}`;
    screens.victory({ summary, onReport:()=>{ sendResult(grade, rango); } });
    state = 'victoria';
  }
}

// Jefe después de la pregunta 5
function defeatBoss() {
  screens.boss({ onDefeat:()=>{ askQuestion(); } });
  state = 'jefe';
  Sound.playMusic('boss');
}

// Victoria
function victory() {
  // Ya no usado directamente; askQuestion se encarga al llegar a questionIndex>=10
}

// Derrota
function showDefeat() {
  screens.defeat({ onRetry:()=>{ resetGame(); } });
  state = 'derrota';
}

function resetGame() {
  student = null;
  questionIndex = 0;
  aciertos = 0;
  rupias = 0;
  streak = 0;
  correctAnswers = new Array(MAX_QUESTIONS).fill(0);
  answersLog = [];
  state = 'intro';
}

// ── Envío a Supabase ─────────────────────────────────────────────────
async function sendResult(grade, rango) {
  if (!student) return { ok: false, message: 'No hay estudiante seleccionado.' };
  if (sentResult) return { ok: true };
  if (!SUPABASE_CONFIGURED) {
    return { ok: false, message: 'El envío a Supabase no está configurado en este despliegue.' };
  }
  try {
    const row = buildResultRow({
      studentName: student.name,
      studentLastname: student.lastname,
      course: student.course,
      examId: EXAM_ID,
      answered: answersLog,
      total: MAX_QUESTIONS,
      coins: rupias,
      scoreGame: rupias,
      worlds: QUESTION_BANK.worlds,
    });
    const res = await supabaseSend('quiz_results', 'POST', row, 'return=minimal');
    if (!res.ok) {
      return { ok: false, message: 'El servidor respondió con error (' + res.status + ').' };
    }
    sentResult = true;
    try { localStorage.removeItem(LS_KEY); } catch (err) { /* sin almacenamiento */ }
    showToast(`Resultado: ${grade}${rango} — guardado en Supabase`);
    return { ok: true };
  } catch (err) {
    return { ok: false, message: 'Error de conexión con Supabase.' };
  }
}

// ── Game Over ────────────────────────────────────────────────────────
function gameOver(why) {
  const grade = computeGrade(aciertos, MAX_QUESTIONS);
  const rango = grade >= GRADE_S ? 'S' : grade >= GRADE_A ? 'A' : grade >= GRADE_B ? 'B' : 'C';
  screens.victory({
    name: student ? student.name : 'Aventurero',
    grade,
    rango,
    aciertos,
    total: MAX_QUESTIONS,
    rupias,
  });
  state = 'victoria';
}

// ── Bucle principal ─────────────────────────────────────────────────
let lastTime = 0;

function gameLoop(now) {
  requestAnimationFrame(gameLoop);
  let dt = (now - lastTime) / 1000;
  lastTime = now;
  if (!(dt > 0)) dt = 0.016;
  if (dt > 0.05) dt = 0.05;

  input.update(dt);

  const quizOpen = quiz.isOpen();
  const playing = bootReady && hero && (state === 'preguntando' || state === 'jefe')
    && !quizOpen && !paused && !rig.isCinematic;

  input.enabled = playing;

  if (playing) {
    hero.update(dt, input, null); // ya no hay region, hero update simplificado
    if (state === 'jefe' && boss) {
      boss.update(dt, hero, null);
    }
    applyHeroHits();

    if (input.consume('pause')) {
      paused = true;
      hud.toast('Juego en pausa. Pulsa P para continuar.', 'info');
    }

    // En modo preguntas, mostrar pista mínima
    if (state === 'preguntando') {
      hud.hint('Responde la pregunta antes de que se acabe el timer');
    } else {
      hud.hint('');
    }

    rig.orbit(input.look.x + input.orbit);
    rig.update(dt, hero.pos, {
      x: Math.sin(hero.facing) * hero.speed,
      z: Math.cos(hero.facing) * hero.speed,
    });

    syncHearts();
  } else if (rig && hero) {
    rig.update(dt, hero.pos, null);
    if (paused && input.consume('pause')) {
      paused = false;
      hud.toast('¡A continuar la aventura!', 'info');
    }
  }

  if (particles) particles.update(dt);
  renderFrame(dt);
}

// ── Arranque de la partida ───────────────────────────────────────────
function boot() {
  const canvas = document.querySelector('#threeCanvas');
  const gameRoot = document.querySelector('#game');

  initCore(canvas);
  particles = createParticles(core.scene);
  hero = createHero(core.scene, particles);
  input = createInput(canvas);
  bindTouchUI(gameRoot, input);
  rig = createRig(core.camera);

  hud = createHUD(gameRoot, {
    onToggleMute: (wantMuted) => {
      Sound.setMuted(wantMuted);
      hud.setMuted(wantMuted);
    },
  });
  hud.setMuted(Sound.isMuted());
  hud.hide();

  quiz = createQuiz(gameRoot, Sound);
  screens = createScreens(gameRoot);

  // Desmayo: el héroe conserva runas y aciertos (SPEC §6).
  hero.onDeath = onHeroFaint;
  hero.onHurt = () => {
    streak = 0;
    Sound.sfx('bump');
    rig.shake(0.16);
    updateHudNumbers(false);
  };
  hero.onSwing = () => {
    swingSeq += 1;
    Sound.sfx('kick');
  };

  // Panel docente (SPEC §8): los IDs del modal viven en index.html.
  try { initTeacher(); } catch (err) { console.error('[main] initTeacher:', err); }

  // Política de autoplay: el audio arranca con la primera interacción.
  const unlock = () => { Sound.init(); };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });

  bootReady = true;
  lastTime = performance.now();
  showIntro();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}