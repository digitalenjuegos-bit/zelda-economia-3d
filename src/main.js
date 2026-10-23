/**
 * src/main.js — bootstrap y bucle principal de «El Reino de la Economía».
 *
 * Orquesta (SPEC.md, Anexo C):
 *   initCore, createHero, createInput/createRig, createHUD, createQuiz,
 *   createScreens, buildRegion y bucle requestAnimationFrame con dt acotado.
 *
 * Flujo: intro (selector del roster real por curso), verificación de intento,
 * reglas, región 3D, santuarios con pregunta, runas, jefe, región siguiente,
 * victoria con nota (aciertos × 0,5 sobre 10) y envío a Supabase.
 */
import { initCore, core, renderFrame } from './engine/core.js';
import { createRig } from './engine/camera.js';
import { REGIONS, buildRegion } from './engine/world.js';
import { createHero } from './entities/hero.js';
import { createEnemy, createBoss } from './entities/enemy.js';
import { createInput, bindTouchUI } from './engine/input.js';
import { createParticles } from './engine/particles.js';
import { sampleHeight } from './engine/physics.js';
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
let region = null;
let regionIndex = 0;
let boss = null;
const enemies = [];

// intro | reglas | explorando | pregunta | jefe | transicion | victoria
let state = 'intro';
let paused = false;
let student = null;
let pendingStudent = null;
let aciertos = 0;
let rupias = 0;
let streak = 0;
let litByRegion = [];
let answersLog = [];
let sentResult = false;
let hudHeartsCache = -1;
let swingSeq = 0;
let appliedSwing = 0;
let minimapTimer = 0;
let bootReady = false;

const REGION_MUSIC = ['overworld', 'underground', 'forest', 'castle'];
const TOTAL = QUESTION_BANK.total_questions || 20;

const $one = (sel) => document.querySelector(sel);

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
      regionIndex,
      litByRegion,
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
  hud.setRunes(litByRegion[regionIndex] || [], 5);
}

