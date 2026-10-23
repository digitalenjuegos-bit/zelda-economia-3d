export function createQuiz(root, audio) {
  let currentQuestion = null;
  let totalQuestions = 0;
  let onAnswer = null;
  let questionIndex = 0;
  let timer = null;

  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.top = '0'; container.style.left = '0'; container.style.width = '100%'; container.style.height = '100%';
  container.style.background = 'rgba(255,255,255,0.8)';
  container.style.backdropFilter = 'blur(4px)';
  container.style.borderRadius = '8px';
  container.style.padding = '20px';
  container.style.textAlign = 'center';
  container.style.display = 'none';
  container.style.flexDirection = 'column';
  container.style.alignItems = 'center';
  container.style.justifyContent = 'center';
  root.appendChild(container);

  const questionEl = document.createElement('div');
  questionEl.style.fontFamily = 'Cinzel, Georgia, serif';
  questionEl.style.fontSize = '1.2rem';
  questionEl.style.marginBottom = '20px';
  questionEl.style.minHeight = '80px';
  container.appendChild(questionEl);

  const optionsContainer = document.createElement('div');
  optionsContainer.style.display = 'flex';
  optionsContainer.style.flexDirection = 'column';
  optionsContainer.style.gap = '8px';
  optionsContainer.style.width = '100%';
  container.appendChild(optionsContainer);

  const btnContainer = document.createElement('div');
  btnContainer.style.marginTop = '20px';
  btnContainer.style.display = 'flex';
  btnContainer.style.gap = '10px';
  container.appendChild(btnContainer);

  function ask(qText, qIndex, qTotal, callback) {
    totalQuestions = qTotal; onAnswer = callback; questionIndex = qIndex;
    questionEl.innerHTML = qText;
    // opciones del banco
    const options = currentQuestion ? currentQuestion.options : ['A','B','C','D'];
    optionsContainer.innerHTML = '';
    btnContainer.innerHTML = '';
    options.forEach((opt, i) => {
      const btn = document.createElement('button');
      btn.textContent = opt;
      btn.style.flex = '1'; btn.style.padding = '10px'; btn.style.background = '#ecf0f1'; btn.style.border = 'none'; btn.style.cursor = 'pointer'; btn.style.fontFamily = 'Cinzel, Georgia, serif'; btn.onclick = ()=> selectAnswer(i);
      optionsContainer.appendChild(btn);
    });
    // botón submit
    const submitBtn = document.createElement('button');
    submitBtn.textContent = 'Responder';
    submitBtn.style.width = '100%'; submitBtn.style.padding = '10px'; submitBtn.style.background = '#3498db'; submitBtn.style.color = 'white'; submitBtn.style.border = 'none'; submitBtn.style.cursor = 'pointer'; submitBtn.style.fontFamily = 'Cinzel, Georgia, serif'; submitBtn.onclick = ()=>{ if(!currentQuestion) selectAnswer(null); };
    btnContainer.appendChild(submitBtn);
    // timer simple
    clearTimeout(timer); timer = setTimeout(()=>{ if(onAnswer) onAnswer({ok:false, selected:-1, correct:currentQuestion?currentQuestion.answerIdx:-1, timedOut:true}); hide(); }, 20000);
    container.style.display = 'flex';
  }

  function selectAnswer(idx) {
    clearTimeout(timer);
    const correctIdx = currentQuestion ? currentQuestion.answerIdx : -1;
    const ok = idx === correctIdx;
    if (onAnswer) onAnswer({ok, selected:idx, correct:correctIdx, timedOut:false});
    hide();
  }

  function hide() {
    container.style.display = 'none';
    if (timer) { clearTimeout(timer); timer = null; }
  }

  return { ask, close: hide, isOpen:()=>container.style.display === 'flex' };
}