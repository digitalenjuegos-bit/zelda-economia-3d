/**
 * src/engine/toon.js — materiales cel-shading, contorno y rim light.
 *
 * Dirección de arte: bandas nítidas de 4 pasos, contorno casi negro de grosor
 * constante y borde cálido en los cantos. Nada de MeshStandardMaterial plano.
 *
 * API (ver SPEC.md, Anexo A):
 *   gradientMap(steps)          DataTexture 4x1 cacheada, NearestFilter
 *   toon(color, opts)           MeshToonMaterial configurado
 *   outlineMesh(mesh, opts)     copia BackSide del mesh
 *   withOutline(mesh, opts)     grupo {mesh, outline}
 *   glow(color, opts)           material emisivo para runas, agua, antorchas
 *   rimPatch(material, color, strength)
 *
 * Nota de implementación del contorno: por defecto NO se escala la malla
 * (eso desplaza las piezas cuyo pivote no coincide con el centro de la
 * geometría, típico en piernas y brazos). Se empuja cada vértice a lo largo de
 * su normal en el vertex shader, de modo que el grosor es constante en metros
 * y sobrevive al skinning. `opts.mode === 'scale'` conserva el truco clásico
 * de escala 1,03 para geometrías centradas que lo prefieran.
 */
import * as THREE from 'three';

// ---------------------------------------------------------------------
//  Rampa de tonos
// ---------------------------------------------------------------------
const GRAD_CACHE = new Map();

/**
 * Rampa de `steps` niveles para MeshToonMaterial.
 * Los valores no llegan a negro puro: la zona en sombra conserva color, que es
 * lo que separa un cel-shading limpio de una silueta sucia.
 */
export function gradientMap(steps = 4) {
  const n = Math.max(2, Math.min(8, Math.round(steps)));
  if (GRAD_CACHE.has(n)) return GRAD_CACHE.get(n);

  const data = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const t = (i + 1) / n;                       // 0 < t <= 1
    const v = 0.40 + 0.60 * Math.pow(t, 1.05);   // banda mínima al 40 %
    data[i] = Math.round(255 * Math.min(1, v));
  }

  const tex = new THREE.DataTexture(data, n, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  GRAD_CACHE.set(n, tex);
  return tex;
}

// ---------------------------------------------------------------------
//  Material toon
// ---------------------------------------------------------------------
export function toon(colorHex = 0xffffff, opts = {}) {
  const mat = new THREE.MeshToonMaterial({
    color: colorHex,
    gradientMap: opts.gradientMap || gradientMap(opts.steps || 4),
    emissive: opts.emissive !== undefined ? opts.emissive : 0x000000,
    emissiveIntensity: opts.emissiveIntensity !== undefined ? opts.emissiveIntensity : 1,
    map: opts.map || null,
    side: opts.side !== undefined ? opts.side : THREE.FrontSide,
    transparent: !!opts.transparent,
    opacity: opts.opacity !== undefined ? opts.opacity : 1,
    vertexColors: !!opts.vertexColors,
    alphaTest: opts.alphaTest !== undefined ? opts.alphaTest : 0,
    depthWrite: opts.depthWrite !== false,
    fog: opts.fog !== false,
  });

  // MeshToonMaterial no declara `flatShading` en su constructor (three r160),
  // pero sí lo consume el programa de shader: asignarlo después activa
  // FLAT_SHADED y con él la normal por derivadas de normal_fragment_begin.
  // Pasarlo por el constructor solo producía un aviso y ninguna cara plana.
  if (opts.flatShading) mat.flatShading = true;

  if (opts.rim) rimPatch(mat, opts.rim, opts.rimStrength !== undefined ? opts.rimStrength : 0.55);
  return mat;
}

// ---------------------------------------------------------------------
//  Rim light por inyección de shader
// ---------------------------------------------------------------------
/**
 * Añade a un material iluminado el borde luminoso característico del cel-shading:
 *   pow(1 - dot(normal, vista), 3)
 * El término se suma a `outgoingLight`, justo antes de escribir el color.
 */
