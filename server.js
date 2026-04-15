// server.js — Aeterra: World Breaker Entry Point
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express   = require('express');
const http      = require('http');
const WebSocket = require('ws');
const path      = require('path');
const jwt       = require('jsonwebtoken');
const bcrypt    = require('bcryptjs');
// ─── imports do projeto ──────────────────────────────────────────────────────
const { db, logAudit } = require('./server/db');
const { generateMap, findSafeSpawn } = require('./server/worldGen');
const { GameWorld } = require('./server/gameWorld');
const { safeParseJson, getStarterLoadout, refreshDerivedStats, generateNpcs, countInventoryItem } = require('./server/gameSystems');
const {
  initializeGameConfig,
  listConfigEntries,
  listAuditEntries,
  updateConfigs,
} = require('./server/config');

// ─── JWT_SECRET ──────────────────────────────────────────────────────────────
let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    console.error('[FATAL] JWT_SECRET env var e obrigatorio em producao. Encerrando.');
    process.exit(1);
  }
  JWT_SECRET = 'aet_dev_fallback__nao_usar_em_producao__2026';
  console.warn('[WARN] JWT_SECRET nao definido. Usando fallback inseguro de desenvolvimento. NAO use em producao.');
}

const PORT              = process.env.PORT || 3000;
const DEV_RESPAWN_ENABLED = process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEV_RESPAWN !== '0';

// ─── inicializar configs de jogo antes de criar o mundo ──────────────────────
initializeGameConfig(db);

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server });
const world  = new GameWorld(db);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.get('/concept', (_req, res) => res.sendFile(path.join(__dirname, 'aeterra.html')));
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));

// ─────────────────────────── helpers ───────────────────────────────────────
function parseChar(c) {
  const parsed = {
    ...c,
    traits: safeParseJson(c.traits, []),
    family_slot: safeParseJson(c.family_slot, {}),
    inventory: safeParseJson(c.inventory, []),
    equipment: safeParseJson(c.equipment, {}),
    skills: safeParseJson(c.skills, []),
    skill_xp: safeParseJson(c.skill_xp, {}),
    life_skills: safeParseJson(c.life_skills, {}),
    status_effects: safeParseJson(c.status_effects, []),
    maxHp: c.max_hp,
    maxMp: c.max_mp,
    baseMaxHp: c.max_hp,
    baseMaxMp: c.max_mp,
    baseAtk: c.atk,
    baseDef: c.def,
    baseSpd: c.spd,
    skillXp: safeParseJson(c.skill_xp, {}),
    lifeSkills: safeParseJson(c.life_skills, {}),
    statusEffects: safeParseJson(c.status_effects, []),
  };
  refreshDerivedStats(parsed);
  return parsed;
}

function verifyAuth(req, res) {
  const auth = req.headers.authorization || '';
  const tok  = auth.startsWith('Bearer ') ? auth.slice(7) : auth;
  if (!tok) { res.status(401).json({ error: 'Token ausente' }); return null; }
  try { return jwt.verify(tok, JWT_SECRET); }
  catch { res.status(401).json({ error: 'Token inválido' }); return null; }
}

function parseDbDate(value) {
  if (!value) return null;
  return new Date(value.includes(' ') ? value.replace(' ', 'T') + 'Z' : value);
}

function getDeathCooldownState(acc) {
  if (!acc || acc.bypass_death_cooldown || !acc.death_cooldown_until) return null;
  const until = parseDbDate(acc.death_cooldown_until);
  if (!until || Number.isNaN(until.getTime()) || until <= new Date()) return null;
  return { until, rawUntil: acc.death_cooldown_until, ms: until - new Date() };
}

function parseNpcKey(npcKey) {
  const [mapXRaw, mapYRaw, indexRaw] = String(npcKey || '').split(':');
  const mapX = Number(mapXRaw);
  const mapY = Number(mapYRaw);
  const index = Number(indexRaw);
  if (!Number.isInteger(mapX) || !Number.isInteger(mapY) || !Number.isInteger(index)) return null;
  return { mapX, mapY, index };
}

