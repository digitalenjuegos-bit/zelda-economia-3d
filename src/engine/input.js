/**
 * src/engine/input.js — teclado, ratón y controles táctiles.
 *
 * API (ver SPEC.md, Anexo A):
 *   createInput(el)              -> input
 *   bindTouchUI(container, input)
 *
 * Convenciones (importantes para quien escriba hero.js):
 *   input.move.x  > 0  desplazamiento hacia la derecha
 *   input.move.z  > 0  desplazamiento hacia adelante (tecla W)
 *   input.look.x  ya está en RADIANES: pásalo tal cual a rig.orbit()
 *   input.orbit   radianes acumulados por Q/E: ídem
 *   input.consume('attack' | 'interact' | 'dodge' | 'pause') devuelve true una vez
 *
 * Conflicto del SPEC: la lista de controles pide E para interactuar y también
 * Q/E para orbitar. Se resuelve así: una pulsación corta de E (menos de 200 ms)
 * interactúa; mantener E pulsada orbita la cámara. Q orbita siempre.
 */
const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Space', 'KeyE', 'KeyQ', 'ShiftLeft', 'ShiftRight',
  'KeyP', 'Escape',
]);

const TRANSIENT = ['attack', 'interact', 'dodge', 'pause'];
const TRANSIENT_TTL = 0.25; // segundos que un evento sobrevive sin consumirse

function isTyping(target) {
  if (!target) return false;
  const tag = (target.tagName || '').toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

export function createInput(el = null) {
  const joy = { active: false, x: 0, y: 0 };   // lo escribe bindTouchUI

  const input = {
    move: { x: 0, z: 0 },
    look: { x: 0, y: 0 },
    orbit: 0,
    attack: false,
    interact: false,
    dodge: false,
    pause: false,
    attackHeld: false,
    enabled: true,
    touch: typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(pointer: coarse)').matches
      : false,
    update,
    consume,
    attachTouch,
    onAction,
    destroy,
    /** @internal usado por bindTouchUI */
    _joy: joy,
  };

  const keys = new Set();
  const latches = { attack: false, interact: false, dodge: false, pause: false };
  const ages = { attack: 0, interact: 0, dodge: 0, pause: 0 };
  const actionCbs = [];
  const listeners = [];

  let eDownAt = 0;
  let eOrbited = false;
  let dragging = false;
  let dragId = null;
  let lastPX = 0;
  let lastPY = 0;

  function emit(name) {
    latches[name] = true;
    ages[name] = 0;
    if (name === 'attack') input.attackHeld = true;
    input[name] = true;
    for (let i = 0; i < actionCbs.length; i++) {
      try {
        actionCbs[i](name);
      } catch (err) {
        console.error('[input] onAction:', err);
      }
    }
  }

  function consume(name) {
    if (!latches[name]) return false;
    latches[name] = false;
    ages[name] = 0;
    input[name] = false;
    if (name === 'attack') input.attackHeld = false;
    return true;
  }

  function onAction(cb) {
    if (typeof cb === 'function') actionCbs.push(cb);
    return () => {
      const i = actionCbs.indexOf(cb);
      if (i >= 0) actionCbs.splice(i, 1);
    };
  }

  // Canal interno para la UI táctil.
  input._emit = emit;

  // ── Teclado ───────────────────────────────────────────────────────
  const onKeyDown = (ev) => {
    if (!input.enabled || isTyping(ev.target)) return;
    const code = ev.code;

    if (GAME_KEYS.has(code)) ev.preventDefault();
    if (keys.has(code)) return;        // ignora la repetición del sistema
    keys.add(code);

    switch (code) {
      case 'Space':
        emit('attack');
        break;
      case 'KeyE':
        eDownAt = performance.now();
        eOrbited = false;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        emit('dodge');
        break;
      case 'KeyP':
      case 'Escape':
        emit('pause');
        break;
      default:
        break;
    }
  };

  const onKeyUp = (ev) => {
    const code = ev.code;
    keys.delete(code);
    if (code === 'Space') input.attackHeld = false;
    if (code === 'KeyE') {
      const held = (performance.now() - eDownAt) / 1000;
      if (held < 0.2 && !eOrbited) emit('interact');
    }
  };

  const onBlur = () => {
    keys.clear();
    joy.active = false;
    joy.x = 0;
    joy.y = 0;
    input.attackHeld = false;
    dragging = false;
  };

  // ── Ratón / arrastre para orbitar ─────────────────────────────────
  const onPointerDown = (ev) => {
    if (!input.enabled) return;
    if (ev.pointerType === 'touch') return;      // el táctil tiene su joystick
    if (ev.target && ev.target.closest && ev.target.closest('[data-touch-ui]')) return;
    dragging = true;
    dragId = ev.pointerId;
    lastPX = ev.clientX;
    lastPY = ev.clientY;
    if (el && el.setPointerCapture) {
      try { el.setPointerCapture(ev.pointerId); } catch (_) { /* sin captura */ }
    }
  };

  const onPointerMove = (ev) => {
    if (!dragging || ev.pointerId !== dragId) return;
    const dx = ev.clientX - lastPX;
    const dy = ev.clientY - lastPY;
    lastPX = ev.clientX;
    lastPY = ev.clientY;
    input.look.x += dx * 0.0032;
    input.look.y += dy * 0.0020;
  };

  const onPointerUp = (ev) => {
    if (ev.pointerId === dragId) {
      dragging = false;
      dragId = null;
    }
  };

  const target = el || window;
  target.addEventListener('pointerdown', onPointerDown, { passive: true });
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerup', onPointerUp, { passive: true });
  window.addEventListener('pointercancel', onPointerUp, { passive: true });
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  listeners.push(
    () => target.removeEventListener('pointerdown', onPointerDown),
    () => window.removeEventListener('pointermove', onPointerMove),
    () => window.removeEventListener('pointerup', onPointerUp),
    () => window.removeEventListener('pointercancel', onPointerUp),
    () => window.removeEventListener('keydown', onKeyDown),
    () => window.removeEventListener('keyup', onKeyUp),
    () => window.removeEventListener('blur', onBlur)
  );

  // ── actualización ─────────────────────────────────────────────────
  function update(dt) {
    const d = Math.min(Math.max(dt, 0), 0.05);

    let mx = 0;
    let mz = 0;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
    if (keys.has('KeyW') || keys.has('ArrowUp')) mz += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) mz -= 1;

    if (joy.active) {
      const mag = Math.hypot(joy.x, joy.y);
      if (mag > 0.12) {
        const k = Math.min(1, (mag - 0.12) / 0.88) / mag;
        mx += joy.x * k;
        mz += joy.y * k;
      }
    }

    const mag = Math.hypot(mx, mz);
    if (mag > 1) {
      mx /= mag;
      mz /= mag;
    }
    input.move.x = input.enabled ? mx : 0;
    input.move.z = input.enabled ? mz : 0;

    if (input.enabled) {
      const rate = 1.7;                    // radianes por segundo
      if (keys.has('KeyQ')) input.orbit -= rate * d;
      if (keys.has('KeyE')) {
        const held = (performance.now() - eDownAt) / 1000;
        if (held > 0.2) {
          eOrbited = true;
          input.orbit += rate * d;
        }
      }
    }

    // Los deltas de cámara se desvanecen si nadie los lee.
    const decay = Math.exp(-d * 14);
    input.look.x *= decay;
    input.look.y *= decay;
    if (Math.abs(input.look.x) < 1e-4) input.look.x = 0;
    if (Math.abs(input.look.y) < 1e-4) input.look.y = 0;

    // Expiración de eventos no consumidos (evita ataques pegados).
    for (let i = 0; i < TRANSIENT.length; i++) {
      const k = TRANSIENT[i];
      if (!latches[k]) continue;
      ages[k] += d;
      if (ages[k] > TRANSIENT_TTL) {
        latches[k] = false;
        input[k] = false;
      }
    }
    if (!latches.attack) input.attackHeld = false;
  }

  function attachTouch(dom) {
    return bindTouchUI(dom, input);
  }

  function destroy() {
    for (const off of listeners) off();
    listeners.length = 0;
  }

  return input;
}

