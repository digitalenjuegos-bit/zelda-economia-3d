/**
 * src/engine/camera.js — cámara de seguimiento en tercera persona.
 *
 * API (ver SPEC.md, Anexo A):
 *   createRig(camera) -> rig
 *   rig: { update(dt, targetPos, moveDir), shake(amount), setYaw(y),
 *          orbit(delta), cinematic(from, to, dur, cb), yaw }
 *   RIG_DEFAULTS
 *
 * Integración sugerida en main.js (una vez por frame):
 *   input.update(dt);
 *   rig.orbit(input.look.x + input.orbit);
 *   rig.update(dt, hero.pos, heroMoveDir);
 *
 * El rig no escucha el teclado: recibe la órbita ya calculada por input.js.
 */
import * as THREE from 'three';

export const RIG_DEFAULTS = {
  fov: 50,
  pitch: 52,     // grados sobre el horizonte
  dist: 11,      // metros
  height: 1.2,   // altura del punto al que mira la cámara
};

const ORBIT_LIMIT = THREE.MathUtils.degToRad(35);
const MIN_PITCH = THREE.MathUtils.degToRad(22);
const MAX_PITCH = THREE.MathUtils.degToRad(72);
const MIN_DIST = 7;
const MAX_DIST = 15;

const wrapAngle = (a) => {
  let x = (a + Math.PI) % (Math.PI * 2);
  if (x < 0) x += Math.PI * 2;
  return x - Math.PI;
};

function poseOf(v, fallback) {
  if (!v) return fallback.clone();
  if (v.isVector3) return v.clone();
  if (v.pos) return poseOf(v.pos, fallback);
  return new THREE.Vector3(v.x || 0, v.y || 0, v.z || 0);
}

