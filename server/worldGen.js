// server/worldGen.js — Aeterra: World Breaker Procedural World Generator
'use strict';

// ---- Seeded RNG (mulberry32) ----
function mkRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- Tile IDs ----
const T = {
  GRASS:      0,
  TREE:       1,
  WATER:      2,
  ROCK:       3,
  PATH:       4,
  SAND:       5,
  WALL:       6,
  FLOOR:      7,
  DOOR:       8,
  CHEST:      9,
  DUNGEON:   10,
  TALL_GRASS:11,
  MONUMENT:  12,
};

const SOLID = new Set([T.TREE, T.WATER, T.ROCK, T.WALL]);

// ---- Map dimensions ----
const W = 50;
const H = 35;

// ---- Monster templates per biome ----
const MONSTERS = {
  forest: [
    { name:'Lobo Cinzento',  char:'🐺', hp:30, atk:8,  def:3,  spd:4, exp:15, gold:2,  rank:'F' },
    { name:'Aranha Gigante', char:'🕷', hp:20, atk:10, def:2,  spd:6, exp:12, gold:1,  rank:'F', inflicts:['poisoned'] },
    { name:'Espírito Verde', char:'👾', hp:50, atk:12, def:5,  spd:5, exp:30, gold:5,  rank:'E' },
    { name:'Urso das Matas', char:'🐻', hp:80, atk:15, def:8,  spd:2, exp:40, gold:8,  rank:'D', inflicts:['bleeding'] },
  ],
  desert: [
    { name:'Escorpião',         char:'🦂', hp:25, atk:12, def:4,  spd:5, exp:18, gold:3, rank:'F', inflicts:['poisoned'] },
    { name:'Serpente de Areia', char:'🐍', hp:35, atk:11, def:3,  spd:8, exp:22, gold:4, rank:'E' },
    { name:'Múmia das Areias',  char:'💀', hp:60, atk:14, def:10, spd:2, exp:35, gold:6, rank:'D' },
  ],
  mountain: [
    { name:'Goblin das Minas',  char:'👺', hp:40, atk:10, def:6,  spd:5, exp:20, gold:5,  rank:'F' },
    { name:'Águia das Alturas', char:'🦅', hp:55, atk:13, def:5,  spd:9, exp:28, gold:6,  rank:'E' },
    { name:'Troll da Pedra',    char:'👹', hp:120,atk:18, def:12, spd:2, exp:60, gold:15, rank:'C' },
  ],
  city: [
    { name:'Cão de Rua',        char:'🐕', hp:22, atk:6,  def:2,  spd:7, exp:10, gold:1,  rank:'F', disposition:'neutral' },
    { name:'Corvo Urbano',      char:'🐦', hp:18, atk:5,  def:1,  spd:9, exp:9,  gold:1,  rank:'F', disposition:'neutral' },
    { name:'Guarda de Patrulha', char:'🛡', hp:70, atk:14, def:10, spd:4, exp:30, gold:5,  rank:'E', disposition:'neutral' },
  ],
  water: [
    { name:'Piranha Mutante',      char:'🐟', hp:20, atk:9,  def:2,  spd:10,exp:12, gold:2, rank:'F' },
    { name:'Polvo das Profundezas',char:'🐙', hp:55, atk:12, def:8,  spd:4, exp:30, gold:5, rank:'E' },
    { name:'Serpente do Rio',      char:'🐊', hp:70, atk:16, def:7,  spd:5, exp:38, gold:7, rank:'D' },
  ],
  plains: [
    { name:'Javali Selvagem',   char:'🐗', hp:50, atk:13, def:6,  spd:7, exp:25, gold:3,  rank:'E' },
    { name:'Bandido do Caminho',char:'🗡', hp:35, atk:11, def:5,  spd:6, exp:18, gold:6,  rank:'F', inflicts:['bleeding'] },
    { name:'Cavaleiro Maldito', char:'⚔', hp:90, atk:17, def:12, spd:4, exp:50, gold:14, rank:'C' },
  ],
  anomaly: [
    { name:'Ente Corrompido',     char:'👾', hp:60, atk:18, def:6, spd:7, exp:45, gold:10, rank:'D' },
    { name:'Fragmento de Vazio',  char:'⬛', hp:40, atk:22, def:3, spd:9, exp:40, gold:8,  rank:'C', inflicts:['weakened'] },
    { name:'Espectro Dimensional',char:'👻', hp:80, atk:20, def:8, spd:6, exp:60, gold:12, rank:'B' },
  ],
};

