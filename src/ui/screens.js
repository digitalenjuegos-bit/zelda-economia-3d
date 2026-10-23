/**
 * src/ui/screens.js — intro, reglas, región superada, victoria y derrota.
 *
 * API (SPEC.md, Anexo A):
 *   createScreens(root) -> screens
 *   screens.intro(opts, onStart)
 *     opts = { title, subtitle, roster, resume, onResume, checkStudent, loadRanking }
 *     roster: { '1BGU A': [nombres], '1BGU B': [...], '1BGU C': [...] }
 *     checkStudent(nombreCompleto, curso) -> Promise<{ blocked, message }>
 *     resume: { regionIndex, regionName, aciertos } | null
 *   screens.rules(onAccept)          casilla obligatoria que desbloquea «Comenzar aventura»
 *   screens.regionClear(region, onNext)
 *   screens.victory(summary, onReport, onExit)
 *   screens.defeat(onRetry)
 *   screens.fade(onMid)              fundido a negro de 0,4 s
 *   screens.loading(b)               overlay de carga
 */
export function createScreens(root) {
  const container = document.createElement('div');
  container.className = 'screens';
  root.appendChild(container);

  const screens = [];
  let rankTimer = null;

  function makeScreen() {
    const s = document.createElement('div');
    s.className = 'screen';
    container.appendChild(s);
    screens.push(s);
    return s;
  }

  function hideAll() {
    for (const s of screens) s.classList.remove('open');
  }

  function openScreen(s) {
    hideAll();
    s.classList.add('open');
  }

  function makeCard(s, titleText, subText) {
    const card = document.createElement('div');
    card.className = 'card';
    if (titleText) {
      const h = document.createElement('h1');
      h.textContent = titleText;
      card.appendChild(h);
    }
    if (subText) {
      const p = document.createElement('p');
      p.className = 'sub';
      p.textContent = subText;
      card.appendChild(p);
    }
    s.appendChild(card);
    return card;
  }

  function mkBtn(label, cls, onClick) {
    const b = document.createElement('button');
    b.className = 'btn' + (cls ? ' ' + cls : '');
    b.type = 'button';
    b.textContent = label;
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }

  // ── Intro: selección de estudiante ─────────────────────────────
  const introScreen = makeScreen();
  let introCard = null;

  function intro(opts = {}, onStart = null) {
    hideAll();
    if (introCard) { introCard.remove(); introCard = null; }
    introCard = makeCard(
      introScreen,
      opts.title || 'El Reino de la Economía',
      opts.subtitle || 'Una aventura 3D para aprender economía de 1.º BGU. Elige tu nombre y comienza.'
    );

    // Selector agrupado por curso (solo nombres reales del roster).
    const label = document.createElement('label');
    label.textContent = 'Tu nombre:';
    label.setAttribute('for', 'rosterSelect');
    introCard.appendChild(label);

    const select = document.createElement('select');
    select.id = 'rosterSelect';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '-- Elige tu nombre --';
    select.appendChild(placeholder);

    const roster = opts.roster || {};
    const courses = Object.keys(roster).sort();
    for (const course of courses) {
      const group = document.createElement('optgroup');
      group.label = course;
      for (const fullName of roster[course] || []) {
        const o = document.createElement('option');
        o.value = course + '::' + fullName;
        o.textContent = fullName;
        group.appendChild(o);
      }
      select.appendChild(group);
    }
    introCard.appendChild(select);

    const status = document.createElement('div');
    status.className = 'status';
    status.textContent = 'Selecciona tu nombre para verificar tu intento.';
    introCard.appendChild(status);

    // Reanudar partida guardada.
    if (opts.resume && opts.onResume) {
      const rc = document.createElement('div');
      rc.className = 'resume-card';
      rc.textContent = 'Tienes una aventura en curso: ' + (opts.resume.regionName || 'Región')
        + ' · ' + (opts.resume.aciertos || 0) + ' aciertos.';
      const rb = mkBtn('Continuar aventura', '', () => {
        if (opts.onResume) opts.onResume();
      });
      rb.style.marginTop = '10px';
      rc.appendChild(rb);
      introCard.appendChild(rc);
    }

    const startBtn = mkBtn('Ver las reglas', '', () => {
      if (typeof onStart === 'function') onStart();
    });
    startBtn.disabled = true;
    const row = document.createElement('div');
    row.className = 'btn-row';
    row.appendChild(startBtn);
    introCard.appendChild(row);

    // Ranking de la clase.
    if (typeof opts.loadRanking === 'function') {
      const rankBtn = document.createElement('button');
      rankBtn.type = 'button';
      rankBtn.className = 'link-btn';
      rankBtn.textContent = 'Ver ranking de la clase';
      rankBtn.addEventListener('click', () => openRanking(opts.loadRanking));
      introCard.appendChild(rankBtn);
    }

    let checking = false;
    select.addEventListener('change', async () => {
      const val = select.value;
      if (!val || typeof opts.checkStudent !== 'function') {
        startBtn.disabled = !val;
        return;
      }
      const sep = val.indexOf('::');
      const course = val.slice(0, sep);
      const fullName = val.slice(sep + 2);
      if (checking) return;
      checking = true;
      startBtn.disabled = true;
      status.className = 'status wait';
      status.textContent = 'Verificando tu intento...';
      try {
        const res = await opts.checkStudent(fullName, course);
        if (res && res.blocked) {
          status.className = 'status blocked';
          status.textContent = res.message || 'Ya registraste tu resultado en este examen.';
        } else {
          status.className = 'status ok';
          status.textContent = 'Puedes comenzar la aventura. ¡Buena suerte!';
          startBtn.disabled = false;
        }
      } catch (err) {
        // Si la verificación falla (red caída), se permite jugar.
        status.className = 'status ok';
        status.textContent = 'No se pudo verificar el intento anterior; puedes comenzar.';
        startBtn.disabled = false;
      } finally {
        checking = false;
      }
    });

    openScreen(introScreen);
  }

  // ── Reglas: casilla que desbloquea «Comenzar aventura» ─────────
  const rulesScreen = makeScreen();

  function rules(onAccept = null) {
    hideAll();
    rulesScreen.innerHTML = '';
    const card = makeCard(rulesScreen, 'Reglas de la aventura', 'Lee con atención antes de comenzar.');

    const list = document.createElement('ul');
    list.className = 'rules-list';
    list.innerHTML = `
      <li>Recorre cuatro regiones del reino y responde <strong>20 preguntas de economía</strong>: una por cada santuario con runa.</li>
      <li>Cada respuesta correcta enciende la runa del santuario y suma rupias. Cada error resta medio corazón y muestra la explicación del concepto.</li>
      <li>Con las cinco runas encendidas aparece el jefe de la región. Derrotarlo abre el paso a la siguiente región.</li>
      <li>Si te quedas sin corazones, te desmayas en el punto de entrada de la región, recuperas los cinco corazones y conservas las runas encendidas y tus aciertos. Nunca se pierde la partida.</li>
      <li>Tu nota final es el número de aciertos multiplicado por 0,5, sobre 10, y se guarda al terminar.</li>
    `;
    card.appendChild(list);

    const controls = document.createElement('p');
    controls.className = 'sub';
    controls.innerHTML = '<strong>Controles:</strong> teclas W A S D o las flechas del teclado para moverte, '
      + 'barra espaciadora para atacar con la espada, tecla E para interactuar con santuarios, cofres y carteles, '
      + 'Shift para esquivar y tecla P para pausar.';
    card.appendChild(controls);

    const checkLabel = document.createElement('label');
    checkLabel.className = 'rules-check';
    const check = document.createElement('input');
    check.type = 'checkbox';
    const checkText = document.createElement('span');
    checkText.textContent = 'He leído las reglas y quiero comenzar mi único intento.';
    checkLabel.appendChild(check);
    checkLabel.appendChild(checkText);
    card.appendChild(checkLabel);

    const startBtn = mkBtn('Comenzar aventura', '', () => {
      if (typeof onAccept === 'function') onAccept();
    });
    startBtn.disabled = true;
    check.addEventListener('change', () => { startBtn.disabled = !check.checked; });

    const row = document.createElement('div');
    row.className = 'btn-row';
    row.appendChild(startBtn);
    card.appendChild(row);

    openScreen(rulesScreen);
  }

  // ── Región superada ─────────────────────────────────────────────
  const regionClearScreen = makeScreen();

  function regionClear(region = {}, onNext = null) {
    hideAll();
    regionClearScreen.innerHTML = '';
    const last = !!(region && region.isLast);
    const card = makeCard(
      regionClearScreen,
      'Región superada',
      'Has derrotado al ' + (region.bossName || 'guardián de la región') + '.'
    );

    if (region.name) {
      const p = document.createElement('p');
      p.className = 'sub';
      p.textContent = region.name + ' queda en paz. ' + (region.focus || '');
      card.appendChild(p);
    }

    if (region.aciertos !== undefined) {
      const stats = document.createElement('div');
      stats.className = 'stat-row';
      stats.innerHTML =
        '<div class="stat"><div class="v">' + region.aciertos + '</div><div class="k">aciertos</div></div>'
        + '<div class="stat"><div class="v">' + (region.rupias || 0) + '</div><div class="k">rupias</div></div>';
      card.appendChild(stats);
    }

    const row = document.createElement('div');
    row.className = 'btn-row';
    row.appendChild(mkBtn(last ? 'Conocer mi nota final' : 'Siguiente región', '', () => {
      if (typeof onNext === 'function') onNext();
    }));
    card.appendChild(row);

    openScreen(regionClearScreen);
  }

  // ── Victoria ────────────────────────────────────────────────────
  const victoryScreen = makeScreen();

  function victory(summary = {}, onReport = null, onExit = null) {
    hideAll();
    victoryScreen.innerHTML = '';
    const card = makeCard(victoryScreen, '¡Aventura completada!',
      (summary.name || '') + ', has recorrido las cuatro regiones del reino.');

    const rank = document.createElement('div');
    rank.className = 'rank-chip';
    rank.textContent = summary.rango || 'C';
    card.appendChild(rank);

    const grade = document.createElement('div');
    grade.className = 'big-grade';
    grade.textContent = (summary.grade !== undefined ? summary.grade : '0') + ' / 10';
    card.appendChild(grade);

    const stats = document.createElement('div');
    stats.className = 'stat-row';
    stats.innerHTML =
      '<div class="stat"><div class="v">' + (summary.aciertos || 0) + '</div><div class="k">aciertos de ' + (summary.total || 20) + '</div></div>'
      + '<div class="stat"><div class="v">' + (summary.rupias || 0) + '</div><div class="k">rupias</div></div>'
      + '<div class="stat"><div class="v">' + (summary.rango || '-') + '</div><div class="k">rango</div></div>';
    card.appendChild(stats);

    const status = document.createElement('div');
    status.className = 'status';
    card.appendChild(status);

    const saveBtn = mkBtn('Guardar mi resultado', '', async () => {
      saveBtn.disabled = true;
      status.className = 'status wait';
      status.textContent = 'Enviando tu resultado...';
      try {
        const res = await (typeof onReport === 'function' ? onReport() : { ok: true });
        if (res && res.ok === false) {
          status.className = 'status blocked';
          status.textContent = (res.message || 'No se pudo enviar el resultado.') + ' Pulsa de nuevo para reintentar.';
          saveBtn.disabled = false;
        } else {
          status.className = 'status ok';
          status.textContent = 'Resultado enviado correctamente. ¡Buen trabajo!';
        }
      } catch (err) {
        status.className = 'status blocked';
        status.textContent = 'Error de conexión al enviar. Pulsa de nuevo para reintentar.';
        saveBtn.disabled = false;
      }
    });
    if (summary.sent) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Resultado ya enviado';
    }

    const row = document.createElement('div');
    row.className = 'btn-row';
    row.appendChild(saveBtn);
    if (typeof onExit === 'function') row.appendChild(mkBtn('Volver al inicio', 'secondary', onExit));
    card.appendChild(row);

    openScreen(victoryScreen);
  }

  // ── Derrota (desmayo) ───────────────────────────────────────────
  const defeatScreen = makeScreen();

  function defeat(onRetry = null) {
    hideAll();
    defeatScreen.innerHTML = '';
    const card = makeCard(defeatScreen, 'Te has desmayado',
      'Recuperas tus corazones en el punto de entrada de la región. Conservas las runas encendidas y tus aciertos.');

    const row = document.createElement('div');
    row.className = 'btn-row';
    row.appendChild(mkBtn('Seguir explorando', '', () => {
      if (typeof onRetry === 'function') onRetry();
    }));
    card.appendChild(row);

    openScreen(defeatScreen);
  }

  // ── Ranking de la clase ─────────────────────────────────────────
  const rankModal = document.createElement('div');
  rankModal.className = 'rank-modal';
  rankModal.innerHTML = `
    <div class="card" style="max-width:460px;">
      <h2>Ranking de la clase</h2>
      <p class="sub">Puntos de la partida. Solo se muestran las iniciales del apellido. Se actualiza cada 15 segundos.</p>
      <div class="rank-list"></div>
      <div class="rank-updated"></div>
      <div class="btn-row"><button class="btn secondary" type="button">Cerrar</button></div>
    </div>
  `;
  container.appendChild(rankModal);
  rankModal.querySelector('.btn').addEventListener('click', () => {
    rankModal.classList.remove('open');
    clearInterval(rankTimer);
    rankTimer = null;
  });

  function openRanking(loadRanking) {
    const listEl = rankModal.querySelector('.rank-list');
    const updEl = rankModal.querySelector('.rank-updated');

    const refresh = async () => {
      listEl.innerHTML = '<p class="sub">Cargando...</p>';
      try {
        const rows = await loadRanking();
        const items = (rows || [])
          .filter((r) => r && r.answers && r.answers.completed)
          .sort((a, b) => (Number(b.answers && b.answers.score_game) || 0)
            - (Number(a.answers && a.answers.score_game) || 0))
          .slice(0, 12);
        if (!items.length) {
          listEl.innerHTML = '<p class="sub">Todavía no hay resultados guardados.</p>';
        } else {
          listEl.innerHTML = items.map((r) => {
            const surname = String(r.student_lastname || '').trim();
            const initials = surname ? surname.split(/\s+/).map((p) => p.charAt(0) + '.').join(' ') : '·';
            const pts = Number(r.answers && r.answers.score_game) || 0;
            const grade = Number(r.grade || 0).toFixed(1);
            return '<div class="rank-item"><span>' + initials
              + ' <small style="color:var(--muted)">(' + (r.course || '') + ')</small></span>'
              + '<span class="pts">' + pts + ' rupias · nota ' + grade + '</span></div>';
          }).join('');
        }
        updEl.textContent = 'Actualizado a las ' + new Date().toLocaleTimeString('es-EC');
      } catch (err) {
        listEl.innerHTML = '<p class="sub">No se pudo cargar el ranking. Revisa tu conexión.</p>';
      }
    };

    rankModal.classList.add('open');
    refresh();
    clearInterval(rankTimer);
    rankTimer = setInterval(refresh, 15000);
  }

  // ── Fundido a negro ─────────────────────────────────────────────
  const fadeLayer = document.createElement('div');
  fadeLayer.className = 'fadeLayer';
  container.appendChild(fadeLayer);

  function fade(onMid) {
    fadeLayer.classList.add('on');
    setTimeout(() => {
      if (typeof onMid === 'function') {
        try { onMid(); } catch (err) { console.error('[screens] fade:', err); }
      }
      fadeLayer.classList.remove('on');
    }, 420);
  }

  // ── Carga ───────────────────────────────────────────────────────
  const loadingLayer = document.createElement('div');
  loadingLayer.className = 'loadingLayer';
  loadingLayer.innerHTML = '<div class="spinner"></div><div class="t">Preparando la región...</div>';
  container.appendChild(loadingLayer);

  function loading(b) {
    loadingLayer.classList.toggle('open', !!b);
  }

  /** Oculta todas las pantallas (comienzo de la partida). */
  function close() {
    hideAll();
    clearInterval(rankTimer);
    rankTimer = null;
  }

  return { intro, rules, regionClear, victory, defeat, fade, loading, close };
}