export function createRig(camera) {
  if (!camera) throw new Error('createRig: se requiere una cámara');

  camera.fov = RIG_DEFAULTS.fov;
  camera.updateProjectionMatrix();

  const target = new THREE.Vector3(0, RIG_DEFAULTS.height, 0);
  const smoothTarget = new THREE.Vector3().copy(target);
  const desiredPos = new THREE.Vector3();
  const shakeOff = new THREE.Vector3();

  let baseYaw = 0;                       // orientación de referencia (hacia donde avanza)
  let userYaw = 0;                       // desvío manual, limitado a ±35°
  let pitch = THREE.MathUtils.degToRad(RIG_DEFAULTS.pitch);
  let dist = RIG_DEFAULTS.dist;
  let height = RIG_DEFAULTS.height;

  let initialized = false;
  let shakeAmp = 0;
  let shakeTime = 0;

  // Cinemática
  let cine = null;

  const rig = {
    yaw: 0,
    pitch,
    dist,
    height,
    autoFollow: true,
    followRate: 1.6,
    lead: 1.4,
    groundFn: null,

    update(dt, targetPos, moveDir) {
      const d = Math.min(Math.max(dt, 0), 0.05);

      if (cine) {
        updateCinematic(d);
        return;
      }

      // Punto al que mira la cámara.
      const tx = targetPos ? targetPos.x : 0;
      const ty = targetPos ? targetPos.y : 0;
      const tz = targetPos ? targetPos.z : 0;

      let mvx = 0;
      let mvz = 0;
      let mag = 0;
      if (moveDir) {
        mvx = moveDir.x || 0;
        mvz = moveDir.z || 0;
        mag = Math.hypot(mvx, mvz);
      }

      // Adelanto suave en la dirección del movimiento.
      let leadX = 0;
      let leadZ = 0;
      if (mag > 0.05) {
        const k = Math.min(1, mag) * rig.lead;
        leadX = (mvx / mag) * k;
        leadZ = (mvz / mag) * k;
      }

      target.set(tx + leadX, ty + height, tz + leadZ);

      if (!initialized) {
        smoothTarget.copy(target);
        initialized = true;
      } else {
        smoothTarget.lerp(target, 1 - Math.exp(-d * 7.5));
      }

      // La cámara se coloca detrás del rumbo de avance.
      if (rig.autoFollow && mag > 0.15) {
        const want = Math.atan2(-mvx / mag, -mvz / mag);
        const diff = wrapAngle(want - baseYaw);
        baseYaw = wrapAngle(baseYaw + diff * (1 - Math.exp(-d * rig.followRate)));
      }

      userYaw = THREE.MathUtils.clamp(userYaw, -ORBIT_LIMIT, ORBIT_LIMIT);
      const yaw = wrapAngle(baseYaw + userYaw);
      rig.yaw = yaw;

      const cp = Math.cos(pitch);
      const sp = Math.sin(pitch);
      desiredPos.set(
        smoothTarget.x + Math.sin(yaw) * cp * dist,
        smoothTarget.y + sp * dist,
        smoothTarget.z + Math.cos(yaw) * cp * dist
      );

      // No atravesar el suelo.
      if (rig.groundFn) {
        const gh = rig.groundFn(desiredPos.x, desiredPos.z);
        if (Number.isFinite(gh) && desiredPos.y < gh + 0.9) {
          desiredPos.y = gh + 0.9;
        }
      }

      const k = initialized ? 1 - Math.exp(-d * 6.5) : 1;
      camera.position.lerp(desiredPos, k);

      // Sacudida: ruido de alta frecuencia con caída exponencial.
      if (shakeAmp > 0.0001) {
        shakeTime += d;
        const s = shakeAmp;
        shakeOff.set(
          Math.sin(shakeTime * 61.0) * s,
          Math.sin(shakeTime * 47.3 + 1.7) * s * 0.8,
          Math.sin(shakeTime * 53.7 + 3.1) * s
        );
        camera.position.add(shakeOff);
        shakeAmp *= Math.exp(-d * 7.5);
        if (shakeAmp < 0.0008) shakeAmp = 0;
      }

      camera.lookAt(smoothTarget);

      // Inclinación al orbitar: refuerza la sensación de giro.
      camera.rotation.z += userYaw * -0.06;
    },

    /** Sacudida corta; amount en metros (0,05 suave, 0,35 golpe fuerte). */
    shake(amount = 0.12) {
      shakeAmp = Math.min(0.6, Math.max(shakeAmp, amount));
    },

    /** Fija el rumbo de referencia (normalmente el del héroe). */
    setYaw(y, snap = false) {
      baseYaw = wrapAngle(y);
      if (snap) {
        initialized = false;
        userYaw = 0;
      }
    },

    /** Suma órbita manual; se recorta a ±35°. */
    orbit(delta) {
      if (!Number.isFinite(delta)) return;
      userYaw = THREE.MathUtils.clamp(userYaw + delta, -ORBIT_LIMIT, ORBIT_LIMIT);
    },

    /** Zoom suave (rueda del ratón). */
    zoom(delta) {
      if (!Number.isFinite(delta)) return;
      dist = THREE.MathUtils.clamp(dist + delta, MIN_DIST, MAX_DIST);
    },

    /** Ajusta la inclinación en grados. */
    setPitch(deg) {
      pitch = THREE.MathUtils.clamp(
        THREE.MathUtils.degToRad(deg), MIN_PITCH, MAX_PITCH
      );
    },

    /** Reinicia el seguimiento (cambio de región, reaparición). */
    reset(targetPos) {
      initialized = false;
      userYaw = 0;
      if (targetPos) {
        smoothTarget.set(targetPos.x, targetPos.y + height, targetPos.z);
        target.copy(smoothTarget);
        camera.position.copy(desiredPosFor(smoothTarget, baseYaw, pitch, dist));
        camera.lookAt(smoothTarget);
        initialized = true;
      }
    },

    /**
     * Movimiento de cámara guionizado.
     * from / to = { pos:{x,y,z}, look:{x,y,z} } o Vector3 para pos.
     */
    cinematic(from, to, dur = 1.8, cb = null) {
      const fallbackPos = camera.position.clone();
      const fallbackLook = smoothTarget.clone();

      cine = {
        t: 0,
        dur: Math.max(0.1, dur),
        cb,
        fromPos: poseOf(from && from.pos, fallbackPos),
        fromLook: poseOf(from && from.look, fallbackLook),
        toPos: poseOf(to && to.pos, fallbackPos),
        toLook: poseOf(to && to.look, fallbackLook),
      };
      initialized = true;
    },

    get isCinematic() {
      return !!cine;
    },
  };

  function desiredPosFor(tgt, yaw, pit, dd) {
    const cp = Math.cos(pit);
    const sp = Math.sin(pit);
    return new THREE.Vector3(
      tgt.x + Math.sin(yaw) * cp * dd,
      tgt.y + sp * dd,
      tgt.z + Math.cos(yaw) * cp * dd
    );
  }

  function updateCinematic(d) {
    cine.t += d;
    const raw = Math.min(1, cine.t / cine.dur);
    const e = raw < 0.5
      ? 4 * raw * raw * raw
      : 1 - Math.pow(-2 * raw + 2, 3) / 2;   // easeInOutCubic

    camera.position.lerpVectors(cine.fromPos, cine.toPos, e);
    const look = new THREE.Vector3().lerpVectors(cine.fromLook, cine.toLook, e);
    camera.lookAt(look);

    if (raw >= 1) {
      const cb = cine.cb;
      cine = null;
      if (cb) {
        try { cb(); } catch (err) { console.error('[camera] cinematic:', err); }
      }
    }
  }

  return rig;
}
