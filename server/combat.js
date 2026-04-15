// server/combat.js — Aeterra: World Breaker Combat System
'use strict';

const { getConfig } = require('./config');

/** Base damage formula: attacker ATK vs target DEF with variance */
function calcDamage(atk, def, isCrit, critMultiplier = getConfig('combat.playerCritMultiplier')) {
  const base    = Math.max(1, atk - Math.floor(def / 2));
  const variance = Math.floor(Math.random() * Math.max(1, Math.floor(atk / 4)));
  const dmg     = base + variance;
  return isCrit ? Math.floor(dmg * critMultiplier) : dmg;
}

function rollCrit() {
  return Math.random() < getConfig('combat.playerCritChance');
}

/** XP needed to reach the NEXT level from current level */
function xpForLevel(level) {
  return Math.floor(getConfig('combat.xpBase') * Math.pow(getConfig('combat.xpExponent'), level - 1));
}

/**
 * Apply earned XP. Returns true if the entity levelled up.
 * Mutates the entity object in place.
 */
function applyExp(entity, xp) {
  entity.exp += xp;
  const needed = xpForLevel(entity.level);
  if (entity.exp < needed) return false;

  entity.exp  -= needed;
  entity.level += 1;

  const gains = getConfig('combat.levelGains');
  const g = gains[entity.biome] || gains.plains;
  entity.maxHp  += g.hp;
  entity.hp      = Math.min(entity.hp + g.hp, entity.maxHp);
  entity.atk    += g.atk;
  entity.def    += g.def;
  entity.spd    += g.spd;
  return true;
}

module.exports = { calcDamage, rollCrit, xpForLevel, applyExp };
