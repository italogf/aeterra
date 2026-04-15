'use strict';
// ─── AETERNITAS i18n ─────────────────────────────────────────────────────
// Stores language in localStorage under 'aet_lang'. Default: 'pt'.
// Usage:  t('key')            → translated string
//         t('key', a, b)      → %s substitution (first %s → a, second %s → b)
//         applyI18n()         → update all [data-i18n] / [data-i18n-placeholder] elements
//         setLang('en'|'pt')  → change language, persist, re-apply

const TRANSLATIONS = {
  pt: {
    // ── Login ────────────────────────────────────────────────────────
    'login.title':                  'Aeterra: World Breaker — Entrar',
    'login.tab.login':              'ENTRAR',
    'login.tab.register':           'INVOCAR CONTA',
    'login.label.username':         'IDENTIFICAÇÃO',
    'login.placeholder.username':   'Seu nome no reino',
    'login.label.password':         'SENHA ARCANA',
    'login.placeholder.password':   '••••••••',
    'login.label.email':            'E-MAIL',
    'login.placeholder.email':      'Seu e-mail',
    'login.label.confirmPassword':  'CONFIRMAR SENHA',
    'login.placeholder.minChars':   '3–20 caracteres',
    'login.placeholder.minPass':    'Mínimo 6 caracteres',
    'login.placeholder.repeatPass': 'Repita a senha',
    'login.loading.login':          'VERIFICANDO...',
    'login.loading.register':       'INSCREVENDO...',
    'login.btn.login':              '▶  ADENTRAR O MUNDO',
    'login.btn.register':           '✦  INSCREVER NO DESTINO',
    'login.footer':                 'Somente os dignos persistem.',
    'login.footer.link':            'Conhecer o mundo.',
    'login.footer.gm':              'Painel GM',
    'login.cooldown.died':          'Sua personagem encontrou o fim.',
    'login.cooldown.waiting':       'O mundo aguarda um novo portador do destino.',
    'login.cooldown.renews':        'O destino se renova em seu tempo.',
    'login.cooldown.timerExpired':  'O destino renova-se agora.',
    'login.btn.devRespawn':         'RENASCER PARA TESTE',
    'login.err.fillAll':            'Preencha todos os campos.',
    'login.err.passwordMismatch':   'As senhas não coincidem.',
    'login.err.loginFailed':        'Erro ao entrar.',
    'login.err.registerFailed':     'Erro ao registrar.',
    'login.err.offline':            'Servidor inacessível.',

    // ── Game buttons ─────────────────────────────────────────────────
    'game.btn.worldMap':  '✦ MAPA MUNDIAL',
    'game.btn.inventory': '⚔ INVENTÁRIO',
    'game.btn.character': '◉ PERSONAGEM',
    'game.btn.admin':     '☬ ADMIN',
    'game.btn.controls':  '? CONTROLES',

    // ── Inventory ────────────────────────────────────────────────────
    'game.inv.title':   'INVENTÁRIO',
    'game.inv.equipped':'EQUIPADO',
    'game.inv.gold':    'Ouro',
    'game.inv.empty':   'Vazio',
    'game.inv.note':    'Clique em um item do inventário para equipar. Clique em um item equipado para remover.',
    'game.inv.equipIn': 'Equipar em',
    'game.inv.removeFrom': 'Remover de',
    'game.inv.emptySlot':  'vazio',

    // ── Controls ─────────────────────────────────────────────────────
    'game.ctrl.title':       'CONTROLES DE JOGO',
    'game.ctrl.move':        'Mover personagem',
    'game.ctrl.attack':      'Atacar inimigo próximo',
    'game.ctrl.attackTarget':'Atacar alvo específico',
    'game.ctrl.interact':    'Usar ação contextual principal',
    'game.ctrl.activities':  'Escolher mineração, pesca ou cultivo',
    'game.ctrl.chat':        'Focar chat',
    'game.ctrl.inventory':   'Inventário',
    'game.ctrl.equip':       'Equipar / remover equipamento',
    'game.ctrl.map':         'Mapa do mundo',
    'game.ctrl.charsheet':   'Ficha do personagem',
    'game.ctrl.regen':       'Regenerar HP (3%/s)',
    'game.ctrl.note':        'Bordas de mapa → muda zona automaticamente \u00a0|\u00a0 ESC fecha painéis',

    // ── World map ────────────────────────────────────────────────────
    'game.wmap.title':      '✦ MAPA DO MUNDO DESCOBERTO',
    'game.wmap.close':      '✕ FECHAR',
    'game.wmap.noZones':    'Nenhuma zona descoberta ainda.',
    'game.wmap.here':       'Você está aqui',
    'game.wmap.currentPos': 'Posição atual',
    'game.wmap.compact':    'Modo compacto (alto espalhamento de coordenadas)',
    'game.wmap.zone':       'zona',
    'game.wmap.zones':      'zonas',
    'game.wmap.disc1':      'descoberta',
    'game.wmap.discN':      'descobertas',

    // ── GM admin ─────────────────────────────────────────────────────
    'game.gm.title':          '☬ CONTROLE ADMINISTRATIVO',
    'game.gm.close':          '✕ FECHAR',
    'game.gm.targetLabel':    'USERNAME ALVO',
    'game.gm.targetPH':       'Nome exato da conta para administrar',
    'game.gm.cooldownTitle':  'ISENÇÃO DE COOLDOWN',
    'game.gm.cooldownDesc':   'Ativa ou remove a exceção que permite criar novo personagem sem aguardar 24h após a morte.',
    'game.gm.cooldownGrant':  'LIBERAR 24H',
    'game.gm.cooldownRevoke': 'RESTAURAR 24H',
    'game.gm.roleTitle':      'CARGO GM',
    'game.gm.roleDesc':       'Promove a conta alvo para GM ou remove esse cargo sem editar o banco manualmente.',
    'game.gm.roleGrant':      'PROMOVER A GM',
    'game.gm.roleRevoke':     'REMOVER GM',
    'game.gm.feedback':       'Aguardando comando administrativo.',
    'game.gm.noTarget':       'Informe o username alvo antes de executar a ação.',
    'game.gm.applying':       'Aplicando alteração de cooldown...',
    'game.gm.applyingRole':   'Aplicando alteração de cargo GM...',
    'game.gm.bypassGranted':  'agora ignora o cooldown de morte',
    'game.gm.bypassRevoked':  'voltou a seguir a regra de 24h',
    'game.gm.roleGranted':    'foi promovido a GM',
    'game.gm.roleRevoked':    'deixou de ser GM',
    'game.gm.actionFailed':   'Falha ao executar ação administrativa.',
    'game.gm.accessDenied':   'Acesso restrito a GMs',
    'game.gm.account':        'Conta',
    'game.gm.active':         'GM ativo',
    'game.gm.noRole':         'Sem cargo GM',
    'game.gm.exempted':       'Isento do cooldown de morte',

    // ── Character creation ───────────────────────────────────────────
    'game.cc.title':        'INVOCAR DESTINO',
    'game.cc.desc':         'Um novo portador surge no mundo eterno.\nDeclare seu nome — o destino fará o resto.',
    'game.cc.nameLbl':      'NOME',
    'game.cc.namePH':       'Seu nome',
    'game.cc.genderLbl':    'GÊNERO',
    'game.cc.genderM':      'MASCULINO',
    'game.cc.genderF':      'FEMININO',
    'game.cc.genderN':      'NEUTRO',
    'game.cc.btn':          '✦  LANÇAR NO MUNDO',
    'game.cc.btnLoading':   'INVOCANDO…',
    'game.cc.accept':       'ACEITAR DESTINO  ▶',
    'game.cc.errNoName':    'Digite um nome.',
    'game.cc.errNoGender':  'Selecione um gênero.',
    'game.cc.errOffline':   'Servidor inacessível.',

    // ── Character sheet ──────────────────────────────────────────────
    'game.cs.header':       '✦ FICHA DO PERSONAGEM',
    'game.cs.close':        '✕ FECHAR',
    'game.cs.identity':     'IDENTIDADE',
    'game.cs.equipment':    'EQUIPAMENTOS',
    'game.cs.status':       'STATUS',
    'game.cs.attributes':   'ATRIBUTOS',
    'game.cs.classSkills':  'CLASSE E SKILLS',
    'game.cs.activeEffects':'EFEITOS ATIVOS',
    'game.cs.achievements': 'CONQUISTAS',
    'game.cs.chronicles':   '✦ CRÔNICAS DO DESTINO',
    'game.cs.quests':       '✦ CONTRATOS LOCAIS',
    'game.cs.empty':        '— vazio —',
    'game.cs.noEffects':    'Sem efeitos ativos.',
    'game.cs.noChronicles': 'Nenhuma crônica registrada ainda.',
    'game.cs.noQuests':     'Nenhum contrato ativo ou concluido ainda.',
    'game.cs.noSkills':     'Nenhuma skill aprendida ainda.',
    'game.cs.noTrades':     'Nenhum oficio registrado ainda.',

    // ── Death overlay ────────────────────────────────────────────────
    'game.death.title':    'VOCÊ MORREU',
    'game.death.default':  'O destino recusou sua existência.',
    'game.death.byKiller': 'Abatido por %s. O destino não perdoa os fracos.',
    'game.death.return':   'RETORNAR AO REINO',

    // ── Action panel ─────────────────────────────────────────────────
    'game.action.idle':      'Exploração ativa. Nenhuma ação contextual disponível.',
    'game.action.noActions': 'Sem atividades no tile atual. Explore margens, montanhas, dungeons e solo fertil.',
    'game.action.noDetail':  'Sem detalhes adicionais.',

    // ── HUD ──────────────────────────────────────────────────────────
    'game.hud.noInterlocutor': 'Sem interlocutor ativo',
    'game.hud.talkingWith':    'Falando com %s',
    'game.hud.noEffects':      'Sem efeitos',
    'hud.adventure':           'Aventureiro',
    'hud.day':                 'Dia',
    'hud.year':                'Ano',

    // ── NPC ──────────────────────────────────────────────────────────
    'game.npc.noHistory':     'Sem historico registrado',
    'game.npc.noMemory':      'Ainda nao ha memoria forte entre voces.',
    'game.npc.commerce':      'COMERCIO',
    'game.npc.quests':        'MISSOES LOCAIS',
    'game.npc.acceptQuest':   'Aceitar missao',
    'game.npc.turnIn':        'Entregar agora',
    'game.npc.questDone':     'Contrato encerrado',
    'game.npc.questOngoing':  'Coleta em andamento',
    'game.npc.favor':         'Favor concluido.',
    'game.npc.affinity':      'Afinidade',
    'game.npc.conversations': 'conversas',
    'game.npc.talksAbout':    'fala sobre',
    'game.npc.buyItem':       'Comprar %s',
    'game.npc.basePrice':     'base',

    // ── Chat messages ────────────────────────────────────────────────
    'game.chat.nightFalls':    '☾ A noite cobre o mundo. Mais criaturas espreitam nas sombras.',
    'game.chat.dawn':          '✦ O amanhecer chega. As criaturas da noite recuam.',
    'game.chat.loot':          '✦ Loot: %s  (+%s EXP, +%s ouro)',
    'game.chat.killed':        '☠ %s foi abatido.',
    'game.chat.levelUp':       '⬆ Nível %s! HP: %s/%s',
    'game.chat.skillUnlock':   '⬡ Skill aprendida: %s',
    'game.chat.statusApplied': '✦ %s aplicado.',
    'game.chat.statusExpired': '✦ %s terminou.',
    'game.chat.statusDamage':  '☠ %s causa %s de dano.',
    'game.chat.noStamina':     '⚡ Sem estamina — aguarde recuperação.',
    'game.chat.floatExhausted':'EXAUSTO!',
    'game.chat.adminAction':   '☬ Admin: %s %s.',

    // ── Quest state ──────────────────────────────────────────────────
    'game.quest.readyToTurnIn': 'Pronta para entrega',
    'game.quest.accepted':      'Em andamento',
    'game.quest.completed':     'Concluida',
    'game.quest.available':     'Disponivel',
    'game.quest.progress':      'Progresso',
    'game.quest.reward':        'Recompensa',
    'game.quest.npcFallback':   'Contato local',
    'game.quest.asked':         'pediu',
    'game.quest.gold':          'ouro',
    'game.quest.bonus':         '+ %s× %s',

    // ── Attributes ───────────────────────────────────────────────────
    'game.attr.level':    'NÍVEL',
    'game.attr.exp':      'EXP',
    'game.attr.atk':      'ATQ',
    'game.attr.def':      'DEF',
    'game.attr.spd':      'VEL',
    'game.attr.stamina':  'ESTÂMINA',
    'game.attr.gold':     'OURO',
    'game.attr.kills':    'ABATES',
    'game.attr.daysAlive':'DIAS VIVO',

    // ── Character reveal ─────────────────────────────────────────────
    'game.reveal.name':       'NOME',
    'game.reveal.origin':     'ORIGEM',
    'game.reveal.profession': 'PROFISSÃO',
    'game.reveal.traits':     'TRAÇOS',
    'game.reveal.hp':         'HP',
    'game.reveal.atkDef':     'ATK / DEF',
    'game.reveal.destiny':    'DESTINO',

    // ── Biomes ───────────────────────────────────────────────────────
    'biome.forest':   'Floresta',
    'biome.desert':   'Deserto',
    'biome.mountain': 'Montanha',
    'biome.city':     'Cidade',
    'biome.water':    'Águas',
    'biome.plains':   'Planícies',
    'biome.anomaly':  'Anomalia',

    // ── Genders ──────────────────────────────────────────────────────
    'gender.M': 'Masculino',
    'gender.F': 'Feminino',
    'gender.N': 'Neutro',

    // ── Equipment slots ──────────────────────────────────────────────
    'slot.weapon': 'Arma',
    'slot.armor':  'Armadura',
    'slot.helmet': 'Elmo',
    'slot.boots':  'Botas',
    'slot.ring':   'Anel',

    // ── Achievements ─────────────────────────────────────────────────
    'ach.born':               'Nascido no Destino',
    'ach.born.desc':          'Criou um personagem',
    'ach.firstStep':          'Primeiro Passo',
    'ach.firstStep.desc':     'Entrou no mundo',
    'ach.firstBlood':         'Primeiro Sangue',
    'ach.firstBlood.desc':    'Abateu 1 inimigo',
    'ach.hunter':             'Caçador',
    'ach.hunter.desc':        'Abateu 5 inimigos',
    'ach.reaper':             'Ceifador',
    'ach.reaper.desc':        'Abateu 20 inimigos',
    'ach.exterminator':       'Exterminador',
    'ach.exterminator.desc':  'Abateu 100 inimigos',
    'ach.survivor':           'Sobrevivente',
    'ach.survivor.desc':      'Sobreviveu 1 dia real',
    'ach.veteran':            'Veterano',
    'ach.veteran.desc':       'Sobreviveu 7 dias',

    // ── Char sheet misc ──────────────────────────────────────────────
    'cs.discipline': 'DISCIPLINAS',
    'cs.class':      'CLASSE',
    'cs.level':      'Nv',

    // ── Chat input ───────────────────────────────────────────────────
    'game.chat.placeholder': 'T para focar chat…',
  },

  // ────────────────────────────────────────────────────────────────────
  en: {
    // ── Login ────────────────────────────────────────────────────────
    'login.title':                  'Aeterra: World Breaker — Enter',
    'login.tab.login':              'ENTER',
    'login.tab.register':           'CREATE ACCOUNT',
    'login.label.username':         'IDENTIFICATION',
    'login.placeholder.username':   'Your name in the realm',
    'login.label.password':         'ARCANE PASSWORD',
    'login.placeholder.password':   '••••••••',
    'login.label.email':            'E-MAIL',
    'login.placeholder.email':      'Your e-mail',
    'login.label.confirmPassword':  'CONFIRM PASSWORD',
    'login.placeholder.minChars':   '3–20 characters',
    'login.placeholder.minPass':    'Minimum 6 characters',
    'login.placeholder.repeatPass': 'Repeat password',
    'login.loading.login':          'VERIFYING...',
    'login.loading.register':       'REGISTERING...',
    'login.btn.login':              '▶  ENTER THE WORLD',
    'login.btn.register':           '✦  INSCRIBE YOUR FATE',
    'login.footer':                 'Only the worthy persist.',
    'login.footer.link':            'Know the world.',
    'login.footer.gm':              'GM Panel',
    'login.cooldown.died':          'Your character met their end.',
    'login.cooldown.waiting':       'The world awaits a new bearer of fate.',
    'login.cooldown.renews':        'Fate renews in its own time.',
    'login.cooldown.timerExpired':  'Fate renews now.',
    'login.btn.devRespawn':         'RESPAWN FOR TESTING',
    'login.err.fillAll':            'Please fill in all fields.',
    'login.err.passwordMismatch':   'Passwords do not match.',
    'login.err.loginFailed':        'Failed to login.',
    'login.err.registerFailed':     'Failed to register.',
    'login.err.offline':            'Server unreachable.',

    // ── Game buttons ─────────────────────────────────────────────────
    'game.btn.worldMap':  '✦ WORLD MAP',
    'game.btn.inventory': '⚔ INVENTORY',
    'game.btn.character': '◉ CHARACTER',
    'game.btn.admin':     '☬ ADMIN',
    'game.btn.controls':  '? CONTROLS',

    // ── Inventory ────────────────────────────────────────────────────
    'game.inv.title':    'INVENTORY',
    'game.inv.equipped': 'EQUIPPED',
    'game.inv.gold':     'Gold',
    'game.inv.empty':    'Empty',
    'game.inv.note':     'Click an inventory item to equip. Click an equipped item to remove.',
    'game.inv.equipIn':  'Equip in',
    'game.inv.removeFrom': 'Remove from',
    'game.inv.emptySlot':  'empty',

    // ── Controls ─────────────────────────────────────────────────────
    'game.ctrl.title':       'GAME CONTROLS',
    'game.ctrl.move':        'Move character',
    'game.ctrl.attack':      'Attack nearest enemy',
    'game.ctrl.attackTarget':'Attack specific target',
    'game.ctrl.interact':    'Use main contextual action',
    'game.ctrl.activities':  'Choose mining, fishing or farming',
    'game.ctrl.chat':        'Focus chat',
    'game.ctrl.inventory':   'Inventory',
    'game.ctrl.equip':       'Equip / remove equipment',
    'game.ctrl.map':         'World map',
    'game.ctrl.charsheet':   'Character sheet',
    'game.ctrl.regen':       'Regen HP (3%/s)',
    'game.ctrl.note':        'Map edges \u2192 auto zone change \u00a0|\u00a0 ESC closes panels',

    // ── World map ────────────────────────────────────────────────────
    'game.wmap.title':      '✦ DISCOVERED WORLD MAP',
    'game.wmap.close':      '✕ CLOSE',
    'game.wmap.noZones':    'No zones discovered yet.',
    'game.wmap.here':       'You are here',
    'game.wmap.currentPos': 'Current position',
    'game.wmap.compact':    'Compact mode (high coordinate spread)',
    'game.wmap.zone':       'zone',
    'game.wmap.zones':      'zones',
    'game.wmap.disc1':      'discovered',
    'game.wmap.discN':      'discovered',

    // ── GM admin ─────────────────────────────────────────────────────
    'game.gm.title':          '☬ ADMINISTRATIVE CONTROL',
    'game.gm.close':          '✕ CLOSE',
    'game.gm.targetLabel':    'TARGET USERNAME',
    'game.gm.targetPH':       'Exact account name to manage',
    'game.gm.cooldownTitle':  'COOLDOWN EXEMPTION',
    'game.gm.cooldownDesc':   'Enables or removes the exception that allows creating a new character without waiting 24h after death.',
    'game.gm.cooldownGrant':  'GRANT 24H BYPASS',
    'game.gm.cooldownRevoke': 'RESTORE 24H',
    'game.gm.roleTitle':      'GM ROLE',
    'game.gm.roleDesc':       'Promotes the target account to GM or removes that role without editing the database manually.',
    'game.gm.roleGrant':      'PROMOTE TO GM',
    'game.gm.roleRevoke':     'REMOVE GM',
    'game.gm.feedback':       'Awaiting administrative command.',
    'game.gm.noTarget':       'Enter the target username before executing the action.',
    'game.gm.applying':       'Applying cooldown change...',
    'game.gm.applyingRole':   'Applying GM role change...',
    'game.gm.bypassGranted':  'now ignores the death cooldown',
    'game.gm.bypassRevoked':  'is back to the 24h rule',
    'game.gm.roleGranted':    'was promoted to GM',
    'game.gm.roleRevoked':    'is no longer GM',
    'game.gm.actionFailed':   'Failed to execute administrative action.',
    'game.gm.accessDenied':   'Access restricted to GMs',
    'game.gm.account':        'Account',
    'game.gm.active':         'GM active',
    'game.gm.noRole':         'No GM role',
    'game.gm.exempted':       'Death cooldown exempt',

    // ── Character creation ───────────────────────────────────────────
    'game.cc.title':       'INVOKE FATE',
    'game.cc.desc':        'A new bearer rises in the eternal world.\nDeclare your name — fate will do the rest.',
    'game.cc.nameLbl':     'NAME',
    'game.cc.namePH':      'Your name',
    'game.cc.genderLbl':   'GENDER',
    'game.cc.genderM':     'MALE',
    'game.cc.genderF':     'FEMALE',
    'game.cc.genderN':     'NEUTRAL',
    'game.cc.btn':         '✦  CAST INTO THE WORLD',
    'game.cc.btnLoading':  'INVOKING…',
    'game.cc.accept':      'ACCEPT FATE  ▶',
    'game.cc.errNoName':   'Enter a name.',
    'game.cc.errNoGender': 'Select a gender.',
    'game.cc.errOffline':  'Server unreachable.',

    // ── Character sheet ──────────────────────────────────────────────
    'game.cs.header':       '✦ CHARACTER SHEET',
    'game.cs.close':        '✕ CLOSE',
    'game.cs.identity':     'IDENTITY',
    'game.cs.equipment':    'EQUIPMENT',
    'game.cs.status':       'STATUS',
    'game.cs.attributes':   'ATTRIBUTES',
    'game.cs.classSkills':  'CLASS & SKILLS',
    'game.cs.activeEffects':'ACTIVE EFFECTS',
    'game.cs.achievements': 'ACHIEVEMENTS',
    'game.cs.chronicles':   '✦ CHRONICLES OF FATE',
    'game.cs.quests':       '✦ LOCAL CONTRACTS',
    'game.cs.empty':        '— empty —',
    'game.cs.noEffects':    'No active effects.',
    'game.cs.noChronicles': 'No chronicles recorded yet.',
    'game.cs.noQuests':     'No active or completed contracts yet.',
    'game.cs.noSkills':     'No skills learned yet.',
    'game.cs.noTrades':     'No trades registered yet.',

    // ── Death overlay ────────────────────────────────────────────────
    'game.death.title':    'YOU DIED',
    'game.death.default':  'Fate refused your existence.',
    'game.death.byKiller': 'Slain by %s. Fate does not forgive the weak.',
    'game.death.return':   'RETURN TO THE REALM',

    // ── Action panel ─────────────────────────────────────────────────
    'game.action.idle':      'Active exploration. No contextual action available.',
    'game.action.noActions': 'No activities on current tile. Explore shores, mountains, dungeons and fertile soil.',
    'game.action.noDetail':  'No additional details.',

    // ── HUD ──────────────────────────────────────────────────────────
    'game.hud.noInterlocutor': 'No active interlocutor',
    'game.hud.talkingWith':    'Talking to %s',
    'game.hud.noEffects':      'No effects',
    'hud.adventure':           'Adventurer',
    'hud.day':                 'Day',
    'hud.year':                'Year',

    // ── NPC ──────────────────────────────────────────────────────────
    'game.npc.noHistory':     'No history recorded',
    'game.npc.noMemory':      'No strong memory between you yet.',
    'game.npc.commerce':      'TRADE',
    'game.npc.quests':        'LOCAL QUESTS',
    'game.npc.acceptQuest':   'Accept quest',
    'game.npc.turnIn':        'Turn in now',
    'game.npc.questDone':     'Contract concluded',
    'game.npc.questOngoing':  'Collection ongoing',
    'game.npc.favor':         'Favor concluded.',
    'game.npc.affinity':      'Affinity',
    'game.npc.conversations': 'conversations',
    'game.npc.talksAbout':    'talks about',
    'game.npc.buyItem':       'Buy %s',
    'game.npc.basePrice':     'base',

    // ── Chat messages ────────────────────────────────────────────────
    'game.chat.nightFalls':    '☾ Night covers the world. More creatures lurk in the shadows.',
    'game.chat.dawn':          '✦ Dawn arrives. The creatures of the night retreat.',
    'game.chat.loot':          '✦ Loot: %s  (+%s EXP, +%s gold)',
    'game.chat.killed':        '☠ %s was slain.',
    'game.chat.levelUp':       '⬆ Level %s! HP: %s/%s',
    'game.chat.skillUnlock':   '⬡ Skill learned: %s',
    'game.chat.statusApplied': '✦ %s applied.',
    'game.chat.statusExpired': '✦ %s ended.',
    'game.chat.statusDamage':  '☠ %s deals %s damage.',
    'game.chat.noStamina':     '⚡ No stamina — wait for recovery.',
    'game.chat.floatExhausted':'EXHAUSTED!',
    'game.chat.adminAction':   '☬ Admin: %s %s.',

    // ── Quest state ──────────────────────────────────────────────────
    'game.quest.readyToTurnIn': 'Ready to turn in',
    'game.quest.accepted':      'In progress',
    'game.quest.completed':     'Completed',
    'game.quest.available':     'Available',
    'game.quest.progress':      'Progress',
    'game.quest.reward':        'Reward',
    'game.quest.npcFallback':   'Local contact',
    'game.quest.asked':         'requested',
    'game.quest.gold':          'gold',
    'game.quest.bonus':         '+ %s× %s',

    // ── Attributes ───────────────────────────────────────────────────
    'game.attr.level':    'LEVEL',
    'game.attr.exp':      'EXP',
    'game.attr.atk':      'ATK',
    'game.attr.def':      'DEF',
    'game.attr.spd':      'SPD',
    'game.attr.stamina':  'STAMINA',
    'game.attr.gold':     'GOLD',
    'game.attr.kills':    'KILLS',
    'game.attr.daysAlive':'DAYS ALIVE',

    // ── Character reveal ─────────────────────────────────────────────
    'game.reveal.name':       'NAME',
    'game.reveal.origin':     'ORIGIN',
    'game.reveal.profession': 'PROFESSION',
    'game.reveal.traits':     'TRAITS',
    'game.reveal.hp':         'HP',
    'game.reveal.atkDef':     'ATK / DEF',
    'game.reveal.destiny':    'DESTINY',

    // ── Biomes ───────────────────────────────────────────────────────
    'biome.forest':   'Forest',
    'biome.desert':   'Desert',
    'biome.mountain': 'Mountain',
    'biome.city':     'City',
    'biome.water':    'Waters',
    'biome.plains':   'Plains',
    'biome.anomaly':  'Anomaly',

    // ── Genders ──────────────────────────────────────────────────────
    'gender.M': 'Male',
    'gender.F': 'Female',
    'gender.N': 'Neutral',

    // ── Equipment slots ──────────────────────────────────────────────
    'slot.weapon': 'Weapon',
    'slot.armor':  'Armor',
    'slot.helmet': 'Helmet',
    'slot.boots':  'Boots',
    'slot.ring':   'Ring',

    // ── Achievements ─────────────────────────────────────────────────
    'ach.born':               'Born of Fate',
    'ach.born.desc':          'Created a character',
    'ach.firstStep':          'First Step',
    'ach.firstStep.desc':     'Entered the world',
    'ach.firstBlood':         'First Blood',
    'ach.firstBlood.desc':    'Slew 1 enemy',
    'ach.hunter':             'Hunter',
    'ach.hunter.desc':        'Slew 5 enemies',
    'ach.reaper':             'Reaper',
    'ach.reaper.desc':        'Slew 20 enemies',
    'ach.exterminator':       'Exterminator',
    'ach.exterminator.desc':  'Slew 100 enemies',
    'ach.survivor':           'Survivor',
    'ach.survivor.desc':      'Survived 1 real day',
    'ach.veteran':            'Veteran',
    'ach.veteran.desc':       'Survived 7 days',

    // ── Char sheet misc ──────────────────────────────────────────────
    'cs.discipline': 'DISCIPLINES',
    'cs.class':      'CLASS',
    'cs.level':      'Lv',

    // ── Chat input ───────────────────────────────────────────────────
    'game.chat.placeholder': 'T to focus chat…',
  },
};

