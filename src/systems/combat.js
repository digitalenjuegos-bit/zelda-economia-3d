import { glow } from './../engine/toon.js';
import { createParticles } from './../engine/particles.js';

export function createCombat({ hero, particles, audio, hud, onHeroDeath }) {
  let invuln = 0; // frames
  let heroHurtTimer = 0;
  const ENEMY_HIT_SOUND = audio ? audio.play('golpe') : null;
  const PLAYER_HIT_SOUND = audio ? audio.play('daño') : null;

  // --- hero attack ---
  function heroAttack() {
    if (hero.isAttacking) return;
    hero.isAttacking = true;
    // crear estela de espada + partículas
    particles.sword({ pos: hero.pos, dir: hero.facing });
    // sonido
    if (audio) audio.play('espada');
    // invulnerabilidad frames
    hero.isAttacking = false;
  }

  // --- damage hero ---
  function damageHero(n, dir) {
    if (invuln > 0) return; // invulnerable
    hero.hearts = Math.max(0, hero.hearts - n);
    invuln = 80; // 1.3 s a 60 fps
    heroHurtTimer = invuln;
    if (PLAYER_HIT_SOUND) PLAYER_HIT_SOUND();
    // sacudida de cámara
    if (camera && camera.shake) camera.shake(0.1, 0.3);
    if (hero.hearts <= 0) { onHeroDeath(); }
    showToast(`Daño recibido: -${n} corazón${hero.hearts===0?' (¡muerte!)':''}`, 'danger');
  }

  // --- hit enemy ---
  function hitEnemy(enemy, dmg, dir) {
    if (!enemy.alive) return;
    enemy.hp = Math.max(0, enemy.hp - dmg);
    if (ENEMY_HIT_SOUND) ENEMY_HIT_SOUND();
    // partículas de impacto
    particles.impact({ pos: enemy.pos, color:0xe74c3c });
    if (enemy.hp <= 0) {
      enemy.alive = false;
      enemy.group.visible = false;
      if (enemy.onDeath) enemy.onDeath();
      showToast('Enemigo derrotado', 'success');
    }
  }

  // --- update ---
  function update(dt, enemies, region) {
    // actualizar invulnerabilidad
    if (invuln > 0) { invuln -= dt * 60; if(invuln<0) invuln=0; }
    if (heroHurtTimer > 0) { heroHurtTimer -= dt * 60; if(heroHurtTimer<=0) hero.clearHurtVisual(); }

    // actualizar héroe
    if (hero.update) hero.update(dt, input, region);

    // ataques del héroe (tecla E o botón ataque)
    if (input && input.isAttacking && !hero.isAttacking) {
      heroAttack();
    }

    // IA y actualización de enemigos
    if (enemies && enemies.length) {
      enemies.forEach(en => {
        if (!en.alive) return;
        if (en.update) en.update(dt, hero, region);
        // detección de colisión héroe-enemigo
        const dist = Math.hypot(en.pos.x - hero.pos.x, en.pos.z - hero.pos.z);
        if (dist < en.radius + hero.radius) {
          if (en.isBoss) { damageHero(2, en.dir); } else { damageHero(1, en.dir); }
          // empujón
          hero.pos.x += en.dir.x * 0.5; hero.pos.z += en.dir.z * 0.5;
        }
        // ataque enemigo al héroe
        if (en.attackTimer && en.attackTimer <= 0) {
          damageHero(en.dmg, en.dir);
          en.attackTimer = en.attackCooldown;
        } else if (en.attackTimer) en.attackTimer -= dt;
      });
    }
  }

  // --- expose ---
  return { update, heroAttack, damageHero, hitEnemy, reset };
}