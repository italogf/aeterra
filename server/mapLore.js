// server/mapLore.js — Aeterra: World Breaker Map Lore Generator
'use strict';

const https = require('https');
const { safeParseJson } = require('./gameSystems');

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_API_KEY = () => process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL   = () => process.env.OPENROUTER_MODEL || 'google/gemma-4-31b-it:free';

// ---- Biome flavour descriptors ----
const BIOME_FLAVOR = {
  forest:   { terrain: 'floresta densa e antiga', atmosphere: 'silenciosa e carregada de presença', threat: 'criaturas das sombras e espíritos territoriais' },
  desert:   { terrain: 'planícies áridas e dunas eternas', atmosphere: 'abrasante e sem misericórdia', threat: 'caçadores do deserto e mortos das areias' },
  mountain: { terrain: 'picos gelados e ravinas profundas', atmosphere: 'cortante como lâmina de vento', threat: 'bestas das alturas e guardiões da pedra' },
  city:     { terrain: 'ruínas urbanas e estruturas de pedra', atmosphere: 'pesada com memória de multidões', threat: 'facções rivais e fantasmas do passado civil' },
  water:    { terrain: 'lagos profundos e corredeiras traiçoeiras', atmosphere: 'úmida e sussurrante', threat: 'criaturas das profundezas e correntes amaldiçoadas' },
  plains:   { terrain: 'campos abertos e gramados altos', atmosphere: 'enganosamente calma', threat: 'bandos nômades e predadores das planícies' },
  anomaly:  { terrain: 'fragmentos de realidade deformados', atmosphere: 'instável e perturbadora para a mente', threat: 'entes corrompidos e fragmentos do vazio' },
};

const RANK_CONTEXT = {
  F:   { age: 'recém-descoberta', history: 'poucos aventureiros chegaram aqui', significance: 'marginal' },
  E:   { age: 'explorada há poucas gerações', history: 'alguns registros esparsos existem', significance: 'periférica' },
  D:   { age: 'conhecida há décadas', history: 'expedições ocasionais foram documentadas', significance: 'moderada' },
  C:   { age: 'parte das rotas antigas', history: 'embates e disputas já moldaram esta terra', significance: 'estratégica' },
  B:   { age: 'palco de eventos históricos', history: 'batalhas e segredos foram enterrados aqui', significance: 'alta' },
  A:   { age: 'terra de lendas regionais', history: 'apenas os mais fortes sobreviveram para contar', significance: 'lendária' },
  S:   { age: 'território de mitos e perigos extremos', history: 'a maioria dos que entraram não voltou', significance: 'aterrorizante' },
  SS:  { age: 'domínio de entidades além da compreensão', history: 'apenas fragmentos de diários sobrevivem', significance: 'catastrófica' },
  SSS: { age: 'origem desconhecida, anterior à historia registrada', history: 'existência desta área é segredo guardado a sangue', significance: 'apocalíptica' },
};

// ---- Procedural fallback lore ----
const LORE_SEEDS = {
  forest: [
    'Esta floresta abriga espíritos que despertaram antes dos primeiros impérios. Os galhos mais antigos guardam segredos que nenhum escriba ousou registrar.',
    'Os caçadores locais nunca penetram além do terceiro círculo de árvores. Dizem que quem o faz ouve vozes em línguas de civilizações extintas.',
    'Relíquias de um povo pré-imperial foram encontradas nesta mata. Eles veneravam as árvores como guardiãs de almas aprisionadas.',
  ],
  desert: [
    'Sob a areia, estruturas de uma cidade antiga aguardam quem for corajoso o suficiente para escavar. Os habitantes sumiram em uma única noite há séculos.',
    'Mercadores evitam esta rota após o desaparecimento de três caravanas. As pegadas encontradas levavam em direção ao centro das dunas, mas nunca saíam.',
    'Uma tempestade de areia nesta região dura sete dias cada vez que alguém tenta mapear seu perímetro. Coincidência ou proteção antiga?',
  ],
  mountain: [
    'Este pico foi palco de um cerco que durou dezoito anos. Os defensores jamais cederam, e quando os atacantes finalmente escalaram os muros, não encontraram ninguém.',
    'Mineiros que trabalharam nestas rochas relatam ouvir batidas rítmicas vindas do interior da montanha, como se algo enorme caminhasse por túneis abaixo.',
    'A altitude extrema faz com que o sangue dos feridos tome cor diferente aqui. Os xamãs das tribos locais chamam esta terra de "onde o céu prova os vivos".',
  ],
  city: [
    'Esta cidade foi fundada por exilados de um reino que não existe mais nos mapas. Seus descendentes ainda guardam o juramento de não revelar o nome verdadeiro do lugar de onde vieram.',
    'Três governantes diferentes tentaram tomar controle desta localidade nos últimos dois séculos. Todos desapareceram antes de completar o primeiro mandato.',
    'As ruas foram construídas sobre uma necrópole ainda maior. A cada nova construção, trabalhadores relatam encontrar câmaras seladas que não aparecem em nenhuma planta.',
  ],
  water: [
    'As águas aqui mantêm uma temperatura constante, independentemente da estação. Pescadores mais velhos afirmam que o fundo possui uma fonte de calor que ainda não foi explicada.',
    'Um mercador de mapas antigos possui registros mostrando que este lago era terra firme há trezentos anos. O que afundou, e por quê, é assunto que ninguém quer investigar.',
    'Nas noites de lua cheia, silhuetas são vistas se movendo sob a superfície. Grandes demais para peixes, pequenas demais para serem embarcações afundadas.',
  ],
  plains: [
    'Estas planícies foram o campo de batalha de uma guerra que apagou três gerações de duas regiões vizinhas. O capim que cresce aqui é vermelho na raiz.',
    'Nômades que cruzam estas terras relatam encontrar acampamentos abandonados com comida ainda quente, como se os habitantes tivessem saído segundos antes da chegada.',
    'Uma estrada antiga cortava estas planícies, mas foi deliberadamente destruída. Os registros do motivo foram queimados junto com a biblioteca que os guardava.',
  ],
  anomaly: [
    'Instrumentos de medição param de funcionar nesta área. Estudiosos do arcano acreditam que o tecido da realidade foi rasgado e costurado às pressas em algum ponto do passado.',
    'Qualquer ser vivo que permaneça aqui por tempo suficiente começa a lembrar de eventos que nunca aconteceram. Os mais afetados não conseguem mais distinguir memória de profecia.',
    'Esta fenda não existia nos mapas de cinquenta anos atrás. O que causou o colapso local da realidade é desconhecido, mas os sobreviventes da região original jamais foram encontrados.',
  ],
};