// ─── Core API ────────────────────────────────────────────────────────────
let _currentLang = localStorage.getItem('aet_lang') || 'pt';
if (!TRANSLATIONS[_currentLang]) _currentLang = 'pt';

/** Returns the translated string for key, substituting %s with extra args. */
function t(key, ...args) {
  const dict = TRANSLATIONS[_currentLang] || TRANSLATIONS['pt'];
  let s = dict[key] ?? TRANSLATIONS['pt'][key] ?? key;
  args.forEach(arg => { s = s.replace('%s', String(arg ?? '')); });
  return s;
}

/** Returns the translated biome label. Falls back to raw biome string. */
function tBiome(biome) {
  return t(`biome.${biome}`) || biome;
}

/** Changes language, stores in localStorage, re-applies to current DOM. */
function setLang(lang) {
  if (!TRANSLATIONS[lang]) return;
  _currentLang = lang;
  localStorage.setItem('aet_lang', lang);
  applyI18n();
  // Update page title if a key is set
  const titleKey = document.documentElement.dataset.i18nTitle;
  if (titleKey) document.title = t(titleKey);
  // Update lang toggle button label
  document.querySelectorAll('.lang-toggle').forEach(btn => {
    btn.textContent = lang === 'pt' ? 'EN' : 'PT';
    btn.title       = lang === 'pt' ? 'Switch to English' : 'Mudar para Português';
  });
}

/** Updates all [data-i18n] and [data-i18n-placeholder] elements. */
function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (key) el.textContent = t(key);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.dataset.i18nPlaceholder;
    if (key) el.placeholder = t(key);
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.dataset.i18nTitle;
    if (key) el.title = t(key);
  });
}

/** Returns current language code ('pt' or 'en'). */
function getLang() { return _currentLang; }

/** Injects a fixed language-toggle button into the body. */
function injectLangToggle(style) {
  const btn = document.createElement('button');
  btn.className = 'lang-toggle';
  btn.textContent = _currentLang === 'pt' ? 'EN' : 'PT';
  btn.title = _currentLang === 'pt' ? 'Switch to English' : 'Mudar para Português';
  if (style) Object.assign(btn.style, style);
  btn.addEventListener('click', () => setLang(_currentLang === 'pt' ? 'en' : 'pt'));
  document.body.appendChild(btn);
  return btn;
}

// ─── Expose globals ───────────────────────────────────────────────────────
window.t           = t;
window.tBiome      = tBiome;
window.getLang     = getLang;
window.setLang     = setLang;
window.applyI18n   = applyI18n;
window.injectLangToggle = injectLangToggle;