// ---- Helpers ----
function idx(x, y) { return y * W + x; }

function borderExit(x, y) {
  const mx = Math.floor(W / 2), my = Math.floor(H / 2);
  if (y === 0 || y === H - 1) return Math.abs(x - mx) <= 1;
  if (x === 0 || x === W - 1) return Math.abs(y - my) <= 1;
  return false;
}

function addClusters(tiles, rng, type, density) {
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (borderExit(x, y)) continue;
      if (tiles[idx(x,y)] !== 0 && tiles[idx(x,y)] !== T.GRASS && tiles[idx(x,y)] !== T.SAND) continue;
      if (rng() < density) {
        tiles[idx(x,y)] = type;
        for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          const nx = x+dx, ny = y+dy;
          if (nx>0&&nx<W-1&&ny>0&&ny<H-1&&!borderExit(nx,ny)&&rng()<0.5) tiles[idx(nx,ny)] = type;
        }
      }
    }
  }
}

function addSparse(tiles, rng, type, density) {
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (borderExit(x, y)) continue;
      const t = tiles[idx(x, y)];
      if (SOLID.has(t)) continue;
      if (rng() < density) tiles[idx(x, y)] = type;
    }
  }
}

function addCrossPath(tiles) {
  const mx = Math.floor(W / 2), my = Math.floor(H / 2);
  for (let x = 1; x < W - 1; x++) tiles[idx(x, my)] = T.PATH;
  for (let y = 1; y < H - 1; y++) tiles[idx(mx, y)] = T.PATH;
}

function openBorderExits(tiles) {
  const mx = Math.floor(W / 2), my = Math.floor(H / 2);
  for (let d = -1; d <= 1; d++) {
    tiles[idx(mx+d, 0)]     = T.PATH;
    tiles[idx(mx+d, H-1)]   = T.PATH;
    tiles[idx(0,   my+d)]   = T.PATH;
    tiles[idx(W-1, my+d)]   = T.PATH;
  }
}

const SPAWN_TILE_PRIORITY = new Map([
  [T.PATH, 0],
  [T.FLOOR, 1],
  [T.GRASS, 2],
  [T.SAND, 2],
  [T.TALL_GRASS, 3],
  [T.DOOR, 4],
  [T.CHEST, 5],
  [T.DUNGEON, 6],
]);

function isTraversableTile(tile) {
  return !SOLID.has(tile);
}

function countTraversableNeighbors(tiles, width, height, x, y, isBlocked = () => false) {
  let open = 0;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
    if (!isTraversableTile(tiles[ny * width + nx])) continue;
    if (isBlocked(nx, ny)) continue;
    open++;
  }
  return open;
}

function countReachableTiles(tiles, width, height, startX, startY, isBlocked = () => false, maxTiles = 48) {
  if (startX < 0 || startY < 0 || startX >= width || startY >= height) return 0;
  if (!isTraversableTile(tiles[startY * width + startX]) || isBlocked(startX, startY)) return 0;

  const queue = [[startX, startY]];
  const seen = new Set([`${startX},${startY}`]);

  for (let i = 0; i < queue.length && seen.size < maxTiles; i++) {
    const [x, y] = queue[i];
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nx = x + dx;
      const ny = y + dy;
      const key = `${nx},${ny}`;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height || seen.has(key)) continue;
      if (!isTraversableTile(tiles[ny * width + nx]) || isBlocked(nx, ny)) continue;
      seen.add(key);
      queue.push([nx, ny]);
    }
  }

  return seen.size;
}

function isSafeSpawnTile(tiles, width, height, x, y, options = {}) {
  const isBlocked = options.isBlocked || (() => false);
  const minReachable = options.minReachable ?? 12;
  if (x < 0 || y < 0 || x >= width || y >= height) return false;
  if (!isTraversableTile(tiles[y * width + x]) || isBlocked(x, y)) return false;
  if (countTraversableNeighbors(tiles, width, height, x, y, isBlocked) === 0) return false;
  return countReachableTiles(tiles, width, height, x, y, isBlocked, Math.max(minReachable, 48)) >= minReachable;
}

