// server/gameWorld.js — Aeterra: World Breaker Game State Manager
'use strict';

const { generateMap, T, SOLID, MONSTERS, MAP_W, MAP_H, findSafeSpawn, isSafeSpawnTile, calcMapRank, generateMapName, mapHasMonument } = require('./worldGen');
const { calcDamage, rollCrit, applyExp } = require('./combat');
const {
  STATUS_DEFS,
  safeParseJson,
  createItem,
  normalizeInventory,
  storeItem,
  countInventoryItem,
  consumeInventoryItem,
  refreshDerivedStats,
  serializePlayerState,
  grantDisciplineXp,
  grantActivityXp,
  getActivityBonus,
  pickCropForBiome,
  createCropHarvest,
  applyStatus,
  tickStatusEffects,
  rollMonsterItemDrops,
  rollChestLoot,
  generateNpcs,
  buildNpcQuestContract,
  equipInventoryItem,
  unequipSlot,
  dominantDiscipline,
} = require('./gameSystems');
const { NpcDialogueService } = require('./npcAI');
const { getOrGenerateLore, getProceduralLore } = require('./mapLore');
const { getConfig } = require('./config');

// GAME_START_TS é constante de runtime do servidor (não configurável via banco)
const GAME_START_TS = Date.now();

const TILE_LABELS = {
  [T.GRASS]: 'gramado',
  [T.TREE]: 'mata fechada',
  [T.WATER]: 'agua',
  [T.ROCK]: 'pedra',
  [T.PATH]: 'estrada',
  [T.SAND]: 'areia',
  [T.WALL]: 'parede antiga',
  [T.FLOOR]: 'piso antigo',
  [T.DOOR]: 'porta',
  [T.CHEST]: 'bau',
  [T.DUNGEON]: 'entrada de dungeon',
  [T.TALL_GRASS]: 'vegetacao alta',
  [T.MONUMENT]: 'pedra de inscricoes',
};

function getGameTime() {
  const elapsed   = (Date.now() - GAME_START_TS) / 1000;
  const totalMins = Math.floor(elapsed * getConfig('game.gameMinutesPerSecond'));
  const totalDays = Math.floor(totalMins / 1440);
  const hour      = Math.floor((totalMins % 1440) / 60);
  return {
    hour,
    minute: totalMins % 60,
    day: (totalDays % 365) + 1,
    year: Math.floor(totalDays / 365) + 1,
    isNight: hour < 6 || hour >= 20,
  };
}

function calcMaxStamina(level, spd) {
  return 100 + (level - 1) * 5 + spd * 2;
}

const AFFINITY = {
  forest: { forest: 6, plains: 3, mountain: 2, water: 1, desert: 0, city: 1, anomaly: 0 },
  desert: { desert: 6, plains: 2, mountain: 1, anomaly: 1, forest: 0, water: 0, city: 1 },
  mountain: { mountain: 6, forest: 2, plains: 1, anomaly: 1, desert: 1, water: 1, city: 0 },
  city: { city: 2, plains: 4, water: 2, forest: 1, mountain: 1, desert: 0, anomaly: 0 },
  water: { water: 7, plains: 2, forest: 1, mountain: 1, desert: 0, city: 0, anomaly: 0 },
  plains: { plains: 4, forest: 2, water: 2, mountain: 1, desert: 1, city: 2, anomaly: 0 },
  anomaly: { anomaly: 3, mountain: 2, forest: 1, desert: 1, plains: 1, water: 1, city: 0 },
};

class GameWorld {
  constructor(db) {
    this.db = db;
    this.rooms = new Map();
    this.sockets = new Map();
    this.dialogueService = new NpcDialogueService(db);
    this._tid = setInterval(() => this._tick(), getConfig('game.tickMs'));
  }

  _loadMapState(value) {
    const parsed = safeParseJson(value, {});
    return {
      version: 1,
      tileOverrides: parsed?.tileOverrides && typeof parsed.tileOverrides === 'object' ? parsed.tileOverrides : {},
      sites: parsed?.sites && typeof parsed.sites === 'object' ? parsed.sites : {},
      cooldowns: parsed?.cooldowns && typeof parsed.cooldowns === 'object' ? parsed.cooldowns : {},
    };
  }

  _applyMapStateToTiles(tiles, mapState) {
    Object.entries(mapState.tileOverrides || {}).forEach(([rawIndex, rawTile]) => {
      const index = Number(rawIndex);
      const tile = Number(rawTile);
      if (!Number.isInteger(index) || index < 0 || index >= tiles.length) return;
      if (!Number.isInteger(tile)) return;
      tiles[index] = tile;
    });
  }

  _saveMapState(room) {
    const now = Date.now();
    Object.entries(room.mapState.cooldowns || {}).forEach(([key, value]) => {
      if (!value || value <= now) delete room.mapState.cooldowns[key];
    });

    this.db.prepare('UPDATE world_maps SET map_state=? WHERE map_x=? AND map_y=?').run(
      JSON.stringify(room.mapState || {}),
      room.mapX,
      room.mapY
    );
  }

