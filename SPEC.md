# SPEC.md — «El Reino de la Economía» (aventura 3D estilo Zelda, Three.js)

Contrato de arquitectura. Todo subagente trabaja contra este documento. Si el código
contradice el SPEC, gana el SPEC; si el SPEC es ambiguo, se pregunta al coordinador.

## 0. Objetivo

Aventura de acción 3D en el navegador, cámara en tercera persona con vista elevada
(estilo *Zelda: Breath of the Wild* / *Wind Waker*), en español, con identidad visual
propia (NO copiar assets, personajes ni nombres de Nintendo). El progreso del juego
se gana respondiendo 20 preguntas de economía de 1.º BGU.

Calidad visual objetivo: **AAA de navegador**. Referencia de comparación a ciegas:
capturas de Zelda BotW/Wind Waker.

## 1. Restricciones técnicas duras

- **Three.js 0.160.0** por import map desde jsdelivr. Versión fija.
- ES modules nativos. Sin bundler, sin npm, sin build.
- **Cero assets externos**: toda textura se genera en `<canvas>`, toda geometría por
  código, todo audio por WebAudio. No hay archivos .png/.jpg/.mp3/.glb.
- 1 unidad = 1 metro. Héroe ≈ 1,7 m de alto.
- 60 fps en un MacBook M3 con Chrome. Presupuesto: < 900 draw calls, < 350k triángulos.
- Funciona servido estáticamente (GitHub Pages). Sin fetch a rutas relativas que
  fallen por CORS en `file://` (el juego se prueba con `http.server`, y en producción
  con Pages, ambos HTTP).
- Español con tildes correctas en TODO texto visible.
- Terminología económica IB estricta. En textos para estudiantes **nunca** usar
  símbolos sueltos: se escribe «demanda agregada», «nivel de precios», «producción
  real», «oferta agregada de largo plazo». Prohibidas las flechas (→ ← ↑ ↓) en
  cualquier texto de interfaz.

## 2. Estructura de archivos (propiedad de cada módulo)

```
index.html                 import map, canvas, capas DOM del HUD
src/main.js                bootstrap + bucle principal
src/config.js              EXAM_ID, Supabase, TEACHER_KEY, LS_KEY
src/bank.js                QUESTION_BANK (4 regiones x 5 preguntas)
src/roster.js              ROSTER por curso (ya existe, no tocar)
src/engine/core.js         renderer, escena, cámara, composer, resize, reloj
src/engine/toon.js         materiales cel-shading + contorno + rim light
src/engine/tex.js          texturas procedimentales en canvas + ruido
src/engine/world.js        construcción de las 4 regiones
src/engine/physics.js      colisiones AABB/círculo, gravedad, altura del terreno
src/engine/input.js        teclado, ratón, táctil
src/engine/camera.js       cámara de seguimiento suavizada
src/engine/particles.js    polvo, hojas, chispas, salpicaduras
src/engine/audio.js        música y efectos por WebAudio
src/entities/hero.js       héroe, modelo, animaciones, espada
src/entities/enemy.js      enemigos y jefes
src/entities/props.js      cofres, vasijas, carteles, antorchas, santuarios
src/systems/combat.js      golpes, daño, retroceso, invulnerabilidad
src/systems/game.js        máquina de estados y progreso
src/ui/hud.js              corazones, rupias, progreso, minimapa
src/ui/quiz.js             panel de pregunta estilo pergamino
src/ui/screens.js          intro, reglas, región superada, victoria, derrota
src/ui/supabase.js         (ya existe, no tocar)
src/ui/logic.js            (ya existe, no tocar)
src/ui/teacher.js          (ya existe, no tocar)
qa/ui/shoot.sh             capturas headless
qa/ui/frame.html           viewport móvil por iframe
```

## 3. Dirección de arte (lo que hace que parezca Zelda)

