'use strict';

const OPENAI_API_URL = process.env.OPENAI_API_URL || 'https://api.openai.com/v1/chat/completions';
const OPENROUTER_API_URL = process.env.OPENROUTER_API_URL || 'https://openrouter.ai/api/v1/chat/completions';
const MODEL_PROVIDER = process.env.OPENROUTER_API_KEY ? 'openrouter' : 'openai';
const CHAT_API_URL = MODEL_PROVIDER === 'openrouter' ? OPENROUTER_API_URL : OPENAI_API_URL;
const CHAT_MODEL = process.env.OPENROUTER_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';
const CHAT_API_KEY = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || '';
const OPENROUTER_SITE_URL = process.env.OPENROUTER_SITE_URL || 'http://localhost';
const OPENROUTER_SITE_NAME = process.env.OPENROUTER_SITE_NAME || 'Aeterra';
const STOPWORDS = new Set(['a', 'o', 'e', 'de', 'da', 'do', 'das', 'dos', 'em', 'no', 'na', 'nos', 'nas', 'um', 'uma', 'para', 'com', 'sobre', 'por', 'que', 'meu', 'minha', 'seu', 'sua', 'voce', 'voces', 'eu', 'tu', 'ele', 'ela', 'isso', 'isto', 'aquele', 'aquela', 'muito', 'pouco', 'mais', 'menos', 'ser', 'estar', 'ter', 'falar', 'conversar', 'quero', 'gosto', 'hoje', 'ontem', 'amanha']);
const TRADE_PROFESSION_RX = /mercador|estalajadeir|ferreir|moleir|barqueir/i;

