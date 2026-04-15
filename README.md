# Aeterra: World Breaker

> *"Um mundo que nasce ao ser descoberto. Uma historia que nunca termina. Uma vida que importa."*

MMORPG hardcore procedural com narrativa intergeracional, mortes permanentes e mundo em evolucao continua.

A proposta do Aeterra e combinar:

- Mundo procedural em larga escala, com seed deterministica
- Progressao de personagem com risco real (permadeath + cooldown)
- NPCs com memoria e dialogo contextual
- Backend simples e direto em Node.js puro, sem framework de build

Se voce curte game systems, backend de jogos, simulacao procedural, narrativa emergente ou quer aprender contribuindo, este projeto e para voce.

## Estado do projeto

**Alpha aberto** - o loop central e jogavel. Exploracao, combate, progressao, interacao com NPCs e administracao basica funcionam. Esperamos feedback e contribuicoes.

## Features atuais

### Conta, sessao e personagem

- Registro e login com JWT + bcrypt
- Criacao de personagem com nome, sobrenome, genero, bioma natal, profissao e tracos
- Persistencia completa de personagem em SQLite
- Ficha de personagem com cronicas, equipamentos, skills, efeitos e contratos locais
- Morte permanente com cooldown real de 24h
- Bypass de respawn apenas para ambiente de desenvolvimento

### Mundo procedural e exploracao

- Geracao procedural de mapas por coordenada e seed
- Biomas jogaveis: forest, desert, mountain, city, water, plains e anomaly
- Mudanca de mapa por borda com sincronizacao em tempo real
- Visitacao registrada por mapa, com bonus para primeiro explorador
- Monumentos e lore procedural por mapa
- Minimap, mapa mundial descoberto e contexto de interacao por tile

### Combate, loot e inventario

- Combate em tempo real via WebSocket
- Monstros por bioma com respawn automatico
- Loot de monstros e baus com sincronizacao imediata de ouro e inventario
- Inventario com pilhas, limite de slots e aviso quando nao cabe tudo
- Equipamentos por slot: weapon, armor, helmet, boots e ring
- Progressao por nivel, EXP, atributos derivados e stamina

### Progressao de build

- Classe derivada por uso, disciplina e equipamento em vez de classe fixa inicial
- Disciplinas: martial, survival, arcane, guile, faith e civic
- Skills passivas desbloqueadas por limiares de experiencia de disciplina
- Efeitos positivos e negativos com duracao, modificadores e dano periodico
- HUD com HP, MP, stamina, ouro, atributos e status ativos

### Oficios e acoes contextuais

- Pesca em margens e areas aquaticas
- Mineracao em montanha, dungeon e leito de rio
- Agricultura com abertura de clareira, plantio e colheita
- Progressao separada para fishing, mining e farming

### NPCs, memoria social e servicos

- NPCs procedurais em cidades e outros biomas com nome, profissao, distrito, personalidade e papel social
- Mobs urbanos neutros por padrao em zonas de cidade
- Dialogo contextual por NPC com memoria por personagem
- Afinidade, familiaridade, resumo de memoria e fatos lembrados em reencontros
- Cache de respostas por NPC para reduzir custo e latencia
- Integracao opcional com OpenAI/OpenRouter para respostas livres
- Comercio local com desconto por afinidade
- Missoes locais persistentes por NPC, com aceite, progresso e entrega
- Rede social de NPCs exibida na ficha do personagem

### Ferramentas de operacao

- Endpoints administrativos para GM
- Audit log para operacoes administrativas
- Endpoint dev para unstuck de personagem
- Smoke test automatizado para fluxo principal do mundo

## Stack tecnica

- Runtime: Node.js 20+
- HTTP: Express 4
- Realtime: ws (WebSocket)
- Banco: SQLite via better-sqlite3
- Auth: jsonwebtoken + bcryptjs
- Frontend: HTML/CSS/JS vanilla em public/
- NPC AI: OpenAI/OpenRouter (opcional via variaveis de ambiente)