Paleta saturada y limpia, luz de sol cálida, sombras suaves azuladas, niebla que
funde el horizonte con el cielo. Nada de grises planos ni materiales default.

1. **Cel-shading real**: `MeshToonMaterial` con `gradientMap` de 4 pasos
   (`DataTexture` 4x1, `NearestFilter`, `NoColorSpace`). Bandas nítidas, no
   degradados suaves.
2. **Contorno**: malla duplicada con `THREE.BackSide`, escala 1,03, color casi negro
   (`0x101018`), `polygonOffset`. Solo en personajes y props grandes, nunca en el
   terreno.
3. **Rim light**: en `toon.js` se inyecta con `onBeforeCompile` un término
   `pow(1.0 - dot(normal, viewDir), 3.0)` sumado al color, color de borde cálido.
   Da el borde luminoso característico.
4. **Iluminación**: `HemisphereLight` (cielo `0x9fd7ff`, suelo `0x4a6b3a`, 0.55) +
   `DirectionalLight` cálida (`0xfff1d0`, 1.5) con sombras de 2048 px y cámara de
   sombra ajustada a la región. Sin sombras no hay calidad.
5. **Post-proceso**: `EffectComposer` + `RenderPass` + `UnrealBloomPass`
   (strength 0.42, radius 0.7, threshold 0.85) + `SMAAPass`. El bloom solo debe
   encender runas, antorchas, agua y estelas de espada.
6. **Cielo**: cúpula con `ShaderMaterial` de degradado vertical (cenit azul profundo
   → horizonte crema), más `scene.fog = new THREE.Fog(colorHorizonte, 40, 130)`.
   El color del fog DEBE coincidir con el horizonte del cielo.
7. **Terreno con color por vértice**: verde hierba → verde oscuro en pendiente →
   roca gris en altura → arena junto al agua. Se calcula por altura y pendiente.
8. **Hierba instanciada**: `InstancedMesh` de 6000–9000 matas (2 triángulos
   cruzados), con balanceo en vertex shader (`onBeforeCompile`, seno por
   `instanceMatrix` y `uTime`). Es el truco que más sube la percepción de calidad.
9. **Agua**: plano con shader propio, olas por seno, espuma en el borde, reflejo
   falso por Fresnel con el color del cielo.
10. **Tono**: `ACESFilmicToneMapping`, `exposure 1.12`, `outputColorSpace = SRGBColorSpace`.

## 4. Cámara y control

- Perspectiva, `fov 50`, inclinación 52° sobre el horizonte, distancia 11 m, altura
  objetivo a 1,2 m del héroe.
- Seguimiento con amortiguación exponencial (`lerp` dependiente del delta), nunca
  rígido. Pequeño adelanto en la dirección del movimiento.
- Rotación orbital opcional con ratón (arrastrar) y flechas Q/E, limitada a ±35°.
- Sacudida de cámara corta al recibir o dar golpes fuertes.
- Controles: WASD o flechas para moverse, `Espacio` atacar con la espada, `E`
  interactuar (santuario, cofre, cartel), `Shift` esquivar, `P` pausa, `M` mapa.
- En táctil: joystick virtual izquierdo + botón de ataque y de interactuar.

## 5. Física

- Colisión en el plano XZ: círculo del actor contra AABB de cada colisionador y
  contra cilindros de árboles/rocas. Resolución por eje separado (deslizar, no
  bloquearse).
- Altura del terreno por muestreo bilineal de la función de altura. El actor se pega
  al suelo; la gravedad solo actúa al caer de bordes.
- El agua frena al héroe y hace salpicar partículas.
- Sin motor físico externo (nada de cannon/rapier). Todo a mano, determinista.

## 6. Estructura del juego

Cuatro regiones, cada una con identidad visual propia. Se recorren en orden; al
derrotar al jefe de una se abre el portal a la siguiente.