  _recordVisitor(room, player) {
    const row = this.db.prepare('SELECT visitors, achievements FROM world_maps WHERE map_x=? AND map_y=?').get(room.mapX, room.mapY);
    if (!row) return;

    const visitors    = safeParseJson(row.visitors, []);
    const achievements = safeParseJson(row.achievements, []);

    const alreadyVisited = visitors.some(v => v.charId === player.charId);
    if (alreadyVisited) return;

    const isFirstEver = visitors.length === 0;
    visitors.push({ charId: player.charId, name: player.name, visitedAt: new Date().toISOString() });

    if (isFirstEver) {
      achievements.push(`Primeiro Desbravador: ${player.name}`);
      // Reward: small exp/gold bonus for first visitor
      player.gold += 10;
      player.exp  += 20;
      const ws = this.sockets.get(player.charId);
      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'chat', sender: 'Mundo', text: `✦ Você é o primeiro a explorar ${room.name}! +10 ouro, +20 EXP.`, color: '#f0c040', system: true }));
      }
    }

    this.db.prepare('UPDATE world_maps SET visitors=?, achievements=? WHERE map_x=? AND map_y=?')
      .run(JSON.stringify(visitors.slice(-50)), JSON.stringify(achievements), room.mapX, room.mapY);
  }

  _emitMapInfo(ws, room) {
    const row = this.db.prepare('SELECT lore, visitors, achievements, rank, name FROM world_maps WHERE map_x=? AND map_y=?').get(room.mapX, room.mapY);
    if (!row) return;

    const visitors     = safeParseJson(row.visitors, []);
    const achievements = safeParseJson(row.achievements, []);
    const lore         = row.lore || null;

    const alreadyVisited = visitors.some(v => v.charId === ws.player.charId);

    ws.send(JSON.stringify({
      type: 'map_info',
      name: row.name || room.name,
      rank: row.rank || room.rank,
      biome: room.biome,
      lore,
      visitors: visitors.slice(-10).map(v => ({ name: v.name, visitedAt: v.visitedAt })),
      achievements,
      isFirstVisit: !alreadyVisited,
      hasMonument: mapHasMonument(row.rank || room.rank, room.biome),
    }));

    // Trigger async lore generation if missing (rank B+ or city)
    const rank = row.rank || room.rank;
    const needsLore = !row.lore && (mapHasMonument(rank, room.biome));
    if (needsLore) {
      const mapName = row.name || room.name;
      getOrGenerateLore(this.db, room.mapX, room.mapY, room.biome, rank, mapName)
        .then(generatedLore => {
          // Push lore update once ready
          if (ws.readyState === 1) {
            ws.send(JSON.stringify({ type: 'map_lore_ready', lore: generatedLore }));
          }
        })
        .catch(e => console.error('mapLore async error:', e));
    }
  }

  _serializeActivitySites(room) {
    const now = Date.now();
    return Object.fromEntries(Object.entries(room.mapState?.sites || {}).map(([key, site]) => {
      if (!site) return [key, null];
      const cropReady = !!site.crop && (site.crop.readyAt || 0) <= now;
      return [key, {
        kind: site.kind,
        fertility: site.fertility,
        source: site.source,
        crop: site.crop ? {
          id: site.crop.id,
          name: site.crop.name,
          readyAt: site.crop.readyAt,
          ready: cropReady,
        } : null,
        stage: site.crop ? (cropReady ? 'ready' : 'growing') : 'cleared',
      }];
    }).filter(([, site]) => !!site));
  }

  _sendSiteUpdate(room, index) {
    const site = this._serializeActivitySites(room)[String(index)] || null;
    this._broadcast(room, { type: 'site_update', idx: index, site });
  }

  _refreshRoomContexts(room) {
    room.players.forEach((player, charId) => {
      const ws = this.sockets.get(charId);
      if (ws && ws.readyState === 1) this._pushInteractionContext(ws);
    });
  }

  _setTile(room, index, tile) {
    room.tiles[index] = tile;
    room.mapState.tileOverrides[index] = tile;
    this._saveMapState(room);
    this._broadcast(room, { type: 'tile_change', idx: index, tile });
    this._refreshRoomContexts(room);
  }

  _setSite(room, index, site) {
    if (site) room.mapState.sites[index] = site;
    else delete room.mapState.sites[index];
    this._saveMapState(room);
    this._sendSiteUpdate(room, index);
    this._refreshRoomContexts(room);
  }

  _getCooldown(room, activityId, tileIndex) {
    const until = Number(room.mapState?.cooldowns?.[`${activityId}:${tileIndex}`] || 0);
    return Math.max(0, until - Date.now());
  }

  _setCooldown(room, activityId, tileIndex, durationMs) {
    room.mapState.cooldowns[`${activityId}:${tileIndex}`] = Date.now() + durationMs;
    this._saveMapState(room);
    this._refreshRoomContexts(room);
  }

  _getRoom(mapX, mapY) {
    const key = `${mapX},${mapY}`;
    if (this.rooms.has(key)) return this.rooms.get(key);

    let row = this.db.prepare('SELECT * FROM world_maps WHERE map_x=? AND map_y=?').get(mapX, mapY);
    if (!row) {
      const biome = this._pickBiome(mapX, mapY);
      const seed = Math.floor(Math.random() * 2147483647);
      this.db.prepare('INSERT INTO world_maps (map_x,map_y,biome,seed) VALUES (?,?,?,?)').run(mapX, mapY, biome, seed);
      row = this.db.prepare('SELECT * FROM world_maps WHERE map_x=? AND map_y=?').get(mapX, mapY);
    }

    const data = generateMap(mapX, mapY, row.biome, row.seed);
    const mapState = this._loadMapState(row.map_state);
    this._applyMapStateToTiles(data.tiles, mapState);
    const rank = calcMapRank(mapX, mapY, row.biome);
    const name = row.name || generateMapName(mapX, mapY, row.biome, row.seed);
    // Persist name if missing
    if (!row.name) {
      this.db.prepare('UPDATE world_maps SET name=?, rank=? WHERE map_x=? AND map_y=?').run(name, rank, mapX, mapY);
    }
    const room = {
      key,
      mapX,
      mapY,
      biome: data.biome,
      tiles: data.tiles,
      width: MAP_W,
      height: MAP_H,
      players: new Map(),
      monsters: new Map(),
      npcs: new Map(),
      mapState,
      rank,
      name,
    };

    data.monsters.forEach(monster => room.monsters.set(monster.id, this._hydrateMonster(monster)));
    generateNpcs({ mapX, mapY, biome: row.biome, seed: row.seed, tiles: data.tiles, width: MAP_W, height: MAP_H })
      .forEach(npc => room.npcs.set(npc.id, npc));

    this.rooms.set(key, room);
    return room;
  }

  _pickBiome(x, y) {
    const scores = { forest: 1, desert: 1, mountain: 1, city: 0.5, water: 1, plains: 2, anomaly: 0.2 };
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const row = this.db.prepare('SELECT biome FROM world_maps WHERE map_x=? AND map_y=?').get(x + dx, y + dy);
      if (row) Object.entries(AFFINITY[row.biome] || {}).forEach(([biome, weight]) => { scores[biome] = (scores[biome] || 0) + weight; });
    }
    scores.anomaly = Math.min(scores.anomaly, 0.5);
    let roll = Math.random() * Object.values(scores).reduce((sum, value) => sum + value, 0);
    for (const [biome, weight] of Object.entries(scores)) {
      roll -= weight;
      if (roll <= 0) return biome;
    }
    return 'plains';
  }

  addPlayer(ws, char) {
    const room = this._getRoom(char.map_x, char.map_y);
    const player = {
      id: `p_${char.id}`,
      charId: char.id,
      accountId: ws.accountId,
      name: `${char.name} ${char.surname}`,
      type: 'player',
      char: '◉',
      x: char.pos_x,
      y: char.pos_y,
      hp: char.hp,
      mp: char.mp,
      baseMaxHp: char.max_hp,
      baseMaxMp: char.max_mp,
      baseAtk: char.atk,
      baseDef: char.def,
      baseSpd: char.spd,
      atk: char.atk,
      def: char.def,
      spd: char.spd,
      maxHp: char.max_hp,
      maxMp: char.max_mp,
      level: char.level,
      exp: char.exp,
      gold: char.gold,
      biome: char.biome,
      profession: char.profession,
      gender: char.gender,
      traits: safeParseJson(char.traits, []),
      inventory: normalizeInventory(safeParseJson(char.inventory, []), getConfig('game.inventoryLimit')),
      equipment: safeParseJson(char.equipment, {}),
      kills: char.kills || 0,
      skills: safeParseJson(char.skills, []),
      skillXp: safeParseJson(char.skill_xp, {}),
      lifeSkills: safeParseJson(char.life_skills, {}),
      statusEffects: safeParseJson(char.status_effects, []),
      familySlot: safeParseJson(char.family_slot, {}),
      lastMove: 0,
      lastAtk: 0,
      lastMoveAt: Date.now(),
      stamina: 100,
      maxStamina: 100,
    };

    const relocated = this._relocatePlayerToSafeSpawn(room, player, 'player-login');
    if (relocated) {
      this.db.prepare('UPDATE characters SET pos_x=?, pos_y=? WHERE id=?').run(player.x, player.y, player.charId);
    }

    this._refreshPlayerBuild(player, true);

    room.players.set(char.id, player);
    this.sockets.set(char.id, ws);
    ws.room = room;
    ws.player = player;
    ws.activeNpcId = null;

    ws.send(JSON.stringify({
      type: 'init',
      map: { x: room.mapX, y: room.mapY, biome: room.biome, name: room.name, rank: room.rank, tiles: room.tiles, width: room.width, height: room.height, sites: this._serializeActivitySites(room) },
      entities: this._entities(room),
      playerId: player.id,
      time: getGameTime(),
    }));
    this._pushPlayerState(player, ws);
    this._pushInteractionContext(ws);
    this._recordVisitor(room, player);
    this._emitMapInfo(ws, room);
    this._broadcast(room, { type: 'player_join', entity: this._ent(player) }, char.id);
    this._broadcast(room, { type: 'chat', sender: 'Servidor', text: `${player.name} entrou no mapa.`, color: '#7a5e2a', system: true });
  }

  removePlayer(ws) {
    const { player, room } = ws;
    if (!player || !room) return;
    this._savePlayer(player);
    room.players.delete(player.charId);
    this.sockets.delete(player.charId);
    this._broadcast(room, { type: 'player_leave', entityId: player.id });
    if (room.players.size === 0) setTimeout(() => { if (room.players.size === 0) this.rooms.delete(room.key); }, 60000);
  }

  unstuckCharacter(charId, reason = 'dev-unstuck') {
    const row = this.db.prepare('SELECT id, map_x, map_y, pos_x, pos_y FROM characters WHERE id=? AND is_alive=1').get(charId);
    if (!row) return null;

    const ws = this.sockets.get(charId);
    const room = ws?.room || this._getRoom(row.map_x, row.map_y);
    const player = ws?.player || { id: `p_${charId}`, charId, x: row.pos_x, y: row.pos_y };
    const relocated = this._relocatePlayerToSafeSpawn(room, player, reason, true);
    if (!relocated) return null;

    this.db.prepare('UPDATE characters SET pos_x=?, pos_y=? WHERE id=?').run(player.x, player.y, charId);

    if (ws?.player) {
      this._broadcast(room, { type: 'entity_move', entityId: player.id, x: player.x, y: player.y });
      this._syncNpcFocus(ws, true);
      this._pushPlayerState(player, ws);
      ws.send(JSON.stringify({
        type: 'chat',
        sender: 'Servidor',
        text: `Reposicionamento de desenvolvimento aplicado em ${player.x},${player.y}.`,
        color: '#7a5e2a',
        system: true,
      }));
    }

    return { mapX: room.mapX, mapY: room.mapY, biome: room.biome, x: player.x, y: player.y, from: relocated.from };
  }

  _savePlayer(player) {
    this.db.prepare(`
      UPDATE characters
      SET pos_x=?, pos_y=?, hp=?, mp=?, exp=?, gold=?, level=?, atk=?, def=?, spd=?, max_hp=?, max_mp=?,
          inventory=?, equipment=?, kills=?, skills=?, skill_xp=?, life_skills=?, status_effects=?
      WHERE id=?
    `).run(
      player.x,
      player.y,
      player.hp,
      player.mp,
      player.exp,
      player.gold,
      player.level,
      player.baseAtk,
      player.baseDef,
      player.baseSpd,
      player.baseMaxHp,
      player.baseMaxMp,
      JSON.stringify(normalizeInventory(player.inventory || [], getConfig('game.inventoryLimit'))),
      JSON.stringify(player.equipment || {}),
      player.kills || 0,
      JSON.stringify(player.skills || []),
      JSON.stringify(player.skillXp || {}),
      JSON.stringify(player.lifeSkills || {}),
      JSON.stringify(player.statusEffects || []),
      player.charId
    );
  }

  handleMessage(ws, msg) {
    switch (msg.type) {
      case 'move': this._move(ws, msg); break;
      case 'attack': this._attack(ws, msg); break;
      case 'chat': this._chat(ws, msg); break;
      case 'interact': this._interact(ws, msg); break;
      case 'npc_chat': this._npcChat(ws, msg); break;
      case 'npc_service': this._npcService(ws, msg); break;
      case 'equip': this._equip(ws, msg); break;
      case 'unequip': this._unequip(ws, msg); break;
    }
  }

  _move(ws, msg) {
    const { player, room } = ws;
    const now = Date.now();
    const cd = Math.max(100, getConfig('game.moveCooldownMs') - player.spd * 8);
    if (now - player.lastMove < cd) return;

    const directions = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    const dir = directions[msg.dir];
    if (!dir) return;
    const [dx, dy] = dir;
    const nx = player.x + dx;
    const ny = player.y + dy;

    if (nx < 0 || ny < 0 || nx >= room.width || ny >= room.height) {
      const target = nx < 0
        ? [room.mapX - 1, room.mapY, room.width - 2, player.y]
        : nx >= room.width
          ? [room.mapX + 1, room.mapY, 1, player.y]
          : ny < 0
            ? [room.mapX, room.mapY - 1, player.x, room.height - 2]
            : [room.mapX, room.mapY + 1, player.x, 1];
      this._warpMap(ws, ...target);
      return;
    }

    const tile = room.tiles[ny * room.width + nx];
    if (SOLID.has(tile)) return;
    if (this._isOccupiedByNpc(room, nx, ny)) return;

    player.x = nx;
    player.y = ny;
    player.lastMove = now;
    player.lastMoveAt = now;

    this._syncNpcFocus(ws, true);

    if (tile === T.PATH && (nx === 0 || nx === room.width - 1 || ny === 0 || ny === room.height - 1)) {
      const target = ny === 0
        ? [room.mapX, room.mapY - 1, nx, room.height - 2]
        : ny === room.height - 1
          ? [room.mapX, room.mapY + 1, nx, 1]
          : nx === 0
            ? [room.mapX - 1, room.mapY, room.width - 2, ny]
            : [room.mapX + 1, room.mapY, 1, ny];
      this._warpMap(ws, ...target);
      return;
    }

    this._broadcast(room, { type: 'entity_move', entityId: player.id, x: player.x, y: player.y });
    this._pushInteractionContext(ws);
  }

  _warpMap(ws, nmx, nmy, npx, npy) {
    const { player, room } = ws;
    this._savePlayer(player);
    room.players.delete(player.charId);
    this._broadcast(room, { type: 'player_leave', entityId: player.id });

    this.db.prepare('UPDATE characters SET map_x=?,map_y=?,pos_x=?,pos_y=? WHERE id=?').run(nmx, nmy, npx, npy, player.charId);

    player.x = npx;
    player.y = npy;
    player.lastMoveAt = Date.now();
    const newRoom = this._getRoom(nmx, nmy);
    newRoom.players.set(player.charId, player);
    ws.room = newRoom;
    ws.activeNpcId = null;

    ws.send(JSON.stringify({
      type: 'map_change',
      map: { x: newRoom.mapX, y: newRoom.mapY, biome: newRoom.biome, name: newRoom.name, rank: newRoom.rank, tiles: newRoom.tiles, width: newRoom.width, height: newRoom.height, sites: this._serializeActivitySites(newRoom) },
      entities: this._entities(newRoom),
      playerId: player.id,
      time: getGameTime(),
    }));
    this._pushPlayerState(player, ws);
    this._pushInteractionContext(ws);
    this._recordVisitor(newRoom, player);
    this._emitMapInfo(ws, newRoom);
    ws.send(JSON.stringify({ type: 'npc_focus', npc: null }));
    this._broadcast(newRoom, { type: 'player_join', entity: this._ent(player) }, player.charId);
    this._broadcast(newRoom, { type: 'chat', sender: 'Servidor', text: `${player.name} chegou ao mapa.`, color: '#7a5e2a', system: true });
  }

  _attack(ws, msg) {
    const { player, room } = ws;
    const now = Date.now();
    const cd = Math.max(400, getConfig('game.attackCooldownMs') - player.spd * 30);
    if (now - player.lastAtk < cd) return;

    const staminaCost = 20;
    if (player.stamina < staminaCost) {
      if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'stamina_low' }));
      return;
    }

    const targetRef = this._resolveTarget(room, msg.targetId);
    if (!targetRef || targetRef.type === 'npc') return;
    const { entity: target, type: targetType } = targetRef;

    const dist = Math.max(Math.abs(player.x - target.x), Math.abs(player.y - target.y));
    if (dist > 1) return;

    player.lastAtk = now;
    player.stamina = Math.max(0, player.stamina - staminaCost);
    ws.send(JSON.stringify({ type: 'stamina_update', stamina: Math.floor(player.stamina), maxStamina: player.maxStamina }));

    const crit = rollCrit();
    const damage = calcDamage(player.atk, target.def, crit);
    target.hp = Math.max(0, target.hp - damage);

    this._broadcast(room, { type: 'combat', attackerId: player.id, targetId: target.id, damage, crit, targetHp: target.hp, targetMaxHp: target.maxHp });

    if (target.hp <= 0) {
      if (targetType === 'monster') this._killMonster(room, target, player, ws);
      else this._killPlayer(room, target, player);
      return;
    }

    if (targetType === 'monster') {
      target.state = 'aggro';
      target.targetId = player.id;
    }
  }

  _killMonster(room, monster, killer, killerWs) {
    room.monsters.delete(monster.id);

    const levelState = {
      biome: killer.biome,
      level: killer.level,
      exp: killer.exp,
      hp: killer.hp,
      maxHp: killer.baseMaxHp,
      atk: killer.baseAtk,
      def: killer.baseDef,
      spd: killer.baseSpd,
    };
    const levelled = applyExp(levelState, monster.exp);
    killer.level = levelState.level;
    killer.exp = levelState.exp;
    killer.hp = Math.min(levelState.hp, killer.maxHp);
    killer.baseMaxHp = levelState.maxHp;
    killer.baseAtk = levelState.atk;
    killer.baseDef = levelState.def;
    killer.baseSpd = levelState.spd;

    killer.gold += monster.gold;
    killer.kills = (killer.kills || 0) + 1;

    const discipline = dominantDiscipline(killer);
    const unlocked = grantDisciplineXp(killer, discipline, monster.exp + 5);
    const itemDrops = rollMonsterItemDrops(monster, room.biome, Math.random);
    const storedDrops = [];
    const lostDrops = [];

    itemDrops.forEach(item => {
      const stored = storeItem(killer.inventory, item, getConfig('game.inventoryLimit'));
      killer.inventory = stored.inventory;
      (stored.stored ? storedDrops : lostDrops).push(item);
    });

    if (Math.random() < getConfig('combat.focusedProcChance')) this._applyPlayerStatus(killer, 'focused', killerWs, monster.id);

    this._refreshPlayerBuild(killer, levelled);

    const drops = [{ item: 'Ouro', qty: monster.gold }, ...storedDrops.map(item => ({ item: item.name, qty: item.qty || 1 }))];
    if (lostDrops.length) {
      killerWs.send(JSON.stringify({ type: 'chat', sender: 'Sistema', text: `Inventario cheio: ${lostDrops.map(item => item.name).join(', ')} ficou no chao.`, color: '#cc8844', system: true }));
    }

    this._broadcast(room, { type: 'entity_death', entityId: monster.id, killerId: killer.id, drops, expGain: monster.exp, goldGain: monster.gold });
    this._pushPlayerState(killer, killerWs);

    if (levelled) {
      killerWs.send(JSON.stringify({
        type: 'level_up',
        level: killer.level,
        hp: killer.hp,
        maxHp: killer.maxHp,
        atk: killer.atk,
        def: killer.def,
        spd: killer.spd,
        maxStamina: killer.maxStamina,
      }));
      killerWs.send(JSON.stringify({ type: 'stamina_update', stamina: killer.maxStamina, maxStamina: killer.maxStamina }));
    }

    unlocked.forEach(skill => killerWs.send(JSON.stringify({ type: 'skill_unlock', skill })));

    const delay = 30000 + Math.floor(Math.random() * 30000);
    setTimeout(() => {
      if (!this.rooms.has(room.key)) return;
      const pool = MONSTERS[room.biome] || MONSTERS.plains;
      const template = pool[Math.floor(Math.random() * pool.length)];
      const monsterRespawn = this._spawnMonster(room, template, `m_${Date.now()}_${room.mapX}_${room.mapY}`);
      if (!monsterRespawn) return;
      room.monsters.set(monsterRespawn.id, monsterRespawn);
      this._broadcast(room, { type: 'entity_spawn', entity: this._ent(monsterRespawn) });
    }, delay);
  }

  _killPlayer(room, victim, killer) {
    this.db.prepare("UPDATE characters SET is_alive=0, died_at=datetime('now'), hp=0 WHERE id=?").run(victim.charId);
    this.db.prepare(`
      UPDATE accounts
      SET death_cooldown_until=CASE
        WHEN bypass_death_cooldown=1 THEN NULL
        ELSE datetime('now','+1 day')
      END
      WHERE id=?
    `).run(victim.accountId);
    this.db.prepare('INSERT INTO chronicles (event_type,description,actors,map_x,map_y) VALUES (?,?,?,?,?)')
      .run('death', `${victim.name} foi morto por ${killer.name}.`, JSON.stringify([victim.name, killer.name]), room.mapX, room.mapY);

    this._broadcast(room, { type: 'entity_death', entityId: victim.id, killerId: killer.id, isPlayer: true, victimName: victim.name });

    const ws = this.sockets.get(victim.charId);
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'you_died', killerName: killer.name }));
      ws.send(JSON.stringify({ type: 'npc_focus', npc: null }));
    }

    room.players.delete(victim.charId);
    this.sockets.delete(victim.charId);
  }

  _chat(ws, msg) {
    const text = String(msg.text || '').trim().slice(0, 140);
    if (!text) return;
    this._broadcast(ws.room, { type: 'chat', sender: ws.player.name, text, color: '#c9a84c' });
  }

  async _npcChat(ws, msg) {
    const text = String(msg.text || '').trim().slice(0, 280);
    if (!text) return;
    const npc = this._findNearbyNpc(ws.player, ws.room, msg.npcId || ws.activeNpcId, 3);
    if (!npc) {
      ws.send(JSON.stringify({ type: 'npc_focus', npc: null }));
      return;
    }

    ws.activeNpcId = npc.id;
    const reply = await this.dialogueService.respond({
      npc,
      player: ws.player,
      room: { mapX: ws.room.mapX, mapY: ws.room.mapY, biome: ws.room.biome, biomeLabel: ws.room.biome },
      prompt: text,
    });
    ws.send(JSON.stringify({ type: 'npc_dialogue', npc: this._npcSummary(npc, ws.player, reply.relation), text: reply.text, source: reply.source }));
  }

  _npcService(ws, msg) {
    const npc = this._findNearbyNpc(ws.player, ws.room, msg?.npcId || ws.activeNpcId, 3);
    if (!npc) {
      ws.activeNpcId = null;
      ws.send(JSON.stringify({ type: 'npc_focus', npc: null }));
      return;
    }

    ws.activeNpcId = npc.id;
    switch (msg?.action) {
      case 'buy_item':
        this._buyNpcTradeItem(ws, npc, String(msg.offerId || ''));
        break;
      case 'accept_quest':
        this._acceptNpcQuest(ws, npc, String(msg.questId || ''));
        break;
      case 'turn_in_quest':
        this._turnInNpcQuest(ws, npc, String(msg.questId || ''));
        break;
      default:
        return;
    }

    ws.send(JSON.stringify({ type: 'npc_focus', npc: this._npcSummary(npc, ws.player) }));
    this._pushPlayerState(ws.player, ws);
  }

  _applyTradeDiscount(basePrice, discountPercent) {
    return Math.max(1, Math.ceil(Number(basePrice || 0) * (100 - Math.max(0, Number(discountPercent || 0))) / 100));
  }

  _buildNpcTradeOffers(npc, relation) {
    const discountPercent = Number(relation?.unlocks?.discountPercent || 0);
    return (npc.tradeStock || []).map(offer => ({
      ...offer,
      discountPercent,
      finalPrice: this._applyTradeDiscount(offer.basePrice, discountPercent),
    }));
  }

  _buildNpcQuestEntries(npc, player, relation) {
    const rows = this.db.prepare('SELECT * FROM npc_quests WHERE npc_key=? AND char_id=?').all(npc.npcId, player.charId);
    const rowMap = new Map(rows.map(row => [row.quest_id, row]));
    const unlockedQuestIds = new Set((relation?.unlocks?.localQuests || []).map(entry => entry.id));
    const entries = [];

    npc.questHooks.forEach(hook => {
      const row = rowMap.get(hook.id);
      if (!row && !unlockedQuestIds.has(hook.id)) return;
      entries.push(this._hydrateNpcQuestEntry(npc, player, buildNpcQuestContract(npc, hook), row));
    });

    rows.forEach(row => {
      if (entries.some(entry => entry.questId === row.quest_id)) return;
      entries.push(this._hydrateNpcQuestEntry(npc, player, {
        questId: row.quest_id,
        title: row.title,
        summary: row.summary,
        objectiveType: row.objective_type,
        objectiveItemId: row.objective_item_id,
        objectiveItemName: row.objective_item_name,
        requiredQty: Number(row.required_qty || 0),
        rewardGold: Number(row.reward_gold || 0),
        rewardItemId: row.reward_item_id || '',
        rewardItemName: row.reward_item_name || '',
        rewardItemQty: Number(row.reward_item_qty || 0),
        rewardNote: row.reward_note || '',
      }, row));
    });

    return entries;
  }

  _hydrateNpcQuestEntry(npc, player, contract, row) {
    const currentQty = contract.objectiveType === 'deliver'
      ? countInventoryItem(player.inventory || [], contract.objectiveItemId)
      : 0;
    const completed = row?.state === 'completed';
    const ready = !completed && currentQty >= Number(contract.requiredQty || 0);
    return {
      ...contract,
      npcKey: npc.npcId,
      npcName: npc.name,
      currentQty: Math.min(currentQty, Number(contract.requiredQty || 0)),
      state: completed ? 'completed' : row ? (ready ? 'ready_to_turn_in' : 'accepted') : 'available',
      canAccept: !row,
      canTurnIn: !!row && ready && row.state !== 'completed',
    };
  }

  _buyNpcTradeItem(ws, npc, offerId) {
    const relation = this.dialogueService.getRelationshipSnapshot(npc, ws.player);
    const offer = this._buildNpcTradeOffers(npc, relation).find(entry => entry.offerId === offerId);
    if (!offer) {
      ws.send(JSON.stringify({ type: 'chat', sender: npc.name, text: 'Nao tenho essa mercadoria separada para voce agora.', color: '#7fb7a3', system: true }));
      return;
    }
    if (ws.player.gold < offer.finalPrice) {
      ws.send(JSON.stringify({ type: 'chat', sender: npc.name, text: `Voce precisa de ${offer.finalPrice} ouro para levar ${offer.name}.`, color: '#7fb7a3', system: true }));
      return;
    }

    const item = createItem(offer.itemId, { qty: offer.qty || 1 });
    const stored = storeItem(ws.player.inventory, item, getConfig('game.inventoryLimit'));
    if (!stored.stored) {
      ws.send(JSON.stringify({ type: 'chat', sender: npc.name, text: 'Seu inventario esta cheio. Volte quando puder carregar mais.', color: '#7fb7a3', system: true }));
      return;
    }

    ws.player.inventory = stored.inventory;
    ws.player.gold -= offer.finalPrice;
    const unlocked = grantDisciplineXp(ws.player, 'civic', 8);
    this._refreshPlayerBuild(ws.player);
    ws.send(JSON.stringify({ type: 'chat', sender: npc.name, text: `${offer.name} saiu por ${offer.finalPrice} ouro${offer.discountPercent ? `, ja com ${offer.discountPercent}% de desconto` : ''}.`, color: '#7fb7a3', system: true }));
    unlocked.forEach(skill => ws.send(JSON.stringify({ type: 'skill_unlock', skill })));
  }

  _acceptNpcQuest(ws, npc, questId) {
    const relation = this.dialogueService.getRelationshipSnapshot(npc, ws.player);
    const hook = (relation.unlocks?.localQuests || []).find(entry => entry.id === questId);
    if (!hook) {
      ws.send(JSON.stringify({ type: 'chat', sender: npc.name, text: 'Ainda nao confio o bastante para pedir isso a voce.', color: '#7fb7a3', system: true }));
      return;
    }

    const existing = this.db.prepare('SELECT state FROM npc_quests WHERE npc_key=? AND char_id=? AND quest_id=?').get(npc.npcId, ws.player.charId, questId);
    if (existing?.state === 'completed') {
      ws.send(JSON.stringify({ type: 'chat', sender: npc.name, text: 'Esse favor ja foi quitado entre nos.', color: '#7fb7a3', system: true }));
      return;
    }
    if (existing) {
      ws.send(JSON.stringify({ type: 'chat', sender: npc.name, text: 'Voce ja esta com esse pedido em maos.', color: '#7fb7a3', system: true }));
      return;
    }

    const contract = buildNpcQuestContract(npc, hook);
    this.db.prepare(`
      INSERT INTO npc_quests (
        npc_key, char_id, npc_name, quest_id, title, summary, objective_type,
        objective_item_id, objective_item_name, required_qty, state,
        reward_gold, reward_item_id, reward_item_name, reward_item_qty, reward_note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'accepted', ?, ?, ?, ?, ?)
    `).run(
      npc.npcId,
      ws.player.charId,
      npc.name,
      contract.questId,
      contract.title,
      contract.summary,
      contract.objectiveType,
      contract.objectiveItemId,
      contract.objectiveItemName,
      contract.requiredQty,
      contract.rewardGold,
      contract.rewardItemId || null,
      contract.rewardItemName || null,
      contract.rewardItemQty || 0,
      contract.rewardNote || ''
    );

    ws.send(JSON.stringify({
      type: 'chat',
      sender: npc.name,
      text: `Entao esta combinado: traga ${contract.requiredQty}x ${contract.objectiveItemName}. Pago ${contract.rewardGold} ouro${contract.rewardItemName ? ` e ainda separo ${contract.rewardItemQty}x ${contract.rewardItemName}` : ''}.`,
      color: '#7fb7a3',
      system: true,
    }));
  }

  _turnInNpcQuest(ws, npc, questId) {
    const row = this.db.prepare('SELECT * FROM npc_quests WHERE npc_key=? AND char_id=? AND quest_id=?').get(npc.npcId, ws.player.charId, questId);
    if (!row) {
      ws.send(JSON.stringify({ type: 'chat', sender: npc.name, text: 'Nao tenho esse acordo registrado com voce.', color: '#7fb7a3', system: true }));
      return;
    }
    if (row.state === 'completed') {
      ws.send(JSON.stringify({ type: 'chat', sender: npc.name, text: 'Esse trato ja foi encerrado.', color: '#7fb7a3', system: true }));
      return;
    }

    const currentQty = countInventoryItem(ws.player.inventory || [], row.objective_item_id);
    if (currentQty < Number(row.required_qty || 0)) {
      ws.send(JSON.stringify({
        type: 'chat',
        sender: npc.name,
        text: `Ainda faltam ${Math.max(0, Number(row.required_qty || 0) - currentQty)}x ${row.objective_item_name}.`,
        color: '#7fb7a3',
        system: true,
      }));
      return;
    }

    const consumed = consumeInventoryItem(ws.player.inventory || [], row.objective_item_id, Number(row.required_qty || 0), getConfig('game.inventoryLimit'));
    if (!consumed.ok) return;
    ws.player.inventory = consumed.inventory;
    ws.player.gold += Number(row.reward_gold || 0);

    const rewardLoot = [{ item: 'Ouro', qty: Number(row.reward_gold || 0) }];
    if (row.reward_item_id && Number(row.reward_item_qty || 0) > 0) {
      const rewardItem = createItem(row.reward_item_id, { qty: Number(row.reward_item_qty || 0) });
      const stored = storeItem(ws.player.inventory, rewardItem, getConfig('game.inventoryLimit'));
      ws.player.inventory = stored.inventory;
      if (stored.stored) rewardLoot.push({ item: rewardItem.name, qty: rewardItem.qty || 1 });
      else {
        ws.send(JSON.stringify({ type: 'chat', sender: npc.name, text: `${rewardItem.name} ficou separado, mas seu inventario nao comporta agora.`, color: '#7fb7a3', system: true }));
      }
    }

    this.db.prepare('UPDATE npc_quests SET state=\'completed\', completed_at=datetime(\'now\') WHERE id=?').run(row.id);
    const unlocked = grantDisciplineXp(ws.player, 'civic', 16);
    this._refreshPlayerBuild(ws.player);
    ws.send(JSON.stringify({ type: 'loot', items: rewardLoot }));
    ws.send(JSON.stringify({ type: 'chat', sender: npc.name, text: `Bom trabalho. ${row.title} esta encerrada.`, color: '#7fb7a3', system: true }));
    unlocked.forEach(skill => ws.send(JSON.stringify({ type: 'skill_unlock', skill })));
  }

  _pushInteractionContext(ws) {
    if (!ws || ws.readyState !== 1 || !ws.player || !ws.room) return;
    ws.send(JSON.stringify({ type: 'interaction_context', context: this._buildInteractionContext(ws.player, ws.room) }));
  }

  _buildInteractionContext(player, room) {
    const tileIndex = player.y * room.width + player.x;
    const tile = room.tiles[tileIndex];
    const site = room.mapState?.sites?.[tileIndex] || null;
    const adjacent = this._getAdjacentTiles(player, room);
    const hasWaterAdjacent = adjacent.some(entry => entry.tile === T.WATER);
    const nearestTree = adjacent.find(entry => entry.tile === T.TREE);
    const miningSource = this._getMiningSource(room, tile, adjacent);
    const now = Date.now();
    const actions = [];

    if (tile === T.CHEST) {
      actions.push({ id: 'open_chest', activity: 'loot', label: 'Abrir bau', detail: 'Saquear ouro e suprimentos.', disabled: false, cooldownMs: 0 });
    }

    if (tile === T.MONUMENT) {
      actions.push({ id: 'read_monument', activity: 'lore', label: 'Examinar Inscricoes', detail: 'Uma pedra antiga coberta de inscricoes gravadas. Algo foi registrado aqui.', disabled: false, cooldownMs: 0 });
    }

    if (site?.kind === 'farm_plot' && site.crop) {
      const cropReady = (site.crop.readyAt || 0) <= now;
      actions.push({
        id: cropReady ? 'harvest_crop' : 'inspect_crop',
        activity: 'farming',
        label: cropReady ? `Colher ${site.crop.name}` : `Cultivo crescendo: ${site.crop.name}`,
        detail: cropReady ? 'A safra esta pronta para colheita.' : 'Retorne quando a plantacao amadurecer.',
        disabled: !cropReady,
        cooldownMs: cropReady ? 0 : Math.max(0, (site.crop.readyAt || now) - now),
      });
    } else if (site?.kind === 'farm_plot' && site.fertility === 'fertile') {
      actions.push({ id: 'plant_crop', activity: 'farming', label: 'Plantar no canteiro', detail: 'Usa o solo preparado para uma nova safra.', disabled: false, cooldownMs: 0 });
    } else if (!site && this._isNaturallyFertileTile(room, tile)) {
      actions.push({ id: 'plant_crop', activity: 'farming', label: 'Plantar em solo fertil', detail: 'O terreno permite cultivo sem desmatamento previo.', disabled: false, cooldownMs: 0 });
    }

    if (!site && room.biome === 'forest' && nearestTree && (tile === T.GRASS || tile === T.TALL_GRASS)) {
      actions.push({ id: 'clear_land', activity: 'farming', label: 'Abrir clareira', detail: 'Corta arvores proximas para transformar o local em canteiro fertil.', disabled: false, cooldownMs: 0 });
    }

    if (hasWaterAdjacent) {
      const fishingCooldown = this._getCooldown(room, 'fishing', tileIndex);
      actions.push({
        id: 'fish',
        activity: 'fishing',
        label: 'Pescar',
        detail: 'Lanca linhas e armadilhas leves na agua ao lado.',
        disabled: fishingCooldown > 0,
        cooldownMs: fishingCooldown,
      });
    }

    if (miningSource) {
      const miningCooldown = this._getCooldown(room, 'mining', tileIndex);
      actions.push({
        id: 'mine',
        activity: 'mining',
        label: `Minerar ${miningSource.label}`,
        detail: miningSource.detail,
        disabled: miningCooldown > 0,
        cooldownMs: miningCooldown,
      });
    }

    return {
      tileIndex,
      tile,
      terrain: TILE_LABELS[tile] || 'terreno desconhecido',
      biome: room.biome,
      site: site ? (this._serializeActivitySites(room)[String(tileIndex)] || null) : null,
      actions,
    };
  }

  _getAdjacentTiles(player, room) {
    const entries = [];
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
      const x = player.x + dx;
      const y = player.y + dy;
      if (x < 0 || y < 0 || x >= room.width || y >= room.height) return;
      entries.push({ x, y, index: y * room.width + x, tile: room.tiles[y * room.width + x] });
    });
    return entries;
  }

  _isNaturallyFertileTile(room, tile) {
    return room.biome === 'plains' && (tile === T.GRASS || tile === T.TALL_GRASS);
  }

  _getMiningSource(room, tile, adjacent) {
    const nearDungeon = tile === T.DUNGEON || adjacent.some(entry => entry.tile === T.DUNGEON);
    if (nearDungeon) {
      return { kind: 'dungeon_vein', label: 'na dungeon', detail: 'Fragmentos antigos e metal se acumulam nas fendas da dungeon.' };
    }
    if (room.biome === 'mountain' && adjacent.some(entry => entry.tile === T.ROCK)) {
      return { kind: 'mountain_vein', label: 'na montanha', detail: 'As rochas expostas escondem pedra e metal bruto.' };
    }
    if (room.biome === 'forest' && adjacent.some(entry => entry.tile === T.WATER)) {
      return { kind: 'riverbed_deposit', label: 'no leito do rio', detail: 'Cascalho de rio pode esconder minerais valiosos.' };
    }
    return null;
  }

  _rollMiningLoot(sourceKind, player) {
    const bonus = getActivityBonus(player, 'mining');
    const table = {
      mountain_vein: ['stone_shard', 'copper_ore', 'iron_ore'],
      dungeon_vein: ['stone_shard', 'iron_ore', 'ancient_relic'],
      riverbed_deposit: ['stone_shard', 'copper_ore', 'ancient_relic'],
    }[sourceKind] || ['stone_shard'];
    const first = table[Math.floor(Math.random() * table.length)];
    const items = [createItem(first, { qty: 1 + (Math.random() < 0.25 ? 1 : 0) })];
    if (Math.random() < bonus.bonusYieldChance) {
      items.push(createItem(table[Math.floor(Math.random() * table.length)], { qty: 1 }));
    }
    return items;
  }

  _rollFishingLoot(player, biome) {
    const bonus = getActivityBonus(player, 'fishing');
    const table = {
      water: ['river_fish', 'silver_fish', 'cavern_eel'],
      forest: ['river_fish', 'silver_fish'],
      plains: ['river_fish', 'silver_fish'],
      mountain: ['river_fish', 'cavern_eel'],
      anomaly: ['silver_fish', 'cavern_eel'],
    }[biome] || ['river_fish'];
    const first = table[Math.floor(Math.random() * table.length)];
    const items = [createItem(first, { qty: 1 })];
    if (Math.random() < bonus.bonusYieldChance) items.push(createItem('river_fish', { qty: 1 }));
    return items;
  }

  _storeLoot(player, items) {
    const limit = getConfig('game.inventoryLimit');
    const storedItems = [];
    items.forEach(item => {
      const stored = storeItem(player.inventory, item, limit);
      player.inventory = stored.inventory;
      if (stored.stored) storedItems.push(item);
    });
    return storedItems;
  }

  _emitActivityProgress(ws, progress) {
    if (!progress?.activity) return;
    if (progress.levelUp) {
      ws.send(JSON.stringify({
        type: 'chat',
        sender: 'Oficio',
        text: `${progress.activity.name} avancou para o nivel ${progress.newLevel}.`,
        color: '#c9a84c',
        system: true,
      }));
    }
    (progress.unlocks || []).forEach(unlock => {
      ws.send(JSON.stringify({
        type: 'chat',
        sender: 'Oficio',
        text: `${progress.activity.name}: ${unlock.name} liberado.`,
        color: '#7fb7a3',
        system: true,
      }));
    });
  }

  _readMonument(ws) {
    const { room } = ws;
    const row = this.db.prepare('SELECT lore, rank, name FROM world_maps WHERE map_x=? AND map_y=?').get(room.mapX, room.mapY);
    const lore = row?.lore;

    if (lore) {
      ws.send(JSON.stringify({ type: 'monument_lore', name: row.name || room.name, rank: row.rank || room.rank, lore }));
    } else {
      // Lore not ready yet — show procedural while generating
      const { getProceduralLore } = require('./mapLore');
      const fallback = getProceduralLore(room.biome, room.rank, room.name);
      ws.send(JSON.stringify({ type: 'monument_lore', name: room.name, rank: room.rank, lore: fallback, generating: true }));

      const mapName = row?.name || room.name;
      const rank    = row?.rank  || room.rank;
      getOrGenerateLore(this.db, room.mapX, room.mapY, room.biome, rank, mapName)
        .then(generatedLore => {
          if (ws.readyState === 1) {
            ws.send(JSON.stringify({ type: 'monument_lore', name: mapName, rank, lore: generatedLore }));
          }
        })
        .catch(e => console.error('_readMonument lore error:', e));
    }

    const progress = grantDisciplineXp(ws.player, 'arcane', 8);
    this._refreshPlayerBuild(ws.player);
    if (progress?.length) progress.forEach(skill => ws.send(JSON.stringify({ type: 'skill_unlock', skill })));
  }

  _openChest(ws, tileIndex) {
    const { player, room } = ws;
    this._setTile(room, tileIndex, T.FLOOR);
    const gold = 5 + Math.floor(Math.random() * 20);
    const chestLoot = rollChestLoot(room.biome, Math.random);
    const storedItems = [];

    player.gold += gold;
    chestLoot.items.forEach(item => {
      const stored = storeItem(player.inventory, item, getConfig('game.inventoryLimit'));
      player.inventory = stored.inventory;
      if (stored.stored) storedItems.push(item);
    });

    const unlocked = grantDisciplineXp(player, room.biome === 'city' ? 'civic' : 'survival', 15);
    this._refreshPlayerBuild(player);
    if (chestLoot.bonusStatus) this._applyPlayerStatus(player, chestLoot.bonusStatus, ws, 'chest');

    ws.send(JSON.stringify({ type: 'loot', items: [{ item: 'Ouro', qty: gold }, ...storedItems.map(item => ({ item: item.name, qty: item.qty || 1 }))] }));
    unlocked.forEach(skill => ws.send(JSON.stringify({ type: 'skill_unlock', skill })));
  }

  _clearLand(ws, context) {
    const { player, room } = ws;
    const tileIndex = context.tileIndex;
    const adjacentTree = this._getAdjacentTiles(player, room).find(entry => entry.tile === T.TREE);
    if (!adjacentTree) return false;

    this._setTile(room, adjacentTree.index, T.GRASS);
    if (room.tiles[tileIndex] === T.TALL_GRASS) this._setTile(room, tileIndex, T.GRASS);
    this._setSite(room, tileIndex, {
      kind: 'farm_plot',
      fertility: 'fertile',
      source: 'forest_clearance',
      preparedAt: Date.now(),
      crop: null,
    });

    const loot = this._storeLoot(player, [createItem('wood_log', { qty: 1 + Math.floor(Math.random() * 2) }), createItem('wild_seed', { qty: 1 })]);
    const progress = grantActivityXp(player, 'farming', 14);
    this._emitActivityProgress(ws, progress);
    if (loot.length) ws.send(JSON.stringify({ type: 'loot', items: loot.map(item => ({ item: item.name, qty: item.qty || 1 })) }));
    ws.send(JSON.stringify({ type: 'chat', sender: 'Sistema', text: 'A clareira foi aberta e o terreno ficou pronto para cultivo.', color: '#7fb7a3', system: true }));
    return true;
  }

  _plantCrop(ws, context) {
    const { player, room } = ws;
    const tileIndex = context.tileIndex;
    const existingSite = room.mapState?.sites?.[tileIndex] || null;
    const crop = pickCropForBiome(room.biome, Math.random);
    const farmingBonus = getActivityBonus(player, 'farming');
    const baseGrowMs = Math.max(getConfig('game.minGrowthMs'), crop.growMs - farmingBonus.growReductionMs);
    const overrideGrowMs = Math.max(0, Number(process.env.MIN_GROWTH_MS) || 0);
    const growMs = overrideGrowMs > 0 ? Math.min(baseGrowMs, overrideGrowMs) : baseGrowMs;
    const readyAt = Date.now() + growMs;

    this._setSite(room, tileIndex, {
      kind: 'farm_plot',
      fertility: existingSite?.fertility || 'fertile',
      source: existingSite?.source || (room.biome === 'plains' ? 'natural_fertility' : 'prepared_soil'),
      preparedAt: existingSite?.preparedAt || Date.now(),
      crop: {
        id: crop.id,
        name: crop.name,
        plantedAt: Date.now(),
        readyAt,
      },
    });

    const progress = grantActivityXp(player, 'farming', 18);
    this._emitActivityProgress(ws, progress);
    ws.send(JSON.stringify({ type: 'chat', sender: 'Sistema', text: `${crop.name} foi plantado neste solo fertil.`, color: '#7fb7a3', system: true }));
    return true;
  }

  _harvestCrop(ws, context) {
    const { player, room } = ws;
    const tileIndex = context.tileIndex;
    const site = room.mapState?.sites?.[tileIndex];
    if (!site?.crop || (site.crop.readyAt || 0) > Date.now()) return false;

    const harvest = createCropHarvest(site.crop.id, Math.random, getActivityBonus(player, 'farming').bonusYieldChance);
    const stored = this._storeLoot(player, harvest);
    this._setSite(room, tileIndex, {
      kind: 'farm_plot',
      fertility: site.fertility || 'fertile',
      source: site.source || 'prepared_soil',
      preparedAt: site.preparedAt || Date.now(),
      crop: null,
    });

    const progress = grantActivityXp(player, 'farming', 26);
    this._emitActivityProgress(ws, progress);
    if (stored.length) ws.send(JSON.stringify({ type: 'loot', items: stored.map(item => ({ item: item.name, qty: item.qty || 1 })) }));
    ws.send(JSON.stringify({ type: 'chat', sender: 'Sistema', text: 'A colheita foi reunida com sucesso.', color: '#7fb7a3', system: true }));
    return true;
  }

  _mineSpot(ws, context) {
    const { player, room } = ws;
    const items = this._rollMiningLoot(this._getMiningSource(room, context.tile, this._getAdjacentTiles(player, room))?.kind, player);
    const stored = this._storeLoot(player, items);
    this._setCooldown(room, 'mining', context.tileIndex, getConfig('game.activityCooldowns').mining);
    const progress = grantActivityXp(player, 'mining', 16);
    this._emitActivityProgress(ws, progress);
    if (stored.length) ws.send(JSON.stringify({ type: 'loot', items: stored.map(item => ({ item: item.name, qty: item.qty || 1 })) }));
    ws.send(JSON.stringify({ type: 'chat', sender: 'Sistema', text: 'Voce extraiu material do terreno ao redor.', color: '#7a5e2a', system: true }));
    return true;
  }

  _fishSpot(ws, context) {
    const { player, room } = ws;
    const items = this._rollFishingLoot(player, room.biome);
    const stored = this._storeLoot(player, items);
    this._setCooldown(room, 'fishing', context.tileIndex, getConfig('game.activityCooldowns').fishing);
    const progress = grantActivityXp(player, 'fishing', 15);
    this._emitActivityProgress(ws, progress);
    if (stored.length) ws.send(JSON.stringify({ type: 'loot', items: stored.map(item => ({ item: item.name, qty: item.qty || 1 })) }));
    ws.send(JSON.stringify({ type: 'chat', sender: 'Sistema', text: 'A linha voltou com algo das aguas.', color: '#7a5e2a', system: true }));
    return true;
  }

  _interact(ws, msg) {
    const { player, room } = ws;
    if (!msg?.actionId) {
      const npc = this._findNearbyNpc(player, room, msg?.targetId || ws.activeNpcId, 2);
      if (npc) {
        ws.activeNpcId = npc.id;
        const summary = this._npcSummary(npc, player);
        ws.send(JSON.stringify({ type: 'npc_focus', npc: summary }));
        ws.send(JSON.stringify({ type: 'npc_dialogue', npc: summary, text: this.dialogueService.getGreeting(npc, player, room), source: 'greeting' }));
        return;
      }
    }

    const context = this._buildInteractionContext(player, room);
    const action = msg?.actionId
      ? context.actions.find(entry => entry.id === msg.actionId)
      : context.actions.find(entry => !entry.disabled);

    if (!action) {
      this._pushInteractionContext(ws);
      return;
    }

    if (action.disabled) {
      ws.send(JSON.stringify({ type: 'chat', sender: 'Sistema', text: 'Essa acao ainda nao esta disponivel.', color: '#7a5e2a', system: true }));
      this._pushInteractionContext(ws);
      return;
    }

    switch (action.id) {
      case 'open_chest':
        this._openChest(ws, context.tileIndex);
        break;
      case 'read_monument':
        this._readMonument(ws);
        break;
      case 'clear_land':
        this._clearLand(ws, context);
        break;
      case 'plant_crop':
        this._plantCrop(ws, context);
        break;
      case 'harvest_crop':
        this._harvestCrop(ws, context);
        break;
      case 'mine':
        this._mineSpot(ws, context);
        break;
      case 'fish':
        this._fishSpot(ws, context);
        break;
      default:
        break;
    }

    this._pushPlayerState(player, ws);
    this._pushInteractionContext(ws);
  }

  _equip(ws, msg) {
    const result = equipInventoryItem(ws.player, Number(msg.index), getConfig('game.inventoryLimit'));
    if (!result.ok) {
      ws.send(JSON.stringify({ type: 'error', msg: result.error }));
      return;
    }
    const discipline = result.item.discipline || dominantDiscipline(ws.player);
    const unlocked = grantDisciplineXp(ws.player, discipline, 12);
    this._refreshPlayerBuild(ws.player);
    this._pushPlayerState(ws.player, ws);
    ws.send(JSON.stringify({ type: 'chat', sender: 'Sistema', text: `${result.item.name} equipado.`, color: '#7a5e2a', system: true }));
    unlocked.forEach(skill => ws.send(JSON.stringify({ type: 'skill_unlock', skill })));
  }

  _unequip(ws, msg) {
    const result = unequipSlot(ws.player, String(msg.slot || ''), getConfig('game.inventoryLimit'));
    if (!result.ok) {
      ws.send(JSON.stringify({ type: 'error', msg: result.error }));
      return;
    }
    this._refreshPlayerBuild(ws.player);
    this._pushPlayerState(ws.player, ws);
    ws.send(JSON.stringify({ type: 'chat', sender: 'Sistema', text: `${result.item.name} removido do equipamento.`, color: '#7a5e2a', system: true }));
  }

  _tick() {
    const now = Date.now();
    this._tickCount = (this._tickCount || 0) + 1;

    this.rooms.forEach(room => {
      if (room.players.size === 0) return;
      this._tickMonsters(room, now);
      this._tickNpcs(room, now);
      this._tickStatus(room, now);
      this._tickRegen(room, now);
      this._tickStamina(room);
    });

    if (this._tickCount % 60 === 0) {
      const gameTime = getGameTime();
      const data = JSON.stringify({ type: 'time', ...gameTime });
      this.sockets.forEach(ws => { if (ws.readyState === 1) ws.send(data); });
      if (gameTime.isNight) this._nightSpawn();
    }
  }

  _tickStatus(room, now) {
    if (this._tickCount % 10 !== 0) return;
    room.players.forEach(player => {
      const summary = tickStatusEffects(player, now);
      if (!summary.changed) return;
      const ws = this.sockets.get(player.charId);
      if (!ws || ws.readyState !== 1) return;
      summary.triggered.forEach(entry => {
        ws.send(JSON.stringify({ type: 'status_event', mode: 'tick', effect: entry.effect, damage: entry.damage, hp: player.hp, maxHp: player.maxHp }));
      });
      summary.expired.forEach(effect => {
        ws.send(JSON.stringify({ type: 'status_event', mode: 'expired', effect }));
      });
      this._refreshPlayerBuild(player);
      this._pushPlayerState(player, ws);
      if (player.hp <= 0) this._killPlayer(room, player, { id: 'status', name: 'as proprias feridas' });
    });
  }

  _tickRegen(room, now) {
    if (this._tickCount % 20 !== 0) return;
    room.players.forEach(player => {
      if (player.hp >= player.maxHp) return;
      const hasNegativeStatus = (player.statusEffects || []).some(effect => STATUS_DEFS[effect.id]?.type === 'negative');
      if (hasNegativeStatus) return;
      const idleMs = now - (player.lastMoveAt || now);
      if (idleMs < 5000) return;
      const regen = Math.max(1, Math.floor(player.maxHp * 0.03));
      player.hp = Math.min(player.maxHp, player.hp + regen);
      const ws = this.sockets.get(player.charId);
      if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'hp_regen', hp: player.hp, maxHp: player.maxHp }));
    });
  }

  _tickStamina(room) {
    room.players.forEach(player => {
      if (player.stamina >= player.maxStamina) return;
      const regen = player.maxStamina / 100;
      player.stamina = Math.min(player.maxStamina, player.stamina + regen);
      if (this._tickCount % 5 !== 0) return;
      const ws = this.sockets.get(player.charId);
      if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'stamina_update', stamina: Math.floor(player.stamina), maxStamina: player.maxStamina }));
    });
  }

  _tickNpcs(room, now) {
    room.npcs.forEach(npc => {
      if (now - npc.moveTimer < getConfig('game.npcMoveIntervalMs')) return;
      npc.moveTimer = now;
      if (Math.random() >= 0.45) return;
      const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      const [sx, sy] = directions[Math.floor(Math.random() * directions.length)];
      const nx = npc.x + sx;
      const ny = npc.y + sy;
      if (Math.abs(nx - npc.spawnX) > npc.roamRadius || Math.abs(ny - npc.spawnY) > npc.roamRadius) return;
      if (nx <= 0 || nx >= room.width - 1 || ny <= 0 || ny >= room.height - 1) return;
      const tile = room.tiles[ny * room.width + nx];
      if (tile !== T.PATH && tile !== T.FLOOR) return;
      if (this._isOccupied(room, nx, ny, npc.id)) return;
      npc.x = nx;
      npc.y = ny;
      this._broadcast(room, { type: 'entity_move', entityId: npc.id, x: npc.x, y: npc.y });
    });
  }

  _nightSpawn() {
    this.rooms.forEach(room => {
      if (room.players.size === 0) return;
      if (room.monsters.size >= 14) return;
      const pool = MONSTERS[room.biome] || MONSTERS.plains;
      const template = pool[Math.floor(Math.random() * pool.length)];
      const monster = this._spawnMonster(room, template, `m_night_${Date.now()}_${room.mapX}_${room.mapY}`);
      if (!monster) return;
      room.monsters.set(monster.id, monster);
      this._broadcast(room, { type: 'entity_spawn', entity: this._ent(monster) });
    });
  }

  _tickMonsters(room, now) {
    room.monsters.forEach(monster => {
      let nearest = null;
      let minDist = Infinity;
      room.players.forEach(player => {
        const dist = Math.max(Math.abs(player.x - monster.x), Math.abs(player.y - monster.y));
        if (dist < minDist) {
          nearest = player;
          minDist = dist;
        }
      });
      if (!nearest) {
        monster.state = 'idle';
        return;
      }

      const canAggro = monster.disposition !== 'neutral';
      if (canAggro && minDist <= getConfig('game.aggroRange')) monster.state = 'aggro';
      else if (monster.state === 'aggro' && minDist > getConfig('game.chaseRange')) {
        monster.state = 'idle';
        monster.targetId = null;
      }

      if (monster.state === 'aggro') {
        if (minDist <= 1 && now - monster.attackTimer >= getConfig('game.monsterAttackIntervalMs')) {
          monster.attackTimer = now;
          const crit = Math.random() < getConfig('combat.monsterCritChance');
          const damage = calcDamage(monster.atk, nearest.def, crit, getConfig('combat.monsterCritMultiplier'));
          nearest.hp = Math.max(0, nearest.hp - damage);
          this._broadcast(room, { type: 'combat', attackerId: monster.id, targetId: nearest.id, damage, crit, targetHp: nearest.hp, targetMaxHp: nearest.maxHp });
          const ws = this.sockets.get(nearest.charId);
          if (ws && monster.inflicts?.length && Math.random() < getConfig('combat.monsterStatusChance')) {
            const statusId = monster.inflicts[Math.floor(Math.random() * monster.inflicts.length)];
            this._applyPlayerStatus(nearest, statusId, ws, monster.id);
          }
          if (nearest.hp <= 0) this._killPlayer(room, nearest, monster);
          else if (ws) this._pushPlayerState(nearest, ws);
        } else if (minDist > 1 && now - monster.moveTimer >= getConfig('game.monsterMoveIntervalMs')) {
          monster.moveTimer = now;
          const dx = Math.sign(nearest.x - monster.x);
          const dy = Math.sign(nearest.y - monster.y);
          const tryStep = (sx, sy) => {
            const nx = monster.x + sx;
            const ny = monster.y + sy;
            if (nx < 0 || nx >= room.width || ny < 0 || ny >= room.height) return false;
            if (SOLID.has(room.tiles[ny * room.width + nx])) return false;
            if (this._isOccupied(room, nx, ny, monster.id)) return false;
            monster.x = nx;
            monster.y = ny;
            return true;
          };
          if (!tryStep(dx, 0) && !tryStep(0, dy)) tryStep(dx, dy);
          this._broadcast(room, { type: 'entity_move', entityId: monster.id, x: monster.x, y: monster.y });
        }
      } else if (now - monster.moveTimer >= getConfig('game.monsterMoveIntervalMs') * 3 && Math.random() < 0.4) {
        monster.moveTimer = now;
        const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        const [sx, sy] = directions[Math.floor(Math.random() * directions.length)];
        const nx = monster.x + sx;
        const ny = monster.y + sy;
        if (nx > 0 && nx < room.width - 1 && ny > 0 && ny < room.height - 1 && !SOLID.has(room.tiles[ny * room.width + nx]) && !this._isOccupied(room, nx, ny, monster.id)) {
          monster.x = nx;
          monster.y = ny;
          this._broadcast(room, { type: 'entity_move', entityId: monster.id, x: monster.x, y: monster.y });
        }
      }
    });
  }

  _refreshPlayerBuild(player, refillStamina = false) {
    refreshDerivedStats(player);
    const nextMaxStamina = calcMaxStamina(player.level, player.spd);
    player.maxStamina = nextMaxStamina;
    player.stamina = refillStamina ? nextMaxStamina : Math.min(player.stamina || nextMaxStamina, nextMaxStamina);
  }

  _pushPlayerState(player, ws = this.sockets.get(player.charId)) {
    if (!ws || ws.readyState !== 1) return;
    this._refreshPlayerBuild(player);
    ws.send(JSON.stringify({ type: 'player_state', state: serializePlayerState(player) }));
  }

  _applyPlayerStatus(player, statusId, ws, sourceId) {
    const applied = applyStatus(player, statusId, sourceId);
    if (!applied || !ws || ws.readyState !== 1) return;
    this._refreshPlayerBuild(player);
    ws.send(JSON.stringify({ type: 'status_event', mode: 'applied', effect: applied }));
    this._pushPlayerState(player, ws);
  }

  _relocatePlayerToSafeSpawn(room, player, reason, force = false) {
    const isBlocked = (x, y) => this._isOccupied(room, x, y, player.id);
    // For the "is current position already safe" check, only consider NPCs and other players —
    // not monsters, because monsters move and may transiently block a valid spawn tile.
    const isBlockedNoMonsters = (x, y) => {
      let blocked = false;
      room.players.forEach(p => { if (p.id !== player.id && p.x === x && p.y === y) blocked = true; });
      room.npcs.forEach(npc => { if (npc.x === x && npc.y === y) blocked = true; });
      return blocked;
    };
    if (!force && isSafeSpawnTile(room.tiles, room.width, room.height, player.x, player.y, { isBlocked: isBlockedNoMonsters })) return null;

    const next = findSafeSpawn(room.tiles, room.width, room.height, { isBlocked });
    if (!next) return null;

    const from = {
      x: player.x,
      y: player.y,
      tile: room.tiles[player.y * room.width + player.x],
    };

    player.x = next.x;
    player.y = next.y;
    player.lastMoveAt = Date.now();

    console.warn(`[spawn-fix] reason=${reason} char=${player.charId} map=${room.mapX},${room.mapY} from=${from.x},${from.y} tile=${from.tile} to=${next.x},${next.y} reachable=${next.reachable}`);

    return { from, to: next };
  }

  _spawnMonster(room, template, id) {
    const SAFE_RADIUS = 8;
    let x = 2;
    let y = 2;
    let tries = 0;
    do {
      x = 2 + Math.floor(Math.random() * (room.width - 4));
      y = 2 + Math.floor(Math.random() * (room.height - 4));
      tries++;
    } while ((SOLID.has(room.tiles[y * room.width + x]) || this._isOccupied(room, x, y) ||
      [...room.players.values()].some(p => Math.abs(p.x - x) <= SAFE_RADIUS && Math.abs(p.y - y) <= SAFE_RADIUS)
    ) && tries < 60);
    if (tries >= 60) return null;

    return this._hydrateMonster({
      id,
      ...JSON.parse(JSON.stringify(template)),
      x,
      y,
      spawnX: x,
      spawnY: y,
    });
  }

  _hydrateMonster(monster) {
    return {
      ...monster,
      type: 'monster',
      maxHp: monster.maxHp || monster.hp,
      state: monster.state || 'idle',
      targetId: monster.targetId || null,
      moveTimer: monster.moveTimer || 0,
      attackTimer: monster.attackTimer || 0,
      disposition: monster.disposition || 'hostile',
      inflicts: monster.inflicts || [],
    };
  }

  _resolveTarget(room, targetId) {
    if (!targetId) return null;
    if (targetId.startsWith('m_')) {
      const entity = room.monsters.get(targetId);
      return entity ? { entity, type: 'monster' } : null;
    }
    if (targetId.startsWith('p_')) {
      const entity = room.players.get(parseInt(targetId.replace('p_', ''), 10));
      return entity ? { entity, type: 'player' } : null;
    }
    if (targetId.startsWith('n_')) {
      const entity = room.npcs.get(targetId);
      return entity ? { entity, type: 'npc' } : null;
    }
    return null;
  }

  _findNearbyNpc(player, room, targetId = null, radius = 2) {
    if (targetId && room.npcs.has(targetId)) {
      const npc = room.npcs.get(targetId);
      const dist = Math.max(Math.abs(player.x - npc.x), Math.abs(player.y - npc.y));
      if (dist <= radius) return npc;
    }

    let found = null;
    let minDist = Infinity;
    room.npcs.forEach(npc => {
      const dist = Math.max(Math.abs(player.x - npc.x), Math.abs(player.y - npc.y));
      if (dist <= radius && dist < minDist) {
        minDist = dist;
        found = npc;
      }
    });
    return found;
  }

  _syncNpcFocus(ws, clearWhenFar = false) {
    if (!ws.activeNpcId) return;
    const npc = ws.room?.npcs?.get(ws.activeNpcId);
    if (!npc) {
      ws.activeNpcId = null;
      ws.send(JSON.stringify({ type: 'npc_focus', npc: null }));
      return;
    }
    const dist = Math.max(Math.abs(ws.player.x - npc.x), Math.abs(ws.player.y - npc.y));
    if (clearWhenFar && dist > 3) {
      ws.activeNpcId = null;
      ws.send(JSON.stringify({ type: 'npc_focus', npc: null }));
    }
  }

  _npcSummary(npc, player = null, relation = null) {
    const snapshot = player ? (relation || this.dialogueService.getRelationshipSnapshot(npc, player)) : null;
    const services = player
      ? {
          tradeOffers: this._buildNpcTradeOffers(npc, snapshot),
          quests: this._buildNpcQuestEntries(npc, player, snapshot),
        }
      : { tradeOffers: npc.tradeStock || [], quests: [] };
    return {
      id: npc.id,
      name: npc.name,
      profession: npc.profession,
      personality: npc.personality,
      district: npc.district,
      topic: npc.topic,
      familyRole: npc.familyRole,
      biography: npc.biography,
      char: npc.char,
      relation: snapshot,
      tradeOffers: services.tradeOffers,
      quests: services.quests,
    };
  }

  _isOccupied(room, x, y, ignoreId = null) {
    let blocked = false;
    room.players.forEach(player => { if (player.id !== ignoreId && player.x === x && player.y === y) blocked = true; });
    room.monsters.forEach(monster => { if (monster.id !== ignoreId && monster.x === x && monster.y === y) blocked = true; });
    room.npcs.forEach(npc => { if (npc.id !== ignoreId && npc.x === x && npc.y === y) blocked = true; });
    return blocked;
  }

  _isOccupiedByNpc(room, x, y) {
    let blocked = false;
    room.npcs.forEach(npc => { if (npc.x === x && npc.y === y) blocked = true; });
    return blocked;
  }

  _entities(room) {
    const entities = [];
    room.players.forEach(player => entities.push(this._ent(player)));
    room.monsters.forEach(monster => entities.push(this._ent(monster)));
    room.npcs.forEach(npc => entities.push(this._ent(npc)));
    return entities;
  }

  _ent(entity) {
    return {
      id: entity.id,
      type: entity.type,
      name: entity.name,
      char: entity.char,
      x: entity.x,
      y: entity.y,
      hp: entity.hp,
      maxHp: entity.maxHp,
      level: entity.level,
      rank: entity.rank,
      stamina: entity.stamina,
      maxStamina: entity.maxStamina,
      profession: entity.profession,
      disposition: entity.disposition,
    };
  }

  _broadcast(room, msg, excludeCharId = null) {
    const data = JSON.stringify(msg);
    room.players.forEach((player, charId) => {
      if (charId === excludeCharId) return;
      const ws = this.sockets.get(charId);
      if (ws && ws.readyState === 1) ws.send(data);
    });
  }
}

module.exports = { GameWorld };