function findSafeSpawn(tiles, width, height, options = {}) {
  const isBlocked = options.isBlocked || (() => false);
  const minReachable = options.minReachable ?? 12;
  const centerX = Math.floor(width / 2);
  const centerY = Math.floor(height / 2);
  const viable = [];
  let fallback = null;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const tile = tiles[y * width + x];
      if (!isTraversableTile(tile) || isBlocked(x, y)) continue;

      const neighbors = countTraversableNeighbors(tiles, width, height, x, y, isBlocked);
      if (!neighbors) continue;

      const reachable = countReachableTiles(tiles, width, height, x, y, isBlocked, Math.max(minReachable, 48));
      const candidate = {
        x,
        y,
        tile,
        reachable,
        neighbors,
        rank: SPAWN_TILE_PRIORITY.get(tile) ?? 99,
        dist: Math.abs(x - centerX) + Math.abs(y - centerY),
      };

      if (!fallback || candidate.reachable > fallback.reachable || (candidate.reachable === fallback.reachable && candidate.rank < fallback.rank) || (candidate.reachable === fallback.reachable && candidate.rank === fallback.rank && candidate.dist < fallback.dist)) {
        fallback = candidate;
      }

      if (reachable >= minReachable) viable.push(candidate);
    }
  }

  viable.sort((left, right) => left.rank - right.rank || left.dist - right.dist || right.reachable - left.reachable || right.neighbors - left.neighbors);
  const best = viable[0] || fallback;
  return best ? { x: best.x, y: best.y, tile: best.tile, reachable: best.reachable } : null;
}

// ---- Map Rank ----
const MAP_RANKS = ['F', 'E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS'];

function calcMapRank(mapX, mapY, biome) {
  const dist = Math.max(Math.abs(mapX), Math.abs(mapY));
  let rankIdx;
  if      (dist <= 3)   rankIdx = 0; // F
  else if (dist <= 8)   rankIdx = 1; // E
  else if (dist <= 15)  rankIdx = 2; // D
  else if (dist <= 25)  rankIdx = 3; // C
  else if (dist <= 40)  rankIdx = 4; // B
  else if (dist <= 60)  rankIdx = 5; // A
  else if (dist <= 90)  rankIdx = 6; // S
  else if (dist <= 130) rankIdx = 7; // SS
  else                  rankIdx = 8; // SSS
  if (biome === 'anomaly') rankIdx = Math.min(rankIdx + 1, 8);
  return MAP_RANKS[rankIdx];
}

function mapHasMonument(rank, biome) {
  if (biome === 'city') return true;
  const monumentRanks = new Set(['B', 'A', 'S', 'SS', 'SSS']);
  return monumentRanks.has(rank);
}

// ---- Map Name Generation ----
const NAME_PARTS = {
  forest: {
    prefix: ['Floresta', 'Bosque', 'Selva', 'Arvoredo', 'Mata'],
    mid: ['de', 'das', 'dos', 'do'],
    suffix: ['Sombras', 'Espíritos', 'Almas Perdidas', 'Névoa Eterna', 'Sussurros', 'Sangue Antigo', 'Guardião Verde', 'Lamentos', 'Anciãos'],
  },
  desert: {
    prefix: ['Deserto', 'Planície Árida', 'Dunas', 'Mar de Areia', 'Ermos'],
    mid: ['de', 'da', 'do', 'dos'],
    suffix: ['Ossos', 'Silêncio', 'Fogo Morto', 'Tempestade', 'Memórias', 'Sol Partido', 'Caçadores Caídos', 'Sede Eterna'],
  },
  mountain: {
    prefix: ['Pico', 'Serra', 'Montanha', 'Cordilheira', 'Cumes'],
    mid: ['de', 'da', 'do', 'dos'],
    suffix: ['Trovões', 'Gelo Eterno', 'Abismo', 'Pedra Sangrada', 'Vento Afiado', 'Titãs Caídos', 'Eco Morto', 'Queda'],
  },
  city: {
    prefix: ['Cidade', 'Fortaleza', 'Bastião', 'Porto', 'Assentamento'],
    mid: ['de', 'da', 'do'],
    suffix: ['Cinzas', 'Ferro', 'Jade', 'Poeira', 'Âncoras', 'Almas', 'Cicatrizes', 'Pedra e Sangue'],
  },
  water: {
    prefix: ['Lago', 'Rio', 'Mar Interno', 'Abismo Aquático', 'Águas'],
    mid: ['de', 'das', 'dos', 'do'],
    suffix: ['Profundezas', 'Correntes Mortas', 'Afogados', 'Marés Negras', 'Ecos Submersos', 'Silêncio Fundo'],
  },
  plains: {
    prefix: ['Planícies', 'Campos', 'Vales', 'Pradaria', 'Estepes'],
    mid: ['de', 'das', 'dos', 'do'],
    suffix: ['Cinza', 'Batalha Antiga', 'Vento Livre', 'Ossos e Ervas', 'Promessa Quebrada', 'Sangue Seco'],
  },
  anomaly: {
    prefix: ['Fenda', 'Vazio', 'Fragmento', 'Brecha', 'Ruína Dimensional'],
    mid: ['de', 'da', 'do', 'dos'],
    suffix: ['Esquecimento', 'Realidade Rasgada', 'Ecos do Fim', 'Corrução Pura', 'Devora-Almas', 'Inversão'],
  },
};