function normalizeText(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectIntent(prompt) {
  const text = normalizeText(prompt);
  if (!text) return 'greeting';
  if (/\b(oi|ola|bom dia|boa tarde|boa noite|saudacoes)\b/.test(text)) return 'greeting';
  if (/\b(nome|quem e voce|quem e vc|quem voce e)\b/.test(text)) return 'identity';
  if (/\b(trabalha|trabalho|profissao|oficio|faz)\b/.test(text)) return 'profession';
  if (/\b(rumor|boato|noticia|novidade|acontece|acontecendo)\b/.test(text)) return 'rumor';
  if (/\b(cidade|bairro|rua|mercado|lugar)\b/.test(text)) return 'city';
  if (/\b(familia|irmao|irma|pai|mae|parente|sobrenome)\b/.test(text)) return 'family';
  if (/\b(ajuda|missao|servico|preciso)\b/.test(text)) return 'help';
  if (/\b(comprar|vender|preco|ouro|mercadoria)\b/.test(text)) return 'trade';
  return 'freeform';
}

function buildSharedFamilyHint(npc, player) {
  const playerSurname = String(player?.name || '').trim().split(/\s+/).slice(1).join(' ');
  if (!playerSurname) return '';
  const npcSurname = String(npc.name || '').trim().split(/\s+/).slice(1).join(' ');
  if (npcSurname && npcSurname === playerSurname) {
    return ` Seu sobrenome combina com o meu. Talvez exista um ramo esquecido da familia ${npcSurname}.`;
  }
  return '';
}

function normalizeFacts(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(sanitizeFact).filter(Boolean);
  try { return JSON.parse(value).map(sanitizeFact).filter(Boolean); }
  catch { return []; }
}

function sanitizeFact(fact) {
  if (!fact) return null;
  if (typeof fact === 'string') {
    return { summary: fact, category: 'topic', weight: 1, lastSeen: null };
  }
  if (typeof fact !== 'object') return null;
  const summary = String(fact.summary || '').trim();
  if (!summary) return null;
  return {
    summary,
    category: String(fact.category || 'topic'),
    weight: Math.max(1, Number(fact.weight || 1)),
    lastSeen: fact.lastSeen || null,
  };
}

function affinityLabel(affinity) {
  if (affinity >= 18) return 'confidente';
  if (affinity >= 10) return 'aliado';
  if (affinity >= 4) return 'conhecido';
  return 'estranho';
}

function playerFirstName(player) {
  return String(player?.name || 'Viajante').trim().split(/\s+/)[0] || 'Viajante';
}

function buildNpcUnlocks(npc, relation) {
  const discountPercent = TRADE_PROFESSION_RX.test(String(npc?.profession || ''))
    ? (relation.affinity >= 18 ? 15 : relation.affinity >= 12 ? 10 : relation.affinity >= 6 ? 5 : 0)
    : 0;
  const rareRumors = relation.affinity >= 8
    ? (npc?.rareRumors || []).slice(0, relation.affinity >= 18 ? 2 : 1)
    : [];
  const localQuests = relation.affinity >= 12
    ? (npc?.questHooks || []).slice(0, relation.affinity >= 18 ? 2 : 1)
    : [];
  const services = [];
  if (discountPercent > 0) services.push(`${discountPercent}% de desconto local`);
  if (rareRumors.length) services.push('rumor raro');
  if (localQuests.length) services.push('missao local');
  return { discountPercent, rareRumors, localQuests, services };
}

function rememberedFacts(relation, maxFacts = 3) {
  return normalizeFacts(relation.facts)
    .sort((left, right) => right.weight - left.weight)
    .slice(0, maxFacts)
    .map(entry => entry.summary);
}

function normalizeRelationship(row, player) {
  const affinity = Number(row?.affinity || 0);
  return {
    affinity,
    familiarity: Number(row?.familiarity || 0),
    conversationCount: Number(row?.conversation_count || 0),
    affinityLabel: row?.affinity_label || affinityLabel(affinity),
    lastTopic: row?.last_topic || '',
    memorySummary: row?.memory_summary || '',
    facts: normalizeFacts(row?.facts),
    playerName: row?.player_name || player?.name || '',
  };
}

function buildRelationshipSnapshot(npc, row, player) {
  const relation = normalizeRelationship(row, player);
  return {
    ...relation,
    rememberedFacts: rememberedFacts(relation),
    unlocks: buildNpcUnlocks(npc, relation),
  };
}

function extractTopic(prompt, intent, npc) {
  if (intent && intent !== 'freeform') return intent;
  const keywords = normalizeText(prompt).split(' ').filter(word => word.length >= 4 && !STOPWORDS.has(word));
  if (!keywords.length) return npc.topic;
  return keywords.slice(0, 3).join(' ');
}

function affinityGain(prompt, intent) {
  const text = normalizeText(prompt);
  let gain = 1;
  if (intent === 'freeform') gain += 1;
  if (intent === 'family' || intent === 'help') gain += 1;
  if (text.length >= 32) gain += 1;
  if (/\b(obrigad|valeu|confio|amig|respeito|lembra|recorda)\b/.test(text)) gain += 2;
  return gain;
}

function extractSignificantFacts(prompt, intent, topic) {
  const raw = String(prompt || '').trim();
  const text = normalizeText(raw);
  const facts = [];

  if (/\bmeu nome e\b/.test(text)) facts.push({ summary: 'revelou o proprio nome em conversa', category: 'identity', weight: 3 });
  if (/\b(procuro|busco|ca[cç]o|quero encontrar)\b/.test(text)) facts.push({ summary: 'esta procurando algo importante', category: 'goal', weight: 4 });
  if (/\b(confio|amig|aliad|voltei|lembra|recorda)\b/.test(text)) facts.push({ summary: 'reforcou um vinculo de confianca', category: 'bond', weight: 5 });
  if (/\b(familia|irmao|irma|pai|mae|sobrenome|parente)\b/.test(text)) facts.push({ summary: 'falou sobre assuntos de familia', category: 'family', weight: 4 });
  if (/\b(preciso|ajuda|servico|missao)\b/.test(text)) facts.push({ summary: 'demonstrou precisar de ajuda local', category: 'need', weight: 3 });
  if (intent === 'freeform' && topic) facts.push({ summary: `costuma conversar sobre ${topic}`, category: 'topic', weight: 2 });

  return facts;
}

function mergeFacts(existingFacts, nextFacts) {
  const merged = new Map();
  normalizeFacts(existingFacts).forEach(fact => merged.set(fact.summary, fact));
  (nextFacts || []).map(sanitizeFact).filter(Boolean).forEach(fact => {
    const current = merged.get(fact.summary);
    if (current) {
      merged.set(fact.summary, { ...current, weight: Math.max(current.weight, fact.weight), lastSeen: fact.lastSeen || current.lastSeen });
      return;
    }
    merged.set(fact.summary, fact);
  });
  return [...merged.values()].sort((left, right) => right.weight - left.weight).slice(0, 8);
}

function buildMemorySummary(relation, topic, playerName) {
  const firstName = String(playerName || '').split(/\s+/)[0] || 'o viajante';
  const strongestFact = rememberedFacts(relation, 1)[0];
  if (relation.conversationCount >= 10) {
    return `${firstName} ja e presenca constante. ${strongestFact || `Nossas conversas costumam voltar para ${topic || relation.lastTopic || 'assuntos do lugar'}.`}`;
  }
  if (relation.conversationCount >= 5) {
    return `${firstName} sempre retorna para conversar sobre ${topic || relation.lastTopic || 'assuntos locais'}. ${strongestFact || ''}`.trim();
  }
  if (relation.conversationCount >= 2) {
    return `${firstName} nao e mais um estranho e ja demonstrou interesse em ${topic || relation.lastTopic || 'minha rotina'}.`;
  }
  return '';
}

function relationGreeting(relation, npc, player) {
  const firstName = playerFirstName(player);
  if (relation.affinity >= 18) return `${firstName}, bom ver voce de novo. Ainda guardo na memoria o que dividimos sobre ${relation.lastTopic || npc.topic}.`;
  if (relation.affinity >= 10) return `${firstName}, eu me lembro de voce. Da ultima vez falamos sobre ${relation.lastTopic || npc.topic}.`;
  if (relation.conversationCount >= 2) return `${firstName}, nos ja nos falamos antes. Se quiser, continuo a conversa sobre ${relation.lastTopic || npc.topic}.`;
  return '';
}

function buildCommonReply(intent, npc, player, room, relation) {
  const biomeLabel = room?.biomeLabel || room?.biome || 'estas terras';
  const familyHint = buildSharedFamilyHint(npc, player);
  const rememberedGreeting = relationGreeting(relation, npc, player);
  const unlocks = relation.unlocks || buildNpcUnlocks(npc, relation);

  switch (intent) {
    case 'greeting':
      return rememberedGreeting || `Sou ${npc.name}, ${npc.profession.toLowerCase()} de ${npc.district}. Se precisar de algo sobre ${npc.topic}, fale com calma.${familyHint}`;
    case 'identity':
      return `${npc.name}. ${npc.familyRole}, personalidade ${npc.personality}, ligado a ${npc.district}. Meu lugar e ${biomeLabel}.`;
    case 'profession':
      return `Trabalho como ${npc.profession.toLowerCase()}. Minha rotina gira em torno de ${npc.topic}, e raramente saio de ${npc.district}.`;
    case 'rumor':
      if (unlocks.rareRumors.length) return `Ja que voce voltou, conto algo raro: ${unlocks.rareRumors[0]}`;
      return `Os comentarios de ${npc.district} falam sobre ${npc.topic}. Nada grande escapa por muito tempo quando a cidade esta inquieta.`;
    case 'city':
      return `${npc.district} e o meu limite. Conheco as passagens, as familias e quem deve favores por aqui.`;
    case 'family':
      return `Minha historia me prende a ${npc.familyRole}. Carrego o nome ${npc.name.split(' ').slice(1).join(' ')} com cuidado.${familyHint}`;
    case 'help':
      if (unlocks.localQuests.length) return `Tenho um pedido para voce: ${unlocks.localQuests[0].title}. ${unlocks.localQuests[0].summary}`;
      return `Posso orientar sobre ${npc.topic} e sobre o humor de ${npc.district}. ${relation.affinity >= 10 ? 'Ja confio mais em voce do que nos primeiros encontros.' : 'Para algo maior, volte quando eu confiar mais em voce.'}`;
    case 'trade':
      if (unlocks.discountPercent > 0) return `Para voce eu consigo ${unlocks.discountPercent}% de desconto local. Ja provou que vale a pena negociar com calma.`;
      return `Nao negocio de verdade ainda, mas entendo o valor de ouro, suprimentos e reputacao por estas ruas.`;
    default:
      return null;
  }
}

class NpcDialogueService {
  constructor(db) {
    this.db = db;
    this.hasApiKey = !!CHAT_API_KEY;
  }

  getRelationshipSnapshot(npc, player) {
    const row = this.db.prepare('SELECT * FROM npc_relationships WHERE npc_key=? AND char_id=?').get(npc.npcId, player.charId);
    return buildRelationshipSnapshot(npc, row, player);
  }

  getGreeting(npc, player, room) {
    const relation = this.getRelationshipSnapshot(npc, player);
    return buildCommonReply('greeting', npc, player, room, relation);
  }

  async respond({ npc, player, room, prompt }) {
    const relation = this.getRelationshipSnapshot(npc, player);
    const intent = detectIntent(prompt);
    const topic = extractTopic(prompt, intent, npc);
    const common = buildCommonReply(intent, npc, player, room, relation);
    this.#appendHistory(npc.npcId, player.charId, 'player', prompt, intent);
    if (common) {
      this.#cacheReply(npc.npcId, `${player.charId}:${intent}`, common);
      this.#appendHistory(npc.npcId, player.charId, 'npc', common, intent);
      const updated = this.#recordInteraction(npc, player, { intent, topic, promptText: prompt });
      return { text: common, source: 'template', cached: true, intent, relation: updated };
    }

    const promptKey = `${player.charId}:${normalizeText(prompt).slice(0, 120)}`;
    const cached = this.db.prepare('SELECT response FROM npc_dialogue_cache WHERE npc_key=? AND prompt_key=?').get(npc.npcId, promptKey);
    if (cached?.response) {
      this.db.prepare('UPDATE npc_dialogue_cache SET hits=hits+1, updated_at=datetime(\'now\') WHERE npc_key=? AND prompt_key=?').run(npc.npcId, promptKey);
      this.#appendHistory(npc.npcId, player.charId, 'npc', cached.response, intent);
      const updated = this.#recordInteraction(npc, player, { intent, topic, promptText: prompt });
      return { text: cached.response, source: 'cache', cached: true, intent, relation: updated };
    }

    if (!this.hasApiKey) {
      const fallback = `${npc.name} pensa por um momento antes de responder: "${playerFirstName(player)}, eu sou ${npc.profession.toLowerCase()} em ${npc.district}. Posso falar sobre ${npc.topic}, minha familia e o que observo por aqui. ${relation.affinity >= 10 ? 'Ja lembro bem de voce.' : 'Fora disso, prefiro cautela.'}"`;
      this.#cacheReply(npc.npcId, promptKey, fallback);
      this.#appendHistory(npc.npcId, player.charId, 'npc', fallback, intent);
      const updated = this.#recordInteraction(npc, player, { intent, topic, promptText: prompt });
      return { text: fallback, source: 'fallback', cached: false, intent, relation: updated };
    }

    try {
      const response = await this.#callModel(npc, player, room, prompt, relation);
      const text = response || buildCommonReply('help', npc, player, room, relation) || 'Hoje prefiro poucas palavras.';
      this.#cacheReply(npc.npcId, promptKey, text);
      this.#appendHistory(npc.npcId, player.charId, 'npc', text, intent);
      const updated = this.#recordInteraction(npc, player, { intent, topic, promptText: prompt });
      return { text, source: 'llm', cached: false, intent, relation: updated };
    } catch {
      const fallback = buildCommonReply('help', npc, player, room, relation) || 'Nao tenho muito a acrescentar agora.';
      this.#cacheReply(npc.npcId, promptKey, fallback);
      this.#appendHistory(npc.npcId, player.charId, 'npc', fallback, intent);
      const updated = this.#recordInteraction(npc, player, { intent, topic, promptText: prompt });
      return { text: fallback, source: 'fallback', cached: false, intent, relation: updated };
    }
  }

  #appendHistory(npcKey, charId, speaker, text, intent) {
    this.db.prepare('INSERT INTO npc_conversation_history (npc_key, char_id, speaker, text, intent) VALUES (?,?,?,?,?)')
      .run(npcKey, charId, speaker, String(text || '').slice(0, 400), intent || '');
    this.db.prepare(`
      DELETE FROM npc_conversation_history
      WHERE id NOT IN (
        SELECT id FROM npc_conversation_history WHERE npc_key=? AND char_id=? ORDER BY id DESC LIMIT 12
      ) AND npc_key=? AND char_id=?
    `).run(npcKey, charId, npcKey, charId);
  }

  #ensureRelationship(npc, player) {
    const current = this.db.prepare('SELECT * FROM npc_relationships WHERE npc_key=? AND char_id=?').get(npc.npcId, player.charId);
    if (current) return normalizeRelationship(current, player);
    this.db.prepare(`
      INSERT INTO npc_relationships (npc_key, char_id, player_name, affinity, familiarity, conversation_count, affinity_label, last_topic, memory_summary, facts)
      VALUES (?, ?, ?, 0, 0, 0, 'estranho', '', '', '[]')
    `).run(npc.npcId, player.charId, player.name);
    return normalizeRelationship(null, player);
  }

  #recordInteraction(npc, player, { intent, topic, promptText }) {
    const current = this.getRelationshipSnapshot(npc, player);
    const nextFacts = extractSignificantFacts(promptText, intent, topic).map(fact => ({ ...fact, lastSeen: new Date().toISOString() }));
    const next = {
      affinity: current.affinity + affinityGain(promptText || topic, intent),
      familiarity: current.familiarity + 1,
      conversationCount: current.conversationCount + 1,
      lastTopic: topic || current.lastTopic || npc.topic,
      facts: mergeFacts(current.facts, nextFacts),
      playerName: player.name,
    };
    const summarySeed = { ...next, affinityLabel: affinityLabel(next.affinity) };
    next.affinityLabel = summarySeed.affinityLabel;
    next.memorySummary = buildMemorySummary(summarySeed, next.lastTopic, player.name);

    this.db.prepare(`
      INSERT INTO npc_relationships (
        npc_key, char_id, player_name, affinity, familiarity, conversation_count,
        affinity_label, last_topic, memory_summary, facts, last_interaction_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(npc_key, char_id)
      DO UPDATE SET
        player_name=excluded.player_name,
        affinity=excluded.affinity,
        familiarity=excluded.familiarity,
        conversation_count=excluded.conversation_count,
        affinity_label=excluded.affinity_label,
        last_topic=excluded.last_topic,
        memory_summary=excluded.memory_summary,
        facts=excluded.facts,
        last_interaction_at=datetime('now')
    `).run(
      npc.npcId,
      player.charId,
      player.name,
      next.affinity,
      next.familiarity,
      next.conversationCount,
      next.affinityLabel,
      next.lastTopic,
      next.memorySummary,
      JSON.stringify(next.facts)
    );

    return buildRelationshipSnapshot(npc, {
      affinity: next.affinity,
      familiarity: next.familiarity,
      conversation_count: next.conversationCount,
      affinity_label: next.affinityLabel,
      last_topic: next.lastTopic,
      memory_summary: next.memorySummary,
      facts: next.facts,
      player_name: player.name,
    }, player);
  }

  #cacheReply(npcKey, promptKey, response) {
    this.db.prepare(`
      INSERT INTO npc_dialogue_cache (npc_key, prompt_key, response, hits, updated_at)
      VALUES (?, ?, ?, 1, datetime('now'))
      ON CONFLICT(npc_key, prompt_key)
      DO UPDATE SET response=excluded.response, hits=npc_dialogue_cache.hits+1, updated_at=datetime('now')
    `).run(npcKey, promptKey, response);
  }

  async #callModel(npc, player, room, prompt, relation) {
    const history = this.db.prepare(
      'SELECT speaker, text FROM npc_conversation_history WHERE npc_key=? AND char_id=? ORDER BY id DESC LIMIT 6'
    ).all(npc.npcId, player.charId).reverse();
    const historyText = history.length
      ? history.map(entry => `${entry.speaker}: ${entry.text}`).join('\n')
      : 'Sem conversa anterior relevante.';
    const body = {
      model: CHAT_MODEL,
      temperature: 0.5,
      max_tokens: 120,
      messages: [
        {
          role: 'system',
          content: [
            `Voce e ${npc.name}, ${npc.profession.toLowerCase()} de ${npc.district}.`,
            `Personalidade: ${npc.personality}.`,
            `Historia curta: ${npc.biography}.`,
            `Tema recorrente: ${npc.topic}.`,
            `Relacao com ${player.name}: afinidade ${relation.affinity} (${relation.affinityLabel}).`,
            `Memoria curta sobre ${player.name}: ${relation.memorySummary || 'nenhuma memoria marcante ainda'}.`,
            `Fatos importantes lembrados: ${(relation.rememberedFacts || []).join('; ') || 'nenhum ainda'}.`,
            `Desbloqueios atuais: ${(relation.unlocks?.services || []).join(', ') || 'nenhum'}.`,
            `Ultimo topico forte: ${relation.lastTopic || npc.topic}.`,
            `Limites: responda como um NPC do mapa ${room?.mapX},${room?.mapY}; nao fale como assistente, nao quebre personagem, nao invente poderes sistêmicos.`,
            `Fale em portugues do Brasil, com no maximo 3 frases, coerente com a cidade e com a sua funcao.`
          ].join(' ')
        },
        {
          role: 'user',
          content: `Historico recente:\n${historyText}\n\n${player?.name || 'Viajante'} pergunta agora: ${prompt}`
        }
      ]
    };

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${CHAT_API_KEY}`
    };
    if (MODEL_PROVIDER === 'openrouter') {
      headers['HTTP-Referer'] = OPENROUTER_SITE_URL;
      headers['X-Title'] = OPENROUTER_SITE_NAME;
    }

    const result = await fetch(CHAT_API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!result.ok) throw new Error(`${MODEL_PROVIDER} ${result.status}`);
    const data = await result.json();
    return data?.choices?.[0]?.message?.content?.trim() || null;
  }
}

module.exports = { NpcDialogueService };