export function rimPatch(material, colorHex = 0xffd9a0, strength = 0.55) {
  if (!material || material.isMeshBasicMaterial) return material;

  const rimColor = new THREE.Color(colorHex);
  const rimStrength = strength;

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRimColor = { value: rimColor.clone() };
    shader.uniforms.uRimStrength = { value: rimStrength };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vRimNormalW;
        varying vec3 vRimPosW;`
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vRimNormalW = normalize(mat3(modelMatrix) * objectNormal);
        vRimPosW = (modelMatrix * vec4(transformed, 1.0)).xyz;`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uRimColor;
        uniform float uRimStrength;
        varying vec3 vRimNormalW;
        varying vec3 vRimPosW;`
      )
      .replace(
        '#include <opaque_fragment>',
        `{
          vec3 rimView = normalize(cameraPosition - vRimPosW);
          float rimDot = clamp(dot(normalize(vRimNormalW), rimView), 0.0, 1.0);
          float rim = pow(1.0 - rimDot, 3.0);
          // El borde trasero (normal alejándose de la cámara) se atenúa:
          // así sólo se enciende el canto, nunca el interior del volumen.
          float back = smoothstep(0.0, 0.45, dot(normalize(vRimNormalW), -rimView));
          outgoingLight += uRimColor * rim * uRimStrength * (1.0 - back * 0.65);
        }
        #include <opaque_fragment>`
      );
  };

  material.customProgramCacheKey = () => `rim:${rimStrength}:${rimColor.getHexString()}`;
  material.needsUpdate = true;
  return material;
}

// ---------------------------------------------------------------------
//  Contorno
// ---------------------------------------------------------------------
export function outlineMesh(mesh, opts = {}) {
  const mode = opts.mode || 'normal';
  // `width` se interpreta como metros a ~10 m de cámara. El shader lo escala
  // con la profundidad, así el contorno mantiene ~2 px en pantalla a cualquier
  // distancia en vez de desaparecer en los objetos lejanos.
  const width = opts.width !== undefined ? opts.width : 0.026;
  const scale = opts.scale !== undefined ? opts.scale : 1.035;

  const mat = new THREE.MeshBasicMaterial({
    color: opts.color !== undefined ? opts.color : 0x101018,
    side: THREE.BackSide,
    transparent: !!opts.transparent,
    opacity: opts.opacity !== undefined ? opts.opacity : 1,
    depthWrite: opts.depthWrite !== false,
    fog: opts.fog !== false,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });

  const geo = mesh.geometry;
  let outline;

  if (mesh.isSkinnedMesh && THREE.SkinnedMesh) {
    outline = new THREE.SkinnedMesh(geo, mat);
    outline.bind(mesh.skeleton, mesh.bindMatrix);
  } else {
    outline = new THREE.Mesh(geo, mat);
  }

  const canExtrude = !!(geo && geo.attributes && geo.attributes.normal);

  if (mode === 'scale' || !canExtrude) {
    outline.scale.setScalar(scale);
  } else {
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uOutlineWidth = { value: width };
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform float uOutlineWidth;`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          {
            // Grosor constante en píxeles: la extrusión crece con la distancia.
            float oDepth = max(0.6, length((modelViewMatrix * vec4(transformed, 1.0)).xyz));
            transformed += normalize(normal) * uOutlineWidth * oDepth * 0.1;
          }`
        );
    };
    mat.customProgramCacheKey = () => 'outline-normal-v2';
  }

  outline.castShadow = false;
  outline.receiveShadow = false;
  outline.matrixAutoUpdate = true;
  outline.frustumCulled = mesh.frustumCulled;
  outline.name = (mesh.name || 'mesh') + '_outline';
  outline.userData.isOutline = true;
  outline.userData.outlineFor = mesh;
  return outline;
}

/**
 * Envuelve `mesh` con su contorno. El contorno se cuelga DENTRO del mesh para
 * heredar posición, rotación y escala sin sincronización manual.
 * Devuelve un Group con `group.mesh` y `group.outline` accesibles.
 */
export function withOutline(mesh, opts = {}) {
  const outline = outlineMesh(mesh, opts);
  outline.position.set(0, 0, 0);
  outline.quaternion.identity();

  mesh.add(outline);

  const group = new THREE.Group();
  group.name = (mesh.name || 'prop') + '_group';
  group.add(mesh);
  group.mesh = mesh;
  group.outline = outline;
  group.userData.mesh = mesh;
  group.userData.outline = outline;
  return group;
}

// ---------------------------------------------------------------------
//  Emisivo (runas, antorchas, agua, estelas)
// ---------------------------------------------------------------------
export function glow(colorHex = 0x3fe4ff, opts = {}) {
  const mat = new THREE.MeshBasicMaterial({
    color: colorHex,
    map: opts.map || null,
    side: opts.side !== undefined ? opts.side : THREE.FrontSide,
    transparent: opts.transparent !== undefined ? opts.transparent : true,
    opacity: opts.opacity !== undefined ? opts.opacity : 1,
    blending: opts.blending !== undefined ? opts.blending : THREE.AdditiveBlending,
    depthWrite: opts.depthWrite !== undefined ? opts.depthWrite : false,
    toneMapped: false,
    fog: opts.fog !== false,
  });
  // Por encima de 1.0 para que UnrealBloom lo encienda de verdad.
  mat.color.multiplyScalar(opts.intensity !== undefined ? opts.intensity : 1.8);
  return mat;
}