function syncHearts() {
  const halves = Math.round((hero ? hero.hearts : 0) * 2);
  if (halves !== hudHeartsCache) {
    hudHeartsCache = halves;
    if (hud) hud.setHearts(hero.hearts, hero.maxHearts);
  }
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
    // Si la verificación no llega a completarse, se permite jugar.
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

// ── Construcción de regiones ─────────────────────────────────────────
function teardownRegion() {
  for (const e of enemies) {
    try { e.dispose(); } catch (err) { /* ya eliminado */ }
  }
  enemies.length = 0;
  if (boss) {
    try { boss.dispose(); } catch (err) { /* ya eliminado */ }
    boss = null;
  }
  if (region) {
    try { region.dispose(); } catch (err) { /* ya eliminada */ }
    region = null;
  }
}

function onEnemyDeath(enemy) {
  rupias += enemy.rupees || 2;
  streak += 1;
  Sound.sfx('stomp');
  Sound.sfx('coin');
  hud.toast('Enemigo derrotado: +' + (enemy.rupees || 2) + ' rupias', 'success');
  updateHudNumbers(true);
}

function loadRegion(idx, savedLit) {
  if (!bootReady) return;
  screens.loading(true);
  // Deja que el overlay de carga pinte antes de la construcción pesada.
  setTimeout(() => {
    try {
      teardownRegion();
      regionIndex = Math.max(0, Math.min(REGIONS.length - 1, idx));
      region = buildRegion(core.scene, regionIndex);

      rig.groundFn = (x, z) => (region ? sampleHeight(region, x, z) : 0);

      const sp = region.spawn;
      hero.respawn(sp.x, sp.z);
      hero.isDead = false;
      hero.hearts = hero.maxHearts;
      hero.pos.y = sampleHeight(region, sp.x, sp.z);
      hudHeartsCache = -1;

      // Runas ya encendidas (reanudación de sesión).
      const litRow = savedLit && savedLit.length === 5 ? savedLit : (litByRegion[regionIndex] || []);
      region.shrines.forEach((s, i) => { if (litRow[i]) s.setLit(true); });
      litByRegion[regionIndex] = region.shrines.map((s) => !!s.lit);

      for (const spawn of region.enemySpawns) {
        enemies.push(createEnemy(core.scene, spawn.type, spawn.x, spawn.z, {
          particles,
          onDeath: onEnemyDeath,
        }));
      }

      core.fitShadows({ x: sp.x, y: 0, z: sp.z }, 60);
      rig.reset({ x: sp.x, y: sampleHeight(region, sp.x, sp.z), z: sp.z });

      hud.setRegion(region.name);
      updateHudNumbers(false);
      syncHearts();

      Sound.playMusic(REGION_MUSIC[regionIndex]);
      state = 'explorando';

      if (litByRegion[regionIndex].every(Boolean)) {
        // Sesión reanudada con las cinco runas: el jefe vuelve a aparecer.
        summonBoss();
      }
      saveSession();
    } catch (err) {
      console.error('[main] loadRegion:', err);
      state = 'intro';
    } finally {
      screens.loading(false);
    }
  }, 80);
}

// ── Santuarios y preguntas ───────────────────────────────────────────
function questionForShrine(shrine) {
  const world = QUESTION_BANK.worlds[regionIndex];
  if (!world || !world.questions) return null;
  const byId = String(shrine.id || '').replace(/^s/, '');
  let q = world.questions.find((x) => String(x.id) === byId);
  if (!q && Number.isInteger(shrine.index)) q = world.questions[shrine.index];
  return q || null;
}

function askShrine(shrine) {
  const q = questionForShrine(shrine);
  if (!q || quiz.isOpen()) return;
  Sound.duck(true);
  state = 'pregunta';
  const asked = answersLog.filter((a) => a.wi === regionIndex).length + 1;
  quiz.ask(
    {
      q: q.q,
      options: q.options,
      answerIdx: Number(q.answer),
      explanation: q.explanation,
      subtopic: q.subtopic || (QUESTION_BANK.worlds[regionIndex] || {}).subtopic || '',
    },
    Math.min(asked, TOTAL),
    TOTAL,
    (res) => handleAnswer(res, shrine, q)
  );
}

function forceFaint() {
  hero.isDead = true;
  onHeroFaint();
}

function onHeroFaint() {
  streak = 0;
  Sound.sfx('die');
  hud.toast('Te has desmayado. Vuelves al punto de entrada con cinco corazones.', 'danger');
  updateHudNumbers(false);
}

function handleAnswer(res, shrine, q) {
  Sound.duck(false);
  const ok = !!(res && res.ok);
  answersLog.push({
    qi: shrine.index,
    wi: regionIndex,
    slot: shrine.index,
    id: q.id,
    q: q.q,
    options: q.options,
    correctIdx: Number(q.answer),
    selectedIdx: res && res.selected !== undefined ? res.selected : -1,
    ok,
    subtopic: q.subtopic || '',
    difficulty: q.difficulty || 1,
  });

  if (ok) {
    aciertos += 1;
    rupias += 5;
    shrine.setLit(true);
    litByRegion[regionIndex][shrine.index] = true;
    if (hero.hearts < hero.maxHearts) hero.heal(1);
    particles.burst('rune', { x: shrine.x, y: shrine.y + 2.6, z: shrine.z }, { count: 26, speed: 1.4 });
    Sound.sfx('coin');
    hud.toast('Runa encendida: +' + 5 + ' rupias', 'success');
    updateHudNumbers(true);
    state = 'explorando';
    saveSession();
    if (litByRegion[regionIndex].every(Boolean)) {
      hud.toast('¡Las cinco runas brillan! El guardián de la región ha despertado.', 'danger');
      setTimeout(() => { if (state === 'explorando') summonBoss(); }, 1400);
    }
  } else {
    streak = 0;
    // Medio corazón menos; el desmayo conserva runas y aciertos (SPEC §6).
    hero.hearts = Math.max(0, hero.hearts - 0.5);
    hudHeartsCache = -1;
    updateHudNumbers(false);
    state = 'explorando';
    if (hero.hearts <= 0) forceFaint();
  }
}

// ── Jefe ─────────────────────────────────────────────────────────────
function summonBoss() {
  if (boss || !region) return;
  state = 'jefe';
  Sound.playMusic('boss');
  boss = createBoss(core.scene, regionIndex, region.bossArena);
  boss.onHit = () => Sound.sfx('bossHit');
  boss.onDeath = onBossDefeated;
  core.fitShadows({ x: region.bossArena.x, y: 0, z: region.bossArena.z }, 46);
  hud.toast('¡' + REGIONS[regionIndex].bossName + ' ha despertado! Derrota al guardián.', 'danger');
}

function onBossDefeated() {
  if (state !== 'jefe') return;
  state = 'transicion';
  rupias += 20;
  updateHudNumbers(true);
  Sound.sfx('bossDie');
  Sound.stopMusic();
  if (region && region.portal) region.portal.activate();
  if (particles && boss) {
    particles.burst('spark', { x: boss.pos.x, y: boss.pos.y + 2, z: boss.pos.z }, { count: 40, speed: 2.4 });
    particles.burst('rupee', { x: boss.pos.x, y: boss.pos.y + 2.5, z: boss.pos.z }, { count: 14, speed: 1.8 });
  }
  const bx = boss ? boss.pos.x : region.bossArena.x;
  const bz = boss ? boss.pos.z : region.bossArena.z;
  setTimeout(() => {
    rig.cinematic(
      null,
      { pos: { x: bx, y: sampleHeight(region, bx, bz) + 5.5, z: bz + 9 }, look: { x: bx, y: 2, z: bz } },
      1.9,
      () => showRegionClear()
    );
  }, 900);
}

function showRegionClear() {
  Sound.sfx('stageClear');
  screens.regionClear({
    name: REGIONS[regionIndex].name,
    bossName: REGIONS[regionIndex].bossName,
    focus: REGIONS[regionIndex].focus,
    aciertos,
    rupias,
    isLast: regionIndex >= REGIONS.length - 1,
  }, gotoNextRegion);
}

function gotoNextRegion() {
  if (boss) {
    try { boss.dispose(); } catch (err) { /* ya eliminado */ }
    boss = null;
  }
  regionIndex += 1;
  if (regionIndex >= REGIONS.length) {
    regionIndex = REGIONS.length - 1;
    doVictory();
    return;
  }
  saveSession();
  screens.fade(() => loadRegion(regionIndex));
}

// ── Victoria y envío ─────────────────────────────────────────────────
function gradeRango(grade) {
  if (grade >= 8) return 'S';
  if (grade >= 5) return 'A';
  if (grade >= 3) return 'B';
  return 'C';
}

function doVictory() {
  state = 'victoria';
  Sound.stopMusic();
  Sound.sfx('fanfare');
  Sound.playMusic('results');
  const grade = computeGrade(aciertos, TOTAL);
  screens.victory({
    name: student ? student.name : 'Aventurero',
    grade,
    rango: gradeRango(grade),
    aciertos,
    total: TOTAL,
    rupias,
  }, sendResult, backToIntro);
}

async function sendResult() {
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
      total: TOTAL,
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
    return { ok: true };
  } catch (err) {
    return { ok: false, message: 'Error de conexión con Supabase.' };
  }
}

