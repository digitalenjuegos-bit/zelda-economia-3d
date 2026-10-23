/**
 * src/ui/hud.js — corazones, rupias, runas, racha, minimapa y avisos.
 *
 * API (SPEC.md, Anexo A):
 *   createHUD(root, opts) -> hud
 *   hud: { setHearts(n, max), setRupees(n, animate), setRunes(lit, total),
 *          setStreak(n), setName(text), setRegion(name), toast(text, kind),
 *          setMinimap(data), drawMinimap(region, heroPos, shrines),
 *          setMuted(b), show(), hide() }
 *
 * opts.onToggleMute: callback del botón de sonido (lo dispara main.js).
 * setHearts admite medios corazones (n = 4.5 dibuja 4 llenos y 1 a medias).
 */
export function createHUD(root, opts = {}) {
  const onToggleMute = typeof opts.onToggleMute === 'function' ? opts.onToggleMute : null;

  const container = document.createElement('div');
  container.className = 'hud';
  container.innerHTML = `
    <div class="heartsRow" id="hearts"></div>
    <div class="studentName" id="studentName"></div>
    <div class="streak" id="streak"></div>
    <div class="regionTitle" id="regionTitle"></div>
    <div class="rupeeCounter" id="rupeeBox"><span class="rupeeIcon"></span><span id="rupees">0</span></div>
    <button class="soundBtn" id="soundBtn" type="button">Silenciar</button>
    <div class="runesRow" id="runes"></div>
    <div class="minimap"><canvas id="minimap" width="132" height="132"></canvas></div>
    <div class="hintMsg" id="hintMsg"></div>
    <div class="hudToast" id="hudToast"></div>
  `;
  root.appendChild(container);

  const el = (sel) => container.querySelector(sel);
  const heartsEl = el('#hearts');
  const rupeesEl = el('#rupees');
  const rupeeBox = el('#rupeeBox');
  const runesEl = el('#runes');
  const streakEl = el('#streak');
  const nameEl = el('#studentName');
  const regionEl = el('#regionTitle');
  const minimapCanvas = el('#minimap');
  const soundBtn = el('#soundBtn');
  const hintEl = el('#hintMsg');
  const toastEl = el('#hudToast');

  let muted = false;
  let toastTimer = null;
  let hintTimer = null;

  // ── Corazones (con medios) ─────────────────────────────────────
  function setHearts(n, max) {
    const total = max || 5;
    const hp = Math.max(0, Math.min(total, Number(n) || 0));
    heartsEl.innerHTML = '';
    for (let i = 0; i < total; i++) {
      const h = document.createElement('div');
      h.className = 'heart';
      if (hp >= i + 1) {
        // lleno
      } else if (hp > i) {
        h.classList.add('half');
      } else {
        h.classList.add('empty');
      }
      heartsEl.appendChild(h);
    }
  }

  // ── Rupias ──────────────────────────────────────────────────────
  function setRupees(n, animate) {
    rupeesEl.textContent = (Number(n) || 0).toLocaleString('es-EC');
    if (animate) {
      rupeeBox.classList.remove('bump');
      void rupeeBox.offsetWidth; // reinicia la animación CSS
      rupeeBox.classList.add('bump');
    }
  }

  // ── Runas: lit es un array de booleanos por santuario ──────────
  function setRunes(lit, total) {
    const n = total || (lit ? lit.length : 0);
    runesEl.innerHTML = '';
    for (let i = 0; i < n; i++) {
      const r = document.createElement('div');
      r.className = 'rune' + (lit && lit[i] ? ' lit' : '');
      runesEl.appendChild(r);
    }
  }

  function setStreak(n) {
    const s = Number(n) || 0;
    if (s >= 2) {
      streakEl.textContent = 'Racha de ' + s;
      streakEl.classList.add('visible');
    } else {
      streakEl.classList.remove('visible');
    }
  }

  function setName(text) { nameEl.textContent = text || ''; }
  function setRegion(name) { regionEl.textContent = name || ''; }

  // ── Aviso flotante ─────────────────────────────────────────────
  function toast(text, kind = 'info') {
    if (!text) return;
    toastEl.textContent = text;
    toastEl.className = 'hudToast visible' + (kind === 'success' || kind === 'danger' ? ' ' + kind : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.className = 'hudToast'; }, 3600);
  }

  // ── Pista de interacción (E) ────────────────────────────────────
  function hint(text) {
    if (!text) { hintEl.classList.remove('visible'); return; }
    if (hintEl.textContent === text && hintEl.classList.contains('visible')) return;
    hintEl.textContent = text;
    hintEl.classList.add('visible');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => { hintEl.classList.remove('visible'); }, 4200);
  }

  // ── Minimapa circular ──────────────────────────────────────────
  // Mapea las coordenadas del mundo de la región al círculo del canvas.
  function drawMinimap(region, heroPos, shrines) {
    if (!region || !heroPos || !minimapCanvas) return;
    const ctx = minimapCanvas.getContext('2d');
    if (!ctx) return;
    const S = minimapCanvas.width;
    const cx = S / 2;
    const cy = S / 2;

    const b = region.bounds || { minX: -85, maxX: 85, minZ: -85, maxZ: 85 };
    const w = Math.max(1, b.maxX - b.minX);
    const h = Math.max(1, b.maxZ - b.minZ);
    const scale = (S / 2 - 10) / Math.max(w, h) * 2;
    const toMap = (x, z) => ({
      x: cx + (x - (b.minX + b.maxX) / 2) * scale,
      y: cy + (z - (b.minZ + b.maxZ) / 2) * scale,
    });

    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, S / 2, 0, Math.PI * 2);
    ctx.clip();

    // Fondo del bioma.
    ctx.fillStyle = '#2c3f24';
    ctx.fillRect(0, 0, S, S);

    // Agua (aproximada: franja del arroyo o llanura del pantano).
    if (region.waterLevel !== null && region.waterLevel !== undefined) {
      ctx.fillStyle = 'rgba(64,140,180,.75)';
      ctx.beginPath();
      ctx.ellipse(cx, cy, S * 0.46, S * 0.2, 0.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Arena del jefe.
    if (region.bossArena) {
      const a = toMap(region.bossArena.x, region.bossArena.z);
      ctx.strokeStyle = 'rgba(240,220,160,.65)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(a.x, a.y, Math.max(4, region.bossArena.r * scale), 0, Math.PI * 2);
      ctx.stroke();
    }

    // Portal.
    if (region.portal) {
      const p = toMap(region.portal.x, region.portal.z);
      ctx.fillStyle = region.portal.active ? '#7af2ff' : 'rgba(190,190,190,.55)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Santuarios: rombos cian encendidos, grises apagados.
    const list = shrines || region.shrines || [];
    for (const s of list) {
      const m = toMap(s.x, s.z);
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.rotate(Math.PI / 4);
      if (s.lit) {
        ctx.fillStyle = '#37f2dc';
        ctx.shadowColor = '#37f2dc';
        ctx.shadowBlur = 6;
      } else {
        ctx.fillStyle = 'rgba(225,225,215,.75)';
      }
      ctx.fillRect(-3, -3, 6, 6);
      ctx.restore();
    }

    // Cofre.
    const chest = region.chests && region.chests[0];
    if (chest && !chest.opened) {
      const c = toMap(chest.x, chest.z);
      ctx.fillStyle = '#e8c96a';
      ctx.fillRect(c.x - 2.5, c.y - 2.5, 5, 5);
    }

    // Héroe: punto rojo con rumbo.
    const hp2 = toMap(heroPos.x, heroPos.z);
    const facing = (heroPos.facing !== undefined) ? heroPos.facing
      : (region._heroFacing !== undefined ? region._heroFacing : 0);
    ctx.fillStyle = '#ff5a4a';
    ctx.beginPath();
    ctx.arc(hp2.x, hp2.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ff5a4a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(hp2.x, hp2.y);
    ctx.lineTo(hp2.x + Math.sin(facing) * 7, hp2.y + Math.cos(facing) * 7);
    ctx.stroke();

    ctx.restore();

    // Aro exterior.
    ctx.strokeStyle = 'rgba(240,230,200,.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, S / 2 - 1.5, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Compatibilidad con la firma antigua: los datos viven en drawMinimap.
  function setMinimap() { /* el minimapa se redibuja con drawMinimap */ }

  // ── Sonido ─────────────────────────────────────────────────────
  function setMuted(b) {
    muted = !!b;
    soundBtn.textContent = muted ? 'Activar sonido' : 'Silenciar';
    soundBtn.classList.toggle('muted', muted);
  }
  soundBtn.addEventListener('click', () => {
    if (onToggleMute) onToggleMute(!muted);
  });

  function show() { container.style.display = ''; }
  function hide() { container.style.display = 'none'; }

  return {
    setHearts, setRupees, setRunes, setStreak, setName, setRegion,
    toast, hint, setMinimap, drawMinimap, setMuted, show, hide,
  };
}
