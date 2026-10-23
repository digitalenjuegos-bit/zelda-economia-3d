export function createScreens(root) {
  const container = document.createElement('div');
  container.style.position = 'absolute'; container.style.top = '0'; container.style.left = '0'; container.style.width = '100%'; container.style.height = '100%';
  container.style.background = 'var(--bg)'; container.style.color = 'var(--text)'; container.style.flexDirection = 'column'; container.style.alignItems = 'center'; container.style.justifyContent = 'center'; container.style.display = 'none'; root.appendChild(container);

  // intro
  const introEl = document.createElement('div'); introEl.style.textAlign = 'center'; introEl.style.marginBottom = '40px';
  const introTitle = document.createElement('h1'); introTitle.style.fontFamily = 'Cinzel, Georgia, serif'; introTitle.style.fontSize = '2.5rem'; introTitle.style.marginBottom = '10px'; introTitle.textContent = 'El Reino de la Economía';
  const introSub = document.createElement('p'); introSub.style.fontFamily = 'Nunito, system-ui, sans-serif'; introSub.style.fontSize = '1.2rem'; introSub.style.maxWidth = '600px'; introSub.style.margin = '0 auto'; introSub.textContent = 'Una aventura 3D para aprender economía de 1.º BGU. Selecciona tu nombre y comienza.';
  introEl.appendChild(introTitle); introEl.appendChild(introSub);

  // roster selector
  const rosterDiv = document.createElement('div'); rosterDiv.style.margin = '20px 0'; rosterDiv.style.display = 'flex'; rosterDiv.style.flexDirection = 'column'; rosterDiv.style.gap = '8px'; rosterDiv.style.alignItems = 'center';
  const rosterLabel = document.createElement('label'); rosterLabel.style.fontFamily = 'Nunito, system-ui, sans-serif'; rosterLabel.style.fontSize = '1rem'; rosterLabel.textContent = 'Tu nombre:';
  const rosterSelect = document.createElement('select'); rosterSelect.style.fontFamily = 'Nunito, system-ui, sans-serif'; rosterSelect.style.fontSize = '1rem';
  // opciones se poblarán desde logic.js roster
  rosterSelect.style.padding = '6px'; rosterSelect.style.border = '1px solid var(--border)'; rosterSelect.style.borderRadius = '4px';
  const placeholderOpt = document.createElement('option'); placeholderOpt.value = ''; placeholderOpt.textContent = '-- Selecciona tu nombre --'; rosterSelect.appendChild(placeholderOpt);
  rosterDiv.appendChild(rosterLabel); rosterDiv.appendChild(rosterSelect);

  // reglas
  const rulesEl = document.createElement('div'); rulesEl.style.textAlign = 'center'; rulesEl.style.maxWidth = '600px'; rulesEl.style.padding = '20px'; rulesEl.style.background = 'white'; rulesEl.style.border = '2px solid var(--border)'; rulesEl.style.borderRadius = '8px'; rulesEl.style.margin = '20px';
  const rulesTitle = document.createElement('h2'); rulesTitle.style.fontFamily = 'Cinzel, Georgia, serif'; rulesTitle.style.marginBottom = '10px'; rulesTitle.textContent = 'Reglas de la Aventura';
  const rulesText = document.createElement('p'); rulesText.style.fontSize = '1rem'; rulesText.style.lineHeight = '1.6'; rulesText.innerHTML = '<ol><li>Selecciona tu nombre en el listado antes de comenzar.</li><li>Sólo un intento por estudiante.</li><li>Responde bien en los santuarios para encender las runas y recibir recompensas.</li><li>Responder mal resta medio corazón y muestra la explicación.</li><li>Al derrotar al jefe de región, avanzas al siguiente mundo.</li></ol>';
  const acceptBtn = document.createElement('button'); acceptBtn.style.fontFamily = 'Cinzel, Georgia, serif'; acceptBtn.style.padding = '8px 16px'; acceptBtn.style.background = '#3498db'; acceptBtn.style.color = 'white'; acceptBtn.style.border = 'none'; acceptBtn.style.cursor = 'pointer'; acceptBtn.style.borderRadius = '4px'; acceptBtn.textContent = 'Acepto y comienzo';
  rulesEl.appendChild(rulesTitle); rulesEl.appendChild(rulesText); rulesEl.appendChild(acceptBtn);

  // región superada
  const regionClearEl = document.createElement('div'); regionClearEl.style.textAlign = 'center'; regionClearEl.style.maxWidth = '600px'; regionClearEl.style.padding = '20px'; regionClearEl.style.background = 'white'; regionClearEl.style.border = '2px solid #27ae60'; regionClearEl.style.borderRadius = '8px'; regionClearEl.style.margin = '20px';
  const regionClearTitle = document.createElement('h2'); regionClearTitle.style.fontFamily = 'Cinzel, Georgia, serif'; regionClearTitle.style.marginBottom = '10px'; regionClearTitle.textContent = 'Región superada';
  const regionClearText = document.createElement('p'); regionClearText.style.fontSize = '1rem'; regionClearText.textContent = 'Has derrotado al jefe. Avanzando al siguiente mundo...';
  const nextBtn = document.createElement('button'); nextBtn.style.fontFamily = 'Cinzel, Georgia, serif'; nextBtn.style.padding = '8px 16px'; nextBtn.style.background = '#27ae60'; nextBtn.style.color = 'white'; nextBtn.style.border = 'none'; nextBtn.style.cursor = 'pointer'; nextBtn.style.borderRadius = '4px'; nextBtn.textContent = 'Siguiente región';
  regionClearEl.appendChild(regionClearTitle); regionClearEl.appendChild(regionClearText); regionClearEl.appendChild(nextBtn);

  // victoria
  const victoryEl = document.createElement('div'); victoryEl.style.textAlign = 'center'; victoryEl.style.maxWidth = '600px'; victoryEl.style.padding = '40px'; victoryEl.style.background = 'white'; victoryEl.style.border = '2px solid #2c3e50'; victoryEl.style.borderRadius = '8px'; victoryEl.style.margin = '20px';
  const victoryTitle = document.createElement('h1'); victoryTitle.style.fontFamily = 'Cinzel, Georgia, serif'; victoryTitle.style.fontSize = '3rem'; victoryTitle.style.marginBottom = '10px'; victoryTitle.style.color = '#2c3e50';
  const victorySub = document.createElement('p'); victorySub.style.fontFamily = 'Nunito, system-ui, sans-serif'; victorySub.style.fontSize = '1.2rem'; victorySub.style.margin = '10px 0';
  const victoryNote = document.createElement('div'); victoryNote.style.fontSize = '1rem'; victoryNote.style.margin = '10px 0'; victoryNote.style.minHeight = '30px';
  const victoryBtn = document.createElement('button'); victoryBtn.style.fontFamily = 'Cinzel, Georgia, serif'; victoryBtn.style.padding = '10px 20px'; victoryBtn.style.background = '#e74c3c'; victoryBtn.style.color = 'white'; victoryBtn.style.border = 'none'; victoryBtn.style.cursor = 'pointer'; victoryBtn.style.borderRadius = '4px'; victoryBtn.textContent = '¡Jugar de nuevo!';
  victoryEl.appendChild(victoryTitle); victoryEl.appendChild(victorySub); victoryEl.appendChild(victoryNote); victoryEl.appendChild(victoryBtn);

  // derrota
  const defeatEl = document.createElement('div'); defeatEl.style.textAlign = 'center'; defeatEl.style.maxWidth = '600px'; defeatEl.style.padding = '40px'; defeatEl.style.background = 'white'; defeatEl.style.border = '2px solid #e74c3c'; defeatEl.style.borderRadius = '8px'; defeatEl.style.margin = '20px';
  const defeatTitle = document.createElement('h2'); defeatTitle.style.fontFamily = 'Cinzel, Georgia, serif'; defeatTitle.style.marginBottom = '10px'; defeatTitle.textContent = 'Te has desmayado';
  const defeatText = document.createElement('p'); defeatText.style.fontSize = '1rem'; defeatText.textContent = 'Has perdido todos tus corazones. ¿Reintentar?';
  const retryBtn = document.createElement('button'); retryBtn.style.fontFamily = 'Cinzel, Georgia, serif'; retryBtn.style.padding = '10px 20px'; retryBtn.style.background = '#e74c3c'; retryBtn.style.color = 'white'; retryBtn.style.border = 'none'; retryBtn.style.cursor = 'pointer'; retryBtn.style.borderRadius = '4px'; retryBtn.textContent = 'Reintentar';
  const menuBtn = document.createElement('button'); menuBtn.style.fontFamily = 'Cinzel, Georgia, serif'; menuBtn.style.padding = '10px 20px'; menuBtn.style.background = '#3498db'; menuBtn.style.color = 'white'; menuBtn.style.border = 'none'; menuBtn.style.cursor = 'pointer'; menuBtn.style.borderRadius = '4px'; menuBtn.textContent = 'Menú principal';
  defeatEl.appendChild(defeatTitle); defeatEl.appendChild(defeatText); defeatEl.appendChild(retryBtn); defeatEl.appendChild(menuBtn);

  // fade helper
  function fadeOut(el, cb) { el.style.transition = 'opacity 0.4s'; el.style.opacity = 0; setTimeout(()=>{ el.style.display = 'none'; if(cb) cb(); }, 400); }
  function fadeIn(el) { el.style.display = ''; el.style.opacity = 0; setTimeout(()=>{ el.style.opacity = 1; }, 50); }

  // expositores
  function intro(opts, onStart) { fadeIn(introEl); rosterSelect.innerHTML = ''; const roster = window.ROSTER || ['ALBAN ALTAMIRANO, IVANNA','ARTEAGA PLAZA, MARIA','BEJAR JIMENEZ, HELENA']; roster.forEach(n=>{ const opt = document.createElement('option'); opt.value = n; opt.textContent = n; rosterSelect.appendChild(opt); }); acceptBtn.onclick = ()=>{ const val = rosterSelect.value; if(!val||val=== ''){ alert('Selecciona un nombre'); return; }; $('rosterSelect').dispatchEvent(new Event('change')); fadeOut(introEl, onStart); }; };
  function rules(onAccept) { fadeIn(rulesEl); acceptBtn.onclick = ()=>{ fadeOut(rulesEl, onAccept); }; }
  function regionClear(region, onNext) { fadeIn(regionClearEl); nextBtn.onclick = ()=>{ fadeOut(regionClearEl, onNext); }; }
  function victory(summary, onReport) { fadeIn(victoryEl); victoryTitle.textContent = '¡Victoria!'; victorySub.textContent = summary; victoryBtn.onclick = ()=>{ fadeOut(victoryEl, onReport); }; }
  function defeat(onRetry) { fadeIn(defeatEl); retryBtn.onclick = ()=>{ fadeOut(defeatEl, onRetry); }; menuBtn.onclick = ()=>{ fadeOut(defeatEl, ()=>{ showIntro(); }); }; }
  function fade(onMid) { const f = document.createElement('div'); f.style.position = 'absolute'; f.style.top = '0'; f.style.left = '0'; f.style.width = '100%'; f.style.height = '100%'; f.style.background = 'black'; f.style.opacity = 0; f.style.transition = 'opacity 0.4s'; container.appendChild(f); setTimeout(()=>{ f.style.opacity = 1; }, 50); setTimeout(()=>{ fadeOut(f, onMid); }, 400); }

  return { intro, rules, regionClear, victory, defeat, fade };
}