/**
 * src/ui/quiz.js — panel de pregunta estilo pergamino.
 *
 * API (SPEC.md, Anexo A):
 *   createQuiz(root, audio) -> quiz
 *   quiz.ask(question, index, total, onAnswer)
 *     question = { q, options[], answerIdx, explanation?, subtopic? }
 *   onAnswer({ ok, selected, correct, timedOut })
 *   quiz.close(); quiz.isOpen()
 *
 * `audio` es el objeto Sound de src/audio.js: se usan los efectos
 * 'questionOpen', 'correct' y 'wrong' si están disponibles.
 */
const LETTERS = ['A', 'B', 'C', 'D'];
const TIME_LIMIT = 40; // segundos por pregunta

export function createQuiz(root, audio) {
  const sfx = (name) => {
    try { if (audio && typeof audio.sfx === 'function') audio.sfx(name); } catch (e) { /* sin audio */ }
  };

  const container = document.createElement('div');
  container.className = 'quiz-panel';
  container.innerHTML = `
    <div class="quiz-card">
      <div class="quiz-meta">
        <span class="quiz-count"></span>
        <span class="quiz-topic"></span>
      </div>
      <div class="quiz-q"></div>
      <div class="quiz-opts"></div>
      <div class="quiz-timerbar"><div></div></div>
      <div class="quiz-feedback"></div>
      <div class="quiz-actions"></div>
    </div>
  `;
  root.appendChild(container);

  const card = container.querySelector('.quiz-card');
  const countEl = container.querySelector('.quiz-count');
  const topicEl = container.querySelector('.quiz-topic');
  const qEl = container.querySelector('.quiz-q');
  const optsEl = container.querySelector('.quiz-opts');
  const timerEl = container.querySelector('.quiz-timerbar > div');
  const feedbackEl = container.querySelector('.quiz-feedback');
  const actionsEl = container.querySelector('.quiz-actions');

  let onAnswer = null;
  let answered = false;
  let timerId = null;
  let rafId = null;
  let deadline = 0;

  function stopTimer() {
    clearInterval(timerId);
    timerId = null;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    timerEl.style.transition = 'none';
    timerEl.style.width = '100%';
  }

  function close() {
    stopTimer();
    container.classList.remove('open');
    onAnswer = null;
    answered = false;
    feedbackEl.className = 'quiz-feedback';
    feedbackEl.innerHTML = '';
    actionsEl.innerHTML = '';
    actionsEl.style.display = 'none';
  }

  function isOpen() {
    return container.classList.contains('open');
  }

  function finish(result) {
    if (answered) return;
    answered = true;
    stopTimer();
    const cb = onAnswer;
    onAnswer = null;
    if (cb) {
      try { cb(result); } catch (err) { console.error('[quiz] onAnswer:', err); }
    }
  }

  function selectAnswer(idx) {
    if (answered) return;
    const correctIdx = Number(optsEl.dataset.correct);
    const ok = idx === correctIdx;

    const list = Array.from(optsEl.children);
    for (const b of list) b.disabled = true;

    if (list[idx]) list[idx].classList.add(ok ? 'correct' : 'wrong');
    if (!ok && list[correctIdx]) list[correctIdx].classList.add('correct');

    finish({ ok, selected: idx, correct: correctIdx, timedOut: false });

    if (ok) {
      sfx('correct');
      feedbackEl.className = 'quiz-feedback ok';
      feedbackEl.textContent = '¡Respuesta correcta! La runa del santuario se enciende.';
      setTimeout(() => { if (container.classList.contains('open')) close(); }, 1300);
    } else {
      sfx('wrong');
      feedbackEl.className = 'quiz-feedback bad';
      const exp = buttons.dataset.explanation || '';
      feedbackEl.innerHTML = '<strong>Respuesta incorrecta.</strong> Pierdes medio corazón. '
        + (exp ? '<br>' + exp : '');
      actionsEl.style.display = 'flex';
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = 'Continuar';
      btn.addEventListener('click', () => close());
      actionsEl.innerHTML = '';
      actionsEl.appendChild(btn);
      btn.focus();
    }
  }

  /**
   * ask(question, index, total, callback)
   * question: { q, options, answerIdx, explanation?, subtopic? }
   */
  function ask(question, index = 1, total = 20, callback = null) {
    if (!question || !Array.isArray(question.options) || question.options.length === 0) return;

    onAnswer = callback;
    answered = false;
    countEl.textContent = 'Pregunta ' + index + ' de ' + total;
    topicEl.textContent = question.subtopic || '';
    qEl.textContent = question.q || '';

    optsEl.innerHTML = '';
    const correct = Number(question.answerIdx);
    question.options.forEach((opt, i) => {
      const b = document.createElement('button');
      b.className = 'quiz-opt';
      b.type = 'button';
      b.innerHTML = '<span class="letter">' + (LETTERS[i] || String(i + 1)) + '</span><span></span>';
      b.lastChild.textContent = opt;
      b.addEventListener('click', () => selectAnswer(i));
      optsEl.appendChild(b);
    });

    // Metadatos que selectAnswer lee del contenedor de opciones.
    optsEl.dataset.correct = String(correct);
    optsEl.dataset.explanation = question.explanation || '';

    feedbackEl.className = 'quiz-feedback';
    feedbackEl.innerHTML = '';
    actionsEl.innerHTML = '';
    actionsEl.style.display = 'none';

    container.classList.add('open');
    sfx('questionOpen');

    // Temporizador con barra.
    stopTimer();
    deadline = performance.now() + TIME_LIMIT * 1000;
    timerEl.style.transition = 'none';
    timerEl.style.width = '100%';
    requestAnimationFrame(() => {
      if (!isOpen()) return;
      timerEl.style.transition = 'width ' + TIME_LIMIT + 's linear';
      timerEl.style.width = '0%';
    });
    timerId = setInterval(() => {
      if (answered) { stopTimer(); return; }
      if (performance.now() >= deadline) {
        const list = Array.from(optsEl.children);
        const correctIdx = Number(optsEl.dataset.correct);
        for (const b of list) b.disabled = true;
        if (list[correctIdx]) list[correctIdx].classList.add('correct');
        finish({ ok: false, selected: -1, correct: correctIdx, timedOut: true });
        sfx('wrong');
        feedbackEl.className = 'quiz-feedback bad';
        const exp = optsEl.dataset.explanation || '';
        feedbackEl.innerHTML = '<strong>Se acabó el tiempo.</strong> Pierdes medio corazón. '
          + (exp ? '<br>' + exp : '');
        actionsEl.style.display = 'flex';
        const btn = document.createElement('button');
        btn.className = 'btn';
        btn.textContent = 'Continuar';
        btn.addEventListener('click', () => close());
        actionsEl.innerHTML = '';
        actionsEl.appendChild(btn);
      }
    }, 200);
  }

  return { ask, close, isOpen };
}