| # | Región | Bioma | Jefe | Foco económico |
|---|--------|-------|------|----------------|
| 1 | Pradera de la Escasez | prado, robles, arroyo | Guardián de Piedra | escasez, necesidades y deseos, costo de oportunidad, bienes gratuitos |
| 2 | Cañón del Intercambio | cañón rocoso, mesetas, viento | Buitre de las Cumbres | mercado, trueque, dinero, oferta y demanda, precio de equilibrio |
| 3 | Pantano del Esfuerzo | humedal, niebla, juncos | Sierpe del Lodo | factores de producción, productividad, división del trabajo, empresa |
| 4 | Ruinas del Estado | ruinas, volcán, brasas | Coloso de Bronce | impuestos, gasto público, bienes públicos, externalidades, desarrollo |

Cada región contiene:
- **5 santuarios con runa**: cada uno abre una pregunta. Responder bien enciende la
  runa (brillo cian), suelta rupias y da un corazón si faltaba. Responder mal resta
  medio corazón y muestra la explicación; la runa queda apagada y se puede reintentar
  una sola vez por santuario.
- **Enemigos** (6–10 por región) que dan rupias y suben la racha.
- **1 cofre** con 20 rupias y **1 cartel** con una frase de contexto económico.
- **1 jefe** que aparece solo con las 5 runas encendidas. Al morir, cinemática breve
  de cámara y pantalla «Región superada».
- **Corazones**: 5 al empezar. Al llegar a 0 el héroe se desmaya en el punto de
  entrada de la región, recupera 5 corazones y conserva las runas encendidas y los
  aciertos. Nunca se pierde la partida.

Al cerrar la región 4: pantalla de victoria con nota final
(`aciertos × 0,5` sobre 10), rango (S/A/B/C) y envío a Supabase.

## 7. Banco de preguntas

`src/bank.js` exporta `QUESTION_BANK` con la MISMA forma que la versión Mario (para
que `src/ui/logic.js` funcione sin cambios):

```js
export const QUESTION_BANK = {
  exam_id: 'zelda-economia-3d-1bgu',
  title: 'El Reino de la Economía',
  subtitle: 'Historia y Ciudadanía · 1BGU',
  points_per_question: 0.5,
  total_questions: 20,
  worlds: [ { id, code, name, enemy, emoji, subtopic, questions: [
    { id, q, options:[4], answer:0..3, subtopic, difficulty:1..3, explanation }
  ] } ]
};
```

Reglas de calidad del banco:
- 4 opciones por pregunta, una sola correcta, sin ambigüedad ni dobles negaciones.
- La opción correcta **nunca** es la más larga ni la más corta (sesgo de longitud < 15 %
  medido en caracteres). Los tres distractores deben parecer plausibles bajo lectura
  superficial.
- Distribución de la clave equilibrada: no más de 6 preguntas con la misma letra.
- Cada pregunta anclada al contexto del juego (santuario, rupia, mercado del reino)
  sin volverse infantil.
- `explanation` de 1–2 frases, tono docente, sin flechas ni símbolos sueltos.
- Dificultad creciente dentro de cada región.

## 8. Persistencia y funciones docentes (paridad con mario-bros-economia-1bgu)

- **Supabase REST** sobre la tabla existente `quiz_results` (NO crear tablas).
  Columnas: `exam_id, student_name, student_lastname, course, score, total, grade,
  timestamp, attempt, answers`. `answers` es `jsonb` con el array
  `[{ ok, topic, question, correct, selected, options }]`.
- **Un intento por estudiante**: antes de empezar se consulta
  `quiz_results?exam_id=eq.<id>&student_name=eq.<n>&student_lastname=eq.<a>`; si
  existe fila completa, se bloquea el botón y se ofrece ver el informe propio.
- **Selección de estudiante**: lista desplegable por curso desde `ROSTER`
  (1BGU A, 1BGU B, 1BGU C). Filtro de búsqueda por texto.
- **Modal de reglas** obligatorio con casilla que desbloquea el botón «Comenzar
  aventura».
