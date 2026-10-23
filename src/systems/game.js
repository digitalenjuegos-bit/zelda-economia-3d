import { createParticles } from './../engine/particles.js';
import { QUESTION_BANK } from './../bank.js';
import { buildResultRow } from './../ui/logic.js';
import { supabaseSend } from './../ui/supabase.js'; // reutiliza envío existente

export function createGame({ core, audio, hud, quiz, screens, combat, particles, bank, logic, config, supabase }) {
  let student = null; // { name, lastname, course }
  let regionIndex = 0;
  let progress = { hearts:5, rupias:0, streak:0, runes:[] };
  let attemptCount = 0;
  let gameState = 'intro'; // intro | reglas | explorando | pregunta | jefe | regionSuperada | victoria | derrota

  function startAdventure(s) {
    student = s;
    attemptCount = 0;
    progress = { hearts:5, rupias:0, streak:0, runes:[] };
    regionIndex = 0;
    gameState = 'intro';
    showIntro();
  }

  function showIntro() {
    screens.intro({ opts:{ title:'El Reino de la Economía', subtitle:'Historia y Ciudadanía · 1BGU' }, onStart:()=>{ gameState='reglas'; showRules(); } });
  }

  function showRules() {
    screens.rules({ onAccept:()=>{ gameState='explorando'; startExploring(); } });
  }

  function startExploring() {
    // estudiante ya elegido en index.html (roster)
    updateRegion();
    gameState = 'explorando';
  }

  function updateRegion() {
    hud.setRegion(core.REGIONS[regionIndex].name);
    if (!combat) combat = createCombat({ hero, particles, audio, hud, onHeroDeath });
    combat.update(0.05, core.REGIONS[regionIndex].enemySpawns, core.REGIONS[regionIndex]);
    hud.setHearts(progress.hearts, 5); hud.setRupees(progress.rupias, true); hud.setRunes(progress.runes, 5); hud.setStreak(progress.streak);
    const minimapData = { width:150, height:150, region:core.REGIONS[regionIndex], heroPos:hero.pos, shrines:core.REGIONS[regionIndex].shrines };
    hud.setMinimap(minimapData); hud.drawMinimap(core.REGIONS[regionIndex], hero.pos, core.REGIONS[regionIndex].shrines);
  }

  function startQuestion() {
    const shrine = core.REGIONS[regionIndex].shrines[progress.runes.length];
    const q = QUESTION_BANK.questions.find(x=>x.id===shrine.id) || QUESTION_BANK.questions[0];
    quiz.ask(q.q, q.id, QUESTION_BANK.total_questions, onAnswer);
    gameState = 'pregunta';
  }

  function onAnswer({ok, selected, correct}) {
    if (ok) { progress.rupias += 5; progress.streak++; }
    else { progress.hearts--; if(progress.hearts<=0) { progress.hearts=0; showDefeat(); } }
    progress.runes[progress.runes.length] = correct;
    hud.setHearts(progress.hearts, 5); hud.setRupees(progress.rupias, true); hud.setRunes(progress.runes, 5); hud.setStreak(progress.streak);
    quiz.close();
    if (progress.runes.length >= 5) { defeatBoss(); } else { gameState='explorando'; updateRegion(); }
  }

  function defeatBoss() {
    screens.regionClear({ region: core.REGIONS[regionIndex].name, onNext:()=>{ regionIndex++; if(regionIndex>=4){ victory(); } else { updateRegion(); startQuestion(); } } });
    gameState = 'regionSuperada';
  }

  function victory() {
    const aciertos = progress.rupias; // max 20 preguntas × 0.5 = 10
    const grade = Math.round(aciertos * 0.5);
    const range = grade>=8?'S': grade>=5?'A': grade>=3?'B':'C';
    const summary = `${student.name} ${student.lastname}: ${aciertos} aciertos, nota ${grade}${range}`;
    screens.victory({ summary, onReport:()=>{ sendResult(grade, range); } });
    gameState = 'victoria';
  }

  function showDefeat() {
    screens.defeat({ onRetry:()=>{ regionIndex=0; progress={hearts:5, rupias:0, streak:0, runes:[]}; updateRegion(); gameState='explorando'; } });
    gameState = 'derrota';
  }

  async function sendResult(grade, range) {
    const row = await supabaseSend({
      exam_id: config.EXAM_ID,
      student_name: student.name,
      student_lastname: student.lastname,
      course: student.course,
      score: progress.rupias,
      total: 20,
      grade,
      timestamp: Date.now(),
      attempt: attemptCount,
      answers: [] // ya se construye en logic.buildResultRow si hace falta
    });
    showToast(`Resultado: ${grade}${range} — guardado en Supabase`);
  }

  // ── LOOP ──
  function gameLoop() {
    const dt = Math.min(clock.getDelta(), 0.05);
    if (gameState === 'explorando') {
      combat.update(dt, core.REGIONS[regionIndex].enemySpawns, core.REGIONS[regionIndex]);
      hud.setHearts(progress.hearts, 5); hud.setRupees(progress.rupias, true); hud.setRunes(progress.runes, 5); hud.setStreak(progress.streak);
    }
    renderer.render(scene, camera);
    composer.render();
    requestAnimationFrame(gameLoop);
  }

  return { startAdventure, updateRegion, startQuestion, onAnswer, victory, sendResult, gameState };
}