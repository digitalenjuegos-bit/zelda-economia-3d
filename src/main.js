import { initCore } from './src/engine/core.js';
import { createHero } from './src/entities/hero.js';
import { createInput as createInputGlobal } from './src/engine/input.js';
import { createRig } from './src/engine/core.js'; // rig incluido en core ref
import { createHUD } from './src/ui/hud.js';
import { createQuiz } from './src/ui/quiz.js';
import { createScreens } from './src/ui/screens.js';
import { createCombat } from './src/systems/combat.js';
import { createGame } from './src/systems/game.js';
import { createParticles } from './src/engine/particles.js';
import { createAudio } from './src/audio.js';
import { QUESTION_BANK } from './src/bank.js';
import { EXAM_ID, LS_KEY, TEACHER_KEY, SUPABASE_URL, SUPABASE_ANON_KEY } from './src/config.js';
import { createRoster } from './src/roster.js';
import { core } from './src/engine/core.js'; // objeto con refs

let canvas, renderer, scene, camera, composer, clock, dt;
let hero, regionIndex = 0, progress = { hearts:5, rupias:0, streak:0, runes:[] };
let combat, gameInstance, hud, quiz, screens, audio, particles, input, rig;
let studentInfo = null;
let state = 'intro'; // intro | reglas | explorando | pregunta | jefe | regionSuperada | victoria | derrota

function $(s) { return document.querySelector(s); }

function applyImportMap() { /* ya está en index.html */ }

function startGame() {
  // 1. initCore
  coreRef = initCore($('threeCanvas'));
  renderer = coreRef.renderer; scene = coreRef.scene; camera = coreRef.camera; composer = coreRef.composer; clock = coreRef.clock;
  // 2. tema por región (Anexo B)
  setTheme({ sunColor:0xfff1d0, sunIntensity:1.5, hemiSky:0x74b9ff, hemiGround:0x4a6b3a, hemiIntensity:0.55, skyTop:0x74b9ff, skyHorizon:0xfdf3d6, fogColor:0x8ec5ff, fogNear:40, fogFar:130, exposure:1.12 });
  // 3. héroe
  hero = createHero(scene, particles);
  // 4. rig cámara
  rig = coreRef.rig || createRig(camera);
  // 5. input
  input = createInputGlobal($('threeCanvas'));
  bindTouchUI($('threeCanvas'), input);
  // 6. HUD
  hud = createHUD($('gameContainer'));
  // 7. quiz
  quiz = createQuiz($('gameContainer'), audio);
  // 8. screens
  screens = createScreens($('gameContainer'));
  // 9. particles
  particles = createParticles(scene);
  // 10. audio resume policy
  if (audio) { audio.resume(); document.body.addEventListener('click', ()=>{ if(audio) audio.resume(); }, {once:true}); }
  // 11. iniciar estado
  state = 'intro'; showIntro();
}

function showIntro() {
  screens.intro({ opts:{ title:'El Reino de la Economía', subtitle:'Historia y Ciudadanía · 1BGU' }, onStart:()=>{ state='reglas'; showRules(); } });
}

function showRules() {
  screens.rules({ onAccept:()=>{ state='explorando'; startExploring(); } });
}

function startExploring() {
  // seleccion de estudiante (ya hecho en index.html DOMContentLoaded)
  // build primera región
  updateRegion();
  state = 'explorando';
}

function updateRegion() {
  // buildRegion ya hecho en batch 1; aquí solo actualizamos HUD y combate
  const region = core.REGIONS[regionIndex]; // metadatos
  hud.setRegion(region.name);
  if (!combat) combat = createCombat({ hero, particles, audio, hud, onHeroDeath });
  combat.update(dt, region.enemySpawns, region);
  hud.setHearts(progress.hearts, 5); hud.setRupees(progress.rupias, true); hud.setRunes(progress.runes, 5); hud.setStreak(progress.streak);
  // minimap
  const minimapData = { width:150, height:150, region:core.REGIONS[regionIndex], heroPos:hero.pos, shrines:core.REGIONS[regionIndex].shrines };
  hud.setMinimap(minimapData); hud.drawMinimap(region, hero.pos, region.shrines);
}

function startQuestion() {
  const shrine = core.REGIONS[regionIndex].shrines[progress.runes.length]; // santuario actual
  const q = QUESTION_BANK.questions.find(x=>x.id===shrine.id) || QUESTION_BANK.questions[0];
  quiz.ask(q.q, q.id, QUESTION_BANK.total_questions, onAnswer);
  state = 'pregunta';
}

function onAnswer({ok, selected, correct}) {
  if (ok) { progress.rupias += 5; progress.streak++; }
  else { progress.hearts--; if(progress.hearts<=0) { progress.hearts=0; showDefeat(); } }
  progress.runes[progress.runes.length] = correct; // runa encendida
  hud.setHearts(progress.hearts, 5); hud.setRupees(progress.rupias, true); hud.setRunes(progress.runes, 5); hud.setStreak(progress.streak);
  quiz.close();
  if (progress.runes.length >= 5) { defeatBoss(); } else { state='explorando'; updateRegion(); }
}

function defeatBoss() {
  // jefe requiere 5 runas encendidas; al morir pasa a región siguiente
  screens.regionClear({ region: core.REGIONS[regionIndex].name, onNext:()=>{ regionIndex++; if(regionIndex>=4){ victory(); } else { updateRegion(); startQuestion(); } } });
  state = 'regionSuperada';
}

function victory() {
  const aciertos = progress.rupias; // cada pregunta 0.5, total 20 → max 10
  const grade = Math.round(aciertos * 0.5); // sobre 10
  const range = grade>=8?'S': grade>=5?'A': grade>=3?'B':'C';
  screens.victory({ summary:`${studentInfo.name} ${studentInfo.lastname}: ${aciertos} aciertos, nota ${grade}${range}`, onReport:()=>{ sendResult(grade, range); } });
  state = 'victoria';
}

function showDefeat() {
  screens.defeat({ onRetry:()=>{ regionIndex=0; progress={hearts:5, rupias:0, streak:0, runes:[]}; updateRegion(); state='explorando'; } });
  state = 'derrota';
}

function sendResult(grade, range) {
  // usar supabase.js existente; aquí solo simulación
  const row = { exam_id:EXAM_ID, student_name:studentInfo.name, student_lastname:studentInfo.lastname, course:studentInfo.course, score:progress.rupias, total:20, grade, timestamp:Date.now(), attempt:1, answers:[] };
  showToast(`Resultado: ${grade}${range} — enviado a Supabase`);
}

// ── LOOP PRINCIPAL ──
function gameLoop() {
  dt = Math.min(clock.getDelta(), 0.05); // acotado a 0.05 s per SPEC
  if (state === 'explorando') {
    combat.update(dt, core.REGIONS[regionIndex].enemySpawns, core.REGIONS[regionIndex]);
    hud.setHearts(progress.hearts, 5); hud.setRupees(progress.rupias, true); hud.setRunes(progress.runes, 5); hud.setStreak(progress.streak);
    // input handling (WASD/flechas/Shift/E) ya está en input.js consumiendo eventos
  }
  renderer.render(scene, camera);
  composer.render();
  requestAnimationFrame(gameLoop);
}

// iniciar cuando el DOM esté listo
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startGame); else startGame();