const TITLE_SUFFIXES = ['Proibido', 'Maldito', 'Esquecido', 'Amaldiçoado', 'Eterno', 'Sangrento', 'Morto', 'Corrompido'];

function generateMapName(mapX, mapY, biome, seed) {
  const rng = mkRng(seed ^ 0xDEADBEEF);
  const parts = NAME_PARTS[biome] || NAME_PARTS.plains;
  const prefix = parts.prefix[Math.floor(rng() * parts.prefix.length)];
  const mid    = parts.mid[Math.floor(rng() * parts.mid.length)];
  const suffix = parts.suffix[Math.floor(rng() * parts.suffix.length)];
  // High rank maps or anomalies sometimes get a dramatic title suffix
  const dist = Math.max(Math.abs(mapX), Math.abs(mapY));
  if (dist > 40 && rng() < 0.4) {
    const title = TITLE_SUFFIXES[Math.floor(rng() * TITLE_SUFFIXES.length)];
    return `${prefix} ${mid} ${suffix} — ${title}`;
  }
  return `${prefix} ${mid} ${suffix}`;
}

function placeFeature(tiles, rng, type) {
  let fx, fy, tries = 0;
  do {
    fx = 4 + Math.floor(rng() * (W - 8));
    fy = 4 + Math.floor(rng() * (H - 8));
    tries++;
  } while (SOLID.has(tiles[idx(fx, fy)]) && tries < 50);
  if (tries >= 50) return;

  if (type === 'chest') {
    tiles[idx(fx, fy)] = T.CHEST;
  } else if (type === 'dungeon') {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        tiles[idx(fx+dx, fy+dy)] = T.FLOOR;
    tiles[idx(fx, fy)] = T.DUNGEON;
  } else if (type === 'ruin') {
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        tiles[idx(fx+dx, fy+dy)] = (Math.abs(dx)===2||Math.abs(dy)===2) ? T.WALL : T.FLOOR;
      }
    tiles[idx(fx, fy)] = T.CHEST;
  } else if (type === 'monument') {
    // Small clearing around the monument — preserve solid tiles (water, rock, etc.)
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = fx+dx, ny = fy+dy;
        if (nx > 0 && nx < W-1 && ny > 0 && ny < H-1 && !borderExit(nx, ny) && !SOLID.has(tiles[idx(nx, ny)]))
          tiles[idx(nx, ny)] = T.FLOOR;
      }
    tiles[idx(fx, fy)] = T.MONUMENT;
  }
}

function generateCity(tiles, rng) {
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++)
      tiles[idx(x,y)] = T.PATH;

  const bs = 6, gap = 2;
  for (let by = gap; by < H - bs - gap; by += bs + gap) {
    for (let bx = gap; bx < W - bs - gap; bx += bs + gap) {
      for (let dy = 0; dy < bs; dy++)
        for (let dx = 0; dx < bs; dx++) {
          const t = (dx===0||dx===bs-1||dy===0||dy===bs-1) ? T.WALL : T.FLOOR;
          tiles[idx(bx+dx, by+dy)] = t;
        }
      tiles[idx(bx + Math.floor(bs/2), by + bs - 1)] = T.DOOR;
    }
  }
}