- **Ranking de clase** en vivo: puntos, solo iniciales del apellido, se refresca
  cada 15 s.
- **Panel docente** con clave `DOCENTE2026`: listado de resultados, exportar CSV
  (compatible con Excel, tres columnas NOMBRES/APELLIDOS/NOTA en celdas separadas),
  borrar filas del examen, informe individual con desglose por pregunta y exportación
  a PDF con jsPDF 1.5.3 desde cdnjs.
- La sesión se guarda en `localStorage` (`LS_KEY`) para recuperar el progreso si se
  recarga la página.

## 9. HUD y pantallas (estética)

- **Corazones**: contenedores en forma de corazón, relleno rojo con brillo, animación
  de pulso al perder vida. Arriba a la izquierda.
- **Rupias**: contador con icono de rombo verde, número con separador de miles.
  Se anima al sumar.
- **Progreso de runas**: 5 rombos cian que se encienden.
- **Minimapa** circular abajo a la derecha (canvas 2D dibujado a mano con la silueta
  de la región, el héroe y los santuarios).
- **Panel de pregunta**: pergamino de pergamino real (borde de fibras, sombra
  interior, esquinas irregulares), tipografía serif para el texto y los títulos de la
  interfaz, botones tipo sello. Nunca un `alert` ni un `confirm` de navegador
  (los iframes de Hyperclass los bloquean).
- **Transiciones**: fundido a negro de 0,4 s entre pantallas, nunca cortes secos.
- Tipografías desde Google Fonts: `Cinzel` (títulos) y `Nunito` (texto). Si falla la
  red, la pila de respaldo debe verse bien igual (`Georgia, serif` / `system-ui`).

## 10. Audio (WebAudio, sin archivos)

- Tema musical de exploración en modo menor, arpegio de arpa sintetizada, 8 compases
  en bucle, ganancia 0,12. Cambia a versión tensa durante el combate con el jefe.
- Efectos: paso sobre hierba, espada (ruido filtrado con caída rápida), impacto
  metálico, moneda (dos senos rápidos), runa encendida (barrido ascendente con
  reverb corto), daño (diente de sierra grave), cofre, jefe rugiendo.
- Arranca solo tras la primera interacción del usuario (política de autoplay).
- Botón de silencio en el HUD.

## 11. Verificación obligatoria (no se entrega sin esto)

1. `node --check` sobre cada archivo `.js` y sobre el script embebido de `index.html`.
2. Servidor local `python3 -m http.server 8765` y carga real en Chrome.
3. Capturas con `qa/ui/shoot.sh` en 1280x720, 800x650 y 390x844.
4. Consola del navegador sin errores (se comprueba con `--enable-logging=stderr`
   o inyectando un colector de errores en la página).
5. Recorrido completo: intro → reglas → región 1 → 5 preguntas → jefe → región 2 →
   ... → victoria → fila guardada en Supabase (se verifica con GET a la API).
6. Sin errores de textura, sin z-fighting visible, sin objetos flotando ni atravesando
   el suelo.

## 12. Protocolo del juez visual (loop de calidad)

Cada elemento se juzga a ciegas: se presentan dos capturas sin etiqueta (A y B),
una del juego y otra de Zelda. El juez responde obligatoriamente con:

```
GANADOR: A | B | EMPATE
MOTIVO: (una frase)
DEFECTOS_DETECTADOS: lista concreta y accionable
NIVEL: AAA | CASI | NO_AAA
```

Criterios que debe aplicar con dureza: calidad de la iluminación y las sombras,
riqueza del terreno (no plano ni repetitivo), densidad y variedad de la vegetación,
legibilidad del personaje, calidad tipográfica del HUD, coherencia cromática, y
sensación de profundidad. Un solo defecto grave (terreno plano, sombras ausentes,
HUD de estilo genérico, personaje mal proporcionado) obliga a `NO_AAA`.

