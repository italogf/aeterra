'use strict';

function mkRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function safeParseJson(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  try { return JSON.parse(value); }
  catch { return fallback; }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function hashText(value) {
  let hash = 2166136261;
  const text = String(value || '');
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pick(rng, items) {
  return items[Math.floor(rng() * items.length)];
}

function sumBonuses(target, source) {
  Object.entries(source || {}).forEach(([key, value]) => {
    target[key] = (target[key] || 0) + value;
  });
  return target;
}

function scaleBonusValue(value, multiplier) {
  const base = Number(value || 0);
  if (base === 0) return 0;
  const scaled = base * multiplier;
  return scaled > 0 ? Math.ceil(scaled) : Math.floor(scaled);
}

const RARITY_EQUIP_MULTIPLIER = Object.freeze({
  common: 1,
  uncommon: 1.2,
  rare: 1.45,
  epic: 1.75,
  legendary: 2.1,
});

const MEDICINAL_ITEM_EFFECTS = Object.freeze({
  healing_herb: { healFlat: 18, healPercent: 0.08, mpFlat: 6 },
  marsh_herb: { healFlat: 24, healPercent: 0.1, mpFlat: 8 },
  moon_tuber: { healFlat: 14, healPercent: 0.05, mpFlat: 4 },
});

const ITEM_DEFS = Object.freeze({
  rusted_blade: {
    id: 'rusted_blade', name: 'Lamina Gasta', type: 'equipment', slot: 'weapon',
    rarity: 'common', stackable: false, discipline: 'martial', tags: ['blade', 'martial'],
    bonuses: { atk: 2 }, description: 'Uma espada simples, mas confiavel.'
  },
  oak_bow: {
    id: 'oak_bow', name: 'Arco de Carvalho', type: 'equipment', slot: 'weapon',
    rarity: 'common', stackable: false, discipline: 'survival', tags: ['bow', 'survival'],
    bonuses: { atk: 2, spd: 1 }, description: 'Arco leve usado por patrulheiros.'
  },
  ritual_staff: {
    id: 'ritual_staff', name: 'Cajado Ritual', type: 'equipment', slot: 'weapon',
    rarity: 'common', stackable: false, discipline: 'arcane', tags: ['focus', 'arcane'],
    bonuses: { atk: 1, maxMp: 10 }, description: 'Um foco antigo para praticantes do oculto.'
  },
  road_dagger: {
    id: 'road_dagger', name: 'Adaga de Estrada', type: 'equipment', slot: 'weapon',
    rarity: 'common', stackable: false, discipline: 'guile', tags: ['dagger', 'guile'],
    bonuses: { atk: 1, spd: 2 }, description: 'Preferida por batedores e oportunistas.'
  },
  pilgrim_mace: {
    id: 'pilgrim_mace', name: 'Maca Peregrina', type: 'equipment', slot: 'weapon',
    rarity: 'common', stackable: false, discipline: 'faith', tags: ['mace', 'faith'],
    bonuses: { atk: 2, def: 1 }, description: 'Arma cerimonial que tambem protege.'
  },
  trail_boots: {
    id: 'trail_boots', name: 'Botas de Trilha', type: 'equipment', slot: 'boots',
    rarity: 'common', stackable: false, discipline: 'survival', tags: ['boots', 'survival'],
    bonuses: { spd: 1 }, description: 'Feitas para longas jornadas.'
  },
  leather_vest: {
    id: 'leather_vest', name: 'Gibao de Couro', type: 'equipment', slot: 'armor',
    rarity: 'common', stackable: false, discipline: 'martial', tags: ['armor', 'martial'],
    bonuses: { def: 2 }, description: 'Protecao leve e versatil.'
  },
  iron_buckler: {
    id: 'iron_buckler', name: 'Broquel de Ferro', type: 'equipment', slot: 'ring',
    rarity: 'uncommon', stackable: false, discipline: 'martial', tags: ['shield', 'martial'],
    bonuses: { def: 3 }, description: 'Um broquel adaptado como talisma defensivo.'
  },
  warding_ring: {
    id: 'warding_ring', name: 'Anel de Guarda', type: 'equipment', slot: 'ring',
    rarity: 'uncommon', stackable: false, discipline: 'faith', tags: ['ring', 'faith'],
    bonuses: { def: 2, maxHp: 8 }, description: 'Canaliza protecao sobre o portador.'
  },
  ember_ring: {
    id: 'ember_ring', name: 'Anel da Brasa', type: 'equipment', slot: 'ring',
    rarity: 'rare', stackable: false, discipline: 'arcane', tags: ['ring', 'arcane'],
    bonuses: { atk: 2, maxMp: 12 }, description: 'Talisma que vibra com poder latente.'
  },
  scout_hood: {
    id: 'scout_hood', name: 'Capuz de Batedor', type: 'equipment', slot: 'helmet',
    rarity: 'uncommon', stackable: false, discipline: 'guile', tags: ['helmet', 'guile'],
    bonuses: { spd: 1, def: 1 }, description: 'Ajuda a passar despercebido.'
  },
  guild_seal: {
    id: 'guild_seal', name: 'Selo de Guilda', type: 'equipment', slot: 'ring',
    rarity: 'common', stackable: false, discipline: 'civic', tags: ['seal', 'civic'],
    bonuses: { def: 1, maxMp: 4 }, description: 'Insignia de oficios urbanos.'
  },
  healing_herb: {
    id: 'healing_herb', name: 'Erva Medicinal', type: 'material', stackable: true,
    rarity: 'common', discipline: 'survival', tags: ['herb', 'survival'], bonuses: {},
    description: 'Ingrediente basico para remedios e tonicos.'
  },
  venom_gland: {
    id: 'venom_gland', name: 'Glandula Venenosa', type: 'material', stackable: true,
    rarity: 'common', discipline: 'guile', tags: ['poison', 'guile'], bonuses: {},
    description: 'Material perigoso extraido de criaturas venenosas.'
  },
  ancient_relic: {
    id: 'ancient_relic', name: 'Reliquia Antiga', type: 'material', stackable: true,
    rarity: 'rare', discipline: 'arcane', tags: ['relic', 'arcane'], bonuses: {},
    description: 'Fragmento valioso de eras esquecidas.'
  },
  city_pass: {
    id: 'city_pass', name: 'Passe Urbano', type: 'material', stackable: true,
    rarity: 'common', discipline: 'civic', tags: ['token', 'civic'], bonuses: {},
    description: 'Documento reconhecido por habitantes das cidades.'
  },
  stone_shard: {
    id: 'stone_shard', name: 'Fragmento de Pedra', type: 'material', stackable: true,
    rarity: 'common', discipline: 'martial', tags: ['ore', 'stone'], bonuses: {},
    description: 'Pedra lascada, util para construcao e forja bruta.'
  },
  copper_ore: {
    id: 'copper_ore', name: 'Minerio de Cobre', type: 'material', stackable: true,
    rarity: 'common', discipline: 'martial', tags: ['ore', 'metal'], bonuses: {},
    description: 'Minerio maleavel usado em ligas basicas.'
  },
  iron_ore: {
    id: 'iron_ore', name: 'Minerio de Ferro', type: 'material', stackable: true,
    rarity: 'uncommon', discipline: 'martial', tags: ['ore', 'metal'], bonuses: {},
    description: 'Nodulo pesado que sustenta armas e ferramentas melhores.'
  },
  wood_log: {
    id: 'wood_log', name: 'Tora Bruta', type: 'material', stackable: true,
    rarity: 'common', discipline: 'survival', tags: ['wood', 'craft'], bonuses: {},
    description: 'Madeira recem-cortada, ideal para futuras construcoes e ferramentas.'
  },
  wild_seed: {
    id: 'wild_seed', name: 'Semente Silvestre', type: 'material', stackable: true,
    rarity: 'common', discipline: 'survival', tags: ['seed', 'farming'], bonuses: {},
    description: 'Semente resistente que pega bem em solo fertil.'
  },
  grain_bundle: {
    id: 'grain_bundle', name: 'Feixe de Graos', type: 'material', stackable: true,
    rarity: 'common', discipline: 'civic', tags: ['grain', 'farming'], bonuses: {},
    description: 'Graos secos colhidos em terreno fertil.'
  },
  moon_tuber: {
    id: 'moon_tuber', name: 'Tuberculo Lunar', type: 'material', stackable: true,
    rarity: 'common', discipline: 'survival', tags: ['crop', 'farming'], bonuses: {},
    description: 'Raiz densa que cresce melhor em clareiras bem cuidadas.'
  },
  marsh_herb: {
    id: 'marsh_herb', name: 'Erva de Varzea', type: 'material', stackable: true,
    rarity: 'uncommon', discipline: 'survival', tags: ['herb', 'farming'], bonuses: {},
    description: 'Planta umida valorizada por alquimistas e curandeiros.'
  },
  river_fish: {
    id: 'river_fish', name: 'Peixe de Rio', type: 'material', stackable: true,
    rarity: 'common', discipline: 'survival', tags: ['fish', 'fishing'], bonuses: {},
    description: 'Captura comum em margens e lagos tranquilos.'
  },
  silver_fish: {
    id: 'silver_fish', name: 'Peixe Prateado', type: 'material', stackable: true,
    rarity: 'uncommon', discipline: 'survival', tags: ['fish', 'fishing'], bonuses: {},
    description: 'Especie agil de escamas brilhantes.'
  },
  cavern_eel: {
    id: 'cavern_eel', name: 'Enguia de Gruta', type: 'material', stackable: true,
    rarity: 'rare', discipline: 'arcane', tags: ['fish', 'fishing'], bonuses: {},
    description: 'Criatura rara de aguas profundas e sombrias.'
  }
});

const ITEM_VALUES = Object.freeze({
  rusted_blade: 38,
  oak_bow: 42,
  ritual_staff: 52,
  road_dagger: 36,
  pilgrim_mace: 44,
  trail_boots: 24,
  leather_vest: 30,
  iron_buckler: 54,
  warding_ring: 68,
  ember_ring: 110,
  scout_hood: 28,
  guild_seal: 32,
  healing_herb: 8,
  venom_gland: 18,
  ancient_relic: 44,
  city_pass: 12,
  stone_shard: 6,
  copper_ore: 12,
  iron_ore: 22,
  wood_log: 5,
  wild_seed: 4,
  grain_bundle: 9,
  moon_tuber: 8,
  marsh_herb: 16,
  river_fish: 7,
  silver_fish: 16,
  cavern_eel: 30,
});

const TRADE_PROFESSION_RX = /mercador|estalajadeir|ferreir|moleir|barqueir/i;
const TRADE_STOCK_BY_PROFESSION = Object.freeze({
  mercador: ['healing_herb', 'wild_seed', 'grain_bundle', 'city_pass'],
  estalajadeira: ['healing_herb', 'river_fish', 'grain_bundle', 'moon_tuber'],
  ferreiro: ['stone_shard', 'copper_ore', 'iron_ore', 'rusted_blade', 'leather_vest'],
  moleiro: ['grain_bundle', 'wild_seed', 'wood_log', 'healing_herb'],
  barqueiro: ['river_fish', 'silver_fish', 'city_pass', 'wood_log'],
  default: ['healing_herb', 'grain_bundle', 'wild_seed'],
});

const TRADE_STOCK_BY_BIOME = Object.freeze({
  forest: ['wood_log', 'healing_herb', 'trail_boots'],
  desert: ['moon_tuber', 'healing_herb', 'road_dagger'],
  mountain: ['stone_shard', 'copper_ore', 'iron_ore'],
  city: ['city_pass', 'guild_seal', 'healing_herb'],
  water: ['river_fish', 'silver_fish', 'city_pass'],
  plains: ['grain_bundle', 'wild_seed', 'oak_bow'],
  anomaly: ['ancient_relic', 'cavern_eel', 'ritual_staff'],
});

const QUEST_ITEMS_BY_BIOME = Object.freeze({
  forest: ['wood_log', 'healing_herb', 'venom_gland', 'wild_seed'],
  desert: ['moon_tuber', 'healing_herb', 'ancient_relic'],
  mountain: ['stone_shard', 'copper_ore', 'iron_ore'],
  city: ['grain_bundle', 'healing_herb', 'city_pass'],
  water: ['river_fish', 'silver_fish', 'marsh_herb'],
  plains: ['grain_bundle', 'wild_seed', 'river_fish'],
  anomaly: ['ancient_relic', 'cavern_eel', 'marsh_herb'],
});

const QUEST_ITEMS_BY_PROFESSION = Object.freeze({
  mercador: ['grain_bundle', 'healing_herb', 'city_pass'],
  estalajadeira: ['grain_bundle', 'river_fish', 'moon_tuber'],
  ferreiro: ['stone_shard', 'copper_ore', 'iron_ore'],
  moleiro: ['grain_bundle', 'wild_seed', 'wood_log'],
  barqueiro: ['river_fish', 'silver_fish', 'wood_log'],
});

const QUEST_REWARDS_BY_BIOME = Object.freeze({
  forest: ['healing_herb', 'trail_boots'],
  desert: ['healing_herb', 'road_dagger'],
  mountain: ['healing_herb', 'leather_vest'],
  city: ['city_pass', 'guild_seal'],
  water: ['silver_fish', 'city_pass'],
  plains: ['wild_seed', 'oak_bow'],
  anomaly: ['ancient_relic', 'ritual_staff'],
});

const SKILL_DEFS = Object.freeze([
  {
    id: 'blade_forms', name: 'Formas da Lamina', discipline: 'martial', threshold: 40,
    description: 'Treino marcial que refina o impacto de armas laminadas.',
    passive: { atk: 2 }, affinity: ['blade', 'martial'],
    autoCast: { mpCost: 10, cooldownMs: 18000, statusId: 'focused', requiresCombat: true }
  },
  {
    id: 'guardian_stance', name: 'Postura do Guardiao', discipline: 'martial', threshold: 85,
    description: 'O corpo aprende a absorver impactos sem ceder terreno.',
    passive: { def: 2, maxHp: 10 }, affinity: ['shield', 'armor', 'martial'],
    autoCast: { mpCost: 12, cooldownMs: 22000, statusId: 'warded', requiresCombat: true }
  },
  {
    id: 'fieldcraft', name: 'Oficio de Campo', discipline: 'survival', threshold: 35,
    description: 'O personagem reconhece rotas, presas e recursos.',
    passive: { spd: 1, maxHp: 6 }, affinity: ['bow', 'survival', 'boots'],
    autoCast: { mpCost: 8, cooldownMs: 18000, statusId: 'focused', requiresCombat: false }
  },
  {
    id: 'predator_focus', name: 'Foco do Predador', discipline: 'survival', threshold: 90,
    description: 'Cada ataque encontra janelas breves na defesa inimiga.',
    passive: { atk: 2, spd: 1 }, affinity: ['bow', 'survival'],
    autoCast: { mpCost: 11, cooldownMs: 20000, statusId: 'focused', requiresCombat: true }
  },
  {
    id: 'sigil_study', name: 'Estudo de Sigilos', discipline: 'arcane', threshold: 40,
    description: 'Conhecimento ritual torna a energia mais obediente.',
    passive: { maxMp: 14, atk: 1 }, affinity: ['focus', 'arcane'],
    autoCast: { mpCost: 12, cooldownMs: 18000, statusId: 'warded', requiresCombat: false }
  },
  {
    id: 'rift_attunement', name: 'Sintonia de Fenda', discipline: 'arcane', threshold: 95,
    description: 'A mente se alinha com ecos do mundo fraturado.',
    passive: { atk: 2, maxMp: 16 }, affinity: ['arcane', 'relic'],
    autoCast: { mpCost: 14, cooldownMs: 22000, statusId: 'warded', requiresCombat: true }
  },
  {
    id: 'shadow_stride', name: 'Passo Velado', discipline: 'guile', threshold: 35,
    description: 'Movimentos menores e mais rapidos, quase silenciosos.',
    passive: { spd: 2 }, affinity: ['dagger', 'guile', 'helmet'],
    autoCast: { mpCost: 9, cooldownMs: 17000, statusId: 'focused', requiresCombat: false }
  },
  {
    id: 'cutpurse_instinct', name: 'Instinto de Beca', discipline: 'guile', threshold: 80,
    description: 'Oportunidades de saque parecem surgir sozinhas.',
    passive: { atk: 1, def: 1 }, affinity: ['dagger', 'guile']
  },
  {
    id: 'oathbound', name: 'Juramento Vinculante', discipline: 'faith', threshold: 45,
    description: 'Conviccao transforma dor em resistencia.',
    passive: { def: 2, maxHp: 8 }, affinity: ['faith', 'mace', 'ring'],
    autoCast: { mpCost: 10, cooldownMs: 20000, statusId: 'blessed', requiresCombat: false }
  },
  {
    id: 'market_memory', name: 'Memoria de Mercado', discipline: 'civic', threshold: 35,
    description: 'Negociacao e leitura social moldam o papel do personagem.',
    passive: { def: 1, maxMp: 8 }, affinity: ['civic', 'seal', 'ring'],
    autoCast: { mpCost: 8, cooldownMs: 24000, statusId: 'blessed', requiresCombat: false }
  }
]);

const STATUS_DEFS = Object.freeze({
  blessed: {
    id: 'blessed', label: 'Bencao', type: 'positive', icon: '+', durationMs: 45000,
    modifiers: { atk: 2, def: 1 }, description: 'A sorte parece sorrir por um instante.'
  },
  focused: {
    id: 'focused', label: 'Foco', type: 'positive', icon: '+', durationMs: 30000,
    modifiers: { atk: 1, spd: 2 }, description: 'Os sentidos ficam afiados e o corpo responde melhor.'
  },
  warded: {
    id: 'warded', label: 'Guarda Arcana', type: 'positive', icon: '+', durationMs: 30000,
    modifiers: { def: 3, maxMp: 10 }, description: 'Uma camada protetora envolve o personagem.'
  },
  poisoned: {
    id: 'poisoned', label: 'Veneno', type: 'negative', icon: '!', durationMs: 12000,
    modifiers: { atk: -1 }, tickEveryMs: 1500, tickPercentHp: 0.03,
    description: 'O veneno corrói a vitalidade aos poucos.'
  },
  bleeding: {
    id: 'bleeding', label: 'Sangramento', type: 'negative', icon: '!', durationMs: 9000,
    modifiers: { def: -1 }, tickEveryMs: 1000, tickFlatHp: 2,
    description: 'Feridas abertas drenam vida continuamente.'
  },
  weakened: {
    id: 'weakened', label: 'Fraqueza', type: 'negative', icon: '!', durationMs: 10000,
    modifiers: { atk: -3, def: -1 }, description: 'O corpo vacila e a forca cai.'
  },
  slowed: {
    id: 'slowed', label: 'Lentidao', type: 'negative', icon: '!', durationMs: 10000,
    modifiers: { spd: -2 }, description: 'Os passos ficam pesados e imprecisos.'
  }
});

const ACTIVITY_DEFS = Object.freeze({
  mining: {
    id: 'mining',
    name: 'Mineracao',
    description: 'Extrai pedra, metais e fragmentos raros em regioes adequadas.',
    unlocks: [
      { id: 'steady_strike', level: 2, name: 'Golpe Firme', description: 'Pequena chance de extrair material extra.' },
      { id: 'deep_sense', level: 4, name: 'Sentido Profundo', description: 'A leitura do terreno melhora achados raros.' },
      { id: 'master_pick', level: 6, name: 'Picareta Mestra', description: 'Prepara o sistema para veios especiais e minas futuras.' }
    ]
  },
  farming: {
    id: 'farming',
    name: 'Agricultura',
    description: 'Prepara solo fertil, cultiva e colhe recursos renovaveis.',
    unlocks: [
      { id: 'patient_hands', level: 2, name: 'Maos Pacientes', description: 'Os cultivos amadurecem um pouco mais rapido.' },
      { id: 'green_thumb', level: 4, name: 'Polegar Verde', description: 'Aumenta a chance de colheitas generosas.' },
      { id: 'field_planner', level: 6, name: 'Planejador de Campo', description: 'Abre caminho para irrigacao e sementes especiais.' }
    ]
  },
  fishing: {
    id: 'fishing',
    name: 'Pesca',
    description: 'Aproveita correntes, margens e aguas profundas para capturas.',
    unlocks: [
      { id: 'quiet_line', level: 2, name: 'Linha Silenciosa', description: 'Mais consistencia em aguas agitadas.' },
      { id: 'tide_reader', level: 4, name: 'Leitor de Mare', description: 'Aumenta a chance de especies melhores.' },
      { id: 'deep_cast', level: 6, name: 'Arremesso Profundo', description: 'Prepara o sistema para pesca oceanica e armadilhas futuras.' }
    ]
  }
});

const CROP_DEFS = Object.freeze({
  wild_grain: {
    id: 'wild_grain',
    name: 'Grao Selvagem',
    growMs: 120000,
    produce: [{ itemId: 'grain_bundle', min: 2, max: 4 }],
    bonus: { itemId: 'wild_seed', chance: 0.45, min: 1, max: 2 }
  },
  moon_tuber_crop: {
    id: 'moon_tuber_crop',
    name: 'Tuberculo Lunar',
    growMs: 150000,
    produce: [{ itemId: 'moon_tuber', min: 1, max: 3 }],
    bonus: { itemId: 'wild_seed', chance: 0.3, min: 1, max: 1 }
  },
  marsh_herb_crop: {
    id: 'marsh_herb_crop',
    name: 'Erva de Varzea',
    growMs: 135000,
    produce: [{ itemId: 'marsh_herb', min: 1, max: 2 }],
    bonus: { itemId: 'wild_seed', chance: 0.35, min: 1, max: 1 }
  }
});

const PROFESSION_LOADOUTS = [
  { match: /ca[cç]ador|arqueiro|batedor/i, equipment: ['oak_bow', 'trail_boots'] },
  { match: /druida|mago|escriba|alquimista/i, equipment: ['ritual_staff', 'guild_seal'] },
  { match: /guardi[aã]o|ferreiro|cavaleiro|mineiro/i, equipment: ['rusted_blade', 'leather_vest', 'iron_buckler'] },
  { match: /mercador|nobre|bardo/i, equipment: ['road_dagger', 'guild_seal'] },
  { match: /pirata|ladino|n[oô]made/i, equipment: ['road_dagger', 'trail_boots', 'scout_hood'] },
  { match: /clerigo|templ[aá]rio|curandeiro/i, equipment: ['pilgrim_mace', 'warding_ring'] },
];

const DEFAULT_LOADOUT_BY_BIOME = {
  forest: ['oak_bow', 'trail_boots'],
  desert: ['road_dagger', 'trail_boots'],
  mountain: ['rusted_blade', 'leather_vest'],
  city: ['road_dagger', 'guild_seal'],
  water: ['road_dagger', 'trail_boots'],
  plains: ['rusted_blade', 'trail_boots'],
  anomaly: ['ritual_staff', 'ember_ring']
};

const BIOME_DROP_TABLES = {
  forest: ['healing_herb', 'trail_boots', 'scout_hood'],
  desert: ['ancient_relic', 'road_dagger', 'trail_boots'],
  mountain: ['leather_vest', 'iron_buckler', 'rusted_blade'],
  city: ['city_pass', 'guild_seal', 'warding_ring'],
  water: ['healing_herb', 'warding_ring', 'oak_bow'],
  plains: ['trail_boots', 'rusted_blade', 'warding_ring'],
  anomaly: ['ancient_relic', 'ember_ring', 'ritual_staff']
};

const NPC_DATA = {
  names: ['Aldric', 'Selene', 'Marek', 'Iria', 'Darian', 'Liora', 'Vasco', 'Elena', 'Rurik', 'Naia', 'Tomas', 'Helena'],
  surnames: {
    forest: ['Ashbark', 'Thornwood', 'Moonshadow', 'Deeproot'],
    desert: ['Dustwalker', 'Sandforge', 'Sunscar', 'Kharim'],
    mountain: ['Ironpeak', 'Stonecrest', 'Greymantle', 'Emberhall'],
    city: ['Alden', 'Mercer', 'Vale', 'Dawnmere', 'Blackwood', 'Carvell'],
    water: ['Tidesong', 'Wavecrest', 'Saltmere', 'Deepmourne'],
    plains: ['Windrunner', 'Greenfield', 'Hartwell', 'Swiftfield'],
    anomaly: ['Riftborn', 'Ashenveil', 'Voidmark', 'Nightglass']
  },
  familyRoles: ['filho da familia', 'irma de sangue', 'primo distante', 'viuva da casa', 'sobrinho do oficio', 'herdeira do balcão'],
};

const NPC_BIOME_PROFILES = {
  city: {
    minCount: 6,
    maxCount: 10,
    professions: ['Mercador', 'Ferreira', 'Escriba', 'Guarda', 'Curandeira', 'Estalajadeiro', 'Cartografo', 'Moleira'],
    personalities: ['afavel', 'suspeito', 'calmo', 'falante', 'observador', 'rigido', 'maternal', 'ambicioso'],
    districts: ['Mercado Alto', 'Ponte Velha', 'Rua das Lanternas', 'Praca do Relogio', 'Bairro dos Artifices', 'Portao Norte'],
    spawnTiles: [4, 7],
    topicsByProfession: {
      Mercador: ['precos', 'caravanas', 'falta de estoques'],
      Ferreira: ['metais', 'armas', 'trabalho nas forjas'],
      Escriba: ['rumores', 'leis locais', 'cronicas'],
      Guarda: ['seguranca', 'portoes', 'patrulhas'],
      Curandeira: ['ervas', 'doencas', 'ferimentos'],
      Estalajadeiro: ['hospedes', 'comida', 'boatos noturnos'],
      Cartografo: ['mapas', 'rotas', 'fronteiras'],
      Moleira: ['graos', 'fazendas', 'colheitas']
    },
    glyphByProfession: {
      Mercador: '$', Ferreira: '⚒', Escriba: '✒', Guarda: '🛡', Curandeira: '✚', Estalajadeiro: '⌂', Cartografo: '✦', Moleira: '⚙'
    }
  },
  forest: {
    minCount: 2,
    maxCount: 4,
    professions: ['Ervanaria', 'Cacador', 'Lenhador', 'Druida Errante', 'Guia da Mata'],
    personalities: ['reservado', 'gentil', 'atento', 'mistico', 'protetor'],
    districts: ['Clareira das Cinzas', 'Trilha da Lua', 'Bosque Velado', 'Ponte das Raizes'],
    spawnTiles: [0, 4, 7, 11],
    topicsByProfession: {
      Ervanaria: ['ervas raras', 'curas improvisadas', 'poções simples'],
      Cacador: ['presas', 'rastros', 'lobos nas redondezas'],
      Lenhador: ['madeira antiga', 'trilhas seguras', 'arvores tombadas'],
      'Druida Errante': ['espiritos da mata', 'ciclos da floresta', 'anomalias verdes'],
      'Guia da Mata': ['atalhos', 'clareiras seguras', 'caminhos encobertos']
    },
    glyphByProfession: { Ervanaria: '✿', Cacador: '🏹', Lenhador: '🪓', 'Druida Errante': '☘', 'Guia da Mata': '🧭' }
  },
  plains: {
    minCount: 2,
    maxCount: 4,
    professions: ['Pastor', 'Fazendeira', 'Batedor', 'Cavaleiro Andante', 'Moleiro'],
    personalities: ['honesto', 'falante', 'cansado', 'curioso', 'disciplinado'],
    districts: ['Campo das Estacas', 'Estrada Leste', 'Moinho do Vale', 'Posto de Vigia'],
    spawnTiles: [0, 4, 7, 11],
    topicsByProfession: {
      Pastor: ['rebanhos', 'predadores do campo', 'rotas de pastoreio'],
      Fazendeira: ['colheitas', 'clima', 'graos raros'],
      Batedor: ['movimento de bandidos', 'estradas abertas', 'rastros no barro'],
      'Cavaleiro Andante': ['duelos', 'ordens juramentadas', 'viajantes perdidos'],
      Moleiro: ['farinha', 'colheitas', 'trocas entre vilas']
    },
    glyphByProfession: { Pastor: '🐑', Fazendeira: '🌾', Batedor: '🗡', 'Cavaleiro Andante': '⚔', Moleiro: '⚙' }
  },
  desert: {
    minCount: 1,
    maxCount: 3,
    professions: ['Nomade', 'Mercador de Rota', 'Escavadora', 'Guardiao do Oasis'],
    personalities: ['seco', 'astuto', 'resistente', 'silencioso', 'desconfiado'],
    districts: ['Oasis de Sicar', 'Dunas da Vigilia', 'Mercado de Areia', 'Poço do Crepusculo'],
    spawnTiles: [4, 5, 7],
    topicsByProfession: {
      Nomade: ['tempestades de areia', 'poços escondidos', 'rotas seguras'],
      'Mercador de Rota': ['caravanas', 'especiarias', 'assaltos nas dunas'],
      Escavadora: ['ruinas enterradas', 'reliquias', 'tumbas antigas'],
      'Guardiao do Oasis': ['peregrinos', 'agua', 'bestas do deserto']
    },
    glyphByProfession: { Nomade: '☼', 'Mercador de Rota': '$', Escavadora: '⛏', 'Guardiao do Oasis': '🛡' }
  },
  mountain: {
    minCount: 1,
    maxCount: 3,
    professions: ['Mineiro', 'Ferreiro Errante', 'Vigia do Passo', 'Eremita'],
    personalities: ['teimoso', 'lacônico', 'honrado', 'pratico', 'duro'],
    districts: ['Passo de Granito', 'Forja Velha', 'Escarpa do Eco', 'Galaria Fraturada'],
    spawnTiles: [4, 7],
    topicsByProfession: {
      Mineiro: ['veios de metal', 'desabamentos', 'criaturas nas galerias'],
      'Ferreiro Errante': ['laminas', 'minerio puro', 'armaduras'],
      'Vigia do Passo': ['pontes de montanha', 'nevascas', 'invasores'],
      Eremita: ['ecos antigos', 'silencio das alturas', 'juramentos quebrados']
    },
    glyphByProfession: { Mineiro: '⛏', 'Ferreiro Errante': '⚒', 'Vigia do Passo': '🛡', Eremita: '☖' }
  },
  water: {
    minCount: 1,
    maxCount: 3,
    professions: ['Pescador', 'Barqueira', 'Cartografo Costeiro', 'Marinheiro'],
    personalities: ['livre', 'supersticioso', 'observador', 'tranquilo', 'esperto'],
    districts: ['Cais Quebrado', 'Margem da Neblina', 'Doca Salgada', 'Ilhota da Vigia'],
    spawnTiles: [0, 4, 7],
    topicsByProfession: {
      Pescador: ['correntes', 'peixes raros', 'sombras na agua'],
      Barqueira: ['travessias', 'pedagios', 'barcos avariados'],
      'Cartografo Costeiro': ['recifes', 'ilhas', 'rotas de nevoeiro'],
      Marinheiro: ['marés', 'piratas', 'portos distantes']
    },
    glyphByProfession: { Pescador: '🎣', Barqueira: '⛵', 'Cartografo Costeiro': '✦', Marinheiro: '⚓' }
  },
  anomaly: {
    minCount: 1,
    maxCount: 2,
    professions: ['Eco Vivo', 'Vigia da Fenda', 'Coletora de Fragmentos'],
    personalities: ['instavel', 'lucido', 'distante', 'profetico'],
    districts: ['Borda da Fenda', 'Ruina Quebrada', 'Patio do Eclipse'],
    spawnTiles: [4, 7],
    topicsByProfession: {
      'Eco Vivo': ['vozes perdidas', 'eventos repetidos', 'rostos esquecidos'],
      'Vigia da Fenda': ['fraturas do mapa', 'criaturas deslocadas', 'sinais no ceu'],
      'Coletora de Fragmentos': ['reliquias partidas', 'energia residual', 'pedras do vazio']
    },
    glyphByProfession: { 'Eco Vivo': '◌', 'Vigia da Fenda': '✶', 'Coletora de Fragmentos': '⬖' }
  }
};

function getItemTemplate(itemId) {
  return ITEM_DEFS[itemId] || null;
}

function createItem(itemId, overrides = {}) {
  const template = getItemTemplate(itemId);
  if (!template) {
    return {
      itemId,
      name: overrides.name || itemId,
      type: overrides.type || 'material',
      qty: overrides.qty || 1,
      stackable: overrides.stackable !== false,
      bonuses: clone(overrides.bonuses || {}),
      tags: clone(overrides.tags || []),
      slot: overrides.slot || null,
      discipline: overrides.discipline || null,
      rarity: overrides.rarity || 'common',
      description: overrides.description || ''
    };
  }
  const item = {
    itemId: template.id,
    name: template.name,
    type: template.type,
    qty: template.stackable ? Math.max(1, overrides.qty || 1) : 1,
    stackable: !!template.stackable,
    bonuses: clone(template.bonuses || {}),
    tags: clone(template.tags || []),
    slot: template.slot || null,
    discipline: template.discipline || null,
    rarity: template.rarity || 'common',
    description: template.description || ''
  };
  if (!item.stackable) item.uid = overrides.uid || `${template.id}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return { ...item, ...overrides, bonuses: { ...item.bonuses, ...(overrides.bonuses || {}) }, tags: overrides.tags ? clone(overrides.tags) : item.tags };
}

function getItemValue(itemId) {
  return ITEM_VALUES[itemId] || 10;
}

function normalizeInventory(inventory = [], maxSlots = 24) {
  const result = [];
  const stacks = new Map();

  for (const rawItem of inventory) {
    if (!rawItem) continue;
    const item = {
      ...rawItem,
      qty: Math.max(1, Number(rawItem.qty) || 1),
      bonuses: clone(rawItem.bonuses || {}),
      tags: clone(rawItem.tags || []),
      stackable: rawItem.stackable !== false && !rawItem.slot
    };

    if (item.stackable) {
      const key = item.itemId || item.name;
      if (stacks.has(key)) {
        stacks.get(key).qty += item.qty;
      } else if (result.length < maxSlots) {
        const stackItem = { ...item };
        delete stackItem.uid;
        stacks.set(key, stackItem);
        result.push(stackItem);
      }
    } else if (result.length < maxSlots) {
      result.push(item.uid ? item : { ...item, uid: `${item.itemId || item.name}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` });
    }
  }

  return result;
}

function storeItem(inventory = [], item, maxSlots = 24) {
  const current = normalizeInventory(inventory, maxSlots);
  const incoming = item.stackable !== false && !item.slot ? { ...item, stackable: true } : { ...item, stackable: false };

  if (incoming.stackable) {
    const existing = current.find(entry => (entry.itemId || entry.name) === (incoming.itemId || incoming.name) && entry.stackable !== false && !entry.slot);
    if (existing) {
      existing.qty += Math.max(1, incoming.qty || 1);
      return { inventory: current, stored: true };
    }
  }

  if (current.length >= maxSlots) return { inventory: current, stored: false };
  current.push(incoming.slot ? { ...incoming, uid: incoming.uid || `${incoming.itemId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` } : incoming);
  return { inventory: normalizeInventory(current, maxSlots), stored: true };
}

function countInventoryItem(inventory = [], itemId) {
  return normalizeInventory(inventory, Number.MAX_SAFE_INTEGER)
    .filter(item => (item.itemId || item.name) === itemId)
    .reduce((sum, item) => sum + Math.max(1, Number(item.qty) || 1), 0);
}

function isMedicinalItem(item) {
  if (!item) return false;
  const itemId = item.itemId || item.name;
  if (MEDICINAL_ITEM_EFFECTS[itemId]) return true;
  const tags = Array.isArray(item.tags) ? item.tags : [];
  if (tags.includes('herb')) return true;
  return item.type === 'consumable';
}

function consumeInventoryItem(inventory = [], itemId, qty, maxSlots = 24) {
  let remaining = Math.max(1, Number(qty) || 1);
  const next = [];

  normalizeInventory(inventory, Number.MAX_SAFE_INTEGER).forEach(item => {
    if ((item.itemId || item.name) !== itemId || remaining <= 0) {
      next.push(item);
      return;
    }

    if (item.stackable !== false && !item.slot) {
      const removed = Math.min(remaining, Math.max(1, Number(item.qty) || 1));
      const leftQty = Math.max(0, (Number(item.qty) || 1) - removed);
      remaining -= removed;
      if (leftQty > 0) next.push({ ...item, qty: leftQty });
      return;
    }

    remaining -= 1;
  });

  return {
    ok: remaining === 0,
    removedQty: Math.max(0, Math.max(1, Number(qty) || 1) - remaining),
    inventory: normalizeInventory(next, maxSlots),
  };
}

function consumeMedicinalItem(player, index, maxSlots = 24) {
  const inventory = normalizeInventory(player.inventory || [], maxSlots);
  const item = inventory[index];
  if (!item) return { ok: false, error: 'Item inexistente.' };
  if (!isMedicinalItem(item)) return { ok: false, error: 'Esse item nao e medicinal.' };

  const itemId = item.itemId || item.name;
  const effect = MEDICINAL_ITEM_EFFECTS[itemId] || { healFlat: 12, healPercent: 0.06, mpFlat: 3 };
  const maxHp = Math.max(1, Number(player.maxHp || player.baseMaxHp || 1));
  const maxMp = Math.max(0, Number(player.maxMp || player.baseMaxMp || 0));
  const hpBefore = Math.max(0, Number(player.hp || 0));
  const mpBefore = Math.max(0, Number(player.mp || 0));

  const healAmount = Math.max(1, Math.floor((effect.healFlat || 0) + maxHp * (effect.healPercent || 0)));
  const mpAmount = Math.max(0, Number(effect.mpFlat || 0));
  const nextHp = Math.min(maxHp, hpBefore + healAmount);
  const nextMp = Math.min(maxMp, mpBefore + mpAmount);

  if (nextHp <= hpBefore && nextMp <= mpBefore) {
    return { ok: false, error: 'Voce ja esta com vida e mana cheias.' };
  }

  const consumed = consumeInventoryItem(inventory, itemId, 1, maxSlots);
  if (!consumed.ok) return { ok: false, error: 'Falha ao consumir o item.' };

  player.inventory = consumed.inventory;
  player.hp = nextHp;
  player.mp = nextMp;

  return {
    ok: true,
    item,
    restoredHp: Math.max(0, nextHp - hpBefore),
    restoredMp: Math.max(0, nextMp - mpBefore),
    hp: nextHp,
    mp: nextMp,
  };
}

function getStarterLoadout(profession, biome) {
  const matching = PROFESSION_LOADOUTS.find(entry => entry.match.test(String(profession || '')));
  const itemIds = matching ? matching.equipment : (DEFAULT_LOADOUT_BY_BIOME[biome] || ['rusted_blade']);
  const equipment = {};
  const inventory = [];

  itemIds.forEach(itemId => {
    const item = createItem(itemId);
    if (item.slot && !equipment[item.slot]) equipment[item.slot] = item;
    else inventory.push(item);
  });

  return { equipment, inventory };
}

function getEquipmentBonuses(equipment = {}) {
  const total = { atk: 0, def: 0, spd: 0, maxHp: 0, maxMp: 0 };
  Object.values(equipment || {}).forEach(item => {
    if (!item?.bonuses) return;
    const rarity = String(item.rarity || 'common').toLowerCase();
    const multiplier = RARITY_EQUIP_MULTIPLIER[rarity] || 1;
    Object.entries(item.bonuses).forEach(([key, value]) => {
      total[key] = (total[key] || 0) + scaleBonusValue(value, multiplier);
    });
  });
  return total;
}

function getSkillBonuses(skills = []) {
  const total = { atk: 0, def: 0, spd: 0, maxHp: 0, maxMp: 0 };
  (skills || []).forEach(skillId => {
    const skill = SKILL_DEFS.find(entry => entry.id === skillId);
    if (skill) sumBonuses(total, skill.passive || {});
  });
  return total;
}

function getStatusBonuses(statusEffects = []) {
  const total = { atk: 0, def: 0, spd: 0, maxHp: 0, maxMp: 0 };
  (statusEffects || []).forEach(effect => {
    const def = STATUS_DEFS[effect.id];
    if (def) sumBonuses(total, def.modifiers || {});
  });
  return total;
}

function dominantDiscipline(player) {
  const scores = { martial: 0, survival: 0, arcane: 0, guile: 0, faith: 0, civic: 0 };
  Object.entries(player.skillXp || {}).forEach(([discipline, value]) => {
    scores[discipline] = (scores[discipline] || 0) + Number(value || 0);
  });
  Object.values(player.equipment || {}).forEach(item => {
    if (item?.discipline) scores[item.discipline] = (scores[item.discipline] || 0) + 35;
    (item?.tags || []).forEach(tag => {
      if (tag === 'blade' || tag === 'shield' || tag === 'armor') scores.martial += 10;
      if (tag === 'bow' || tag === 'survival' || tag === 'boots') scores.survival += 10;
      if (tag === 'focus' || tag === 'arcane' || tag === 'relic') scores.arcane += 10;
      if (tag === 'dagger' || tag === 'guile' || tag === 'helmet') scores.guile += 10;
      if (tag === 'mace' || tag === 'faith') scores.faith += 10;
      if (tag === 'seal' || tag === 'civic') scores.civic += 10;
    });
  });

  return Object.entries(scores).sort((left, right) => right[1] - left[1])[0]?.[0] || 'martial';
}

function dominantTag(player) {
  const tags = new Map();
  Object.values(player.equipment || {}).forEach(item => {
    (item?.tags || []).forEach(tag => tags.set(tag, (tags.get(tag) || 0) + 1));
  });
  if (tags.size === 0) return null;
  return [...tags.entries()].sort((left, right) => right[1] - left[1])[0][0];
}

function deriveClassName(player) {
  const discipline = dominantDiscipline(player);
  const tag = dominantTag(player);

  if ((tag === 'blade' || tag === 'shield' || tag === 'armor') && discipline === 'martial') return 'Guardiao de Aco';
  if (tag === 'bow' && discipline === 'survival') return 'Batedor do Ermo';
  if ((tag === 'focus' || tag === 'relic') && discipline === 'arcane') return 'Arcanista de Ruina';
  if ((tag === 'dagger' || tag === 'helmet') && discipline === 'guile') return 'Ladino de Fronteira';
  if ((tag === 'mace' || tag === 'faith' || tag === 'ring') && discipline === 'faith') return 'Juramentado';
  if ((tag === 'seal' || tag === 'civic') && discipline === 'civic') return 'Mediador de Guilda';
  return player.profession || 'Aventureiro';
}

function refreshDerivedStats(player) {
  const equipBonuses = getEquipmentBonuses(player.equipment);
  const skillBonuses = getSkillBonuses(player.skills);
  const statusBonuses = getStatusBonuses(player.statusEffects);
  const total = { atk: 0, def: 0, spd: 0, maxHp: 0, maxMp: 0 };

  sumBonuses(total, equipBonuses);
  sumBonuses(total, skillBonuses);
  sumBonuses(total, statusBonuses);

  player.atk = Math.max(1, (player.baseAtk ?? player.atk ?? 1) + total.atk);
  player.def = Math.max(0, (player.baseDef ?? player.def ?? 0) + total.def);
  player.spd = Math.max(1, (player.baseSpd ?? player.spd ?? 1) + total.spd);
  player.maxHp = Math.max(1, (player.baseMaxHp ?? player.maxHp ?? 1) + total.maxHp);
  player.maxMp = Math.max(0, (player.baseMaxMp ?? player.maxMp ?? 0) + total.maxMp);
  player.hp = Math.min(player.hp, player.maxHp);
  player.mp = Math.min(player.mp, player.maxMp);
  player.className = deriveClassName(player);
  return player;
}

function activityXpForLevel(level) {
  if (level <= 1) return 0;
  return Math.floor((level - 1) * level * 45);
}

function getActivityLevelFromXp(xp) {
  let level = 1;
  while (xp >= activityXpForLevel(level + 1)) level++;
  return level;
}

function normalizeLifeSkills(lifeSkills = {}) {
  const normalized = {};
  Object.values(ACTIVITY_DEFS).forEach(def => {
    const raw = lifeSkills?.[def.id] || {};
    const xp = Math.max(0, Number(raw.xp) || 0);
    const level = Math.max(1, Number(raw.level) || getActivityLevelFromXp(xp));
    normalized[def.id] = {
      xp,
      level,
      unlocked: def.unlocks.filter(unlock => level >= unlock.level).map(unlock => unlock.id)
    };
  });
  return normalized;
}

function ensureLifeSkills(player) {
  player.lifeSkills = normalizeLifeSkills(player.lifeSkills || {});
  return player.lifeSkills;
}

function getActivityLevel(player, activityId) {
  return ensureLifeSkills(player)[activityId]?.level || 1;
}

function getActivityBonus(player, activityId) {
  const level = getActivityLevel(player, activityId);
  return {
    level,
    bonusYieldChance: Math.min(0.35, Math.max(0, level - 1) * 0.05),
    growReductionMs: activityId === 'farming' ? Math.min(45000, Math.max(0, level - 1) * 4000) : 0,
  };
}

function serializeLifeSkills(player) {
  const lifeSkills = ensureLifeSkills(player);
  return Object.values(ACTIVITY_DEFS).map(def => {
    const state = lifeSkills[def.id];
    return {
      id: def.id,
      name: def.name,
      description: def.description,
      xp: state.xp,
      level: state.level,
      nextLevelXp: activityXpForLevel(state.level + 1),
      unlocks: def.unlocks.map(unlock => ({ ...unlock, unlocked: state.level >= unlock.level }))
    };
  });
}

function grantActivityXp(player, activityId, amount) {
  if (!ACTIVITY_DEFS[activityId] || amount <= 0) return { activity: ACTIVITY_DEFS[activityId] || null, levelUp: false, newLevel: getActivityLevel(player, activityId), unlocks: [] };

  const lifeSkills = ensureLifeSkills(player);
  const state = lifeSkills[activityId];
  const previousLevel = state.level;
  state.xp += Math.max(1, Math.floor(amount));
  state.level = getActivityLevelFromXp(state.xp);
  state.unlocked = ACTIVITY_DEFS[activityId].unlocks.filter(unlock => state.level >= unlock.level).map(unlock => unlock.id);

  return {
    activity: ACTIVITY_DEFS[activityId],
    levelUp: state.level > previousLevel,
    previousLevel,
    newLevel: state.level,
    xp: state.xp,
    unlocks: ACTIVITY_DEFS[activityId].unlocks.filter(unlock => unlock.level > previousLevel && unlock.level <= state.level)
  };
}

function pickCropForBiome(biome, rng = Math.random) {
  const table = {
    plains: ['wild_grain', 'moon_tuber_crop'],
    forest: ['moon_tuber_crop', 'marsh_herb_crop'],
    water: ['marsh_herb_crop', 'wild_grain'],
    mountain: ['moon_tuber_crop'],
    desert: ['moon_tuber_crop'],
    city: ['wild_grain'],
    anomaly: ['marsh_herb_crop']
  }[biome] || ['wild_grain'];
  return CROP_DEFS[pick(rng, table)] || CROP_DEFS.wild_grain;
}

function createCropHarvest(cropId, rng = Math.random, bonusYieldChance = 0) {
  const crop = CROP_DEFS[cropId] || CROP_DEFS.wild_grain;
  const results = [];

  crop.produce.forEach(entry => {
    const qty = entry.min + Math.floor(rng() * (entry.max - entry.min + 1));
    results.push(createItem(entry.itemId, { qty }));
    if (bonusYieldChance > 0 && rng() < bonusYieldChance) {
      results.push(createItem(entry.itemId, { qty: 1 }));
    }
  });

  if (crop.bonus && rng() < crop.bonus.chance) {
    const qty = crop.bonus.min + Math.floor(rng() * (crop.bonus.max - crop.bonus.min + 1));
    results.push(createItem(crop.bonus.itemId, { qty }));
  }

  return results;
}

function statusPayload(effect, now = Date.now()) {
  const def = STATUS_DEFS[effect.id];
  if (!def) return null;
  return {
    id: def.id,
    label: def.label,
    type: def.type,
    icon: def.icon,
    description: def.description,
    remainingMs: Math.max(0, (effect.expiresAt || now) - now)
  };
}

function serializePlayerState(player) {
  return {
    id: player.id,
    name: player.name,
    profession: player.profession,
    className: player.className || deriveClassName(player),
    level: player.level,
    exp: player.exp,
    hp: player.hp,
    maxHp: player.maxHp,
    mp: player.mp,
    maxMp: player.maxMp,
    atk: player.atk,
    def: player.def,
    spd: player.spd,
    gold: player.gold,
    inventory: normalizeInventory(player.inventory || []),
    equipment: clone(player.equipment || {}),
    kills: player.kills || 0,
    stamina: player.stamina,
    maxStamina: player.maxStamina,
    skills: (player.skills || []).map(skillId => {
      const skill = SKILL_DEFS.find(entry => entry.id === skillId);
      return skill ? { id: skill.id, name: skill.name, description: skill.description, discipline: skill.discipline } : { id: skillId, name: skillId };
    }),
    skillXp: clone(player.skillXp || {}),
    lifeSkills: serializeLifeSkills(player),
    statusEffects: (player.statusEffects || []).map(effect => statusPayload(effect)).filter(Boolean)
  };
}

function grantDisciplineXp(player, discipline, amount) {
  if (!discipline || amount <= 0) return [];
  const skillXp = player.skillXp || (player.skillXp = {});
  skillXp[discipline] = (skillXp[discipline] || 0) + amount;
  const unlocked = [];

  SKILL_DEFS.filter(skill => skill.discipline === discipline).forEach(skill => {
    if ((player.skills || []).includes(skill.id)) return;
    if ((skillXp[discipline] || 0) < skill.threshold) return;
    player.skills = player.skills || [];
    player.skills.push(skill.id);
    unlocked.push(skill);
  });

  refreshDerivedStats(player);
  return unlocked;
}

function applyStatus(entity, statusId, sourceId = null, now = Date.now()) {
  const definition = STATUS_DEFS[statusId];
  if (!definition) return null;
  entity.statusEffects = entity.statusEffects || [];
  const existing = entity.statusEffects.find(effect => effect.id === statusId);
  const expiresAt = now + definition.durationMs;
  if (existing) {
    existing.expiresAt = Math.max(existing.expiresAt || 0, expiresAt);
    existing.nextTickAt = now + (definition.tickEveryMs || 0);
    existing.sourceId = sourceId || existing.sourceId;
  } else {
    entity.statusEffects.push({ id: statusId, sourceId, expiresAt, nextTickAt: now + (definition.tickEveryMs || 0) });
  }
  refreshDerivedStats(entity);
  return statusPayload({ id: statusId, expiresAt }, now);
}

function tickStatusEffects(entity, now = Date.now()) {
  const summary = { expired: [], triggered: [], changed: false, hpDelta: 0 };
  if (!entity.statusEffects?.length) return summary;

  const kept = [];
  for (const effect of entity.statusEffects) {
    const definition = STATUS_DEFS[effect.id];
    if (!definition) continue;
    if ((effect.expiresAt || 0) <= now) {
      summary.expired.push(statusPayload(effect, now));
      summary.changed = true;
      continue;
    }
    if (definition.tickEveryMs && (effect.nextTickAt || 0) <= now) {
      const damage = definition.tickFlatHp
        ? definition.tickFlatHp
        : Math.max(1, Math.floor((entity.maxHp || entity.baseMaxHp || 1) * (definition.tickPercentHp || 0)));
      entity.hp = Math.max(0, entity.hp - damage);
      effect.nextTickAt = now + definition.tickEveryMs;
      summary.triggered.push({ effect: statusPayload(effect, now), damage });
      summary.hpDelta -= damage;
      summary.changed = true;
    }
    kept.push(effect);
  }
  entity.statusEffects = kept;
  if (summary.changed) refreshDerivedStats(entity);
  return summary;
}

function rollMonsterItemDrops(monster, biome, rng = Math.random) {
  const drops = [];
  const lowerName = String(monster?.name || '').toLowerCase();
  if (lowerName.includes('aranha') || lowerName.includes('escorpi')) drops.push(createItem('venom_gland', { qty: 1 }));
  else if (lowerName.includes('esp')) drops.push(createItem('ancient_relic', { qty: 1 }));
  else if (lowerName.includes('guarda') || lowerName.includes('ladr')) drops.push(createItem('city_pass', { qty: 1 }));
  else drops.push(createItem('healing_herb', { qty: 1 }));

  if (rng() < 0.2) {
    const itemId = pick({ random: rng }.random || rng, BIOME_DROP_TABLES[biome] || BIOME_DROP_TABLES.plains);
    drops.push(createItem(itemId));
  }

  return drops;
}

function rollChestLoot(biome, rng = Math.random) {
  const items = [];
  const table = BIOME_DROP_TABLES[biome] || BIOME_DROP_TABLES.plains;
  items.push(createItem(pick({ random: rng }.random || rng, table)));
  if (rng() < 0.45) items.push(createItem('healing_herb', { qty: 1 + Math.floor(rng() * 2) }));
  const bonusStatus = rng() < 0.33 ? pick({ random: rng }.random || rng, ['blessed', 'focused', 'warded']) : null;
  return { items, bonusStatus };
}

function pickFromRng(rng, values) {
  return values[Math.floor(rng() * values.length)];
}

function slugNpcText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function pickUniqueItems(rng, values, count) {
  const pool = [...new Set((values || []).filter(Boolean))];
  const chosen = [];
  while (pool.length && chosen.length < count) {
    const index = Math.floor(rng() * pool.length);
    chosen.push(pool.splice(index, 1)[0]);
  }
  return chosen;
}

function professionKey(profession) {
  const lower = String(profession || '').toLowerCase();
  if (lower.includes('mercador')) return 'mercador';
  if (lower.includes('estalajadeir')) return 'estalajadeira';
  if (lower.includes('ferreir')) return 'ferreiro';
  if (lower.includes('moleir')) return 'moleiro';
  if (lower.includes('barqueir')) return 'barqueiro';
  return 'default';
}

function buildNpcTradeStock(biome, profession, rng) {
  if (!TRADE_PROFESSION_RX.test(String(profession || ''))) return [];
  const key = professionKey(profession);
  const stock = pickUniqueItems(
    rng,
    [...(TRADE_STOCK_BY_PROFESSION[key] || TRADE_STOCK_BY_PROFESSION.default), ...(TRADE_STOCK_BY_BIOME[biome] || [])],
    3
  );

  return stock.map((itemId, index) => {
    const item = createItem(itemId);
    return {
      offerId: `${slugNpcText(profession)}_${index}_${itemId}`,
      itemId: item.itemId,
      name: item.name,
      qty: 1,
      basePrice: getItemValue(item.itemId),
      description: item.description,
    };
  });
}

function buildNpcRareRumors(biome, profession, district, topic) {
  return [
    `${district} anda inquieto: gente discreta comenta sobre ${topic}.`,
    `Ha rumores de movimento incomum em ${district}, sempre ligado a ${profession.toLowerCase()}.`,
    `Quem escuta as esquinas de ${district} jura que ${topic} ainda vai causar problema nestas terras ${biome}.`
  ];
}

function buildNpcQuestHooks(biome, profession, district, topic, index) {
  const prefix = biome === 'city'
    ? 'Pedido do Bairro'
    : biome === 'forest'
      ? 'Favor da Clareira'
      : biome === 'mountain'
        ? 'Chamado da Escarpa'
        : biome === 'water'
          ? 'Chamado da Margem'
          : biome === 'desert'
            ? 'Chamado das Dunas'
            : biome === 'anomaly'
              ? 'Eco da Fenda'
              : 'Favor da Estrada';
  return [
    {
      id: `${slugNpcText(profession)}_${index}_favor`,
      title: `${prefix}: ${profession}`,
      summary: `${profession} precisa de ajuda com ${topic} em ${district}.`,
      rewardHint: biome === 'city' ? 'desconto local e novos contatos' : 'rumores, suprimentos e confianca local'
    },
    {
      id: `${slugNpcText(district)}_${index}_escuta`,
      title: `Vigiar ${district}`,
      summary: `Investigar movimentacoes recentes envolvendo ${topic} nas redondezas.`,
      rewardHint: 'informacoes raras e acesso a boatos melhores'
    }
  ];
}

function buildNpcQuestContract(npc, hook) {
  const biome = npc.homeBiome || 'plains';
  const key = professionKey(npc.profession);
  const rng = mkRng(hashText(`${npc.npcId}:${hook.id}:${npc.profession}:${biome}`));
  const objectivePool = [...(QUEST_ITEMS_BY_PROFESSION[key] || []), ...(QUEST_ITEMS_BY_BIOME[biome] || QUEST_ITEMS_BY_BIOME.plains)];
  const objectiveItemId = pickFromRng(rng, [...new Set(objectivePool)]);
  const requiredQty = 2 + Math.floor(rng() * 3);
  const rewardPool = [
    ...(npc.tradeStock || []).map(entry => entry.itemId),
    ...(QUEST_REWARDS_BY_BIOME[biome] || []),
    'healing_herb'
  ].filter(itemId => itemId && itemId !== objectiveItemId);
  const rewardItemId = [...new Set(rewardPool)][0] || null;
  const rewardItemQty = rewardItemId ? (getItemValue(rewardItemId) <= 12 ? 2 : 1) : 0;
  const objectiveItem = createItem(objectiveItemId);
  const rewardItem = rewardItemId ? createItem(rewardItemId, { qty: rewardItemQty }) : null;

  return {
    questId: hook.id,
    title: hook.title,
    summary: hook.summary,
    objectiveType: 'deliver',
    objectiveItemId,
    objectiveItemName: objectiveItem.name,
    requiredQty,
    rewardGold: Math.max(10, Math.round(getItemValue(objectiveItemId) * requiredQty * 1.3)),
    rewardItemId,
    rewardItemName: rewardItem?.name || '',
    rewardItemQty,
    rewardNote: hook.rewardHint || '',
  };
}

function findNpcSpawn(tiles, width, height, rng, used, allowedTiles = [4, 7]) {
  let x = 2;
  let y = 2;
  let tries = 0;
  while (tries < 120) {
    x = 2 + Math.floor(rng() * (width - 4));
    y = 2 + Math.floor(rng() * (height - 4));
    const key = `${x},${y}`;
    const tile = tiles[y * width + x];
    if (!used.has(key) && allowedTiles.includes(tile)) {
      used.add(key);
      return { x, y };
    }
    tries++;
  }
  return null;
}

function generateNpcs({ mapX, mapY, biome, seed, tiles, width, height }) {
  const profile = NPC_BIOME_PROFILES[biome];
  if (!profile) return [];
  const rng = mkRng((seed ^ 0x9E3779B9) >>> 0);
  const count = profile.minCount + Math.floor(rng() * (profile.maxCount - profile.minCount + 1));
  const used = new Set();
  const npcs = [];
  const surnames = NPC_DATA.surnames[biome] || NPC_DATA.surnames.plains;
  const familyPool = [pickFromRng(rng, surnames), pickFromRng(rng, surnames), pickFromRng(rng, surnames)];

  for (let index = 0; index < count; index++) {
    const pos = findNpcSpawn(tiles, width, height, rng, used, profile.spawnTiles);
    if (!pos) break;
    const profession = pickFromRng(rng, profile.professions);
    const surname = pickFromRng(rng, familyPool);
    const firstName = pickFromRng(rng, NPC_DATA.names);
    const personality = pickFromRng(rng, profile.personalities);
    const district = pickFromRng(rng, profile.districts);
    const familyRole = `${pickFromRng(rng, NPC_DATA.familyRoles)} ${surname}`;
    const topic = pickFromRng(rng, profile.topicsByProfession[profession] || ['a vida nestas terras']);
    npcs.push({
      id: `n_${mapX}_${mapY}_${index}`,
      npcId: `${mapX}:${mapY}:${index}`,
      type: 'npc',
      char: profile.glyphByProfession[profession] || '☺',
      name: `${firstName} ${surname}`,
      x: pos.x,
      y: pos.y,
      spawnX: pos.x,
      spawnY: pos.y,
      roamRadius: 3 + Math.floor(rng() * 3),
      profession,
      personality,
      district,
      familyRole,
      topic,
      biography: `${firstName} ${surname} vive em ${district}, atua como ${profession.toLowerCase()} e costuma falar sobre ${topic}.`,
      tradeStock: buildNpcTradeStock(biome, profession, rng),
      rareRumors: buildNpcRareRumors(biome, profession, district, topic),
      questHooks: buildNpcQuestHooks(biome, profession, district, topic, index),
      disposition: 'friendly',
      interactionRadius: 2,
      state: 'idle',
      moveTimer: 0,
      homeBiome: biome
    });
  }

  return npcs;
}

function equipInventoryItem(player, index, maxSlots = 24) {
  const inventory = normalizeInventory(player.inventory || [], maxSlots);
  const item = inventory[index];
  if (!item) return { ok: false, error: 'Item inexistente.' };
  if (!item.slot) return { ok: false, error: 'Esse item nao pode ser equipado.' };

  inventory.splice(index, 1);
  const previous = player.equipment?.[item.slot];
  if (previous) {
    const stored = storeItem(inventory, previous, maxSlots);
    if (!stored.stored) return { ok: false, error: 'Inventario cheio para desequipar o item atual.' };
    player.inventory = stored.inventory;
  } else {
    player.inventory = inventory;
  }

  player.equipment = player.equipment || {};
  player.equipment[item.slot] = item;
  player.inventory = normalizeInventory(player.inventory, maxSlots);
  refreshDerivedStats(player);
  return { ok: true, item, previous };
}

function unequipSlot(player, slot, maxSlots = 24) {
  const equipped = player.equipment?.[slot];
  if (!equipped) return { ok: false, error: 'Nenhum item equipado nesse slot.' };
  const stored = storeItem(player.inventory || [], equipped, maxSlots);
  if (!stored.stored) return { ok: false, error: 'Inventario cheio.' };
  player.inventory = stored.inventory;
  delete player.equipment[slot];
  refreshDerivedStats(player);
  return { ok: true, item: equipped };
}

module.exports = {
  ITEM_DEFS,
  SKILL_DEFS,
  STATUS_DEFS,
  ACTIVITY_DEFS,
  CROP_DEFS,
  safeParseJson,
  createItem,
  getItemValue,
  normalizeInventory,
  storeItem,
  countInventoryItem,
  consumeInventoryItem,
  consumeMedicinalItem,
  isMedicinalItem,
  getStarterLoadout,
  refreshDerivedStats,
  serializePlayerState,
  grantDisciplineXp,
  grantActivityXp,
  getActivityLevel,
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
  deriveClassName,
};