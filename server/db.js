// server/db.js — Aeterra: World Breaker Database
'use strict';
const Database = require('better-sqlite3');
const path = require('path');

// ─── helpers (exported) ──────────────────────────────────────────────────────
function logAudit(db, actorId, actorName, action, targetType, targetId, details) {
  db.prepare(
    'INSERT INTO audit_logs (actor_id, actor_name, action, target_type, target_id, details) VALUES (?,?,?,?,?,?)'
  ).run(
    actorId    ?? null,
    String(actorName || 'system'),
    String(action),
    targetType ?? null,
    targetId   ?? null,
    JSON.stringify(details || {})
  );
}

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'aeternitas.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    username             TEXT    UNIQUE NOT NULL COLLATE NOCASE,
    password_hash        TEXT    NOT NULL,
    created_at           TEXT    DEFAULT (datetime('now')),
    death_cooldown_until TEXT    DEFAULT NULL,
    is_banned            INTEGER DEFAULT 0,
    is_gm                INTEGER DEFAULT 0,
    bypass_death_cooldown INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS characters (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id  INTEGER NOT NULL REFERENCES accounts(id),
    name        TEXT NOT NULL,
    surname     TEXT NOT NULL,
    gender      TEXT NOT NULL,
    biome       TEXT NOT NULL,
    profession  TEXT NOT NULL,
    traits      TEXT NOT NULL,
    map_x       INTEGER DEFAULT 0,
    map_y       INTEGER DEFAULT 0,
    pos_x       REAL    DEFAULT 15,
    pos_y       REAL    DEFAULT 10,
    hp          REAL    DEFAULT 100,
    max_hp      REAL    DEFAULT 100,
    mp          REAL    DEFAULT 50,
    max_mp      REAL    DEFAULT 50,
    atk         INTEGER DEFAULT 10,
    def         INTEGER DEFAULT 5,
    spd         INTEGER DEFAULT 5,
    exp         INTEGER DEFAULT 0,
    level       INTEGER DEFAULT 1,
    gold        INTEGER DEFAULT 0,
    inventory   TEXT    DEFAULT '[]',
    skills      TEXT    DEFAULT '[]',
    skill_xp    TEXT    DEFAULT '{}',
    life_skills TEXT    DEFAULT '{}',
    status_effects TEXT DEFAULT '[]',
    is_alive    INTEGER DEFAULT 1,
    family_slot TEXT    DEFAULT '{}',
    died_at     TEXT,
    created_at  TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS world_maps (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    map_x            INTEGER NOT NULL,
    map_y            INTEGER NOT NULL,
    biome            TEXT    NOT NULL,
    seed             INTEGER NOT NULL,
    name             TEXT,
    discovered_by    INTEGER REFERENCES accounts(id),
    discovered_at    TEXT    DEFAULT (datetime('now')),
    map_state        TEXT    DEFAULT '{}',
    settlement_stage TEXT    DEFAULT 'none',
    UNIQUE(map_x, map_y)
  );

  CREATE TABLE IF NOT EXISTS chronicles (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type  TEXT NOT NULL,
    description TEXT NOT NULL,
    actors      TEXT DEFAULT '[]',
    map_x       INTEGER,
    map_y       INTEGER,
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS npc_dialogue_cache (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    npc_key    TEXT NOT NULL,
    prompt_key TEXT NOT NULL,
    response   TEXT NOT NULL,
    hits       INTEGER DEFAULT 1,
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(npc_key, prompt_key)
  );

  CREATE TABLE IF NOT EXISTS npc_relationships (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    npc_key            TEXT NOT NULL,
    char_id            INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    player_name        TEXT NOT NULL,
    affinity           INTEGER DEFAULT 0,
    familiarity        INTEGER DEFAULT 0,
    conversation_count INTEGER DEFAULT 0,
    affinity_label     TEXT DEFAULT 'estranho',
    last_topic         TEXT DEFAULT '',
    memory_summary     TEXT DEFAULT '',
    facts              TEXT DEFAULT '[]',
    created_at         TEXT DEFAULT (datetime('now')),
    last_interaction_at TEXT DEFAULT (datetime('now')),
    UNIQUE(npc_key, char_id)
  );

  CREATE TABLE IF NOT EXISTS npc_conversation_history (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    npc_key    TEXT NOT NULL,
    char_id    INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    speaker    TEXT NOT NULL,
    text       TEXT NOT NULL,
    intent     TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS npc_quests (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    npc_key           TEXT NOT NULL,
    char_id           INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    npc_name          TEXT NOT NULL,
    quest_id          TEXT NOT NULL,
    title             TEXT NOT NULL,
    summary           TEXT NOT NULL,
    objective_type    TEXT NOT NULL DEFAULT 'deliver',
    objective_item_id TEXT DEFAULT NULL,
    objective_item_name TEXT DEFAULT NULL,
    required_qty      INTEGER DEFAULT 0,
    state             TEXT NOT NULL DEFAULT 'accepted',
    reward_gold       INTEGER DEFAULT 0,
    reward_item_id    TEXT DEFAULT NULL,
    reward_item_name  TEXT DEFAULT NULL,
    reward_item_qty   INTEGER DEFAULT 0,
    reward_note       TEXT DEFAULT '',
    accepted_at       TEXT DEFAULT (datetime('now')),
    completed_at      TEXT DEFAULT NULL,
    UNIQUE(npc_key, char_id, quest_id)
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id    INTEGER,
    actor_name  TEXT    NOT NULL,
    action      TEXT    NOT NULL,
    target_type TEXT,
    target_id   INTEGER,
    details     TEXT    DEFAULT '{}',
    created_at  TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS game_config (
    key                  TEXT    PRIMARY KEY,
    value_json           TEXT    NOT NULL,
    value_type           TEXT    NOT NULL DEFAULT 'string',
    category             TEXT    NOT NULL DEFAULT 'game',
    description          TEXT    NOT NULL DEFAULT '',
    is_runtime_editable  INTEGER NOT NULL DEFAULT 1,
    requires_restart     INTEGER NOT NULL DEFAULT 0,
    updated_by           TEXT    DEFAULT NULL,
    created_at           TEXT    DEFAULT (datetime('now')),
    updated_at           TEXT    DEFAULT (datetime('now'))
  );
`);

// Migrations: add new columns idempotently
try { db.prepare('ALTER TABLE accounts ADD COLUMN bypass_death_cooldown INTEGER DEFAULT 0').run(); } catch {}
try { db.prepare("ALTER TABLE characters ADD COLUMN equipment TEXT    DEFAULT '{}'").run(); } catch {}
try { db.prepare('ALTER TABLE characters ADD COLUMN kills    INTEGER DEFAULT 0').run();  } catch {}
try { db.prepare("ALTER TABLE characters ADD COLUMN skills TEXT DEFAULT '[]'").run(); } catch {}
try { db.prepare("ALTER TABLE characters ADD COLUMN skill_xp TEXT DEFAULT '{}' ").run(); } catch {}
try { db.prepare("ALTER TABLE characters ADD COLUMN life_skills TEXT DEFAULT '{}' ").run(); } catch {}
try { db.prepare("ALTER TABLE characters ADD COLUMN status_effects TEXT DEFAULT '[]'").run(); } catch {}
try { db.prepare("ALTER TABLE world_maps ADD COLUMN map_state TEXT DEFAULT '{}'").run(); } catch {}
try { db.prepare("ALTER TABLE world_maps ADD COLUMN rank TEXT DEFAULT 'F'").run(); } catch {}
try { db.prepare("ALTER TABLE world_maps ADD COLUMN lore TEXT DEFAULT NULL").run(); } catch {}
try { db.prepare("ALTER TABLE world_maps ADD COLUMN lore_generated_at TEXT DEFAULT NULL").run(); } catch {}
try { db.prepare("ALTER TABLE world_maps ADD COLUMN visitors TEXT DEFAULT '[]'").run(); } catch {}
try { db.prepare("ALTER TABLE world_maps ADD COLUMN achievements TEXT DEFAULT '[]'").run(); } catch {}

module.exports = { db, logAudit };