El loop continúa hasta que las dos instancias de juez independientes declaren `AAA`
y `GANADOR: A` en todos los elementos juzgados.

---

# ANEXO A — Contrato de APIs entre módulos

Cada módulo exporta EXACTAMENTE estas firmas. Un subagente no edita archivos de otro
subagente. Si algo falta, se implementa dentro del propio módulo.

```js
// ── src/engine/core.js ─────────────────────────────────────────────
export function initCore(canvas)                       // → {renderer, scene, camera, composer}
export function setTheme(theme)                        // ver Anexo B
export function setExposure(v)
export function onFrame(cb)                            // cb(dt) tras render
export function renderFrame(dt)
export const core                                      // objeto con las refs, relleno tras initCore

// ── src/engine/toon.js ─────────────────────────────────────────────
export function gradientMap(steps = 4)                 // THREE.DataTexture cacheada
export function toon(colorHex, opts = {})              // MeshToonMaterial cel-shaded
   // opts: {emissive, emissiveIntensity, flatShading, side, transparent, opacity, vertexColors}
export function outlineMesh(mesh, opts = {})           // THREE.Mesh BackSide, ya escalado
export function withOutline(mesh, opts = {})           // THREE.Group {mesh, outline}
export function glow(colorHex, opts = {})              // MeshBasicMaterial emisivo para runas
export function rimPatch(material, colorHex, strength) // inyecta rim light en un material

// ── src/engine/tex.js ──────────────────────────────────────────────
export function rng(seed)                              // → función determinista
export function fbm(x, y, octaves = 4, seed = 1)       // → 0..1
export function canvasTex(w, h, draw, opts = {})       // → THREE.CanvasTexture
   // opts: {repeat:[x,y], wrap:true, aniso:8, srgb:true}
export const TEX = {
  grass, dirt, rock, sand, bark, leaf, water, stoneWall, wood, cloth, rune, metal
}                                                      // todas () => CanvasTexture

// ── src/engine/physics.js ──────────────────────────────────────────
export function sampleHeight(region, x, z)             // altura del terreno
export function resolveMove(region, pos, radius, dx, dz) // → {x, z} con deslizamiento
export function isInWater(region, x, z)                // → bool
export function inBounds(region, x, z)

// ── src/engine/input.js ────────────────────────────────────────────
export function createInput(el)                        // → input
// input: { move:{x,z}, attack:bool, interact:bool, dodge:bool, pause:bool,
//          look:{x,y}, enabled, update(dt), consume(name), attachTouch(dom),
//          onAction(cb) }
export function bindTouchUI(container, input)          // joystick + botones táctiles

// ── src/engine/camera.js ───────────────────────────────────────────
export function createRig(camera)                      // → rig
// rig: { update(dt, targetPos, moveDir), shake(amount), setYaw(y), orbit(delta),
//        cinematic(from, to, dur, cb), yaw }
export const RIG_DEFAULTS                              // {fov:50, pitch:52, dist:11, height:1.2}

// ── src/engine/particles.js ────────────────────────────────────────
export function createParticles(scene)                 // → particles
// particles: { burst(kind, pos, opts), update(dt), setVisible(b) }
// kind: 'dust' | 'leaf' | 'spark' | 'splash' | 'heal' | 'rupee' | 'rune' | 'smoke'

// ── src/engine/audio.js ────────────────────────────────────────────
export const Audio = {
  init(), play(name), music(mode), setMuted(b), muted
}                                                      // mode: 'explore'|'boss'|'title'|'off'
// nombres: 'step','sword','hit','coin','rune','hurt','chest','boss','portal','win'

// ── src/engine/world.js ────────────────────────────────────────────
export const REGIONS                                   // metadatos de las 4 regiones
export function buildRegion(scene, index)              // → region
// region: { index, name, theme, terrain:{mesh, heightAt(x,z)},
//           colliders:[{x,z,hw,hd}], cylinders:[{x,z,r,h}],
//           spawn:{x,y,z}, bounds:{minX,maxX,minZ,maxZ},
//           shrines:[{id,index,x,y,z,mesh,lit,setLit(b),ring}],
//           chests:[{x,y,z,opened,open()}],
//           signs:[{x,y,z,text}],
//           torches:[{x,y,z,mesh}],
//           portal:{x,y,z,mesh,activate(),active},
//           bossArena:{x,z,r},
//           enemySpawns:[{type,x,z}],
//           waterLevel, dispose() }

// ── src/entities/props.js ──────────────────────────────────────────
export function makeShrine(index, lit = false)         // → {group, runes:[], setLit(b)}
export function makeChest()                            // → {group, open(), opened}
export function makeSign()                             // → group
export function makeTorch()                            // → {group, flame}
export function makePortal()                           // → {group, activate()}
export function makeRock(scale), makeTree(kind), makeBush(), makeRupee()
export function makeFenceSegment(), makeBridge(len)

// ── src/entities/hero.js ───────────────────────────────────────────
export function createHero(scene, particles)           // → hero
// hero: { group, pos:{x,y,z}, radius, facing, hearts, maxHearts,
//         update(dt, input, region), attack(), hurt(n, dir), heal(n),
//         respawn(x,z), isAttacking, isDead, setVisible(b), dispose() }

// ── src/entities/enemy.js ──────────────────────────────────────────
export const ENEMY_TYPES                               // definiciones por tipo
export function createEnemy(scene, type, x, z, opts)   // → enemy
// enemy: { group, type, hp, alive, isBoss, pos, update(dt, hero, region),
//          takeHit(dmg, dir), dispose(), onDeath }
export function createBoss(scene, regionIndex, arena)   // → enemy (isBoss = true)

// ── src/ui/hud.js ──────────────────────────────────────────────────
export function createHUD(root)                        // → hud
// hud: { setHearts(n, max), setRupees(n, animate), setRunes(lit[], total),
//        setStreak(n), setName(text), setRegion(name), toast(text, kind),
//        setMinimap(data), drawMinimap(region, heroPos, shrines),
//        setMuted(b), show(), hide() }

// ── src/ui/quiz.js ─────────────────────────────────────────────────
export function createQuiz(root, audio)                // → quiz
// quiz: { ask(question, index, total, onAnswer), close(), isOpen }
// onAnswer({ok, selected, correct, timedOut})

// ── src/ui/screens.js ──────────────────────────────────────────────
export function createScreens(root)                    // → screens
// screens: { intro(opts, onStart), rules(onAccept), regionClear(region, onNext),
//            victory(summary, onReport), defeat(onRetry), fade(onMid), loading(b) }
```

## Anexo B — Temas por región (`setTheme`)

```js
// theme = { sunColor, sunIntensity, hemiSky, hemiGround, hemiIntensity,
//           skyTop, skyHorizon, fogColor, fogNear, fogFar, exposure }
REGION_THEMES[0] // Pradera: sol cálido 0xfff1d0, cielo 0x74b9ff→0xfdf3d6, fog 80..190
REGION_THEMES[1] // Cañón:  sol blanco 0xfff7e8, cielo 0x8ec5ff→0xffe3b0, fog 70..170
REGION_THEMES[2] // Pantano: sol verdoso 0xe8ffd0, cielo 0x9fb8a0→0xd8e8c0, fog 35..110
REGION_THEMES[3] // Ruinas: sol rojizo 0xffc79a, cielo 0x5a4a6a→0xff9a6a, fog 45..130
```

## Anexo C — Puntos de integración de `main.js` (lo escribe el coordinador)

`main.js` orquesta: `initCore` → `buildRegion` → `createHero` → `createInput` →
`createRig` → `createHUD` → `createQuiz` → `createScreens` → bucle `requestAnimationFrame`
con `dt` acotado a 0,05 s. Los módulos NO se autoarrancan ni tocan `document.body`.