function getProceduralLore(biome, rank, mapName) {
  const options = LORE_SEEDS[biome] || LORE_SEEDS.plains;
  const rankCtx = RANK_CONTEXT[rank] || RANK_CONTEXT.F;
  const base = options[Math.abs(mapName.length * 7 + rank.length * 3) % options.length];
  const rankLine = rank === 'F' || rank === 'E'
    ? `Região ${rankCtx.age}, ${rankCtx.history}.`
    : `Terra ${rankCtx.age} — ${rankCtx.history}. Significância: ${rankCtx.significance}.`;
  return `${base}\n\n${rankLine}`;
}

// ---- OpenRouter API call ----
function callOpenRouter(messages) {
  return new Promise((resolve, reject) => {
    const apiKey = OPENROUTER_API_KEY();
    if (!apiKey) { reject(new Error('no api key')); return; }

    const body = JSON.stringify({
      model: OPENROUTER_MODEL(),
      messages,
      max_tokens: 320,
      temperature: 0.85,
    });

    const url = new URL(OPENROUTER_API_URL);
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://github.com/italogf/aeterra',
        'X-Title': 'Aeterra: World Breaker',
      },
    }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const text = parsed?.choices?.[0]?.message?.content?.trim();
          if (text) resolve(text);
          else reject(new Error('empty response'));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(12000, () => { req.destroy(); reject(new Error('timeout')); });
    req.write(body);
    req.end();
  });
}

// ---- Lore prompt builder ----
function buildLorePrompt(mapName, biome, rank, mapX, mapY) {
  const flavor  = BIOME_FLAVOR[biome] || BIOME_FLAVOR.plains;
  const rankCtx = RANK_CONTEXT[rank] || RANK_CONTEXT.F;
  const isCity  = biome === 'city';

  const systemPrompt = `Você é o narrador de Aeterra: World Breaker, um MMORPG hardcore com mundo procedural. Seu estilo é épico e sombrio, inspirado em manhwas coreanos como Solo Leveling, Overgeared e The Beginning After The End. Escreva em português brasileiro, com frases curtas e impacto emocional. Não use markdown. Máximo de 4 parágrafos curtos.`;

  const userPrompt = isCity
    ? `Crie a história de uma cidade chamada "${mapName}" em coordenadas (${mapX}, ${mapY}). A cidade tem terreno de ${flavor.terrain}, atmosfera ${flavor.atmosphere} e abriga ${flavor.threat}. Ela é ${rankCtx.age} e ${rankCtx.history}. Descreva sua fundação, seu maior evento histórico, e um segredo que os habitantes guardam. Tom: misterioso e sombrio.`
    : `Crie a lore de uma região chamada "${mapName}" (rank ${rank}) em coordenadas (${mapX}, ${mapY}). O terreno é ${flavor.terrain}, com atmosfera ${flavor.atmosphere}. As ameaças incluem ${flavor.threat}. A região é ${rankCtx.age} — ${rankCtx.history}. Descreva: o que aconteceu aqui no passado, qual entidade ou força moldou este lugar, e que advertência os mais velhos passam aos jovens que ousam explorar. Tom: épico e ameaçador.`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
}

// ---- Main export: get or generate lore ----
async function getOrGenerateLore(db, mapX, mapY, biome, rank, mapName) {
  const row = db.prepare('SELECT lore, lore_generated_at FROM world_maps WHERE map_x=? AND map_y=?').get(mapX, mapY);
  if (row?.lore) return row.lore;

  let lore;
  try {
    const messages = buildLorePrompt(mapName, biome, rank, mapX, mapY);
    lore = await callOpenRouter(messages);
  } catch (e) {
    console.error('mapLore: LLM failed, using procedural fallback:', e.message);
    lore = getProceduralLore(biome, rank, mapName);
  }

  // Cache
  try {
    db.prepare("UPDATE world_maps SET lore=?, lore_generated_at=datetime('now') WHERE map_x=? AND map_y=?")
      .run(lore, mapX, mapY);
  } catch (e) {
    console.error('mapLore: failed to cache lore:', e);
  }

  return lore;
}

module.exports = { getOrGenerateLore, getProceduralLore, calcMapRank: null }; // rank exported from worldGen