## Estrutura do repositorio

```
server.js              # Entry point do servidor (Express + WS)
server/
  db.js                # Schema/migrations SQLite
  gameWorld.js         # Loop do mundo e entidades em runtime
  gameSystems.js       # Itens, status effects, inventario, progressao
  combat.js            # Formulas de combate e XP
  worldGen.js          # Geracao procedural de mapas
  npcAI.js             # Dialogo e memoria de NPC
public/
  login.html           # Tela de login/registro
  game.html            # Cliente principal
scripts/
  smoke-world.js       # Smoke test de fluxo do mundo
AETERNITAS_CONCEPT.md  # Documento de visao completa do jogo
```

## Requisitos

- Git 2.40+
- Node.js 20+ (recomendado Node 22 LTS)
- npm 10+

## Rodando localmente

### 1) Clonar o repositorio

```bash
git clone https://github.com/italogf/aeterra.git
cd aeterra
```

### 2) Instalar dependencias

```bash
npm install
```

### 3) Configurar variaveis de ambiente

```bash
cp .env.example .env
# edite .env com seu JWT_SECRET
```

Exemplo minimo para dev local:

```
PORT=3011
JWT_SECRET=troque_por_um_segredo_forte
NODE_ENV=development
ALLOW_DEV_RESPAWN=1
MIN_GROWTH_MS=1000
```

Variaveis opcionais para IA de NPC (sem elas o projeto roda normalmente):

```
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini

OPENROUTER_API_KEY=
OPENROUTER_MODEL=google/gemma-4-31b-it:free
```

### 4) Iniciar servidor

```bash
npm start
# ou modo watch:
npm run dev
```

### 5) Abrir no navegador

- Login: http://localhost:3011/
- Conceito: http://localhost:3011/concept

## Smoke test

Com o servidor rodando em outro terminal:

```bash
npm run smoke:world
```

## Problemas comuns

**Servidor fecha com exit code 1**
- Confirme versao do Node (`node --version`)
- Rode `npm install`
- Defina `JWT_SECRET` no `.env`

**Porta em uso** — troque `PORT` no `.env`

**Banco SQLite bloqueado** — feche processos antigos do servidor

## Roadmap

### Fase 1 - Base jogavel estavel
- [ ] Consolidar fluxo completo conta -> personagem -> gameplay sem friccao
- [ ] Melhorar robustez de reconexao WebSocket
- [ ] Cobertura minima de smoke tests para rotas criticas

### Fase 2 - Profundidade de sistemas
- [ ] Expandir disciplinas e balancear combate
- [ ] Evoluir sistema de itens, raridades e crafting

### Fase 3 - Mundo vivo
- [ ] Assentamentos dinamicos e economia local
- [ ] Eventos de mapa e ciclos de risco/recompensa
- [ ] NPCs com memoria mais persistente entre geracoes

### Fase 4 - Escala e comunidade
- [ ] Telemetria e observabilidade basica de runtime
- [ ] Segunda release versionada

## Como contribuir

1. Faca fork do repositorio
2. Crie uma branch (`feature/nome-curto`)
3. Implemente e teste localmente
4. Abra PR explicando contexto, mudancas e como validar

Sugestoes de onde comecar:
- Issues marcadas como `good first issue`
- Melhorias de documentacao
- Smoke tests adicionais

## Codigo de conduta

- Respeito acima de tudo
- Feedback tecnico, objetivo e construtivo
- Zero tolerancia para assedio/discriminacao

## Licenca

MIT - veja [LICENSE](LICENSE).

## Referencias

- Visao completa do jogo: [AETERNITAS_CONCEPT.md](AETERNITAS_CONCEPT.md)
- Pagina de conceito no servidor: `/concept`

---

Se voce leu ate aqui e curtiu a ideia, abra uma issue e venha construir o Aeterra com a gente.