// ── Interacción con el mundo ────────────────────────────────────────
function nearestTarget() {
  if (!region) return null;
  let best = null;
  const consider = (kind, x, z, maxDist, obj) => {
    const d = Math.hypot(hero.pos.x - x, hero.pos.z - z);
    if (d <= maxDist && (!best || d < best.d)) best = { kind, d, obj };
  };
  for (const s of region.shrines) if (!s.lit) consider('shrine', s.x, s.z, 3.8, s);
  for (const c of region.chests) if (!c.opened) consider('chest', c.x, c.z, 2.8, c);
  for (const sg of region.signs) consider('sign', sg.x, sg.z, 3.2, sg);
  if (region.portal) consider('portal', region.portal.x, region.portal.z, 4.2, region.portal);
  return best;
}

function interactWith(target) {
  if (!target) return;
  if (target.kind === 'shrine') {
    askShrine(target.obj);
  } else if (target.kind === 'chest') {
    target.obj.open();
    rupias += 20;
    Sound.sfx('powerup');
    hud.toast('¡Cofre abierto! +20 rupias', 'success');
    updateHudNumbers(true);
  } else if (target.kind === 'sign') {
    hud.toast(target.obj.text || '', 'info');
  } else if (target.kind === 'portal') {
    if (target.obj.active) {
      hud.toast('El portal está abierto. Derrota primero al guardián de la región.', 'info');
    } else {
      hud.toast('El portal se abre cuando las cinco runas están encendidas y cae el guardián.', 'info');
    }
  }
}