function fallbackRelationshipEntry(row) {
  const facts = safeParseJson(row.facts, []).map(entry => typeof entry === 'string' ? entry : entry?.summary).filter(Boolean);
  return {
    npcKey: row.npc_key,
    name: `NPC ${row.npc_key}`,
    profession: 'Desconhecido',
    district: 'Local incerto',
    topic: row.last_topic || 'sem topico marcado',
    char: '☺',
    relation: {
      affinity: Number(row.affinity || 0),
      familiarity: Number(row.familiarity || 0),
      conversationCount: Number(row.conversation_count || 0),
      affinityLabel: row.affinity_label || 'estranho',
      lastTopic: row.last_topic || '',
      memorySummary: row.memory_summary || '',
      facts: safeParseJson(row.facts, []),
      rememberedFacts: facts.slice(0, 3),
      unlocks: { discountPercent: 0, rareRumors: [], localQuests: [], services: [] },
      playerName: row.player_name || '',
    },
  };
}

function hydrateRelationshipEntry(row, playerRef, npcCache) {
  const parsed = parseNpcKey(row.npc_key);
  if (!parsed) return fallbackRelationshipEntry(row);

  const cacheKey = `${parsed.mapX},${parsed.mapY}`;
  let cached = npcCache.get(cacheKey);
  if (!cached) {
    const worldMap = db.prepare('SELECT biome, seed FROM world_maps WHERE map_x=? AND map_y=?').get(parsed.mapX, parsed.mapY);
    if (!worldMap) return fallbackRelationshipEntry(row);

    const mapData = generateMap(parsed.mapX, parsed.mapY, worldMap.biome, worldMap.seed);
    cached = {
      npcs: generateNpcs({ mapX: parsed.mapX, mapY: parsed.mapY, biome: worldMap.biome, seed: worldMap.seed, tiles: mapData.tiles, width: mapData.width, height: mapData.height })
    };
    npcCache.set(cacheKey, cached);
  }

  const npc = cached.npcs.find(entry => entry.npcId === row.npc_key) || cached.npcs[parsed.index];
  if (!npc) return fallbackRelationshipEntry(row);

  return {
    npcKey: row.npc_key,
    name: npc.name,
    profession: npc.profession,
    district: npc.district,
    topic: npc.topic,
    familyRole: npc.familyRole,
    char: npc.char,
    relation: world.dialogueService.getRelationshipSnapshot(npc, playerRef),
  };
}

function requireGm(req, res) {
  const token = verifyAuth(req, res);
  if (!token) return null;

  const acc = db.prepare('SELECT id, username, is_gm FROM accounts WHERE id=?').get(token.accountId);
  if (!acc || !acc.is_gm) {
    res.status(403).json({ error: 'Acesso restrito a GMs' });
    return null;
  }

  return { token, account: acc };
}

function buildAccountSession(accountId) {
  const acc = db.prepare('SELECT id, username, is_gm, bypass_death_cooldown FROM accounts WHERE id=?').get(accountId);
  if (!acc) return null;

  const char = db.prepare('SELECT id FROM characters WHERE account_id=? AND is_alive=1').get(accountId);
  return {
    accountId: acc.id,
    username: acc.username,
    hasCharacter: !!char,
    isGm: !!acc.is_gm,
    bypassDeathCooldown: !!acc.bypass_death_cooldown,
  };
}

const pick = arr => arr[Math.floor(Math.random() * arr.length)];

function reserveBirthMap(biome) {
  const lookupMap = db.prepare('SELECT 1 FROM world_maps WHERE map_x=? AND map_y=?');

  for (let attempt = 0; attempt < 64; attempt++) {
    const mapX = Math.floor(Math.random() * 1000);
    const mapY = Math.floor(Math.random() * 1000);
    if (lookupMap.get(mapX, mapY)) continue;

    const seed = Math.floor(Math.random() * 2147483647);
    const map = generateMap(mapX, mapY, biome, seed);
    const spawn = findSafeSpawn(map.tiles, map.width, map.height);
    if (!spawn) continue;

    return { mapX, mapY, seed, spawn };
  }

  throw new Error(`Falha ao reservar mapa inicial para ${biome}`);
}

