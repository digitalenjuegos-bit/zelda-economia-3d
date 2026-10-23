/**
 * src/engine/physics.js — colisiones en el plano XZ, altura de terreno y agua.
 *
 * Sin motor externo. Todo determinista y barato: círculo del actor contra
 * cajas alineadas a los ejes y contra cilindros (troncos, rocas), resolviendo
 * un eje cada vez para que el personaje deslice en lugar de quedarse clavado.
 *
 * API (ver SPEC.md, Anexo A):
 *   sampleHeight(region, x, z)
 *   resolveMove(region, pos, radius, dx, dz) -> { x, z }
 *   isInWater(region, x, z)
 *   inBounds(region, x, z)
 */
import * as THREE from 'three';

const EPS = 1e-4;

// ---------------------------------------------------------------------
//  Altura del terreno
// ---------------------------------------------------------------------
function heightFn(region) {
  if (!region) return null;
  const t = region.terrain;
  if (t && typeof t.heightAt === 'function') return t.heightAt;
  if (typeof region.heightAt === 'function') return region.heightAt;
  return null;
}

export function sampleHeight(region, x, z) {
  const fn = heightFn(region);
  if (!fn) return 0;
  const h = fn(x, z);
  return Number.isFinite(h) ? h : 0;
}

// ---------------------------------------------------------------------
//  Límites
// ---------------------------------------------------------------------
function boundsOf(region) {
  return region && region.bounds ? region.bounds : null;
}

export function inBounds(region, x, z) {
  const b = boundsOf(region);
  if (!b) return true;
  return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
}

function clampToBounds(region, x, z, radius) {
  const b = boundsOf(region);
  if (!b) return { x, z };
  return {
    x: Math.min(b.maxX - radius, Math.max(b.minX + radius, x)),
    z: Math.min(b.maxZ - radius, Math.max(b.minZ + radius, z)),
  };
}

// ---------------------------------------------------------------------
//  Resolución
// ---------------------------------------------------------------------
/**
 * Mueve un círculo (pos, radius) una distancia (dx, dz) resolviendo choques.
 * Devuelve la posición final en el plano. No modifica `pos`.
 */
export function resolveMove(region, pos, radius, dx, dz) {
  let x = pos.x;
  let z = pos.z;
  const r = Math.max(0.05, radius);

  const boxes = (region && region.colliders) || [];
  const cyls = (region && region.cylinders) || [];

  // Subpasos: un desplazamiento grande en un frame no puede atravesar un muro.
  const dist = Math.hypot(dx, dz);
  const steps = Math.max(1, Math.min(8, Math.ceil(dist / Math.max(0.2, r * 0.75))));
  const sx = dx / steps;
  const sz = dz / steps;

  for (let s = 0; s < steps; s++) {
    // ── eje X ──
    if (sx !== 0) {
      x += sx;
      for (let i = 0; i < boxes.length; i++) {
        const c = boxes[i];
        if (!c || c.disabled) continue;
        const hw = (c.hw !== undefined ? c.hw : (c.w || 0) * 0.5) + r;
        const hd = (c.hd !== undefined ? c.hd : (c.d || 0) * 0.5) + r;
        if (Math.abs(x - c.x) < hw && Math.abs(z - c.z) < hd) {
          x = sx > 0 ? c.x - hw - EPS : c.x + hw + EPS;
        }
      }
    }

    // ── eje Z ──
    if (sz !== 0) {
      z += sz;
      for (let i = 0; i < boxes.length; i++) {
        const c = boxes[i];
        if (!c || c.disabled) continue;
        const hw = (c.hw !== undefined ? c.hw : (c.w || 0) * 0.5) + r;
        const hd = (c.hd !== undefined ? c.hd : (c.d || 0) * 0.5) + r;
        if (Math.abs(x - c.x) < hw && Math.abs(z - c.z) < hd) {
          z = sz > 0 ? c.z - hd - EPS : c.z + hd + EPS;
        }
      }
    }

    // ── cilindros (dos pasadas: un cilindro puede empujar hacia otro) ──
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < cyls.length; i++) {
        const c = cyls[i];
        if (!c || c.disabled) continue;
        const cr = (c.r || 0) + r;
        let ox = x - c.x;
        let oz = z - c.z;
        let d2 = ox * ox + oz * oz;
        if (d2 >= cr * cr) continue;
        if (d2 < 1e-8) {
          // Centrado exacto: sale por el eje con menos penetración.
          ox = 1;
          oz = 0;
          d2 = 1;
        }
        const d = Math.sqrt(d2);
        const push = (cr - d) / d;
        x += ox * push;
        z += oz * push;
      }
    }
  }

  const clamped = clampToBounds(region, x, z, r);
  return { x: clamped.x, z: clamped.z };
}

// ---------------------------------------------------------------------
//  Agua
// ---------------------------------------------------------------------
export function isInWater(region, x, z) {
  if (!region || region.waterLevel === undefined || region.waterLevel === null) return false;

  const h = sampleHeight(region, x, z);
  if (h > region.waterLevel - 0.02) return false;

  // Si la región declara masas de agua concretas, respétalas.
  const areas = region.waterAreas;
  if (Array.isArray(areas) && areas.length) {
    for (let i = 0; i < areas.length; i++) {
      const a = areas[i];
      if (!a) continue;
      if (a.r !== undefined) {
        const dx = x - a.x;
        const dz = z - a.z;
        if (dx * dx + dz * dz <= a.r * a.r) return true;
      } else if (
        a.minX !== undefined &&
        x >= a.minX && x <= a.maxX && z >= a.minZ && z <= a.maxZ
      ) {
        return true;
      }
    }
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------
//  Utilidades expuestas por comodidad (no rompen el contrato)
// ---------------------------------------------------------------------
export const PHYS = {
  /** Altura mínima a la que se puede apoyar un actor sin hundirse. */
  groundHeight(region, x, z) {
    return sampleHeight(region, x, z);
  },

  /** Normal aproximada del terreno, útil para orientar props. */
  slopeAt(region, x, z, eps = 0.5) {
    const hL = sampleHeight(region, x - eps, z);
    const hR = sampleHeight(region, x + eps, z);
    const hD = sampleHeight(region, x, z - eps);
    const hU = sampleHeight(region, x, z + eps);
    return new THREE.Vector3(hL - hR, 2 * eps, hD - hU).normalize();
  },
};