// ── Golpes del héroe contra enemigos y jefe ──────────────────────────
function applyHeroHits() {
  const h = hero.attackHit;
  if (!h || !h.active) return;
  if (appliedSwing === swingSeq) return; // un solo golpe por swing
  appliedSwing = swingSeq;
  for (const e of enemies) {
    if (!e.alive) continue;
    if (Math.hypot(e.pos.x - h.x, e.pos.z - h.z) < e.radius + h.radius) {
      e.takeHit(h.damage, h.dir);
      Sound.sfx('bump');
    }
  }
  if (boss && boss.alive && Math.hypot(boss.pos.x - h.x, boss.pos.z - h.z) < boss.radius + h.radius) {
    boss.takeHit(h.damage, h.dir);
  }
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
  answersLog = [];
  litByRegion = [[], [], [], []];
  sentResult = false;
  hudHeartsCache = -1;
  try { localStorage.removeItem(LS_KEY); } catch (err) { /* sin almacenamiento */ }
  hud.setName(student.name + ' ' + student.lastname + ' · ' + student.course);
  hud.show();
  screens.close();
  screens.fade(() => loadRegion(0));
}

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
  answersLog = Array.isArray(session.answers) ? session.answers : [];
  litByRegion = Array.isArray(session.litByRegion) && session.litByRegion.length === 4
    ? session.litByRegion.map((row) => (Array.isArray(row) ? row : []))
    : [[], [], [], []];
  sentResult = false;
  hudHeartsCache = -1;
  hud.setName(student.name + ' ' + student.lastname + ' · ' + student.course);
  hud.show();
  screens.close();
  const idx = Math.max(0, Math.min(REGIONS.length - 1, Number(session.regionIndex) || 0));
  screens.fade(() => loadRegion(idx, litByRegion[idx]));
}

function backToIntro() {
  teardownRegion();
  state = 'intro';
  hud.hide();
  Sound.stopMusic();
  showIntro();
}

function showIntro() {
  const session = loadSession();
  const resume = session && (session.regionIndex > 0
    || (session.litByRegion || []).some((row) => row && row.some(Boolean))
    || (Number(session.aciertos) || 0) > 0)
    ? { regionIndex: session.regionIndex, regionName: REGIONS[session.regionIndex] ? REGIONS[session.regionIndex].name : '', aciertos: session.aciertos }
    : null;
  Sound.playMusic('title');
  screens.intro({
    title: 'El Reino de la Economía',
    subtitle: QUESTION_BANK.subtitle || 'Historia y Ciudadanía · 1BGU',
    roster: ROSTER,
    resume,
    onResume: () => resumeRun(session),
    checkStudent,
    loadRanking,
  }, () => {
    state = 'reglas';
    screens.rules(() => startRun());
  });
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
  const playing = bootReady && hero && region
    && (state === 'explorando' || state === 'jefe')
    && !quizOpen && !paused && !rig.isCinematic;

  input.enabled = playing;

  if (playing) {
    hero.update(dt, input, region);
    for (const e of enemies) e.update(dt, hero, region);
    if (boss) boss.update(dt, hero, region);
    applyHeroHits();

    if (input.consume('pause')) {
      paused = true;
      hud.toast('Juego en pausa. Pulsa P para continuar.', 'info');
    }

    const target = nearestTarget();
    if (target) {
      const hints = {
        shrine: 'Pulsa E para aceptar el desafío del santuario',
        chest: 'Pulsa E para abrir el cofre',
        sign: 'Pulsa E para leer el cartel',
        portal: 'Pulsa E para inspeccionar el portal',
      };
      hud.hint(hints[target.kind] || '');
      if (input.consume('interact')) interactWith(target);
    } else {
      hud.hint('');
    }

    rig.orbit(input.look.x + input.orbit);
    rig.update(dt, hero.pos, {
      x: Math.sin(hero.facing) * hero.speed,
      z: Math.cos(hero.facing) * hero.speed,
    });

    syncHearts();

    minimapTimer += dt;
    if (minimapTimer >= 0.25) {
      minimapTimer = 0;
      hud.drawMinimap(region, { x: hero.pos.x, y: hero.pos.y, z: hero.pos.z, facing: hero.facing }, region.shrines);
    }
  } else if (rig && hero) {
    // Pantallas, pausa, pregunta y cinemática: el rig sigue animándose
    // (es rig.update quien avanza la cinemática del jefe).
    rig.update(dt, hero.pos, null);
    if (paused && input.consume('pause')) {
      paused = false;
      hud.toast('¡A continuar la aventura!', 'info');
    }
  }

  if (particles) particles.update(dt);
  renderFrame(dt);
}

// ── Bootstrap ────────────────────────────────────────────────────────
function boot() {
  const canvas = $one('#threeCanvas');
  const gameRoot = $one('#game');

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
    swingSeq += 1; // marca un nuevo swing para applyHeroHits
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
  requestAnimationFrame(gameLoop);
  showIntro();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