// ─────────────────────────── POST /api/register ────────────────────────────
app.post('/api/register', async (req, res) => {
  try {
    const { username, password, email } = req.body || {};
    if (!username || !password || !email) return res.status(400).json({ error: 'Dados inválidos' });
    const u = String(username).trim();
    if (u.length < 3 || u.length > 20)       return res.status(400).json({ error: 'Username: 3–20 caracteres' });
    if (!/^[a-zA-Z0-9_]+$/.test(u))          return res.status(400).json({ error: 'Username: apenas letras, números e _' });
    if (String(password).length < 6)          return res.status(400).json({ error: 'Senha: mínimo 6 caracteres' });

    const e = String(email).trim().toLowerCase();
    if (!e.includes('@') || !e.includes('.')) return res.status(400).json({ error: 'E-mail inválido.' });

    const exists = db.prepare('SELECT id FROM accounts WHERE username=? COLLATE NOCASE').get(u);
    if (exists) return res.status(400).json({ error: 'Username já em uso' });

    const emailTaken = db.prepare('SELECT id FROM accounts WHERE email=?').get(e);
    if (emailTaken) return res.status(409).json({ error: 'Email já cadastrado.' });

    const hash = await bcrypt.hash(String(password), 10);
    const { lastInsertRowid } = db.prepare('INSERT INTO accounts (username, password_hash, email) VALUES (?,?,?)').run(u, hash, e);
    const token = jwt.sign({ accountId: lastInsertRowid, username: u }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, username: u, accountId: lastInsertRowid, hasCharacter: false, isGm: false, bypassDeathCooldown: false });
  } catch (e) { console.error('register:', e); res.status(500).json({ error: 'Erro interno' }); }
});

// ─────────────────────────── POST /api/login ───────────────────────────────
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Dados inválidos' });

    const e = String(email).trim().toLowerCase();
    const acc = db.prepare('SELECT * FROM accounts WHERE email=?').get(e);
    if (!acc) return res.status(401).json({ error: 'E-mail ou senha incorretos' });
    if (acc.is_banned) return res.status(403).json({ error: 'Conta banida' });

    const valid = await bcrypt.compare(String(password), acc.password_hash);
    if (!valid) return res.status(401).json({ error: 'E-mail ou senha incorretos' });

    const cooldown = getDeathCooldownState(acc);
    if (cooldown) {
      const h = Math.floor(cooldown.ms / 3600000);
      const m = Math.floor((cooldown.ms % 3600000) / 60000);
      return res.status(403).json({ error: `Sua personagem morreu. Aguarde ${h}h ${m}min para criar uma nova.`, cooldown: true, until: cooldown.rawUntil, allowDevRespawn: DEV_RESPAWN_ENABLED });
    }

    const token = jwt.sign({ accountId: acc.id, username: acc.username }, JWT_SECRET, { expiresIn: '7d' });
    const session = buildAccountSession(acc.id);
    res.json({ token, ...session });
  } catch (e) { console.error('login:', e); res.status(500).json({ error: 'Erro interno' }); }
});

// ─────────────────────────── POST /api/dev/reset-cooldown ─────────────────
app.post('/api/dev/reset-cooldown', async (req, res) => {
  if (!DEV_RESPAWN_ENABLED) return res.status(403).json({ error: 'Recurso indisponivel.' });
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Dados invalidos' });

    const acc = db.prepare('SELECT * FROM accounts WHERE email=?').get(String(email).trim().toLowerCase());
    if (!acc) return res.status(401).json({ error: 'E-mail ou senha incorretos' });
    const valid = await bcrypt.compare(String(password), acc.password_hash);
    if (!valid) return res.status(401).json({ error: 'E-mail ou senha incorretos' });

    db.prepare('UPDATE accounts SET death_cooldown_until=NULL WHERE id=?').run(acc.id);
    const token = jwt.sign({ accountId: acc.id, username: acc.username }, JWT_SECRET, { expiresIn: '7d' });
    const session = buildAccountSession(acc.id);
    res.json({ token, ...session, bypassed: true });
  } catch (e) {
    console.error('dev reset cooldown:', e);
    res.status(500).json({ error: 'Erro interno' });
  }
});

