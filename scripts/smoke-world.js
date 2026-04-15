'use strict';

const WebSocket = require('ws');
const { db } = require('../server/db');
const { generateMap, SOLID, isSafeSpawnTile } = require('../server/worldGen');
const { generateNpcs, createItem, storeItem } = require('../server/gameSystems');

const BASE_URL = process.env.SMOKE_BASE_URL || 'http://localhost:3011';
const WS_URL = BASE_URL.replace(/^http/i, 'ws');
const KEEP_SMOKE_ACCOUNT = process.env.KEEP_SMOKE_ACCOUNT === '1';
const SKIP_GATHERING_SMOKE = process.env.SKIP_GATHERING_SMOKE === '1';
const PASSWORD = 'SmokePass123!';

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; }
  catch { payload = { raw: text }; }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${path}: ${payload?.error || payload?.raw || 'erro desconhecido'}`);
  }
  return payload;
}

class WsSession {
  constructor(token) {
    this.token = token;
    this.ws = null;
    this.queue = [];
    this.waiters = [];
  }

  async connect() {
    await new Promise((resolve, reject) => {
      this.ws = new WebSocket(WS_URL);
      const onError = err => reject(err);
      this.ws.once('error', onError);
      this.ws.once('open', () => {
        this.ws.off('error', onError);
        this.ws.on('message', raw => this.#onMessage(raw));
        this.ws.on('error', err => this.#rejectAll(err));
        this.ws.send(JSON.stringify({ type: 'auth', token: this.token }));
        resolve();
      });
    });
  }

  #onMessage(raw) {
    let msg;
    try { msg = JSON.parse(String(raw)); }
    catch { return; }

    for (let index = 0; index < this.waiters.length; index++) {
      const waiter = this.waiters[index];
      if (!waiter.predicate(msg)) continue;
      clearTimeout(waiter.timer);
      this.waiters.splice(index, 1);
      waiter.resolve(msg);
      return;
    }

    this.queue.push(msg);
  }

  #rejectAll(error) {
    while (this.waiters.length) {
      const waiter = this.waiters.pop();
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
  }

  send(message) {
    this.ws.send(JSON.stringify(message));
  }

  async waitFor(predicate, timeout = 8000, label = 'mensagem do WebSocket') {
    const existingIndex = this.queue.findIndex(predicate);
    if (existingIndex >= 0) return this.queue.splice(existingIndex, 1)[0];

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = this.waiters.indexOf(waiter);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(new Error(`Tempo esgotado aguardando ${label}.`));
      }, timeout);
      const waiter = { predicate, resolve, reject, timer };
      this.waiters.push(waiter);
    });
  }

  async waitForType(type, timeout = 8000) {
    return this.waitFor(message => message.type === type, timeout, `evento ${type}`);
  }

  async close() {
    if (!this.ws) return;
    await new Promise(resolve => {
      const done = () => resolve();
      this.ws.once('close', done);
      this.ws.once('error', done);
      try { this.ws.close(); } catch { resolve(); }
    });
  }
}

function upsertWorldMap(mapX, mapY, biome, seed) {
  db.prepare(`
    INSERT INTO world_maps (map_x, map_y, biome, seed, settlement_stage)
    VALUES (?, ?, ?, ?, 'settled')
    ON CONFLICT(map_x, map_y)
    DO UPDATE SET biome=excluded.biome, seed=excluded.seed, settlement_stage='settled', map_state='{}'
  `).run(mapX, mapY, biome, seed);
}

function findAdjacentFree(mapData, x, y, occupied = new Set()) {
  const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [dx, dy] of directions) {
    const nx = x + dx;
    const ny = y + dy;
    const key = `${nx},${ny}`;
    if (nx < 0 || ny < 0 || nx >= mapData.width || ny >= mapData.height) continue;
    if (SOLID.has(mapData.tiles[ny * mapData.width + nx])) continue;
    if (occupied.has(key)) continue;
    return { x: nx, y: ny };
  }
  return null;
}

function findTile(mapData, predicate) {
  for (let y = 1; y < mapData.height - 1; y++) {
    for (let x = 1; x < mapData.width - 1; x++) {
      const tile = mapData.tiles[y * mapData.width + x];
      if (SOLID.has(tile)) continue;
      if (predicate(x, y, tile)) return { x, y, tile };
    }
  }
  return null;
}

function adjacentTiles(mapData, x, y) {
  return [[1, 0], [-1, 0], [0, 1], [0, -1]]
    .map(([dx, dy]) => {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= mapData.width || ny >= mapData.height) return null;
      return { x: nx, y: ny, tile: mapData.tiles[ny * mapData.width + nx] };
    })
    .filter(Boolean);
}

function cleanupAccount(accountId) {
  db.prepare('DELETE FROM npc_conversation_history WHERE char_id IN (SELECT id FROM characters WHERE account_id=?)').run(accountId);
  db.prepare('DELETE FROM npc_relationships WHERE char_id IN (SELECT id FROM characters WHERE account_id=?)').run(accountId);
  db.prepare('DELETE FROM npc_quests WHERE char_id IN (SELECT id FROM characters WHERE account_id=?)').run(accountId);
  db.prepare('DELETE FROM characters WHERE account_id=?').run(accountId);
  db.prepare('DELETE FROM accounts WHERE id=?').run(accountId);
}

function grantInventoryItem(charId, itemId, qty) {
  const row = db.prepare('SELECT inventory FROM characters WHERE id=?').get(charId);
  const inventory = row?.inventory ? JSON.parse(row.inventory) : [];
  const stored = storeItem(inventory, createItem(itemId, { qty }), 24);
  assert(stored.stored, `Nao foi possivel injetar ${itemId} no inventario de smoke.`);
  db.prepare('UPDATE characters SET inventory=? WHERE id=?').run(JSON.stringify(stored.inventory), charId);
}

async function registerAndCreateCharacter() {
  const username = `smoke_${Date.now().toString(36)}`;
  const registration = await api('/api/register', {
    method: 'POST',
    body: JSON.stringify({ username, password: PASSWORD })
  });
  const creation = await api('/api/character/create', {
    method: 'POST',
    headers: { Authorization: `Bearer ${registration.token}` },
    body: JSON.stringify({ name: `Smoke${Date.now().toString(36).slice(-4)}`, gender: 'N' })
  });
  return {
    username,
    token: registration.token,
    accountId: registration.accountId,
    charId: creation.character.id,
    character: creation.character,
  };
}

async function runCombatFlow(context) {
  console.log('[smoke] iniciando combate e loot');
  const runOffset = Date.now() % 10000;
  const mapX = 30000 + runOffset;
  const mapY = 30000 + runOffset;
  const seed = 123456789;
  upsertWorldMap(mapX, mapY, 'forest', seed);
  const localMap = generateMap(mapX, mapY, 'forest', seed);
  const target = localMap.monsters[0];
  assert(target, 'Nenhum monstro foi gerado para o smoke test de combate.');

  const occupied = new Set(localMap.monsters.map(monster => `${monster.x},${monster.y}`));
  const spawn = findAdjacentFree(localMap, target.x, target.y, occupied);
  assert(spawn, 'Nao foi possivel posicionar o personagem ao lado do monstro de teste.');

  db.prepare('UPDATE characters SET map_x=?, map_y=?, pos_x=?, pos_y=? WHERE id=?')
    .run(mapX, mapY, spawn.x, spawn.y, context.charId);

  let session = new WsSession(context.token);
  await session.connect();
  let init = await session.waitForType('init');
  await session.waitForType('player_state');

  let livePlayer = init.entities.find(entity => entity.id === init.playerId);
  let liveTarget = init.entities.find(entity => entity.id === target.id) ||
    init.entities.filter(entity => entity.type === 'monster')
      .sort((a, b) => Math.hypot(a.x - target.x, a.y - target.y) - Math.hypot(b.x - target.x, b.y - target.y))[0];
  assert(liveTarget, 'O monstro esperado nao apareceu no mapa inicial.');
  assert(livePlayer, 'O personagem nao apareceu entre as entidades iniciais.');

  if (Math.max(Math.abs(livePlayer.x - liveTarget.x), Math.abs(livePlayer.y - liveTarget.y)) > 1) {
    const occupiedLive = new Set(init.entities.map(entity => `${entity.x},${entity.y}`));
    occupiedLive.delete(`${liveTarget.x},${liveTarget.y}`);
    const adjustedSpawn = findAdjacentFree(localMap, liveTarget.x, liveTarget.y, occupiedLive);
    assert(adjustedSpawn, 'Nao foi possivel reposicionar o personagem ao lado do monstro real.');
    await session.close();
    db.prepare('UPDATE characters SET map_x=?, map_y=?, pos_x=?, pos_y=? WHERE id=?')
      .run(mapX, mapY, adjustedSpawn.x, adjustedSpawn.y, context.charId);
    session = new WsSession(context.token);
    await session.connect();
    init = await session.waitForType('init');
    await session.waitForType('player_state');
    livePlayer = init.entities.find(entity => entity.id === init.playerId);
    liveTarget = init.entities.find(entity => entity.id === target.id) ||
      init.entities.filter(entity => entity.type === 'monster')
        .sort((a, b) => Math.hypot(a.x - target.x, a.y - target.y) - Math.hypot(b.x - target.x, b.y - target.y))[0];
    assert(liveTarget, 'O monstro nao apareceu apos reposicionamento.');
  }

  assert(Math.max(Math.abs(livePlayer.x - liveTarget.x), Math.abs(livePlayer.y - liveTarget.y)) <= 1, 'O personagem nao ficou adjacente ao monstro de teste.');

  let latestState = null;
  const goldBefore = context.character.gold || 0;
  let deathEvent = null;

  for (let attempt = 0; attempt < 12; attempt++) {
    console.log(`[smoke] ataque ${attempt + 1} contra ${liveTarget.name}`);
    session.send({ type: 'attack', targetId: liveTarget.id });
    const message = await session.waitFor(
      entry => entry.type === 'combat' || entry.type === 'entity_death' || entry.type === 'player_state' || entry.type === 'stamina_low',
      4000,
      'resultado de ataque'
    );
    if (message.type === 'player_state') latestState = message.state;
    if (message.type === 'entity_death' && message.entityId === liveTarget.id) {
      deathEvent = message;
      break;
    }
    if (message.type === 'combat' && message.targetId === liveTarget.id && message.targetHp <= 0) {
      deathEvent = await session.waitFor(entry => entry.type === 'entity_death' && entry.entityId === liveTarget.id, 4000);
      break;
    }
    await delay(900);
  }

  assert(deathEvent, 'O monstro nao morreu durante o smoke test de combate.');
  latestState = (await session.waitFor(
    entry => entry.type === 'player_state' && (entry.state?.gold || 0) >= goldBefore + (deathEvent.goldGain || 0),
    4000
  )).state;
  assert((latestState.gold || 0) > goldBefore, 'Ouro nao aumentou apos derrotar o monstro.');
  assert(Array.isArray(latestState.inventory) && latestState.inventory.length > 0, 'Nenhum item foi sincronizado no inventario apos o combate.');

  await session.close();
  return {
    goldGained: (latestState.gold || 0) - goldBefore,
    inventorySize: latestState.inventory.length,
    loot: deathEvent.drops || [],
  };
}

async function runNpcMemoryFlow(context) {
  console.log('[smoke] iniciando memoria de NPC');
  const mapX = 41001;
  const mapY = 41001;
  const seed = 987654321;
  upsertWorldMap(mapX, mapY, 'city', seed);

  const localMap = generateMap(mapX, mapY, 'city', seed);
  const localNpcs = generateNpcs({ mapX, mapY, biome: 'city', seed, tiles: localMap.tiles, width: localMap.width, height: localMap.height });
  const npcSeed = localNpcs[0];
  assert(npcSeed, 'Nenhum NPC foi gerado para o smoke test de memoria.');

  const occupied = new Set([
    ...localMap.monsters.map(monster => `${monster.x},${monster.y}`),
    ...localNpcs.map(npc => `${npc.x},${npc.y}`),
  ]);
  const spawn = findAdjacentFree(localMap, npcSeed.x, npcSeed.y, occupied);
  assert(spawn, 'Nao foi possivel posicionar o personagem ao lado do NPC de teste.');

  db.prepare('UPDATE characters SET map_x=?, map_y=?, pos_x=?, pos_y=? WHERE id=?')
    .run(mapX, mapY, spawn.x, spawn.y, context.charId);

  let firstSession = new WsSession(context.token);
  await firstSession.connect();
  let init = await firstSession.waitForType('init');
  await firstSession.waitForType('player_state');
  let livePlayer = init.entities.find(entity => entity.id === init.playerId);
  let liveNpc = init.entities
    .filter(entity => entity.type === 'npc')
    .sort((left, right) => {
      const leftDist = Math.max(Math.abs(left.x - livePlayer.x), Math.abs(left.y - livePlayer.y));
      const rightDist = Math.max(Math.abs(right.x - livePlayer.x), Math.abs(right.y - livePlayer.y));
      return leftDist - rightDist;
    })[0];
  assert(liveNpc, 'Nenhum NPC apareceu no mapa urbano.');
  console.log(`[smoke] sessao urbana inicial: player=(${livePlayer.x},${livePlayer.y}) npc=(${liveNpc.x},${liveNpc.y})`);

  if (Math.max(Math.abs(liveNpc.x - livePlayer.x), Math.abs(liveNpc.y - livePlayer.y)) > 2) {
    const occupied = new Set(init.entities.map(entity => `${entity.x},${entity.y}`));
    occupied.delete(`${liveNpc.x},${liveNpc.y}`);
    const adjustedSpawn = findAdjacentFree(localMap, liveNpc.x, liveNpc.y, occupied);
    assert(adjustedSpawn, 'Nao foi possivel reposicionar o personagem ao lado do NPC real.');
    console.log(`[smoke] reposicionando para (${adjustedSpawn.x},${adjustedSpawn.y}) ao lado do NPC ${liveNpc.id}`);
    await firstSession.close();
    await delay(200);
    db.prepare('UPDATE characters SET map_x=?, map_y=?, pos_x=?, pos_y=? WHERE id=?')
      .run(mapX, mapY, adjustedSpawn.x, adjustedSpawn.y, context.charId);

    firstSession = new WsSession(context.token);
    await firstSession.connect();
    init = await firstSession.waitForType('init');
    await firstSession.waitForType('player_state');
    livePlayer = init.entities.find(entity => entity.id === init.playerId);
    liveNpc = init.entities
      .filter(entity => entity.type === 'npc')
      .sort((left, right) => {
        const leftDist = Math.max(Math.abs(left.x - livePlayer.x), Math.abs(left.y - livePlayer.y));
        const rightDist = Math.max(Math.abs(right.x - livePlayer.x), Math.abs(right.y - livePlayer.y));
        return leftDist - rightDist;
      })[0];
    console.log(`[smoke] sessao urbana ajustada: player=(${livePlayer.x},${livePlayer.y}) npc=(${liveNpc.x},${liveNpc.y})`);
    assert(Math.max(Math.abs(liveNpc.x - livePlayer.x), Math.abs(liveNpc.y - livePlayer.y)) <= 2, 'Nenhum NPC ficou ao alcance do personagem no mapa urbano.');
  }

  firstSession.send({ type: 'interact', targetId: liveNpc.id });
  let focus = await firstSession.waitForType('npc_focus');
  await firstSession.waitForType('npc_dialogue');

  const prompts = [
    'Quero conhecer melhor sua familia e seu trabalho por aqui.',
    'Lembra do que falamos sobre a cidade e as patrulhas?',
    'Confio em voce. O que realmente acontece neste distrito?',
    'Voltei porque gostei de conversar com voce.',
    'Quero manter contato e ouvir mais rumores daqui.'
  ];

  for (const prompt of prompts) {
    console.log(`[smoke] conversa com NPC: ${prompt}`);
    firstSession.send({ type: 'npc_chat', npcId: liveNpc.id, text: prompt });
    const reply = await firstSession.waitForType('npc_dialogue', 6000);
    focus = { type: 'npc_focus', npc: reply.npc };
    assert(reply.npc?.relation, 'A resposta do NPC nao trouxe relacao persistente.');
    await delay(150);
  }

  const relationAfterTalk = focus.npc.relation;
  assert(relationAfterTalk.conversationCount >= prompts.length, 'A contagem de conversas do NPC nao evoluiu.');
  assert(relationAfterTalk.affinity >= 6, 'A afinidade do NPC nao evoluiu com conversas repetidas.');
  assert(relationAfterTalk.memorySummary, 'O NPC nao registrou memoria resumida do personagem.');
  await firstSession.close();

  await delay(250);

  const secondSession = new WsSession(context.token);
  await secondSession.connect();
  await secondSession.waitForType('init');
  await secondSession.waitForType('player_state');
  secondSession.send({ type: 'interact', targetId: liveNpc.id });
  const rememberedFocus = await secondSession.waitForType('npc_focus');
  const rememberedDialogue = await secondSession.waitForType('npc_dialogue');

  assert(rememberedFocus.npc?.relation?.conversationCount >= prompts.length, 'O NPC esqueceu o historico do personagem apos reconectar.');
  assert(rememberedFocus.npc?.relation?.memorySummary, 'O NPC perdeu a memoria resumida ao reencontrar o personagem.');
  assert(/lembro|falamos|voltou|de novo/i.test(rememberedDialogue.text), 'A saudacao do NPC nao demonstra memoria do personagem.');

  await secondSession.close();
  return {
    npcName: rememberedFocus.npc.name,
    relation: rememberedFocus.npc.relation,
    greeting: rememberedDialogue.text,
  };
}

async function runNpcServicesFlow(context) {
  console.log('[smoke] iniciando comercio e missoes locais');
  const mapX = 41003;
  const mapY = 41003;
  const seed = 135792468;
  upsertWorldMap(mapX, mapY, 'city', seed);

  const localMap = generateMap(mapX, mapY, 'city', seed);
  const localNpcs = generateNpcs({ mapX, mapY, biome: 'city', seed, tiles: localMap.tiles, width: localMap.width, height: localMap.height });
  const traderNpc = localNpcs.find(npc => Array.isArray(npc.tradeStock) && npc.tradeStock.length);
  assert(traderNpc, 'Nenhum NPC comerciante foi gerado para o smoke test de servicos.');

  const occupied = new Set([
    ...localMap.monsters.map(monster => `${monster.x},${monster.y}`),
    ...localNpcs.map(npc => `${npc.x},${npc.y}`),
  ]);
  const spawn = findAdjacentFree(localMap, traderNpc.x, traderNpc.y, occupied);
  assert(spawn, 'Nao foi possivel posicionar o personagem ao lado do comerciante de teste.');

  db.prepare('UPDATE characters SET map_x=?, map_y=?, pos_x=?, pos_y=?, gold=? WHERE id=?')
    .run(mapX, mapY, spawn.x, spawn.y, 240, context.charId);

  let session = new WsSession(context.token);
  await session.connect();
  let init = await session.waitForType('init');
  let latestState = (await session.waitForType('player_state')).state;

  let livePlayer = init.entities.find(entity => entity.id === init.playerId);
  let liveNpc = init.entities.find(entity => entity.id === traderNpc.id);
  if (!liveNpc || Math.max(Math.abs(liveNpc.x - livePlayer.x), Math.abs(liveNpc.y - livePlayer.y)) > 2) {
    await session.close();
    await delay(200);
    const occupiedLive = new Set(init.entities.map(entity => `${entity.x},${entity.y}`));
    if (liveNpc) occupiedLive.delete(`${liveNpc.x},${liveNpc.y}`);
    const adjustedSpawn = liveNpc ? findAdjacentFree(localMap, liveNpc.x, liveNpc.y, occupiedLive) : null;
    assert(adjustedSpawn, 'Nao foi possivel reposicionar o personagem ao lado do comerciante real.');
    db.prepare('UPDATE characters SET map_x=?, map_y=?, pos_x=?, pos_y=?, gold=? WHERE id=?')
      .run(mapX, mapY, adjustedSpawn.x, adjustedSpawn.y, 240, context.charId);

    session = new WsSession(context.token);
    await session.connect();
    init = await session.waitForType('init');
    latestState = (await session.waitForType('player_state')).state;
    livePlayer = init.entities.find(entity => entity.id === init.playerId);
    liveNpc = init.entities.find(entity => entity.id === traderNpc.id);
  }

  session.send({ type: 'interact', targetId: traderNpc.id });
  await session.waitForType('npc_focus');
  await session.waitForType('npc_dialogue');

  const prompts = [
    'Quero negociar com calma e voltar sempre que puder.',
    'Confio em voce e quero ajudar este distrito.',
    'Conte mais sobre o trabalho daqui e o que falta para a rua seguir viva.',
    'Voltei para manter contato e apoiar seus pedidos locais.',
    'Preciso de uma tarefa local e de um bom acordo de compra.'
  ];

  let serviceFocus = null;
  for (const prompt of prompts) {
    session.send({ type: 'npc_chat', npcId: traderNpc.id, text: prompt });
    const reply = await session.waitForType('npc_dialogue', 6000);
    serviceFocus = reply.npc;
    await delay(120);
  }

  assert(serviceFocus?.relation?.unlocks?.discountPercent >= 5, 'O desconto por afinidade nao foi liberado.');
  assert(Array.isArray(serviceFocus.tradeOffers) && serviceFocus.tradeOffers.length > 0, 'O comerciante nao expôs ofertas de compra.');
  assert(Array.isArray(serviceFocus.quests) && serviceFocus.quests.some(quest => quest.canAccept), 'Nenhuma missao local ficou disponivel.');

  const offer = serviceFocus.tradeOffers[0];
  const goldBeforeBuy = latestState.gold || 0;
  console.log(`[smoke] compra: ${offer.name} por ${offer.finalPrice} ouro (base ${offer.basePrice}, desconto ${offer.discountPercent}%)`);
  session.send({ type: 'npc_service', npcId: traderNpc.id, action: 'buy_item', offerId: offer.offerId });
  await session.waitFor(message => message.type === 'chat' && /desconto|ouro/i.test(message.text || ''), 5000, 'confirmacao de compra');
  serviceFocus = (await session.waitForType('npc_focus', 5000)).npc;
  latestState = (await session.waitFor(
    message => message.type === 'player_state' && (message.state?.gold || 0) !== goldBeforeBuy,
    5000,
    'player_state com ouro atualizado apos compra'
  )).state;
  assert((goldBeforeBuy - latestState.gold) === offer.finalPrice, `O desconto nao alterou o custo real da compra. Antes=${goldBeforeBuy}, depois=${latestState.gold}, esperado=${offer.finalPrice}`);
  assert((latestState.inventory || []).some(item => item.itemId === offer.itemId), 'O item comprado nao entrou no inventario.');

  const quest = serviceFocus.quests.find(entry => entry.canAccept);
  session.send({ type: 'npc_service', npcId: traderNpc.id, action: 'accept_quest', questId: quest.questId });
  await session.waitFor(message => message.type === 'chat' && /traga|combinado/i.test(message.text || ''), 5000, 'aceite de missao');
  const acceptedFocus = await session.waitFor(
    message => message.type === 'npc_focus' && (message.npc?.quests || []).some(entry => entry.questId === quest.questId && !entry.canAccept),
    5000,
    'foco do NPC com missao aceita'
  );
  const acceptedQuest = (acceptedFocus.npc.quests || []).find(entry => entry.questId === quest.questId);
  assert(acceptedQuest && !acceptedQuest.canAccept, 'A missao nao mudou para estado aceito.');
  console.log(`[smoke] missao aceita: ${acceptedQuest.title} -> ${acceptedQuest.requiredQty}x ${acceptedQuest.objectiveItemName}`);
  await session.close();
  await delay(250);

  grantInventoryItem(context.charId, acceptedQuest.objectiveItemId, acceptedQuest.requiredQty);

  let returnSession = new WsSession(context.token);
  await returnSession.connect();
  let returnInit = await returnSession.waitForType('init');
  latestState = (await returnSession.waitForType('player_state')).state;
  let returnNpc = returnInit.entities.find(entity => entity.id === traderNpc.id);
  let returnPlayer = returnInit.entities.find(entity => entity.id === returnInit.playerId);
  if (!returnNpc || Math.max(Math.abs(returnNpc.x - returnPlayer.x), Math.abs(returnNpc.y - returnPlayer.y)) > 2) {
    await returnSession.close();
    await delay(200);
    const occupiedReturn = new Set(returnInit.entities.map(entity => `${entity.x},${entity.y}`));
    if (returnNpc) occupiedReturn.delete(`${returnNpc.x},${returnNpc.y}`);
    const adjustedSpawn = returnNpc ? findAdjacentFree(localMap, returnNpc.x, returnNpc.y, occupiedReturn) : null;
    assert(adjustedSpawn, 'Nao foi possivel reposicionar o personagem para a entrega da missao.');
    db.prepare('UPDATE characters SET map_x=?, map_y=?, pos_x=?, pos_y=? WHERE id=?')
      .run(mapX, mapY, adjustedSpawn.x, adjustedSpawn.y, context.charId);

    returnSession = new WsSession(context.token);
    await returnSession.connect();
    returnInit = await returnSession.waitForType('init');
    latestState = (await returnSession.waitForType('player_state')).state;
    returnNpc = returnInit.entities.find(entity => entity.id === traderNpc.id);
    returnPlayer = returnInit.entities.find(entity => entity.id === returnInit.playerId);
  }
  const goldBeforeTurnIn = latestState.gold || 0;
  returnSession.send({ type: 'interact', targetId: traderNpc.id });
  const preTurnInFocus = await returnSession.waitForType('npc_focus');
  await returnSession.waitForType('npc_dialogue');
  const preTurnInQuest = (preTurnInFocus.npc?.quests || []).find(entry => entry.questId === quest.questId);
  console.log(`[smoke] estado antes da entrega: ${preTurnInQuest?.state} (${preTurnInQuest?.currentQty}/${preTurnInQuest?.requiredQty})`);
  returnSession.send({ type: 'npc_service', npcId: traderNpc.id, action: 'turn_in_quest', questId: quest.questId });
  const rewardEvent = await returnSession.waitFor(
    message => message.type === 'loot' || (message.type === 'chat' && message.sender === traderNpc.name),
    5000,
    'recompensa ou resposta do NPC'
  );
  assert(rewardEvent.type === 'loot', `Entrega da missao falhou: ${rewardEvent.text || 'sem resposta util do NPC'}`);
  const rewardLoot = rewardEvent;
  latestState = (await returnSession.waitForType('player_state', 5000)).state;
  const completedFocus = await returnSession.waitFor(
    message => message.type === 'npc_focus' && (message.npc?.quests || []).some(entry => entry.questId === quest.questId && entry.state === 'completed'),
    5000,
    'foco do NPC com missao concluida'
  );
  const completedQuest = (completedFocus.npc.quests || []).find(entry => entry.questId === quest.questId);

  assert((latestState.gold || 0) >= goldBeforeTurnIn + acceptedQuest.rewardGold, 'A recompensa em ouro da missao nao foi aplicada.');
  assert(rewardLoot.items?.some(item => item.item === 'Ouro' && item.qty === acceptedQuest.rewardGold), 'O loot da recompensa nao refletiu o ouro da missao.');
  assert(completedQuest?.state === 'completed', 'A missao nao foi marcada como concluida apos a entrega.');

  const sheet = await api('/api/character/sheet', { headers: { Authorization: `Bearer ${context.token}` } });
  const sheetQuest = (sheet.quests || []).find(entry => entry.questId === quest.questId);
  assert(sheetQuest?.state === 'completed', 'A ficha do personagem nao refletiu a missao concluida.');

  await returnSession.close();
  return {
    npcName: traderNpc.name,
    discountPercent: offer.discountPercent,
    boughtItem: offer.name,
    questTitle: acceptedQuest.title,
    rewardLoot: rewardLoot.items,
  };
}

function findForestGatheringMap(mapX, mapY) {
  for (let offset = 0; offset < 48; offset++) {
    const seed = 700000000 + offset * 7919;
    const localMap = generateMap(mapX, mapY, 'forest', seed);
    const localNpcs = generateNpcs({ mapX, mapY, biome: 'forest', seed, tiles: localMap.tiles, width: localMap.width, height: localMap.height });
    const occupied = new Set([
      ...localMap.monsters.map(monster => `${monster.x},${monster.y}`),
      ...localNpcs.map(npc => `${npc.x},${npc.y}`),
    ]);
    const isSafeSpot = (x, y) => !occupied.has(`${x},${y}`) && isSafeSpawnTile(localMap.tiles, localMap.width, localMap.height, x, y, {
      isBlocked: (bx, by) => occupied.has(`${bx},${by}`),
    });
    const bankSpot = findTile(localMap, (x, y) => isSafeSpot(x, y) && adjacentTiles(localMap, x, y).some(entry => entry.tile === 2));
    const clearSpot = findTile(localMap, (x, y, tile) => isSafeSpot(x, y) && (tile === 0 || tile === 11) && adjacentTiles(localMap, x, y).some(entry => entry.tile === 1));
    if (bankSpot && clearSpot) return { seed, localMap, bankSpot, clearSpot };
  }
  return null;
}

async function runGatheringFlow(context) {
  console.log('[smoke] iniciando pesca, mineracao e agricultura');
  const runOffset = Date.now() % 10000;
  const mapX = 41002 + runOffset;
  const mapY = 41002 + runOffset;
  const match = findForestGatheringMap(mapX, mapY);
  assert(match, 'Nao foi possivel gerar um mapa de floresta com agua e mata densa para o smoke test de oficios.');

  upsertWorldMap(mapX, mapY, 'forest', match.seed);

  db.prepare('UPDATE characters SET map_x=?, map_y=?, pos_x=?, pos_y=? WHERE id=?')
    .run(mapX, mapY, match.bankSpot.x, match.bankSpot.y, context.charId);

  const gatheringSession = new WsSession(context.token);
  await gatheringSession.connect();
  await gatheringSession.waitForType('init');
  console.log(`[smoke] margem de coleta em (${match.bankSpot.x},${match.bankSpot.y}) no mapa ${mapX},${mapY}`);
  let latestState = (await gatheringSession.waitForType('player_state')).state;
  let interaction = (await gatheringSession.waitForType('interaction_context', 5000)).context;
  assert((interaction.actions || []).some(action => action.id === 'fish'), `A margem escolhida nao ofereceu pesca: ${JSON.stringify(interaction.actions || [])}`);
  assert((interaction.actions || []).some(action => action.id === 'mine'), `A margem escolhida nao ofereceu mineracao: ${JSON.stringify(interaction.actions || [])}`);

  gatheringSession.send({ type: 'interact', actionId: 'fish' });
  console.log('[smoke] pescando');
  const fishingLoot = await gatheringSession.waitForType('loot', 5000);
  latestState = (await gatheringSession.waitForType('player_state', 5000)).state;
  assert(fishingLoot.items?.some(item => /Peixe/i.test(item.item)), 'A pesca nao retornou nenhum peixe.');

  gatheringSession.send({ type: 'interact', actionId: 'mine' });
  console.log('[smoke] minerando no rio');
  const miningLoot = await gatheringSession.waitForType('loot', 5000);
  latestState = (await gatheringSession.waitForType('player_state', 5000)).state;
  assert(miningLoot.items?.some(item => /Minerio|Pedra|Reliquia/i.test(item.item)), 'A mineracao nao retornou recursos minerados.');
  await gatheringSession.close();

  db.prepare('UPDATE characters SET map_x=?, map_y=?, pos_x=?, pos_y=? WHERE id=?')
    .run(mapX, mapY, match.clearSpot.x, match.clearSpot.y, context.charId);

  const farmingSession = new WsSession(context.token);
  await farmingSession.connect();
  await farmingSession.waitForType('init');
  console.log(`[smoke] clareira em (${match.clearSpot.x},${match.clearSpot.y}) no mapa ${mapX},${mapY}`);
  latestState = (await farmingSession.waitForType('player_state')).state;
  interaction = (await farmingSession.waitForType('interaction_context', 5000)).context;
  assert((interaction.actions || []).some(action => action.id === 'clear_land'), `A clareira escolhida nao ofereceu abertura de terreno: ${JSON.stringify(interaction.actions || [])}`);

  farmingSession.send({ type: 'interact', actionId: 'clear_land' });
  console.log('[smoke] abrindo clareira');
  const clearingLoot = await farmingSession.waitForType('loot', 5000);
  assert(clearingLoot.items?.some(item => /Tora|Semente/i.test(item.item)), 'A abertura da clareira nao gerou recursos esperados.');
  latestState = (await farmingSession.waitForType('player_state', 5000)).state;

  interaction = (await farmingSession.waitFor(message => message.type === 'interaction_context' && (message.context?.actions || []).some(action => action.id === 'plant_crop'), 5000)).context;
  assert((interaction.actions || []).some(action => action.id === 'plant_crop'), `O terreno preparado nao ofereceu plantio: ${JSON.stringify(interaction.actions || [])}`);
  farmingSession.send({ type: 'interact', actionId: 'plant_crop' });
  console.log('[smoke] plantando');
  latestState = (await farmingSession.waitForType('player_state', 5000)).state;

  await delay(1500);
  farmingSession.send({ type: 'interact' });
  console.log('[smoke] colhendo');
  const harvestLoot = await farmingSession.waitForType('loot', 5000);
  assert(harvestLoot.items?.some(item => /Feixe|Tuberculo|Erva/i.test(item.item)), 'A agricultura nao gerou colheita madura apos o cultivo.');

  await farmingSession.close();
  await delay(200);
  const storedSkillsRow = db.prepare('SELECT life_skills FROM characters WHERE id=?').get(context.charId);
  const lifeSkillsRaw = JSON.parse(storedSkillsRow?.life_skills || '{}');
  const lifeSkills = Object.entries(lifeSkillsRaw).map(([id, state]) => ({ id, ...(state || {}) }));
  const byId = Object.fromEntries(lifeSkills.map(skill => [skill.id, skill]));
  assert((byId.fishing?.xp || 0) > 0, 'Pesca nao registrou XP.');
  assert((byId.mining?.xp || 0) > 0, 'Mineracao nao registrou XP.');
  assert((byId.farming?.xp || 0) >= 58, 'Agricultura nao registrou XP suficiente para plantio e colheita completos.');

  return {
    fishingLoot: fishingLoot.items,
    miningLoot: miningLoot.items,
    harvestLoot: harvestLoot.items,
    lifeSkills,
  };
}

async function main() {
  let context = null;
  try {
    context = await registerAndCreateCharacter();
    if (process.env.SMOKE_MODE === 'gathering') {
      const gathering = await runGatheringFlow(context);
      console.log('Smoke de oficios concluido com sucesso.');
      console.log(JSON.stringify({ gathering }, null, 2));
      return;
    }

    const combat = await runCombatFlow(context);
    const memory = await runNpcMemoryFlow(context);
    const services = await runNpcServicesFlow(context);
    const gathering = SKIP_GATHERING_SMOKE ? null : await runGatheringFlow(context);

    console.log('Smoke test concluido com sucesso.');
    console.log(JSON.stringify({ combat, memory, services, ...(gathering ? { gathering } : {}) }, null, 2));
  } finally {
    if (context && !KEEP_SMOKE_ACCOUNT) cleanupAccount(context.accountId);
  }
}

main().catch(error => {
  console.error('Smoke test falhou:', error.message);
  process.exitCode = 1;
});