// ---- Main generator ----
function generateMap(mapX, mapY, biome, seed) {
  const rng    = mkRng(seed || (mapX * 31337 + mapY * 17 + (biome.charCodeAt(0) || 1)));
  const tiles  = new Array(W * H);
  const base   = { forest:T.GRASS, desert:T.SAND, mountain:T.ROCK, city:T.FLOOR, water:T.WATER, plains:T.GRASS, anomaly:T.FLOOR }[biome] ?? T.GRASS;
  tiles.fill(base);

  // Solid border of trees / rocks
  for (let x = 0; x < W; x++) { tiles[idx(x,0)] = T.TREE; tiles[idx(x,H-1)] = T.TREE; }
  for (let y = 1; y < H-1;  y++) { tiles[idx(0,y)] = T.TREE; tiles[idx(W-1,y)] = T.TREE; }

  openBorderExits(tiles);

  switch (biome) {
    case 'forest':
      addClusters(tiles, rng, T.TREE, 0.28);
      addSparse(tiles, rng, T.TALL_GRASS, 0.08);
      addSparse(tiles, rng, T.WATER, 0.008);
      addCrossPath(tiles);
      placeFeature(tiles, rng, 'chest');
      break;
    case 'desert':
      addClusters(tiles, rng, T.ROCK, 0.08);
      addSparse(tiles, rng, T.WATER, 0.004);
      addCrossPath(tiles);
      placeFeature(tiles, rng, 'ruin');
      break;
    case 'mountain':
      addClusters(tiles, rng, T.ROCK, 0.38);
      addSparse(tiles, rng, T.WATER, 0.006);
      addCrossPath(tiles);
      placeFeature(tiles, rng, 'dungeon');
      placeFeature(tiles, rng, 'chest');
      break;
    case 'city':
      generateCity(tiles, rng);
      break;
    case 'water':
      // islands
      for (let i = 0; i < W*H; i++) {
        const x = i%W, y = Math.floor(i/W);
        if (x===0||x===W-1||y===0||y===H-1) continue;
        if (tiles[i]===T.WATER && rng()<0.08) tiles[i]=T.GRASS;
      }
      addCrossPath(tiles);
      break;
    case 'plains':
      addSparse(tiles, rng, T.TREE, 0.04);
      addSparse(tiles, rng, T.TALL_GRASS, 0.14);
      addSparse(tiles, rng, T.WATER, 0.008);
      addCrossPath(tiles);
      placeFeature(tiles, rng, 'chest');
      break;
    case 'anomaly':
      addClusters(tiles, rng, T.ROCK, 0.12);
      addSparse(tiles, rng, T.WATER, 0.04);
      for (let i = 0; i < W*H; i++) {
        const x = i%W, y = Math.floor(i/W);
        if (x===0||x===W-1||y===0||y===H-1) continue;
        if (!borderExit(x,y) && rng()<0.02) tiles[i]=T.WALL;
      }
      placeFeature(tiles, rng, 'dungeon');
      break;
  }

  // Place monument for rank B+ maps and all city maps
  // Use a separate RNG so monument placement doesn't shift monster spawn positions
  const rank = calcMapRank(mapX, mapY, biome);
  if (mapHasMonument(rank, biome)) {
    const monumentRng = mkRng((seed ^ 0xC0FFEE) + mapX * 97 + mapY * 31);
    placeFeature(tiles, monumentRng, 'monument');
  }

  // Spawn monsters — never within SAFE_RADIUS tiles of the map center (player spawn area)
  const pool   = MONSTERS[biome] || MONSTERS.plains;
  const count  = biome === 'city' ? 2 + Math.floor(rng() * 3) : 4 + Math.floor(rng() * 6);
  const monsters = [];
  const centerX = Math.floor(W / 2);
  const centerY = Math.floor(H / 2);
  const SAFE_RADIUS = 8;

  for (let i = 0; i < count; i++) {
    let mx, my, tries = 0;
    do {
      mx = 2 + Math.floor(rng() * (W - 4));
      my = 2 + Math.floor(rng() * (H - 4));
      tries++;
    } while (
      (SOLID.has(tiles[idx(mx, my)]) ||
        (Math.abs(mx - centerX) <= SAFE_RADIUS && Math.abs(my - centerY) <= SAFE_RADIUS)) &&
      tries < 60
    );
    if (tries >= 60) continue;

    const tpl = pool[Math.floor(rng() * pool.length)];
    monsters.push({
      id:       `m_${Date.now()}_${i}_${mapX}_${mapY}`,
      ...JSON.parse(JSON.stringify(tpl)),
      maxHp:    tpl.hp,
      x: mx, y: my,
      state:       'idle',
      targetId:    null,
      moveTimer:   0,
      attackTimer: 0,
      spawnX: mx, spawnY: my,
    });
  }

  return { tiles, width: W, height: H, monsters, biome, mapX, mapY };
}

module.exports = { generateMap, T, SOLID, MONSTERS, MAP_W: W, MAP_H: H, findSafeSpawn, isSafeSpawnTile, isTraversableTile, calcMapRank, generateMapName, mapHasMonument };