app.post('/api/dev/unstuck-character', (req, res) => {
  if (!DEV_RESPAWN_ENABLED) return res.status(403).json({ error: 'Recurso indisponivel.' });
  const p = verifyAuth(req, res); if (!p) return;

  try {
    const char = db.prepare('SELECT id, name, surname FROM characters WHERE account_id=? AND is_alive=1').get(p.accountId);
    if (!char) return res.status(404).json({ error: 'Sem personagem ativa' });

    const result = world.unstuckCharacter(char.id, 'dev-api');
    if (!result) return res.status(409).json({ error: 'Nao foi possivel localizar um tile seguro no mapa atual.' });

    res.json({ ok: true, characterId: char.id, name: `${char.name} ${char.surname}`, ...result });
  } catch (e) {
    console.error('dev unstuck:', e);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ─────────────────────────── GET /api/account/session ──────────────────────
app.get('/api/account/session', (req, res) => {
  const p = verifyAuth(req, res); if (!p) return;
  const session = buildAccountSession(p.accountId);
  if (!session) return res.status(404).json({ error: 'Conta não encontrada' });
  res.json(session);
});

// ─────────────────────────── POST /api/admin/gm-role ───────────────────────
app.post('/api/admin/gm-role', (req, res) => {
  const gm = requireGm(req, res); if (!gm) return;
  try {
    const { username } = req.body || {};
    const isGmValue = req.body?.isGm ?? req.body?.gm ?? req.body?.enabled;
    const targetUsername = String(username || '').trim();

    if (!targetUsername) return res.status(400).json({ error: 'Username alvo é obrigatório' });
    if (typeof isGmValue !== 'boolean') return res.status(400).json({ error: 'Informe isGm/gm/enabled como booleano' });

    const target = db.prepare('SELECT id, username, is_gm FROM accounts WHERE username=? COLLATE NOCASE').get(targetUsername);
    if (!target) return res.status(404).json({ error: 'Conta não encontrada' });

    db.prepare('UPDATE accounts SET is_gm=? WHERE id=?').run(isGmValue ? 1 : 0, target.id);
    logAudit(db, gm.account.id, gm.account.username, 'GM_ROLE_CHANGE', 'account', target.id, { isGm: isGmValue });
    res.json({ username: target.username, isGm: isGmValue, updatedBy: gm.account.username });
  } catch (e) {
    console.error('admin gm role:', e);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ───────────────────── POST /api/admin/death-cooldown-exemption ─────────────────────
app.post('/api/admin/death-cooldown-exemption', (req, res) => {
  const gm = requireGm(req, res); if (!gm) return;
  try {
    const { username } = req.body || {};
    const bypassValue = req.body?.bypass ?? req.body?.exempt ?? req.body?.enabled;
    const targetUsername = String(username || '').trim();

    if (!targetUsername) return res.status(400).json({ error: 'Username alvo é obrigatório' });
    if (typeof bypassValue !== 'boolean') return res.status(400).json({ error: 'Informe bypass/exempt/enabled como booleano' });

    const target = db.prepare('SELECT id, username, death_cooldown_until, bypass_death_cooldown FROM accounts WHERE username=? COLLATE NOCASE').get(targetUsername);
    if (!target) return res.status(404).json({ error: 'Conta não encontrada' });

    db.prepare(`
      UPDATE accounts
      SET bypass_death_cooldown=?,
          death_cooldown_until=CASE WHEN ?=1 THEN NULL ELSE death_cooldown_until END
      WHERE id=?
    `).run(bypassValue ? 1 : 0, bypassValue ? 1 : 0, target.id);

    logAudit(db, gm.account.id, gm.account.username, 'DEATH_COOLDOWN_EXEMPTION', 'account', target.id, { bypass: bypassValue });

    res.json({
      username: target.username,
      bypassDeathCooldown: bypassValue,
      cooldownCleared: !!target.death_cooldown_until && bypassValue,
      updatedBy: gm.account.username,
    });
  } catch (e) {
    console.error('admin death cooldown exemption:', e);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ─────────────────────────── GET /api/admin/session ────────────────────────
app.get('/api/admin/session', (req, res) => {
  const gm = requireGm(req, res); if (!gm) return;
  res.json({ accountId: gm.account.id, username: gm.account.username, isGm: true });
});

// ─────────────────────────── GET /api/admin/config ──────────────────────────
app.get('/api/admin/config', (req, res) => {
  const gm = requireGm(req, res); if (!gm) return;
  try {
    res.json({ configs: listConfigEntries() });
  } catch (e) {
    console.error('admin config list:', e);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ─────────────────────── GET /api/admin/config/audit ────────────────────────
app.get('/api/admin/config/audit', (req, res) => {
  const gm = requireGm(req, res); if (!gm) return;
  try {
    const limit = Number(req.query.limit) || 50;
    if (!Number.isInteger(limit) || limit < 1 || limit > 500)
      return res.status(400).json({ error: 'limit deve ser inteiro entre 1 e 500.' });
    res.json({ entries: listAuditEntries(limit) });
  } catch (e) {
    console.error('admin config audit:', e);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ─────────────────────────── POST /api/admin/config ─────────────────────────
app.post('/api/admin/config', (req, res) => {
  const gm = requireGm(req, res); if (!gm) return;
  try {
    const body = req.body || {};

    // Aceita { key, value } (único) ou { changes: [{key, value}, ...] } (lote)
    let changes;
    if (Array.isArray(body.changes)) {
      changes = body.changes;
    } else if (body.key !== undefined) {
      changes = [{ key: body.key, value: body.value }];
    } else {
      return res.status(400).json({ error: 'Informe { key, value } ou { changes: [{key, value}] }.' });
    }

    if (changes.length === 0)
      return res.status(400).json({ error: 'Nenhuma mudanca fornecida.' });
    if (changes.length > 50)
      return res.status(400).json({ error: 'Maximo de 50 mudancas por requisicao.' });

    // Validar estrutura básica de cada entry antes de passar ao manager
    for (const entry of changes) {
      if (typeof entry.key !== 'string' || !entry.key.trim())
        return res.status(400).json({ error: 'Cada entrada deve ter "key" (string).' });
      if (entry.value === undefined)
        return res.status(400).json({ error: `"value" ausente para a chave "${entry.key}".` });
    }

    const result = updateConfigs(changes, { id: gm.account.id, username: gm.account.username });
    if (!result.ok)
      return res.status(400).json({ error: 'Erros de validacao.', errors: result.errors });

    res.json({ ok: true, updated: result.updated, updatedBy: gm.account.username });
  } catch (e) {
    console.error('admin config update:', e);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ─────────────────────────── GET /api/character ────────────────────────────
app.get('/api/character', (req, res) => {
  const p = verifyAuth(req, res); if (!p) return;
  const c = db.prepare('SELECT * FROM characters WHERE account_id=? AND is_alive=1').get(p.accountId);
  if (!c) return res.status(404).json({ error: 'Sem personagem ativa' });
  res.json({ character: parseChar(c) });
});

// ─────────────────────────── POST /api/character/create ────────────────────
app.post('/api/character/create', (req, res) => {
  const p = verifyAuth(req, res); if (!p) return;
  try {
    const { name, gender } = req.body || {};
    const n = String(name || '').trim();
    if (n.length < 2 || n.length > 24) return res.status(400).json({ error: 'Nome: 2–24 caracteres' });
    if (!['M','F','N'].includes(gender))  return res.status(400).json({ error: 'Gênero inválido' });

    const existing = db.prepare('SELECT id FROM characters WHERE account_id=? AND is_alive=1').get(p.accountId);
    if (existing) return res.status(400).json({ error: 'Já possui personagem ativa' });

    const acc = db.prepare('SELECT death_cooldown_until, bypass_death_cooldown FROM accounts WHERE id=?').get(p.accountId);
    if (getDeathCooldownState(acc)) return res.status(403).json({ error: 'Ainda em cooldown de morte' });

    const BIOMES  = ['forest','forest','forest','plains','plains','plains','mountain','mountain','desert','desert','water','city','anomaly'];
    const biome   = pick(BIOMES);

    const SURNAMES = { forest:['Ashbark','Moonshadow','Deeproot','Thornwood'], desert:['Sandforge','Dustwalker','Sunscorch'], mountain:['Ironpeak','Stonecrest','Greymantle'], city:['Aldenvale','Blackwood','Mercer','Dawnshire'], water:['Wavecrest','Deepmourne','Tidesong'], plains:['Swiftfield','Greenmantle','Windrunner'], anomaly:['Voidmark','Riftborn','Ashenveil'] };
    const PROFS    = { forest:['Caçador','Druida','Arqueiro'], desert:['Nômade','Alquimista','Ladino'], mountain:['Ferreiro','Mineiro','Guardião'], city:['Mercador','Escriba','Nobre'], water:['Marinheiro','Pescador','Pirata'], plains:['Cavaleiro','Fazendeiro','Bardo'], anomaly:['Aberração','Caçador de Anomalias','Mago Fraturado'] };
    const TRAITS   = { forest:[['Cauteloso','Ágil','Solitário']], desert:[['Resistente','Astuto','Silencioso']], mountain:[['Teimoso','Forte','Honrado']], city:[['Político','Carismático','Ambicioso']], water:[['Adaptável','Livre','Misterioso']], plains:[['Corajoso','Leal','Honesto']], anomaly:[['Imprevisível','Poderoso','Raro']] };
    const STATS    = { forest:{hp:90,atk:12,def:6,spd:8}, desert:{hp:95,atk:10,def:7,spd:9}, mountain:{hp:120,atk:14,def:10,spd:5}, city:{hp:80,atk:9,def:8,spd:7}, water:{hp:85,atk:11,def:6,spd:10}, plains:{hp:100,atk:12,def:8,spd:7}, anomaly:{hp:110,atk:15,def:5,spd:8} };
    const FAMILY   = ['irmão desaparecido','irmã que busca vingança','pai ausente','mãe misteriosa','primo rival'];

    const surname = pick(SURNAMES[biome]);
    const prof    = pick(PROFS[biome]);
    const traits  = pick(TRAITS[biome]);
    const stats   = STATS[biome];
    const family  = pick(FAMILY);
    const loadout = getStarterLoadout(prof, biome);
    const initialSkillXp = {};
    Object.values(loadout.equipment).forEach(item => {
      if (!item?.discipline) return;
      initialSkillXp[item.discipline] = (initialSkillXp[item.discipline] || 0) + 18;
    });

    const { mapX, mapY, seed, spawn } = reserveBirthMap(biome);
    const posX = spawn.x;
    const posY = spawn.y;

    db.prepare('INSERT INTO world_maps (map_x,map_y,biome,seed) VALUES (?,?,?,?)').run(mapX, mapY, biome, seed);

    const { lastInsertRowid } = db.prepare(`
      INSERT INTO characters (account_id,name,surname,gender,biome,profession,traits,
        map_x,map_y,pos_x,pos_y,hp,max_hp,mp,max_mp,atk,def,spd,family_slot,inventory,equipment,skills,skill_xp,status_effects)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,50,50,?,?,?, ?,?,?,?,?,?)
    `).run(p.accountId, n, surname, gender, biome, prof, JSON.stringify(traits),
           mapX, mapY, posX, posY, stats.hp, stats.hp, stats.atk, stats.def, stats.spd,
           JSON.stringify({ type: family, filled: false }), JSON.stringify(loadout.inventory), JSON.stringify(loadout.equipment), '[]', JSON.stringify(initialSkillXp), '[]');

    db.prepare('UPDATE accounts SET death_cooldown_until=NULL WHERE id=?').run(p.accountId);
    db.prepare(`INSERT INTO chronicles (event_type,description,actors,map_x,map_y) VALUES (?,?,?,?,?)`)
      .run('birth', `${n} ${surname} nasceu nas terras ${biome}.`, JSON.stringify([`${n} ${surname}`]), mapX, mapY);
    console.log(`[spawn] character=${n} ${surname} biome=${biome} map=${mapX},${mapY} seed=${seed} spawn=${posX},${posY}`);

    const c = db.prepare('SELECT * FROM characters WHERE id=?').get(lastInsertRowid);
    res.json({ character: parseChar(c) });
  } catch (e) { console.error('create char:', e); res.status(500).json({ error: 'Erro interno' }); }
});

// ─────────────────────────── GET /api/worldmap ─────────────────────────────
app.get('/api/worldmap', (req, res) => {
  const p = verifyAuth(req, res); if (!p) return;
  const zones = db.prepare('SELECT map_x, map_y, biome, settlement_stage FROM world_maps ORDER BY id').all();
  const char  = db.prepare('SELECT map_x, map_y FROM characters WHERE account_id=? AND is_alive=1').get(p.accountId);
  res.json({ zones, current: char ? { x: char.map_x, y: char.map_y } : null });
});

// ─────────────────────────── GET /api/character/sheet ────────────────────────
app.get('/api/character/sheet', (req, res) => {
  const p = verifyAuth(req, res); if (!p) return;
  const c = db.prepare('SELECT * FROM characters WHERE account_id=? AND is_alive=1').get(p.accountId);
  if (!c) return res.status(404).json({ error: 'Sem personagem ativa' });
  const character = parseChar(c);
  const chronicles = db.prepare(
    "SELECT event_type, description, created_at FROM chronicles WHERE actors LIKE ? ORDER BY created_at DESC LIMIT 15"
  ).all(`%${c.name}%`);
  const playerRef = { charId: c.id, name: `${c.name} ${c.surname}` };
  const npcCache = new Map();
  const relationships = db.prepare(`
    SELECT *
    FROM npc_relationships
    WHERE char_id=?
    ORDER BY affinity DESC, conversation_count DESC, last_interaction_at DESC
    LIMIT 12
  `).all(c.id).map(row => hydrateRelationshipEntry(row, playerRef, npcCache));
  const quests = db.prepare(`
    SELECT npc_key, npc_name, quest_id, title, summary, objective_type, objective_item_id, objective_item_name,
           required_qty, state, reward_gold, reward_item_id, reward_item_name, reward_item_qty, reward_note,
           accepted_at, completed_at
    FROM npc_quests
    WHERE char_id=?
    ORDER BY CASE WHEN state='completed' THEN 1 ELSE 0 END, accepted_at DESC
  `).all(c.id).map(row => {
    const currentQty = row.objective_type === 'deliver'
      ? countInventoryItem(character.inventory || [], row.objective_item_id)
      : 0;
    const ready = row.state !== 'completed' && currentQty >= Number(row.required_qty || 0);
    return {
      npcKey: row.npc_key,
      npcName: row.npc_name,
      questId: row.quest_id,
      title: row.title,
      summary: row.summary,
      objectiveType: row.objective_type,
      objectiveItemId: row.objective_item_id,
      objectiveItemName: row.objective_item_name,
      requiredQty: Number(row.required_qty || 0),
      currentQty: Math.min(currentQty, Number(row.required_qty || 0)),
      state: row.state === 'completed' ? 'completed' : (ready ? 'ready_to_turn_in' : row.state),
      rewardGold: Number(row.reward_gold || 0),
      rewardItemId: row.reward_item_id || '',
      rewardItemName: row.reward_item_name || '',
      rewardItemQty: Number(row.reward_item_qty || 0),
      rewardNote: row.reward_note || '',
      acceptedAt: row.accepted_at,
      completedAt: row.completed_at,
    };
  });
  res.json({ character, chronicles, relationships, quests });
});

// ─────────────────────────── WebSocket ─────────────────────────────────────
wss.on('connection', ws => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', raw => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'auth') {
      try {
        const tok  = String(msg.token || '');
        const payload = jwt.verify(tok, JWT_SECRET);
        const c    = db.prepare('SELECT * FROM characters WHERE account_id=? AND is_alive=1').get(payload.accountId);
        if (!c) { ws.send(JSON.stringify({ type:'error', msg:'Sem personagem ativa' })); return; }
        ws.accountId = payload.accountId;
        ws.username  = payload.username;
        ws.charId    = c.id;
        world.addPlayer(ws, c);
      } catch { ws.send(JSON.stringify({ type:'error', msg:'Token inválido' })); }
      return;
    }

    if (!ws.charId) return;
    world.handleMessage(ws, msg);
  });

  ws.on('close', () => { if (ws.charId) world.removePlayer(ws); });
  ws.on('error', err => { console.error('ws:', err.message); if (ws.charId) world.removePlayer(ws); });
});

// Heartbeat — detect dead sockets
setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) { ws.terminate(); return; }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

server.listen(PORT, () => console.log(`╔══════════════════════════════════════════╗
║  Aeterra: World Breaker                  ║
║  http://localhost:${PORT}                  ║
╚══════════════════════════════════════════╝`));
