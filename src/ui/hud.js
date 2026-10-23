import { glow } from './../engine/toon.js';

export function createHUD(root) {
  const container = document.createElement('div');
  container.className = 'hud';
  container.innerHTML = `
    <div class="heartsRow" id="hearts"></div>
    <div class="rupeeCounter"><span class="rupeeIcon">💎</span> <span id="rupees">0</span></div>
    <div class="runesRow" id="runes"></div>
    <button class="silenceBtn" id="silenceBtn" onclick="silenceToggle()">Silenciar</button>
    <div class="minimap"><canvas id="minimap"></canvas></div>
  `;
  root.appendChild(container);

  // hearts
  const heartsEl = $('#hearts');
  function setHearts(n, max) {
    heartsEl.innerHTML = '';
    for (let i = 0; i < max; i++) {
      const h = document.createElement('div');
      h.className = 'heart';
      h.style.opacity = i < n ? 1 : 0.2;
      heartsEl.appendChild(h);
    }
  }
  // rupees
  const rupeesEl = $('#rupees');
  function setRupees(n, animate) {
    rupeesEl.textContent = n.toLocaleString();
  }
  // runas
  const runesEl = $('#runes');
  function setRunes(lit, total) {
    runesEl.innerHTML = '';
    for (let i = 0; i < total; i++) {
      const r = document.createElement('div');
      r.className = 'rune';
      r.style.opacity = lit.includes(i) || i < lit.length ? 1 : 0.3;
      r.textContent = '♦';
      runesEl.appendChild(r);
    }
  }
  // streak
  function setStreak(n) { /* opcional: mostrar en HUD */ }
  // region
  function setRegion(name) { /* actualizar título HUD */ }
  // minimap
  function setMinimap(data) { const mc = $('#minimap'); mc.width = data.width; mc.height = data.height; const ctx = mc.getContext('2d'); ctx.fillStyle='#2c3e50'; ctx.fillRect(0,0,data.width,data.height); // fondo // dibujar región simplificada: ctx.beginPath(); ctx.arc(data.heroPos.x, data.heroPos.z, 10, 0, Math.PI*2); ctx.fillStyle='#e74c3c'; ctx.fill(); // héroe ctx.beginPath(); data.shrines.forEach(s=>{ ctx.beginPath(); ctx.arc(s.x, s.z, 5, 0, Math.PI*2); ctx.fillStyle='#1abc9c'; ctx.fill(); }); ctx.fill(); ctx.drawImage(data.heroImg||new Image(), data.heroPos.x-8, data.heroPos.z-8, 16, 16); }
  // drawMinimap (método del objeto screens)
  function drawMinimap(region, heroPos, shrines) { /* delegado a screen.drawMinimap */ }
  // mute
  function setMuted(b) { isMuted = b; if($('#silenceBtn')) $('#silenceBtn').classList.toggle('active', b); }
  // show/hide
  function show() { container.style.display = ''; }
  function hide() { container.style.display = 'none'; }

  return { setHearts, setRupees, setRunes, setStreak, setRegion, setMinimap, drawMinimap, setMuted, show, hide };
}