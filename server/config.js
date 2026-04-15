// server/config.js — Aeterra: World Breaker Game Config Manager
'use strict';

// ─── helpers ─────────────────────────────────────────────────────────────────
function _safeJson(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

// ─── schema ──────────────────────────────────────────────────────────────────
// Each entry: { category, type, default, [min, max], [validate(v)→errStr|null],
//              requiresRestart, isRuntimeEditable, description }
const SCHEMA = {
  // ── game ──────────────────────────────────────────────────────────────────
  'game.tickMs': {
    category: 'game', type: 'integer', default: 50,
    min: 10, max: 500,
    requiresRestart: true, isRuntimeEditable: true,
    description: 'Intervalo do tick do servidor (ms). Requer reinicializacao.',
  },
  'game.moveCooldownMs': {
    category: 'game', type: 'integer', default: 160,
    min: 50, max: 2000,
    requiresRestart: false, isRuntimeEditable: true,
    description: 'Cooldown base de movimento do jogador (ms).',
  },
  'game.attackCooldownMs': {
    category: 'game', type: 'integer', default: 800,
    min: 100, max: 5000,
    requiresRestart: false, isRuntimeEditable: true,
    description: 'Cooldown base de ataque do jogador (ms).',
  },
  'game.monsterMoveIntervalMs': {
    category: 'game', type: 'integer', default: 600,
    min: 100, max: 5000,
    requiresRestart: false, isRuntimeEditable: true,
    description: 'Intervalo de movimento de monstros (ms).',
  },
  'game.monsterAttackIntervalMs': {
    category: 'game', type: 'integer', default: 1000,
    min: 200, max: 10000,
    requiresRestart: false, isRuntimeEditable: true,
    description: 'Intervalo de ataque de monstros (ms).',
  },
  'game.npcMoveIntervalMs': {
    category: 'game', type: 'integer', default: 2400,
    min: 500, max: 30000,
    requiresRestart: false, isRuntimeEditable: true,
    description: 'Intervalo de movimento de NPCs (ms).',
  },
  'game.aggroRange': {
    category: 'game', type: 'integer', default: 8,
    min: 1, max: 30,
    requiresRestart: false, isRuntimeEditable: true,
    description: 'Distancia de agro de monstros (tiles).',
  },
  'game.chaseRange': {
    category: 'game', type: 'integer', default: 12,
    min: 2, max: 50,
    requiresRestart: false, isRuntimeEditable: true,
    description: 'Distancia maxima de perseguicao de monstros (tiles).',
  },
  'game.inventoryLimit': {
    category: 'game', type: 'integer', default: 24,
    min: 4, max: 128,
    requiresRestart: false, isRuntimeEditable: true,
    description: 'Limite de slots do inventario do jogador.',
  },
  'game.minGrowthMs': {
    category: 'game', type: 'integer', default: 35000,
    min: 1000, max: 3600000,
    requiresRestart: false, isRuntimeEditable: true,
    description: 'Tempo minimo de crescimento de cultivo (ms).',
  },
  'game.gameMinutesPerSecond': {
    category: 'game', type: 'integer', default: 2,
    min: 1, max: 60,
    requiresRestart: false, isRuntimeEditable: true,
    description: 'Minutos do jogo que passam por segundo real.',
  },
  'game.activityCooldowns': {
    category: 'game', type: 'json',
    default: { mining: 28000, fishing: 22000 },
    requiresRestart: false, isRuntimeEditable: true,
    description: 'Cooldowns de atividades de coleta (ms). Chaves obrigatorias: mining, fishing.',
    validate(value) {
      if (typeof value !== 'object' || value === null || Array.isArray(value))
        return 'Deve ser um objeto JSON.';
      if (!Number.isInteger(value.mining) || value.mining < 1000)
        return 'mining deve ser inteiro >= 1000.';
      if (!Number.isInteger(value.fishing) || value.fishing < 1000)
        return 'fishing deve ser inteiro >= 1000.';
      return null;
    },
  },

  // ── combat ────────────────────────────────────────────────────────────────
  'combat.playerCritChance': {
    category: 'combat', type: 'float', default: 0.1,
    min: 0, max: 1,
    requiresRestart: false, isRuntimeEditable: true,
    description: 'Chance de critico do jogador (0.0 a 1.0).',
  },
  'combat.playerCritMultiplier': {
    category: 'combat', type: 'float', default: 1.75,
    min: 1.0, max: 5.0,
    requiresRestart: false, isRuntimeEditable: true,
    description: 'Multiplicador de dano em critico do jogador.',
  },
  'combat.monsterCritMultiplier': {
    category: 'combat', type: 'float', default: 1.75,
    min: 1.0, max: 5.0,
    requiresRestart: false, isRuntimeEditable: true,
    description: 'Multiplicador de dano em critico de monstros.',
  },
  'combat.monsterCritChance': {
    category: 'combat', type: 'float', default: 0.05,
    min: 0, max: 1,
    requiresRestart: false, isRuntimeEditable: true,
    description: 'Chance de critico de monstros (0.0 a 1.0).',
  },
  'combat.monsterStatusChance': {
    category: 'combat', type: 'float', default: 0.28,
    min: 0, max: 1,
    requiresRestart: false, isRuntimeEditable: true,
    description: 'Chance de monstro infligir status ao atacar (0.0 a 1.0).',
  },
  'combat.focusedProcChance': {
    category: 'combat', type: 'float', default: 0.18,
    min: 0, max: 1,
    requiresRestart: false, isRuntimeEditable: true,
    description: 'Chance de ganhar status "focused" ao matar monstro (0.0 a 1.0).',
  },
  'combat.xpBase': {
    category: 'combat', type: 'integer', default: 100,
    min: 10, max: 10000,
    requiresRestart: false, isRuntimeEditable: true,
    description: 'XP base da formula de nivel (xpBase * xpExponent^(level-1)).',
  },
  'combat.xpExponent': {
    category: 'combat', type: 'float', default: 1.5,
    min: 1.0, max: 3.0,
    requiresRestart: false, isRuntimeEditable: true,
    description: 'Expoente da curva de XP por nivel.',
  },
  'combat.levelGains': {
    category: 'combat', type: 'json',
    default: {
      forest:   { hp: 8,  atk: 2, def: 1, spd: 1 },
      desert:   { hp: 8,  atk: 2, def: 1, spd: 2 },
      mountain: { hp: 12, atk: 2, def: 2, spd: 0 },
      city:     { hp: 6,  atk: 1, def: 2, spd: 1 },
      water:    { hp: 7,  atk: 2, def: 1, spd: 2 },
      plains:   { hp: 10, atk: 2, def: 1, spd: 1 },
      anomaly:  { hp: 9,  atk: 3, def: 1, spd: 1 },
    },
    requiresRestart: false, isRuntimeEditable: true,
    description: 'Ganhos de atributos por nivel, por bioma. Chaves: forest, desert, mountain, city, water, plains, anomaly.',
    validate(value) {
      if (typeof value !== 'object' || value === null || Array.isArray(value))
        return 'Deve ser um objeto JSON.';
      const BIOMES = ['forest', 'desert', 'mountain', 'city', 'water', 'plains', 'anomaly'];
      const STATS  = ['hp', 'atk', 'def', 'spd'];
      for (const biome of BIOMES) {
        if (typeof value[biome] !== 'object' || value[biome] === null)
          return `Bioma "${biome}" ausente ou invalido.`;
        for (const stat of STATS) {
          if (!Number.isInteger(value[biome][stat]) || value[biome][stat] < 0)
            return `${biome}.${stat} deve ser inteiro nao negativo.`;
        }
      }
      return null;
    },
  },
};

// ─── runtime state ───────────────────────────────────────────────────────────
let _db   = null;
const _cache = new Map(); // key → parsed JS value

// ─── validation ──────────────────────────────────────────────────────────────
function _validateValue(key, value, schema) {
  if (schema.type === 'integer') {
    if (typeof value !== 'number' || !Number.isInteger(value))
      return 'Deve ser um numero inteiro.';
    if (schema.min !== undefined && value < schema.min)
      return `Valor minimo: ${schema.min}.`;
    if (schema.max !== undefined && value > schema.max)
      return `Valor maximo: ${schema.max}.`;
    return null;
  }
  if (schema.type === 'float') {
    if (typeof value !== 'number' || !isFinite(value))
      return 'Deve ser um numero.';
    if (schema.min !== undefined && value < schema.min)
      return `Valor minimo: ${schema.min}.`;
    if (schema.max !== undefined && value > schema.max)
      return `Valor maximo: ${schema.max}.`;
    return null;
  }
  if (schema.type === 'json') {
    if (typeof schema.validate === 'function') return schema.validate(value);
    return null;
  }
  return `Tipo de schema desconhecido: ${schema.type}.`;
}

// ─── public API ──────────────────────────────────────────────────────────────

/**
 * Returns the current parsed value for a config key.
 * Falls back to schema default if not yet initialized.
 */
function getConfig(key) {
  if (_cache.has(key)) return _cache.get(key);
  const schema = SCHEMA[key];
  if (!schema) throw new Error(`[config] Chave desconhecida: ${key}`);
  return schema.default;
}

/**
 * Returns full metadata + current value for a key, or null if key unknown.
 */
function getConfigMeta(key) {
  const schema = SCHEMA[key];
  if (!schema) return null;

  const row = _db
    ? _db.prepare('SELECT updated_by, updated_at, created_at FROM game_config WHERE key=?').get(key)
    : null;

  const entry = {
    key,
    value:             getConfig(key),
    default:           schema.default,
    type:              schema.type,
    category:          schema.category,
    description:       schema.description,
    isRuntimeEditable: schema.isRuntimeEditable,
    requiresRestart:   schema.requiresRestart,
    updatedBy:         row?.updated_by  ?? null,
    updatedAt:         row?.updated_at  ?? null,
    createdAt:         row?.created_at  ?? null,
  };
  if (schema.min !== undefined) entry.min = schema.min;
  if (schema.max !== undefined) entry.max = schema.max;
  return entry;
}

/**
 * Returns all config entries with metadata + current value.
 */
function listConfigEntries() {
  return Object.keys(SCHEMA).map(getConfigMeta);
}

/**
 * Returns the last `limit` audit log entries (default 50).
 */
function listAuditEntries(limit) {
  if (!_db) return [];
  const n = (Number.isInteger(limit) && limit > 0) ? Math.min(limit, 500) : 50;
  const rows = _db.prepare(
    `SELECT id, actor_id, actor_name, action, target_type, target_id, details, created_at
       FROM audit_logs
      WHERE action=?
      ORDER BY id DESC
      LIMIT ?`
  ).all('CONFIG_UPDATE', n);
  return rows.map(row => ({
    old_value:  _safeJson(row.details, {}).oldValue,
    new_value:  _safeJson(row.details, {}).newValue,
    key:        _safeJson(row.details, {}).key || null,
    id:         row.id,
    actorId:    row.actor_id,
    actorName:  row.actor_name,
    action:     row.action,
    targetType: row.target_type,
    targetId:   row.target_id,
    details:    _safeJson(row.details, {}),
    createdAt:  row.created_at,
  }));
}

/**
 * Validates and applies a batch of config changes atomically.
 * @param {Array<{key:string, value:*}>} changes
 * @param {{id:number, username:string}} actor
 * @returns {{ ok: boolean, updated?: Array, errors?: Array }}
 */
function updateConfigs(changes, actor) {
  if (!_db) throw new Error('[config] initializeGameConfig() nao foi chamado.');

  // Phase 1: validate all
  const errors  = [];
  const pending = [];

  for (const { key, value } of changes) {
    const schema = SCHEMA[key];
    if (!schema) {
      errors.push({ key, error: 'Chave de configuracao desconhecida.' });
      continue;
    }
    if (!schema.isRuntimeEditable) {
      errors.push({ key, error: 'Esta configuracao nao e editavel em runtime.' });
      continue;
    }
    const err = _validateValue(key, value, schema);
    if (err) {
      errors.push({ key, error: err });
      continue;
    }
    pending.push({ key, value, schema });
  }

  if (errors.length > 0) return { ok: false, errors };

  // Phase 2: persist + update cache (all-or-nothing)
  const { logAudit } = require('./db');

  const upsert = _db.prepare(`
    INSERT INTO game_config (key, value_json, value_type, category, description, is_runtime_editable, requires_restart, updated_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(key) DO UPDATE SET
      value_json  = excluded.value_json,
      updated_by  = excluded.updated_by,
      updated_at  = datetime('now')
  `);

  _db.transaction(() => {
    for (const { key, value, schema } of pending) {
      const oldValue = getConfig(key);
      upsert.run(
        key,
        JSON.stringify(value),
        schema.type,
        schema.category,
        schema.description,
        schema.isRuntimeEditable ? 1 : 0,
        schema.requiresRestart   ? 1 : 0,
        actor.username
      );
      _cache.set(key, value);
      logAudit(_db, actor.id, actor.username, 'CONFIG_UPDATE', 'game_config', null, {
        key,
        oldValue,
        newValue: value,
        requiresRestart: !!schema.requiresRestart,
      });
    }
  })();

  return { ok: true, updated: pending.map(({ key }) => getConfigMeta(key)) };
}

/**
 * Seeds DB with defaults for all schema keys and loads cache.
 * Must be called once before creating GameWorld.
 */
function initializeGameConfig(db) {
  _db = db;

  const seed = db.prepare(`
    INSERT OR IGNORE INTO game_config
      (key, value_json, value_type, category, description, is_runtime_editable, requires_restart, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `);

  db.transaction(() => {
    for (const [key, schema] of Object.entries(SCHEMA)) {
      seed.run(
        key,
        JSON.stringify(schema.default),
        schema.type,
        schema.category,
        schema.description,
        schema.isRuntimeEditable ? 1 : 0,
        schema.requiresRestart   ? 1 : 0
      );
    }
  })();

  // Load DB values into cache (handles manual DB edits / migrations)
  const rows = db.prepare('SELECT key, value_json FROM game_config').all();
  for (const row of rows) {
    const schema = SCHEMA[row.key];
    if (!schema) continue; // unknown key — skip silently
    const parsed = _safeJson(row.value_json, schema.default);
    _cache.set(row.key, parsed);
  }

  // Ensure every schema key is represented in cache (extra safety)
  for (const [key, schema] of Object.entries(SCHEMA)) {
    if (!_cache.has(key)) _cache.set(key, schema.default);
  }

  console.log(`[config] ${_cache.size} entradas de configuracao carregadas.`);
}

module.exports = {
  getConfig,
  getConfigMeta,
  listConfigEntries,
  listAuditEntries,
  updateConfigs,
  initializeGameConfig,
  SCHEMA,
};
