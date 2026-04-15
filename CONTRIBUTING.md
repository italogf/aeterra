# Contributing to AETERNITAS

AETERNITAS is a hardcore procedural MMORPG built in pure Node.js — no frameworks, no build step, no transpilation. A single `node server.js` starts a fully playable game server. This document covers everything a new contributor needs to understand, run, and extend the project.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Prerequisites & Installation](#2-prerequisites--installation)
3. [Architecture Overview](#3-architecture-overview)
4. [Module Reference](#4-module-reference)
5. [REST API Reference](#5-rest-api-reference)
6. [WebSocket Protocol](#6-websocket-protocol)
7. [Database Schema Reference](#7-database-schema-reference)
8. [Game Systems Reference](#8-game-systems-reference)
9. [World Generation Guide](#9-world-generation-guide)
10. [NPC AI System](#10-npc-ai-system)
11. [Code Standards](#11-code-standards)
12. [How to Contribute](#12-how-to-contribute)
13. [Testing](#13-testing)
14. [Environment Variables](#14-environment-variables)
15. [Roadmap](#15-roadmap)

---

## 1. Project Overview

### Vision

AETERNITAS is a persistent, server-authoritative MMORPG where death has permanent consequences and character legacies span generations. The world is procedurally generated from a seeded RNG — every map tile, monster, NPC, and loot drop is deterministic given its seed. Player characters are mortal: when a character dies, the account enters a cooldown before a new character can be created, forcing reflection and creating meaningful stakes.

### Design Philosophy

| Principle | What it means in practice |
|-----------|--------------------------|
| **Hardcore permanence** | Death is real. No respawn, no retry — a cooldown enforces the consequence. |
| **Server authority** | All game logic lives on the server. The client is a thin renderer. |
| **Determinism** | World generation uses seeded RNG (`mkRng`). Given the same seed, the same world always appears. Never use `Math.random()` for world gen. |
| **Simplicity over abstraction** | No ORM, no framework, no TypeScript. Prefer readable vanilla JS. |
| **Narrative over mechanics** | Biome origin, profession, traits, and NPC relationships create story. Combat is a means to that end. |

### What Makes This Unique

- **Intergerational narrative** — a dead character's legacy affects the next.
- **Procedural world at scale** — 31,623² map cells, each generated on demand from its `(x, y)` seed.
- **LLM-backed NPCs** — NPCs hold memory of past conversations, track affinity, and respond contextually via OpenAI / OpenRouter with a prompt cache to reduce API costs.
- **Zero dependencies on frontend frameworks** — the game client is vanilla HTML/CSS/JS on a `<canvas>`.

---

## 2. Prerequisites & Installation

### Requirements

- **Node.js 18+** (uses `--watch` flag for dev, native `fetch` in smoke tests)
- **npm 8+**
- A Unix or Windows shell

### Step-by-Step Setup

```bash
# 1. Clone the repository
git clone <repo-url>
cd aeternitas

# 2. Install dependencies
npm install

# 3. Create your local environment file
#    (copy the template below, then edit values)
```

Create `.env` in the project root:

```dotenv
PORT=3011
JWT_SECRET=dev-secret-change-in-production
NODE_ENV=development
ALLOW_DEV_RESPAWN=1

# Optional — only needed for NPC LLM dialogue
OPENAI_API_KEY=sk-...
# OR use OpenRouter instead:
# OPENROUTER_API_KEY=sk-or-...
# OPENROUTER_MODEL=gpt-4o-mini
```

```bash
# 4. Start the development server (auto-restarts on file changes)
npm run dev

# 5. Open the game in your browser
#    http://localhost:3011
```

The SQLite database file (`aeternitas.db`) is created automatically on first run. Schema migrations run on every startup — no separate migration command is needed.

### Verifying the Installation

```bash
# In a second terminal, with the dev server running:
npm run smoke:world
```

A passing smoke test suite confirms the server, REST API, WebSocket, and core game systems are all functional.

---

## 3. Architecture Overview

### ASCII Diagram

```
Browser (public/game.html)
  │  Vanilla JS + Canvas
  │
  │  HTTP REST  ──────────────────────────────────────────┐
  │  WebSocket (ws://)  ────────────────────────────────┐ │
  │                                                      │ │
  ▼                                                      ▼ ▼
server.js  (Express + ws.Server)
  │  Entry point: mounts REST endpoints,
  │  upgrades HTTP → WS, holds GameWorld instance
  │
  ├── server/db.js          SQLite schema, migrations, logAudit()
  ├── server/config.js      game_config table, getConfig(), runtime knobs
  ├── server/worldGen.js    Procedural map generation, seeded RNG, tile defs
  ├── server/gameSystems.js Item/skill/status defs, inventory helpers, NPC gen
  ├── server/combat.js      calcDamage(), rollCrit(), xpForLevel(), applyExp()
  ├── server/gameWorld.js   GameWorld class — tick loop, rooms, movement, AI
  ├── server/npcAI.js       NpcDialogueService — intent, affinity, LLM, cache
  └── server/mapLore.js     Procedural map names and lore text generation

public/
  ├── game.html             Game client — canvas renderer, WS handler, HUD
  └── login.html            Account register / login UI

scripts/
  └── smoke-world.js        Integration smoke tests (REST + WebSocket)
```

### Data Flow: Player Action

```
Client keystroke
  → WebSocket message (e.g. { type: 'move', dir: 'n' })
  → server.js ws.on('message') handler
  → GameWorld.handleMessage(ws, msg)
  → game logic (move / combat / interact)
  → GameWorld broadcasts state to affected clients
  → Client renders updated state
```

### Data Flow: Map Load

```
Player crosses map border
  → GameWorld.moveToMap(player, newX, newY)
  → worldGen.generateMap(mapX, mapY, biome, seed)   ← deterministic
  → map_state loaded/saved to world_maps table
  → 'map_change' message sent to client with tiles + entities
```

### Tick Loop

`GameWorld` runs a `setInterval` at **50 ms** (20 ticks/second). Each tick:

1. Update game time (`getGameTime()`)
2. Tick status effects on all players
3. Tick monster AI (pathfinding, attacks)
4. Broadcast `time` message every 30 ticks (1.5 s)
5. Persist dirty player state to SQLite

---

## 4. Module Reference

### `server.js` — Entry Point

**Role:** Bootstraps Express, creates the HTTP server, attaches the WebSocket server, registers all REST endpoints, and instantiates `GameWorld`.

**Key responsibilities:**
- Validates `JWT_SECRET` (fatal error in production if missing)
- Calls `initializeGameConfig(db)` before creating the world
- Exposes `verifyAuth(req, res)` and `requireGm(req, res)` helper functions used by all authenticated endpoints
- Routes WebSocket `upgrade` events to `GameWorld`

**Exports:** Nothing — it is the application entry point.

---

### `server/db.js` — Database

**Role:** Opens the SQLite connection, runs all `CREATE TABLE IF NOT EXISTS` statements, and exports the `db` handle plus `logAudit()`.

**Key exports:**

| Export | Type | Description |
|--------|------|-------------|
| `db` | `Database` | better-sqlite3 connection, WAL mode, FK ON |
| `logAudit(db, actorId, actorName, action, targetType, targetId, details)` | function | Inserts a row into `audit_logs` |

**Migration pattern:** Additive migrations live *after* the main `db.exec()` block as individual `try/catch` ALTER TABLE statements. See [§12 — Adding a DB Column](#adding-a-database-table-or-column-migration).

---

### `server/config.js` — Runtime Configuration

**Role:** Manages the `game_config` table. Provides typed runtime-editable knobs (crit chance, XP exponent, regen rates, etc.) without requiring a server restart.

**Key exports:**

| Export | Description |
|--------|-------------|
| `initializeGameConfig(db)` | Seeds default config rows on first run |
| `getConfig(key)` | Returns parsed value for a config key |
| `listConfigEntries(db)` | Returns all config rows (GM admin UI) |
| `listAuditEntries(db, limit)` | Returns recent audit log rows |
| `updateConfigs(db, changes, actorId, actorName)` | Bulk-updates config values, writes audit log |

---

### `server/worldGen.js` — Procedural World Generator

**Role:** Generates the 50×35 tile map for any `(mapX, mapY)` coordinate from its deterministic seed. Also exports tile constants, monster templates, and spawn-finding utilities.

**Key exports:**

| Export | Description |
|--------|-------------|
| `generateMap(mapX, mapY, biome, seed)` | Returns `{ tiles[], npcs[], monsters[] }` |
| `findSafeSpawn(tiles, width, height, options)` | Finds a traversable spawn point with reachability check |
| `isSafeSpawnTile(tiles, w, h, x, y, options)` | Single-tile safety check |
| `calcMapRank(mapX, mapY)` | Returns rank string (`F` … `SSS`) based on distance from origin |
| `generateMapName(biome, seed)` | Procedural place name |
| `mapHasMonument(tiles)` | Checks for MONUMENT tile |
| `T` | Tile ID constants object |
| `SOLID` | `Set` of tile IDs that block movement |
| `MONSTERS` | Monster templates keyed by biome |
| `MAP_W`, `MAP_H` | 50, 35 |
| `mkRng(seed)` | Mulberry32 seeded PRNG — **always use this for procedural content** |

---

### `server/gameSystems.js` — Items, Skills, Status Effects, Inventory

**Role:** The authoritative registry of all game content definitions. Also contains all stateless helper functions for inventory manipulation, stat calculation, and NPC generation.

**Key exports (definitions):**

| Export | Description |
|--------|-------------|
| `ITEM_DEFS` | Frozen map of all item definitions |
| `ITEM_VALUES` | Gold values for each item (used by NPC merchants) |
| `SKILL_DEFS` | Array of skill definitions with thresholds and passive bonuses |
| `STATUS_DEFS` | Frozen map of status effect definitions |
| `ACTIVITY_DEFS` | Life-skill activity definitions (mining, farming, fishing) |
| `CROP_DEFS` | Crop growth definitions |

**Key exports (functions):**

| Export | Description |
|--------|-------------|
| `safeParseJson(value, fallback)` | JSON.parse wrapper — always returns fallback on error |
| `createItem(id, qty)` | Creates an item instance from ITEM_DEFS |
| `storeItem(inventory, item)` | Adds item to inventory (stacks stackables) |
| `normalizeInventory(inv)` | Prunes null/invalid entries |
| `consumeInventoryItem(inv, id, qty)` | Removes qty of an item; returns success boolean |
| `countInventoryItem(inv, id)` | Returns total qty of an item id in inventory |
| `refreshDerivedStats(char)` | Recalculates HP/ATK/DEF/SPD from equipment + skills |
| `getStarterLoadout(biome, profession)` | Returns starter equipment list for a new character |
| `generateNpcs(biome, seed, mapX, mapY)` | Generates NPC list for a map tile |
| `grantDisciplineXp(char, discipline, amount)` | Awards XP to a discipline, checks for skill unlock |
| `serializePlayerState(player)` | Produces the `player_state` WS payload |
| `applyStatus(statusList, effectId)` | Adds a status effect to a character's effect list |
| `tickStatusEffects(player, nowMs)` | Processes per-tick damage from active status effects |

---

### `server/combat.js` — Combat Formulas

**Role:** Pure functions for all combat math. No state, no DB access. Reads runtime config via `getConfig()`.

**Key exports:**

| Export | Signature | Description |
|--------|-----------|-------------|
| `calcDamage` | `(atk, def, isCrit, critMultiplier?)` | Returns final damage integer |
| `rollCrit` | `()` | Returns boolean — true if crit (configurable chance) |
| `xpForLevel` | `(level)` | XP threshold to advance from `level` |
| `applyExp` | `(entity, xp)` | Mutates entity; returns true if level-up occurred |

---

### `server/npcAI.js` — NPC Dialogue System

**Role:** `NpcDialogueService` class. Manages NPC memory, affinity, intent detection, and LLM dialogue generation with caching.

**Key exports:**

| Export | Description |
|--------|-------------|
| `NpcDialogueService` | Class — instantiated once in `GameWorld`, holds DB reference |
| `detectIntent(prompt)` | Returns intent string from player message |
| `affinityLabel(n)` | Maps numeric affinity to relationship label |
| `normalizeText(text)` | NFD normalization + lowercase + strip diacritics |

---

### `server/mapLore.js` — Map Lore Generator

**Role:** Generates procedural lore text and canonical names for newly discovered map tiles. Optionally calls the LLM for richer descriptions.

---

### `public/game.html` — Game Client

**Role:** Single-file game client. Manages the WebSocket connection, renders the tile map and entities on a `<canvas>`, and drives the HUD.

**Structure:**
- `GameClient` class handles WS messages and input events
- `Renderer` handles canvas drawing (tiles, entities, UI overlay)
- No build step — plain `<script>` tags inside the HTML file

---

### `public/login.html` — Login / Register UI

**Role:** Simple form-based login and account creation. POSTs to `/api/login` and `/api/register`, stores the returned JWT in `localStorage`.

---

## 5. REST API Reference

All authenticated endpoints require `Authorization: Bearer <jwt>` header.  
GM endpoints additionally require `account.is_gm = 1`.

---

### `POST /api/register`

Creates a new account.

**Auth:** None

**Request body:**
```json
{ "username": "string", "password": "string" }
```

**Response (200):**
```json
{ "ok": true }
```

**Errors:** `400` (missing fields / username taken), `500`

---

### `POST /api/login`

Authenticates and returns a signed JWT.

**Auth:** None

**Request body:**
```json
{ "username": "string", "password": "string" }
```

**Response (200):**
```json
{ "token": "<jwt>", "username": "string", "isGm": false }
```

**Errors:** `400` (missing fields), `401` (wrong credentials), `403` (banned), `500`

---

### `GET /api/account/session`

Returns current session state including death cooldown.

**Auth:** Bearer

**Response (200):**
```json
{
  "username": "string",
  "isGm": false,
  "hasCharacter": true,
  "deathCooldownUntil": null,
  "bypassDeathCooldown": false
}
```

---

### `GET /api/character`

Returns the account's active (alive) character summary.

**Auth:** Bearer

**Response (200):**
```json
{
  "id": 1,
  "name": "Aldric Fern",
  "biome": "forest",
  "profession": "Caçador",
  "level": 3,
  "hp": 85,
  "max_hp": 107,
  "is_alive": 1
}
```

**Errors:** `404` (no active character)

---

### `POST /api/character/create`

Creates a new character for the authenticated account.

**Auth:** Bearer

**Request body:**
```json
{
  "name": "string",
  "surname": "string",
  "gender": "M|F",
  "biome": "forest|desert|mountain|city|water|plains|anomaly",
  "profession": "string",
  "traits": ["string"]
}
```

**Response (200):**
```json
{ "ok": true, "characterId": 42 }
```

**Errors:** `400` (validation / already has alive character / death cooldown active), `500`

---

### `GET /api/character/sheet`

Returns the full character sheet including inventory, equipment, skills, and status effects.

**Auth:** Bearer

**Response (200):** Full character object with all JSON fields parsed.

---

### `GET /api/worldmap`

Returns all world map tiles discovered by this account's characters.

**Auth:** Bearer

**Response (200):**
```json
[
  { "map_x": 0, "map_y": 0, "biome": "plains", "name": "Vale Central", "rank": "F" }
]
```

---

### `POST /api/admin/gm-role`

Grants or revokes GM status on a target account.

**Auth:** Bearer + GM

**Request body:**
```json
{ "targetUsername": "string", "isGm": true }
```

**Response (200):**
```json
{ "ok": true, "updatedBy": "gmUsername" }
```

**Errors:** `400`, `401`, `403`, `404`

---

### `POST /api/admin/death-cooldown-exemption`

Sets or clears the `bypass_death_cooldown` flag on a target account.

**Auth:** Bearer + GM

**Request body:**
```json
{ "targetUsername": "string", "exempt": true }
```

**Response (200):**
```json
{ "ok": true }
```

---

### `GET /api/admin/config`

Lists all runtime-editable game config entries.

**Auth:** Bearer + GM

**Response (200):**
```json
[
  {
    "key": "combat.playerCritChance",
    "value_json": "0.15",
    "value_type": "number",
    "category": "combat",
    "description": "...",
    "is_runtime_editable": 1
  }
]
```

---

### `GET /api/admin/config/audit`

Returns the 100 most recent audit log entries.

**Auth:** Bearer + GM

---

### `POST /api/admin/config`

Updates one or more config values.

**Auth:** Bearer + GM

**Request body:**
```json
{ "changes": { "combat.playerCritChance": 0.20 } }
```

**Response (200):**
```json
{ "ok": true, "updated": ["combat.playerCritChance"] }
```

---

### `POST /api/dev/reset-cooldown`

Clears the death cooldown for a username. Only available when `ALLOW_DEV_RESPAWN=1` and `NODE_ENV !== 'production'`.

**Auth:** None

**Request body:**
```json
{ "username": "string" }
```

---

### `POST /api/dev/unstuck-character`

Teleports the active character to the safe spawn point on their current map. Useful during development to escape geometry bugs.

**Auth:** Bearer

**Response (200):**
```json
{ "ok": true }
```

---

## 6. WebSocket Protocol

The WebSocket connection is established at `ws://<host>/`. All messages are JSON-encoded.

### Connection Handshake

```
client → { "type": "auth", "token": "<jwt>" }
server → { "type": "auth_ok", "character": { ... } }
server → { "type": "init", "map": { tiles, npcs, monsters }, "players": [...], "gameTime": { ... } }
```

If authentication fails:
```
server → { "type": "error", "message": "Autenticação inválida" }
```
Connection is closed immediately after.

---

### Client → Server Messages

| `type` | Additional fields | Description |
|--------|-------------------|-------------|
| `auth` | `token` | Authenticate with JWT — must be first message |
| `move` | `dir` (`n`\|`s`\|`e`\|`w`) | Move one tile in direction |
| `attack` | `targetId` | Attack entity by runtime ID |
| `interact` | `actionId` | Interact with tile/entity at current position |
| `equip` | `index` | Equip item at inventory index |
| `unequip` | `slot` | Unequip from equipment slot |
| `chat` | `text` | Send chat message to current map |
| `npc_chat` | `npcId`, `text` | Send dialogue line to NPC |
| `npc_service` | `npcId`, `action` | Use NPC service (e.g. `buy`, `sell`, `quest_accept`) |

---

### Server → Client Messages

| `type` | Payload fields | Description |
|--------|---------------|-------------|
| `auth_ok` | `character` | Successful auth |
| `init` | `map`, `players`, `entities`, `gameTime` | Full map state on join/map change |
| `map_change` | `map`, `mapX`, `mapY`, `players`, `entities`, `gameTime` | Player crossed map boundary |
| `entity_move` | `id`, `x`, `y` | Entity moved to new position |
| `entity_spawn` | `entity` | New entity appeared on map |
| `entity_death` | `id`, `type` | Entity was killed |
| `combat` | `attackerId`, `targetId`, `damage`, `crit`, `targetHp` | Combat round result |
| `player_join` | `player` | Another player entered the map |
| `player_leave` | `id` | Player left the map |
| `chat` | `speaker`, `text`, `isSystem` | Chat message |
| `player_state` | Full stat block | Player's own state update |
| `level_up` | `level`, `gains` | Player levelled up |
| `loot` | `items[]`, `gold` | Items/gold received |
| `time` | `hour`, `minute`, `day`, `year`, `isNight` | Game clock (sent every ~1.5 s) |
| `tile_change` | `x`, `y`, `tile` | A tile on the current map changed |
| `site_update` | `siteId`, `state` | Interactable site state changed (e.g. chest opened) |
| `interaction_context` | `options[]` | Available interaction options at current position |
| `hp_regen` | `hp`, `mp` | Passive HP/MP regeneration tick |
| `stamina_update` | `stamina`, `max` | Stamina value changed |
| `stamina_low` | — | Stamina dropped below warning threshold |
| `npc_focus` | `npcId`, `npcName` | Player entered NPC interaction range |
| `npc_dialogue` | `npcId`, `text`, `affinity`, `label` | NPC response to player |
| `status_event` | `added[]`, `removed[]`, `effects[]` | Status effect changes |
| `skill_unlock` | `skill` | New skill unlocked |
| `you_died` | `killedBy`, `diedAt` | Character death notification |
| `error` | `message` | Non-fatal error message |

---

## 7. Database Schema Reference

The database is a single SQLite file (`aeternitas.db`). WAL mode is enabled. Foreign keys are enforced.

---

### `accounts`

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | Auto-increment |
| `username` | TEXT UNIQUE | Case-insensitive collation |
| `password_hash` | TEXT | bcryptjs hash |
| `created_at` | TEXT | `datetime('now')` |
| `death_cooldown_until` | TEXT | ISO datetime or NULL |
| `is_banned` | INTEGER | 0/1 |
| `is_gm` | INTEGER | 0/1 |
| `bypass_death_cooldown` | INTEGER | 0/1 — GM-set exemption |

---

### `characters`

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `account_id` | INTEGER FK | → `accounts(id)` |
| `name` | TEXT | First name |
| `surname` | TEXT | Family name |
| `gender` | TEXT | `M` or `F` |
| `biome` | TEXT | Birth biome — affects level-up gains |
| `profession` | TEXT | Free text, matched by regex for loadout |
| `traits` | TEXT | JSON array of trait strings |
| `map_x`, `map_y` | INTEGER | Current world map cell |
| `pos_x`, `pos_y` | REAL | Position within current map (0–49, 0–34) |
| `hp`, `max_hp` | REAL | Current and maximum HP |
| `mp`, `max_mp` | REAL | Current and maximum MP |
| `atk`, `def`, `spd` | INTEGER | Combat stats (base + equipment + skills) |
| `exp` | INTEGER | XP toward next level |
| `level` | INTEGER | Current level |
| `gold` | INTEGER | Currency |
| `kills` | INTEGER | Lifetime kill count |
| `inventory` | TEXT | JSON array of item objects |
| `equipment` | TEXT | JSON map `{ slot: itemObject }` |
| `skills` | TEXT | JSON array of unlocked skill IDs |
| `skill_xp` | TEXT | JSON map `{ discipline: xp }` |
| `life_skills` | TEXT | JSON map `{ activity: { level, xp } }` |
| `status_effects` | TEXT | JSON array of active effect objects |
| `family_slot` | TEXT | JSON — previous-generation lineage data |
| `is_alive` | INTEGER | 0/1 |
| `died_at` | TEXT | ISO datetime of death or NULL |
| `created_at` | TEXT | |

---

### `world_maps`

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `map_x`, `map_y` | INTEGER | World grid coordinates, UNIQUE pair |
| `biome` | TEXT | |
| `seed` | INTEGER | Generation seed |
| `name` | TEXT | Procedural place name |
| `discovered_by` | INTEGER FK | → `accounts(id)` |
| `discovered_at` | TEXT | |
| `map_state` | TEXT | JSON `{ tileOverrides, sites, cooldowns }` |
| `rank` | TEXT | `F` … `SSS` |
| `lore` | TEXT | Procedural lore description |
| `visitors` | TEXT | JSON array of visitor account IDs |
| `achievements` | TEXT | JSON array of map-level achievements |
| `settlement_stage` | TEXT | `none` → `camp` → `village` → etc. |

---

### `chronicles`

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `event_type` | TEXT | e.g. `death`, `discovery`, `boss_kill` |
| `description` | TEXT | Human-readable event description |
| `actors` | TEXT | JSON array of character/account names |
| `map_x`, `map_y` | INTEGER | Location of event |
| `created_at` | TEXT | |

---

### `npc_relationships`

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `npc_key` | TEXT | Stable NPC identifier (`biome:mapX:mapY:npcName`) |
| `char_id` | INTEGER FK CASCADE | → `characters(id)` |
| `player_name` | TEXT | Denormalized for display |
| `affinity` | INTEGER | 0–100+, increases with interaction |
| `familiarity` | INTEGER | Conversation count |
| `conversation_count` | INTEGER | |
| `affinity_label` | TEXT | `estranho`/`conhecido`/`aliado`/`confidente` |
| `last_topic` | TEXT | Last detected intent |
| `memory_summary` | TEXT | LLM-generated relationship summary |
| `facts` | TEXT | JSON array of `{ summary, category, weight }` — max 8 |
| `last_interaction_at` | TEXT | |

---

### `npc_conversation_history`

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `npc_key` | TEXT | |
| `char_id` | INTEGER FK CASCADE | |
| `speaker` | TEXT | `player` or `npc` |
| `text` | TEXT | Max 400 chars (enforced on insert) |
| `intent` | TEXT | Detected intent for this line |
| `created_at` | TEXT | |

Auto-cleanup: after each insert, rows beyond the most recent 12 per `(npc_key, char_id)` pair are deleted.

---

### `npc_quests`

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `npc_key` | TEXT | |
| `char_id` | INTEGER FK | |
| `npc_name` | TEXT | |
| `quest_id` | TEXT | Stable quest identifier |
| `title` | TEXT | |
| `summary` | TEXT | |
| `objective_type` | TEXT | e.g. `collect` |
| `objective_item_id` | TEXT | Item required |
| `required_qty` | INTEGER | |
| `state` | TEXT | `accepted` / `ready_to_turn_in` / `completed` |
| `reward_gold` | INTEGER | |
| `reward_item_id` | TEXT | |
| `reward_item_qty` | INTEGER | |
| `accepted_at` | TEXT | |
| `completed_at` | TEXT | |

---

### `audit_logs`

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `actor_id` | INTEGER | Account ID performing the action |
| `actor_name` | TEXT | Denormalized username |
| `action` | TEXT | Action identifier (e.g. `GM_ROLE_GRANT`) |
| `target_type` | TEXT | e.g. `account`, `config` |
| `target_id` | INTEGER | |
| `details` | TEXT | JSON blob |
| `created_at` | TEXT | |

---

### `npc_dialogue_cache`

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `npc_key` | TEXT | |
| `prompt_key` | TEXT | First 120 chars of normalized prompt |
| `response` | TEXT | Cached LLM response |
| `hits` | INTEGER | Cache hit counter |
| `updated_at` | TEXT | |

UNIQUE constraint on `(npc_key, prompt_key)`.

---

### `game_config`

| Column | Type | Notes |
|--------|------|-------|
| `key` | TEXT PK | Dot-notation key, e.g. `combat.playerCritChance` |
| `value_json` | TEXT | JSON-encoded value |
| `value_type` | TEXT | `string` / `number` / `boolean` / `json` |
| `category` | TEXT | `game` / `combat` / `npc` / `ui` |
| `description` | TEXT | Human-readable description |
| `is_runtime_editable` | INTEGER | 1 = editable via admin API while server runs |
| `requires_restart` | INTEGER | 1 = server restart required to take effect |
| `updated_by` | TEXT | Last GM username to update |
| `created_at`, `updated_at` | TEXT | |

---

## 8. Game Systems Reference

### Items

Every item is defined in `ITEM_DEFS` in `server/gameSystems.js`. The shape of an item definition:

```js
{
  id:          'rusted_blade',        // string — unique key
  name:        'Lâmina Gasta',        // display name
  type:        'equipment',           // 'equipment' | 'material'
  slot:        'weapon',              // equipment slot (omit for materials)
  rarity:      'common',             // common | uncommon | rare | epic | legendary
  stackable:   false,                 // materials are stackable
  discipline:  'martial',            // martial|survival|arcane|guile|faith|civic
  tags:        ['blade', 'martial'], // used by skill affinity checks
  bonuses:     { atk: 2 },           // stat modifiers when equipped
  description: 'Uma espada simples.' // flavour text
}
```

Item instances in inventory carry an additional `qty` field (always `1` for non-stackables).

**Equipment slots:** `weapon`, `armor`, `helmet`, `boots`, `ring`

**Rarities and their significance:**

| Rarity | Color (client) | Typical bonus range |
|--------|---------------|-------------------|
| common | white | +1–2 to one stat |
| uncommon | green | +1–2 to two stats |
| rare | blue | +2–3, may include HP/MP |
| epic | purple | not yet in game |
| legendary | orange | not yet in game |

---

### Status Effects

Defined in `STATUS_DEFS`. Shape:

```js
{
  id:           'poisoned',
  label:        'Veneno',
  type:         'negative',       // 'positive' | 'negative'
  icon:         '!',
  durationMs:   12000,            // total duration in milliseconds
  modifiers:    { atk: -1 },      // stat modifiers while active
  tickEveryMs:  1500,             // damage tick interval (omit for non-ticking)
  tickPercentHp: 0.03,            // tick damage as fraction of max HP (or...)
  tickFlatHp:   2,                // ...flat HP damage per tick
  description:  'O veneno corrói...'
}
```

**Active status effects:**

| ID | Type | Effect |
|----|------|--------|
| `blessed` | positive | ATK+2 DEF+1, 45s |
| `focused` | positive | ATK+1 SPD+2, 30s |
| `warded` | positive | DEF+3 MP+10, 30s |
| `poisoned` | negative | ATK-1, -3% maxHP per 1.5s, 12s |
| `bleeding` | negative | DEF-1, -2 HP per 1s, 9s |
| `weakened` | negative | ATK-3 DEF-1, 10s |
| `slowed` | negative | SPD-2, 10s |

---

### Skills (Disciplines)

Skills are passive bonuses unlocked when a discipline's XP threshold is reached. Defined in `SKILL_DEFS`.

Disciplines accumulate XP through:
- Equipping items tagged with that discipline
- Combat kills with discipline-aligned weapons
- Life-skill activities (survival discipline from farming/fishing)

| Skill ID | Discipline | Threshold | Passive Bonus |
|----------|-----------|-----------|---------------|
| `blade_forms` | martial | 40 XP | ATK+2 |
| `guardian_stance` | martial | 85 XP | DEF+2, HP+10 |
| `fieldcraft` | survival | 35 XP | SPD+1, HP+6 |
| `predator_focus` | survival | 90 XP | ATK+2, SPD+1 |
| `sigil_study` | arcane | 40 XP | MP+14, ATK+1 |
| `rift_attunement` | arcane | 95 XP | ATK+2, MP+16 |
| `shadow_stride` | guile | 35 XP | SPD+2 |
| `cutpurse_instinct` | guile | 80 XP | ATK+1, DEF+1 |
| `oathbound` | faith | 45 XP | DEF+2, HP+8 |
| `market_memory` | civic | 35 XP | DEF+1, MP+8 |

---

### Combat Formulas

All formulas live in `server/combat.js`. Config keys are shown in parentheses.

**Damage:**
```
base     = max(1, atk − floor(def / 2))
variance = floor(rng() × max(1, floor(atk / 4)))
raw      = base + variance
final    = isCrit ? floor(raw × critMultiplier) : raw

critMultiplier  = getConfig('combat.playerCritMultiplier')  // default 1.5
critChance      = getConfig('combat.playerCritChance')       // default 0.15
```

**XP curve:**
```
xpForLevel(n) = floor(xpBase × xpExponent^(n-1))

xpBase     = getConfig('combat.xpBase')      // default 100
xpExponent = getConfig('combat.xpExponent')  // default 1.5
```

**Level-up stat gains** (configured via `combat.levelGains`):

| Biome | HP | ATK | DEF | SPD |
|-------|----|-----|-----|-----|
| forest | +7 | +1 | +0 | +1 |
| desert | +6 | +2 | +0 | +1 |
| mountain | +8 | +1 | +2 | +0 |
| city | +6 | +1 | +1 | +1 |
| water | +7 | +1 | +1 | +1 |
| plains | +8 | +1 | +1 | +0.5 |
| anomaly | +5 | +2 | +0 | +2 |

---

## 9. World Generation Guide

### Coordinate System

The world is an infinite 2D grid of map cells addressed by integer `(mapX, mapY)`. The origin `(0, 0)` is the starting area. Each cell is a **50×35** tile grid. Players walk through border exits to enter adjacent cells.

```
Each cell is generated on demand from seed = hash(mapX, mapY, biome)
Cells are cached in the world_maps table once generated
```

### Seeded RNG — `mkRng(seed)`

The mulberry32 PRNG produces deterministic floats in `[0, 1)` given an integer seed.

```js
const rng = mkRng(seed);
const value = rng(); // next float
```

**Rule:** Every procedural decision during world generation (tile placement, monster selection, NPC names) must use `mkRng`. Never use `Math.random()` for content generation — it breaks determinism.

### Rank System

Distance from origin determines map difficulty rank:

| Distance (Chebyshev) | Rank |
|---------------------|------|
| 0–2 | F |
| 3–5 | E |
| 6–9 | D |
| 10–14 | C |
| 15–20 | B |
| 21–27 | A |
| 28–35 | S |
| 36–44 | SS |
| 45+ | SSS |

Higher-rank maps spawn higher-rank monsters (filtered by `rank` field on monster templates).

### Biome Affinity

Biomes cluster naturally using affinity weights. When generating a new adjacent cell, the biome is weighted toward the current cell's affinity table:

```js
const AFFINITY = {
  forest:   { forest: 6, plains: 3, mountain: 2, water: 1, ... },
  water:    { water: 7, plains: 2, forest: 1, ... },
  // ...
};
```

Higher weight = more likely neighbour biome. This creates natural forests, mountain ranges, and river deltas.

### Tile Generation Algorithm

`generateMap(mapX, mapY, biome, seed)` runs in this order:

1. **Base fill** — fill all tiles with the biome's dominant ground tile (GRASS, SAND, FLOOR, etc.)
2. **Cluster obstacles** — `addClusters()` places TREE/ROCK/WATER clusters using the seeded RNG and biome density config
3. **Cross-path** — `addCrossPath()` cuts a horizontal + vertical PATH through the center, ensuring map connectivity
4. **Border exits** — `openBorderExits()` opens 3-wide passages on all four edges at the midpoints
5. **Sparse features** — `addSparse()` places TALL_GRASS, CHEST, DUNGEON, MONUMENT at low density
6. **Dungeon rooms** — for dungeon biomes, a BSP or prefab room layout is stamped onto the tile array
7. **NPC generation** — `generateNpcs()` places NPCs at safe PATH positions using seeded RNG

### Tile Reference

| ID | Constant | Passable | Description |
|----|----------|----------|-------------|
| 0 | GRASS | ✓ | Open ground |
| 1 | TREE | ✗ | Blocks movement |
| 2 | WATER | ✗ | Blocks movement |
| 3 | ROCK | ✗ | Blocks movement |
| 4 | PATH | ✓ | Road/path |
| 5 | SAND | ✓ | Desert floor |
| 6 | WALL | ✗ | Structure wall |
| 7 | FLOOR | ✓ | Structure interior |
| 8 | DOOR | ✓ | Passable door |
| 9 | CHEST | ✓ | Lootable chest |
| 10 | DUNGEON | ✓ | Dungeon entrance |
| 11 | TALL_GRASS | ✓ | Concealment tile |
| 12 | MONUMENT | ✓ | Lore inscriptions |

### Monster Spawning

Monsters are generated by `generateMap` and placed at safe traversable positions. Each biome has its own monster pool in `MONSTERS`. Monsters with a `rank` property are filtered: a map only spawns monsters whose rank ≤ the map's rank.

Monster template shape:
```js
{
  name: 'Lobo Cinzento',
  char: '🐺',           // display emoji
  hp: 30, atk: 8, def: 3, spd: 4,
  exp: 15, gold: 2,
  rank: 'F',
  inflicts: ['poisoned'], // optional — status effect on hit
  disposition: 'neutral', // optional — default is 'hostile'
}
```

### Safe Spawn Algorithm

`findSafeSpawn()` scores candidate tiles by:
1. Tile must be traversable (not in `SOLID`)
2. Must have ≥ 1 traversable neighbour
3. Must have ≥ 12 reachable tiles via flood-fill (prevents spawning in isolated pockets)
4. Scored by `SPAWN_TILE_PRIORITY` (PATH=0 preferred, DUNGEON=6 last resort)
5. Sorted by score, then by distance to map center as tiebreaker

---

## 10. NPC AI System

### Overview

NPCs are procedurally generated per map tile using `generateNpcs()`. Each NPC has a `key` (`biome:mapX:mapY:npcName`) that serves as a stable identifier across server restarts.

`NpcDialogueService` (instantiated once in `GameWorld`) handles all dialogue, memory, and LLM calls.

### Dialogue Flow

```
Player sends: { type: 'npc_chat', npcId: '...', text: 'Quem é você?' }
                          │
                    detectIntent(text)
                          │
                ┌─────────▼──────────┐
                │  template intent?  │ → return template response
                └─────────┬──────────┘
                          │ freeform
                    check cache
                          │
                ┌─────────▼──────────┐
                │   cache hit?       │ → return cached response, increment hits
                └─────────┬──────────┘
                          │ miss
                   build LLM prompt
                   (persona + memory + facts + history)
                          │
                    call LLM API
                          │
                   store in cache
                   update affinity + facts
                          │
                  return response to player
```

### Intent Templates

Common intents are answered without an LLM call:

| Intent | Trigger keywords |
|--------|-----------------|
| `greeting` | oi, olá, bom dia, boa tarde... |
| `identity` | nome, quem é você... |
| `profession` | trabalha, profissão, ofício... |
| `rumor` | rumor, boato, notícia... |
| `city` | cidade, bairro, mercado... |
| `family` | família, irmão, pai, mãe... |
| `help` | ajuda, missão, serviço... |
| `trade` | comprar, vender, preço, ouro... |
| `freeform` | everything else → LLM |

### Affinity System

Affinity is a per `(npc_key, char_id)` integer that increases with each interaction. It affects NPC tone and unlocks deeper dialogue options.

| Affinity | Label | Behaviour |
|----------|-------|-----------|
| 0–3 | `estranho` | Formal, guarded |
| 4–9 | `conhecido` | Friendly, basic info |
| 10–17 | `aliado` | Warm, shares rumours |
| 18+ | `confidente` | Intimate, reveals personal lore |

### Memory & Facts

Each NPC-player pair stores up to **8 facts** — extracted by the LLM from conversation:

```js
{ summary: 'Busca ruínas antigas no leste', category: 'goal', weight: 3 }
```

Facts are injected into subsequent LLM prompts so the NPC "remembers" prior context. Facts are weighted; when the limit is reached, the lowest-weight fact is evicted.

### Cache

The `npc_dialogue_cache` table stores LLM responses keyed by the first 120 chars of the normalized prompt. This dramatically reduces API costs for repeated common interactions. Cache hits increment a `hits` counter.

### LLM Prompt Construction

The system prompt is built from:
- NPC persona (name, profession, biome, personality traits)
- Current affinity label + relationship summary
- Top facts (by weight)
- Last 6 conversation history lines
- Detected intent hint
- Shared surname hint (if player and NPC share a family name)

---

## 11. Code Standards

### Mandatory Rules

These are non-negotiable. PRs violating them will not be merged.

```js
// ✓ CORRECT
'use strict'; // all files start with this

const data = safeParseJson(row.inventory, []);   // always use safeParseJson
db.prepare('SELECT * FROM t WHERE id = ?').get(id); // always parameterize SQL

if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)); // always check readyState

const rng = mkRng(seed); // always use seeded RNG in world gen
const roll = rng();      // not Math.random()
```

```js
// ✗ WRONG
var x = 1;                                // never var
JSON.parse(row.inventory);               // never raw JSON.parse on DB values
db.prepare(`SELECT * FROM t WHERE id = ${id}`); // never interpolate SQL
Math.random();                           // never in world gen
ws.send(JSON.stringify(msg));            // never without readyState check
process.env.JWT_SECRET || 'hardcoded';  // never hardcode secrets
```

### Auth Helpers

```js
// Standard auth — returns payload object or null (already sent 401)
const p = verifyAuth(req, res);
if (!p) return;

// GM auth — includes verifyAuth internally, returns { account, character } or null
const gm = requireGm(req, res);
if (!gm) return;

// NEVER call both — requireGm already calls verifyAuth
```

### Admin Endpoint Template

```js
app.post('/api/admin/example', (req, res) => {
  const gm = requireGm(req, res);
  if (!gm) return;

  const { targetUsername, value } = req.body;
  if (!targetUsername) return res.status(400).json({ error: 'targetUsername required' });

  try {
    const target = db.prepare('SELECT id FROM accounts WHERE username = ?').get(targetUsername);
    if (!target) return res.status(404).json({ error: 'Account not found' });

    db.prepare('UPDATE accounts SET some_col = ? WHERE id = ?').run(value, target.id);

    logAudit(db, gm.account.id, gm.account.username, 'EXAMPLE_ACTION', 'account', target.id, { value });
    res.json({ ok: true });
  } catch (e) {
    console.error('admin/example:', e);
    res.status(500).json({ error: 'Internal error' });
    // Never send e.message to client — it may leak schema/path info
  }
});
```

### Inventory Operations

```js
// ✓ Add item
storeItem(character.inventory, createItem('healing_herb', 3));

// ✓ Remove item
const ok = consumeInventoryItem(character.inventory, 'healing_herb', 1);
if (!ok) return; // player doesn't have it

// ✓ Count item
const qty = countInventoryItem(character.inventory, 'healing_herb');

// ✗ Never push directly
character.inventory.push({ id: 'healing_herb' }); // breaks stacking logic
```

### Comment Style

```js
// ---- Section separator for large logical blocks ----

/** JSDoc for exported/public functions */
function calcDamage(atk, def, isCrit) { ... }

// Inline comment only when logic is non-obvious
const variance = Math.floor(rng() * Math.max(1, Math.floor(atk / 4)));
// Variance is capped at ATK/4 to prevent extreme swings at high levels
```

Don't comment the obvious:
```js
// ✗ Returns true  ← useless
return true;

// ✓ Acceptable (explains the why)
// Fallback to plains gains if biome not configured — anomaly characters are rare
const g = gains[entity.biome] || gains.plains;
```

### DB Migration Pattern

```js
// In server/db.js, AFTER the main db.exec() block:
try {
  db.prepare('ALTER TABLE characters ADD COLUMN new_col TEXT DEFAULT NULL').run();
} catch {
  // Column already exists — migrations are intentionally idempotent
}
```

Never modify existing `CREATE TABLE IF NOT EXISTS` statements. SQLite doesn't support `ALTER TABLE ... MODIFY COLUMN` — add new columns as migrations only.

---

## 12. How to Contribute

### Adding a New REST Endpoint (Authenticated + Audited)

**Example:** Add `POST /api/admin/ban-account`

1. Open `server.js` and find the block of `app.post('/api/admin/...')` routes.

2. Add your endpoint using the admin template:

```js
app.post('/api/admin/ban-account', (req, res) => {
  const gm = requireGm(req, res);
  if (!gm) return;

  const { targetUsername, banned } = req.body;
  if (!targetUsername || typeof banned !== 'boolean') {
    return res.status(400).json({ error: 'targetUsername and banned (boolean) required' });
  }

  try {
    const target = db.prepare('SELECT id FROM accounts WHERE username = ? COLLATE NOCASE')
      .get(targetUsername);
    if (!target) return res.status(404).json({ error: 'Account not found' });

    db.prepare('UPDATE accounts SET is_banned = ? WHERE id = ?').run(banned ? 1 : 0, target.id);

    logAudit(db, gm.account.id, gm.account.username,
      banned ? 'ACCOUNT_BAN' : 'ACCOUNT_UNBAN',
      'account', target.id,
      { targetUsername }
    );

    res.json({ ok: true, updatedBy: gm.account.username });
  } catch (e) {
    console.error('admin/ban-account:', e);
    res.status(500).json({ error: 'Internal error' });
  }
});
```

3. Document it in this file under [§5 REST API Reference](#5-rest-api-reference).

4. Add a smoke test assertion in `scripts/smoke-world.js` if the endpoint affects game state.

---

### Adding a New Item to ITEM_DEFS

1. Open `server/gameSystems.js` and locate `ITEM_DEFS`.

2. Add your item definition. Choose an ID that is lowercase with underscores:

```js
// Inside ITEM_DEFS:
bone_needle: {
  id: 'bone_needle', name: 'Agulha de Osso', type: 'material', stackable: true,
  rarity: 'uncommon', discipline: 'survival', tags: ['bone', 'craft'], bonuses: {},
  description: 'Pontiaguda e resistente, útil para suturas e armadilhas.'
},
```

3. Add a gold value in `ITEM_VALUES`:

```js
bone_needle: 14,
```

4. If the item should appear in NPC shops or as quest loot, add it to the relevant biome entry in:
   - `TRADE_STOCK_BY_BIOME` — for shop stock
   - `QUEST_ITEMS_BY_BIOME` — for quest objectives
   - `QUEST_REWARDS_BY_BIOME` — for quest rewards

5. If it's an **equipment** item, also add a `slot` field and ensure `bonuses` is non-empty. Add it to relevant `PROFESSION_LOADOUTS` patterns if it suits a starting class.

6. **Checklist:**
   - [ ] `id` matches the key in `ITEM_DEFS`
   - [ ] `stackable: true` iff it's a material
   - [ ] `slot` present iff `type === 'equipment'`
   - [ ] Entry added to `ITEM_VALUES`
   - [ ] `discipline` and `tags` are consistent

---

### Adding a New Status Effect

1. Open `server/gameSystems.js` and locate `STATUS_DEFS`.

2. Add the definition:

```js
// Inside STATUS_DEFS:
chilled: {
  id: 'chilled', label: 'Gelado', type: 'negative', icon: '!', durationMs: 8000,
  modifiers: { spd: -3, def: -1 },
  // No tick fields = no per-tick damage; only the stat modifier applies
  description: 'O frio penetra os ossos, reduzindo velocidade e reflexos.'
},
```

3. If the effect deals periodic damage, add `tickEveryMs` plus **one of**:
   - `tickPercentHp: 0.02` — percentage of max HP per tick
   - `tickFlatHp: 3` — flat HP damage per tick

4. To have a monster inflict it, add the effect ID to its `inflicts` array in `MONSTERS`:

```js
// In worldGen.js MONSTERS:
{ name: 'Serpente Glacial', char: '🐍', hp: 45, atk: 13, def: 5, spd: 6,
  exp: 28, gold: 5, rank: 'D', inflicts: ['chilled'] },
```

5. The `tickStatusEffects()` function in `gameSystems.js` already handles all status effects generically — no changes needed there unless the new effect requires special logic.

---

### Adding a New Monster Template

1. Open `server/worldGen.js` and locate the `MONSTERS` object.

2. Find the appropriate biome array and add the template:

```js
// In MONSTERS.mountain:
{ name: 'Dragão de Pedra', char: '🐲', hp: 200, atk: 22, def: 18, spd: 3,
  exp: 120, gold: 30, rank: 'B', inflicts: ['weakened'] },
```

3. **Field reference:**

| Field | Required | Notes |
|-------|----------|-------|
| `name` | ✓ | Display name |
| `char` | ✓ | Single emoji for canvas rendering |
| `hp` | ✓ | Starting HP |
| `atk` | ✓ | Attack stat |
| `def` | ✓ | Defense stat |
| `spd` | ✓ | Speed stat (affects attack cooldown) |
| `exp` | ✓ | XP awarded on kill |
| `gold` | ✓ | Gold awarded on kill |
| `rank` | ✓ | `F`/`E`/`D`/`C`/`B`/`A`/`S`/`SS`/`SSS` |
| `inflicts` | — | Array of status effect IDs |
| `disposition` | — | `'neutral'` if not hostile by default |

4. The `rank` field is used to filter monster spawns. A map of rank `D` only spawns monsters with rank `F`, `E`, or `D`.

5. Balance guideline: HP ≈ (rank_index × 30 + 20), ATK ≈ (rank_index × 3 + 6), DEF ≈ ATK × 0.4.

---

### Adding a New Skill to SKILL_DEFS

1. Open `server/gameSystems.js` and locate `SKILL_DEFS`.

2. Append to the array:

```js
{
  id: 'iron_will', name: 'Vontade de Ferro', discipline: 'faith', threshold: 70,
  description: 'Convicção inabalável reduz os efeitos de estados negativos.',
  passive: { def: 3, maxHp: 12 },
  affinity: ['faith', 'mace', 'ring']
}
```

3. **Field reference:**

| Field | Notes |
|-------|-------|
| `id` | Unique snake_case string |
| `name` | Display name (Portuguese) |
| `discipline` | One of the 6 disciplines |
| `threshold` | XP required to unlock |
| `description` | One sentence flavour text |
| `passive` | Stat bonuses added permanently on unlock |
| `affinity` | Item tags that grant XP toward this discipline |

4. `refreshDerivedStats()` in `gameSystems.js` automatically sums passives from all unlocked skills — no additional wiring needed.

5. Check existing thresholds for the discipline to avoid collisions. Each discipline should have thresholds at ~35–40 (tier 1) and ~80–95 (tier 2).

---

### Adding a Database Table or Column (Migration)

#### New Column

In `server/db.js`, after the main `db.exec()` block, add:

```js
try {
  db.prepare('ALTER TABLE characters ADD COLUMN prestige INTEGER DEFAULT 0').run();
} catch {
  // Idempotent — column already exists on subsequent runs
}
```

Then update `parseChar()` in `server.js` to include the new field if it contains JSON.

#### New Table

Add a new `CREATE TABLE IF NOT EXISTS` block inside the main `db.exec()` call:

```sql
CREATE TABLE IF NOT EXISTS character_titles (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  char_id      INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  title        TEXT    NOT NULL,
  earned_at    TEXT    DEFAULT (datetime('now'))
);
```

**Rules:**
- Always include a primary key
- Reference foreign keys explicitly with `REFERENCES`
- Use `ON DELETE CASCADE` when child rows have no meaning without the parent
- Default timestamps with `datetime('now')`
- Never modify existing `CREATE TABLE IF NOT EXISTS` statements

---

### Adding a New Tile Type

1. Add the tile constant to the `T` object in `server/worldGen.js`:

```js
const T = {
  // ... existing tiles ...
  LAVA: 13,
};
```

2. Decide if it blocks movement. If yes, add it to `SOLID`:

```js
const SOLID = new Set([T.TREE, T.WATER, T.ROCK, T.WALL, T.LAVA]);
```

3. Add a spawn priority entry if players can stand on it:

```js
const SPAWN_TILE_PRIORITY = new Map([
  // ... existing entries ...
  [T.LAVA, 99], // last resort — only if nothing better exists
]);
```

4. Add a human-readable label in `TILE_LABELS` in `server/gameWorld.js`:

```js
const TILE_LABELS = {
  // ... existing ...
  [T.LAVA]: 'lava borbulhante',
};
```

5. Add rendering logic in `public/game.html` inside the canvas tile drawing switch/if block. The client already receives tile IDs from the server — it just needs to know what color/sprite to draw.

6. Use the new tile in `generateMap()` via `addSparse()` or `addClusters()`, referencing the seeded `rng`.

---

## 13. Testing

### Running Tests

```bash
# The server must be running before smoke tests execute
npm run dev         # terminal 1

npm run smoke:world # terminal 2
```

The smoke tests target `SMOKE_BASE_URL` (default: `http://localhost:3011`).

### What the Smoke Tests Cover

`scripts/smoke-world.js` tests the following in order:

1. **Account creation** — `POST /api/register`
2. **Login** — `POST /api/login` → JWT
3. **Character creation** — `POST /api/character/create`
4. **WebSocket auth** — `auth` message → `auth_ok`
5. **Map initialization** — `init` message received
6. **Movement** — `move` message → `entity_move` or `map_change`
7. **Combat** — approaches a monster → `attack` → `combat` message
8. **Interaction** — walks to a chest or NPC → `interact` → response
9. **Gathering** (skippable via `SKIP_GATHERING_SMOKE=1`) — life-skill interactions
10. **REST authenticated endpoints** — `/api/character/sheet`, `/api/worldmap`
11. **Cleanup** — deletes smoke test account unless `KEEP_SMOKE_ACCOUNT=1`

### Syntax Checking Without Running

```bash
node --check server/gameWorld.js
node --check server/gameSystems.js
node --check server.js
```

### Writing New Smoke Tests

Add test steps inside `smoke-world.js` following the existing pattern:

```js
// Step: verify level-up XP formula
console.log('  Testing XP formula...');
const { xpForLevel } = require('../server/combat');
assert(xpForLevel(1) === 100, 'Level 1 XP should be 100');
assert(xpForLevel(2) === 150, 'Level 2 XP should be 150');
console.log('  ✓ XP formula correct');
```

For integration steps that require a live server, use the `api()` helper and `WsSession` class already defined in the file.

### What is NOT Tested (Yet)

- Unit tests for individual functions (no test runner configured)
- NPC dialogue / LLM integration (requires API key)
- Death and cooldown flow end-to-end
- Multi-player interaction

---

## 14. Environment Variables

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `PORT` | `3000` | No | HTTP server port |
| `JWT_SECRET` | *(insecure fallback)* | **Yes in production** | JWT signing secret. Server exits with error if missing in production. |
| `NODE_ENV` | `development` | No | Set to `production` to disable dev routes and enforce `JWT_SECRET`. |
| `OPENAI_API_KEY` | — | No | OpenAI API key for NPC LLM dialogue. If absent, NPC responses fall back to templates only. |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1/chat/completions` | No | Override for OpenAI-compatible API endpoint. |
| `OPENROUTER_API_KEY` | — | No | If set, overrides `OPENAI_API_KEY` and routes LLM calls through OpenRouter. |
| `OPENROUTER_MODEL` | `gpt-4o-mini` | No | Model name when using OpenRouter. |
| `OPENROUTER_SITE_URL` | `http://localhost` | No | Your site URL, sent in OpenRouter headers. |
| `OPENROUTER_SITE_NAME` | `AETERNITAS` | No | Your site name, sent in OpenRouter headers. |
| `ALLOW_DEV_RESPAWN` | `0` | No | Set to `1` to enable `POST /api/dev/reset-cooldown`. Always disabled when `NODE_ENV=production`. |
| `SMOKE_BASE_URL` | `http://localhost:3011` | No | Base URL for smoke test HTTP calls. |
| `KEEP_SMOKE_ACCOUNT` | `0` | No | Set to `1` to skip smoke test account cleanup (useful for manual inspection). |
| `SKIP_GATHERING_SMOKE` | `0` | No | Set to `1` to skip life-skill gathering tests (faster CI runs). |

### Recommended `.env` for Development

```dotenv
PORT=3011
JWT_SECRET=dev-only-not-for-production
NODE_ENV=development
ALLOW_DEV_RESPAWN=1
```

### Production Checklist

- [ ] `JWT_SECRET` is a long random string (≥ 32 chars)
- [ ] `NODE_ENV=production`
- [ ] `ALLOW_DEV_RESPAWN` is unset or `0`
- [ ] `OPENAI_API_KEY` or `OPENROUTER_API_KEY` set if NPC dialogue is desired
- [ ] `.env` file is not committed to version control (it's in `.gitignore`)

---

## 15. Roadmap

These areas are actively open for contribution. Open an issue before starting significant work to avoid duplication.

### Gameplay Systems

| Area | Status | Notes |
|------|--------|-------|
| **Crafting** | Planned | Use material items + life-skill levels to create equipment |
| **Player trading** | Planned | Direct player-to-player item exchange |
| **Settlement system** | Partial | `settlement_stage` column exists; progression logic not implemented |
| **Boss encounters** | Planned | Named bosses with multi-phase AI at high-rank maps |
| **Ranged combat** | Planned | Bow weapons currently grant stat bonuses but use melee hit logic |
| **Magic system** | Planned | MP has no in-combat use yet; arcane discipline skills are passive-only |
| **Family legacy** | Partial | `family_slot` column exists; intergeneration bonus system unimplemented |
| **Weather system** | Planned | Day/night exists; weather conditions affecting tiles and combat |

### Infrastructure

| Area | Status | Notes |
|------|--------|-------|
| **Unit test suite** | Planned | Jest or Node's built-in test runner; currently only integration smoke tests |
| **Docker setup** | Planned | Containerization for consistent deployment |
| **Map editor** | Planned | GM tool to place overrides on map tiles without code |
| **Admin dashboard** | Partial | Config editing works via API; a web UI would improve GM workflow |
| **Chronicle viewer** | Planned | Frontend UI for browsing the `chronicles` table |

### World Content

| Area | Status | Notes |
|------|--------|-------|
| **More monster variants** | Open | Higher-rank monsters for A/S/SS/SSS maps are sparse |
| **Dungeon layouts** | Partial | Dungeon tile exists; multi-room BSP dungeon not fully implemented |
| **NPC quest types** | Partial | Only `collect` objective type exists; `kill`, `escort`, `deliver` planned |
| **Biome-specific events** | Planned | Random events triggered by tile interaction (e.g. cave-in in mountains) |

### Client

| Area | Status | Notes |
|------|--------|-------|
| **Mobile support** | Planned | Touch controls for canvas; viewport scaling |
| **Sound effects** | Planned | Web Audio API integration |
| **Minimap** | Planned | Small overview of current map tile |
| **Chat history** | Partial | Scrollable chat log in the HUD |

---

*This document reflects the state of AETERNITAS as of its current version. For design decisions and game design rationale, see [AETERNITAS_CONCEPT.md](./AETERNITAS_CONCEPT.md).*