// =====================================================================
//  Joystick virtual + botones
// =====================================================================
let uiSeq = 0;

/**
 * Monta joystick (izquierda) y botones de acción (derecha) dentro de
 * `container`. Devuelve { destroy }.
 * Estilos en línea a propósito: no depende de CSS externo y funciona dentro de
 * iframes donde no cargan hojas de estilo del sitio anfitrión.
 */
export function bindTouchUI(container, input) {
  if (!container || !input) return { destroy() {} };
  const joy = input._joy || (input._joy = { active: false, x: 0, y: 0 });
  const id = 'touchui' + (++uiSeq);

  const root = document.createElement('div');
  root.dataset.touchUi = '1';
  root.setAttribute('aria-hidden', 'true');
  root.style.cssText = [
    'position:absolute',
    'inset:0',
    'pointer-events:none',
    'z-index:40',
    'touch-action:none',
    '-webkit-user-select:none',
    'user-select:none',
    '-webkit-tap-highlight-color:transparent',
    'display:none',
  ].join(';');
  container.appendChild(root);

  const show = () => { root.style.display = 'block'; };
  if (input.touch) show();

  // Si el dispositivo se declara coarse o llega el primer toque, aparece.
  const mq = window.matchMedia ? window.matchMedia('(pointer: coarse)') : null;
  if (mq && mq.addEventListener) mq.addEventListener('change', (e) => { if (e.matches) show(); });

  const reveal = () => show();
  window.addEventListener('touchstart', reveal, { passive: true, once: true });

  // ── Joystick ──
  const padSize = 132;
  const knobSize = 58;

  const pad = document.createElement('div');
  pad.style.cssText = [
    'position:absolute',
    `left:22px`,
    'bottom:26px',
    `width:${padSize}px`,
    `height:${padSize}px`,
    'border-radius:50%',
    'pointer-events:auto',
    'touch-action:none',
    'background:radial-gradient(circle at 50% 45%, rgba(255,248,225,0.34), rgba(24,32,28,0.34) 72%)',
    'border:2px solid rgba(255,246,214,0.55)',
    'box-shadow:0 6px 18px rgba(0,0,0,0.35), inset 0 0 22px rgba(0,0,0,0.25)',
    'backdrop-filter:blur(2px)',
  ].join(';');

  const knob = document.createElement('div');
  knob.style.cssText = [
    'position:absolute',
    `width:${knobSize}px`,
    `height:${knobSize}px`,
    'left:50%',
    'top:50%',
    'margin-left:' + (-knobSize / 2) + 'px',
    'margin-top:' + (-knobSize / 2) + 'px',
    'border-radius:50%',
    'pointer-events:none',
    'background:radial-gradient(circle at 38% 32%, #fff6d8, #c9b98c 62%, #8d7c52)',
    'box-shadow:0 3px 10px rgba(0,0,0,0.45), inset 0 -3px 6px rgba(0,0,0,0.25)',
    'transition:transform 70ms linear',
  ].join(';');

  pad.appendChild(knob);
  root.appendChild(pad);

  let padId = null;
  let cx = 0;
  let cy = 0;

  const padMove = (ev) => {
    if (ev.pointerId !== padId) return;
    const max = padSize * 0.42;
    let dx = ev.clientX - cx;
    let dy = ev.clientY - cy;
    const m = Math.hypot(dx, dy);
    if (m > max) {
      dx = (dx / m) * max;
      dy = (dy / m) * max;
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    joy.active = true;
    joy.x = dx / max;
    joy.y = -dy / max;     // arriba en pantalla es adelante
  };

  const padEnd = (ev) => {
    if (ev.pointerId !== padId) return;
    padId = null;
    joy.active = false;
    joy.x = 0;
    joy.y = 0;
    knob.style.transform = 'translate(0px, 0px)';
  };

  pad.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    padId = ev.pointerId;
    const r = pad.getBoundingClientRect();
    cx = r.left + r.width / 2;
    cy = r.top + r.height / 2;
    try { pad.setPointerCapture(ev.pointerId); } catch (_) { /* sin captura */ }
    padMove(ev);
  });
  pad.addEventListener('pointermove', padMove);
  pad.addEventListener('pointerup', padEnd);
  pad.addEventListener('pointercancel', padEnd);
  pad.addEventListener('lostpointercapture', padEnd);

  // ── Botones de acción ──
  const mkButton = (label, sub, size, right, bottom, action) => {
    const b = document.createElement('div');
    b.style.cssText = [
      'position:absolute',
      `right:${right}px`,
      `bottom:${bottom}px`,
      `width:${size}px`,
      `height:${size}px`,
      'border-radius:50%',
      'pointer-events:auto',
      'touch-action:none',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'flex-direction:column',
      'font-family:Georgia,serif',
      'color:#fff8e0',
      'text-shadow:0 1px 2px rgba(0,0,0,0.6)',
      'background:radial-gradient(circle at 38% 32%, rgba(255,246,214,0.42), rgba(30,44,38,0.55) 70%)',
      'border:2px solid rgba(255,246,214,0.6)',
      'box-shadow:0 6px 16px rgba(0,0,0,0.35), inset 0 0 16px rgba(0,0,0,0.2)',
      'backdrop-filter:blur(2px)',
    ].join(';');
    b.innerHTML =
      `<span style="font-size:${Math.round(size * 0.34)}px;line-height:1">${label}</span>` +
      (sub ? `<span style="font-size:${Math.round(size * 0.15)}px;opacity:.8;margin-top:2px">${sub}</span>` : '');

    const down = (ev) => {
      ev.preventDefault();
      b.style.transform = 'scale(0.92)';
      if (typeof input._emit === 'function') input._emit(action);
    };
    const up = () => {
      b.style.transform = 'scale(1)';
      if (action === 'attack') input.attackHeld = false;
    };

    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('pointerleave', up);
    return b;
  };

  root.appendChild(mkButton('A', 'atacar', 82, 22, 34, 'attack'));
  root.appendChild(mkButton('B', 'usar', 66, 118, 22, 'interact'));
  root.appendChild(mkButton('L', 'esquivar', 60, 40, 132, 'dodge'));

  const destroy = () => {
    window.removeEventListener('touchstart', reveal);
    if (root.parentNode) root.parentNode.removeChild(root);
  };

  return { destroy };
}
