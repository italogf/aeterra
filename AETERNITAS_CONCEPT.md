# Aeterra: World Breaker — Documento de Conceito

> *"Um mundo que nasce ao ser descoberto. Uma história que nunca termina. Uma vida que importa."*

---

## 1. Visão Geral

**Aeterra: World Breaker** é um MMORPG hardcore procedural com narrativa intergeracional. O jogo não tem um mundo pré-construído: cada região do mapa só existe depois que um jogador a descobre. Decisões têm consequências permanentes. Mortes são reais. Famílias são compartilhadas entre jogadores. O mundo é literalmente construído pelos seus habitantes.

A estética e intensidade narrativa são inspiradas em manhwas de fantasia (Solo Leveling, Omniscient Reader) — cada personagem tem peso, cada morte tem consequência, cada geração herda o que a anterior construiu ou destruiu.

---

## 2. O Mundo — Escala e Estrutura

### 2.1 O Mapa-Mundo (Macro)

O mapa-mundo é uma **matriz quadrada de 31.623 × 31.623 células** — totalizando **~1 bilhão de células**. Cada célula representa um **mapa de terreno completo e autônomo**.

```
Mundo = 31.623 × 31.623 = 1.000.014.129 células (~1 bilhão de mapas)
```

Com 200 milhões de jogadores explorando constantemente, levaria um tempo considerável para o mundo inteiro ser mapeado — garantindo que sempre haja novos horizontes a descobrir.

### 2.2 Tipos de Terreno (Biomas)

Cada célula do mapa-mundo pertence a um dos 7 biomas:

| Bioma      | Símbolo | Cor         | Descrição                                              |
|------------|---------|-------------|--------------------------------------------------------|
| Floresta   | 🌲      | Verde escuro | Densa vegetação, criaturas antigas, segredos druídicos |
| Deserto    | 🏜️      | Areia        | Calor mortal, ruínas enterradas, civilizações extintas |
| Montanha   | ⛏️      | Cinza pedra  | Minerais raros, anões, tempestades e abismos           |
| Cidade     | 🏛️      | Ouro/pedra   | Centros de civilização, política, mercado, guildas     |
| Água       | 🌊      | Azul profundo| Rios, lagos, oceanos — passagens e perigos aquáticos   |
| Planície   | 🌾      | Verde claro  | Campos férteis, nômades, batalhas campais              |
| Outro      | ✦       | Roxo/cinza   | Terras corrompidas, dimensões fraturadas, biomas raros |

### 2.3 Sistema de Afinidade de Terreno

Os biomas **não aparecem aleatoriamente**: cada célula tem maior probabilidade de ser gerada com base nos biomas vizinhos. Isso cria regiões naturais e contínuas, como um mundo real.

**Tabela de Afinidade:**

```
Floresta   → alta chance de gerar Floresta, Planície, Montanha vizinhas
Deserto    → alta chance de gerar Deserto, Planície, Outro
Montanha   → gera Montanha, Floresta, Nevasca (Outro)
Cidade     → gera Planície e Água próximas (cidades surgem perto de recursos)
Água       → alta chance de gerar Água contígua (rios e oceanos)
Planície   → bioma mais neutro, afinidade média com todos
Outro      → raramente gera contíguo — surge como ilhas de anomalia
```

A geração usa **Wave Function Collapse** adaptado com pesos de afinidade, garantindo que o mundo pareça orgânico e não aleatório em excesso.

---

## 3. O Mapa de Terreno (Micro)

Quando um jogador **descobre uma célula do mapa-mundo**, o servidor gera o **mapa interno daquele terreno** — um mapa explorável detalhado com células menores.

Cada mapa de terreno tem dimensão padrão de **128 × 128 tiles** (podendo escalar até 256×256 em biomas especiais) e contém:

### 3.1 Conteúdo Gerado por Bioma

**Floresta:**
- Trilhas secretas e clareiras
- Acampamentos de criaturas (variando por nível do mundo)
- 1-3 Dungeons escondidas (cavernas, ruínas cobertas por vegetação)
- NPCs: ervanários, caçadores, druidas, foragidos
- Recursos: madeira rara, ervas medicinais, minérios vegetais
- Eventos: caçadas, rituais antigos, espíritos da floresta

**Deserto:**
- Dunas mutáveis (partes do mapa se reorganizam com o tempo)
- Ruínas de civilizações antigas semienterradas
- Oásis — pontos de civilização temporária
- 1-2 Dungeons: tumbas, labirintos ancestrais
- NPCs: nômades, mercadores de rotas desertas, cultistas
- Recursos: cristais de luz, areia de tempo, relíquias

**Montanha:**
- Picos intransponíveis que delimitam regiões
- Minas naturais com minerais raros
- 2-4 Dungeons: minas abandonadas, fortalezas antigas, covis de dragões
- NPCs: mineradores, eremitas, tribos de gigantes
- Recursos: metais raros, crystals de poder, gemas

**Cidade:**
- Layout urbano procedural: ruas, bairros, praças, mercados
- Facções internas com política própria
- Missões de intrigue, comércio e poder
- Dungeons urbanas: esgotos, catacumbas, prisões secretas
- NPCs com memória: comerciantes, guardas, nobres, criminosos
- Eventos: eleições, golpes, festivais, conflitos de guilda

**Água:**
- Rios navegáveis com corredeiras e quedas
- Lagos profundos com segredos no fundo
- Portos e cidades flutuantes próximas
- 1-2 Dungeons aquáticas: templos afundados, cavernas subaquáticas
- NPCs: pescadores, piratas, sereias, criaturas abissais
- Recursos: peixes raros, minerais aquáticos, artefatos náufragos

**Planície:**
- Vastos campos com visibilidade alta (estratégico em guerras)
- Aldeias nômades que se movem entre visitas
- Batalhas campais entre civilizações vizinhas
- 1 Dungeon: grutas, templos enterrados, cemitérios antigos
- NPCs: fazendeiros, cavaleiros errantes, tribos guerreiras
- Recursos: grãos raros, cavalos, componentes alquímicos

**Outro (Terras Anômalas):**
- Leis físicas alteradas: gravidade invertida, tempo acelerado
- Criaturas únicas não encontradas em outros biomas
- Dungeons de alto risco com recompensas únicas no jogo
- NPCs místicos: entidades, ecos de civilizações extintas
- Recursos: materiais só encontrados aqui, fragmentos de poder

### 3.2 Dungeons

Dungeons são subzonas geradas dentro de mapas de terreno. Cada dungeon tem:

- **Tipo** determinado pelo bioma pai
- **Nível de perigo** determinado pela distância do ponto de spawn original
- **Layout procedural** com salas, corredores, armadilhas
- **Chefe** único com nome, história e loot gerado proceduralmente
- **Segredos** (0-3): passagens ocultas, tesouros enterrados, lore da crônica
- **Reset parcial**: monstros respawnam mas layout e segredos permanecem

---

## 4. Sistema de Personagem

### 4.1 Nascimento Procedural

Ao criar uma personagem, o sistema gera:

```
Personagem = {
  nome:          gerado por cultura do bioma de nascimento
  bioma_natal:   célula aleatória em qualquer parte do mundo descoberto
  profissão:     influenciada pelo bioma (montanha → minerador/guardian)
  traços:        3-5 traços de personalidade
  aparência:     determinada pela cultura local
  língua_natal:  gerada pela civilização do mapa natal
  árvore_gen:    parcialmente preenchida (2-6 slots abertos)
  memórias:      3-5 eventos de background coerentes com o bioma natal
  motivação:     objetivo inicial que guia a narrativa pessoal
}
```

### 4.2 Influência do Bioma Natal

O bioma onde a personagem nasce **define profundamente suas características base**:

| Bioma     | Traços Prováveis              | Profissões               | Bônus de Atributo     |
|-----------|-------------------------------|--------------------------|------------------------|
| Floresta  | Cauteloso, Ágil, Solitário    | Caçador, Druida, Arqueiro| +Percepção, +Agilidade |
| Deserto   | Resistente, Astuto, Silencioso| Nômade, Alquimista, Ladino| +Resistência, +Sorte  |
| Montanha  | Teimoso, Forte, Honrado       | Mineiro, Ferreiro, Guardião| +Força, +Defesa      |
| Cidade    | Político, Carismático, Ambicioso| Nobre, Mercador, Escriba| +Carisma, +Inteligência|
| Água      | Adaptável, Livre, Misterioso  | Marinheiro, Pescador, Pirata| +Natação, +Adaptação |
| Planície  | Corajoso, Leal, Honesto       | Cavaleiro, Fazendeiro, Bardo| +Resistência, +Liderança|
| Outro     | Raro, Imprevisível, Poderoso  | Qualquer — mas modificado| +1 atributo aleatório alto|

### 4.3 Pool Familiar Global

A árvore genealógica de cada personagem tem **slots abertos** — membros da família não preenchidos por jogadores. Esses slots entram num **grafo relacional global**.

Quando um novo jogador cria uma personagem, o sistema verifica:

1. **Compatibilidade de idade** (irmão mais novo, primo da mesma geração etc.)
2. **Proximidade geográfica** (biomas próximos no mapa-mundo)
3. **Coerência cultural** (mesma civilização ou civilizações em contato)
4. **Tipo de slot** (um "irmão desaparecido" pede alguém errante, não um nobre sedentário)
5. **Motivação narrativa** (a conexão deve criar tensão ou interesse dramático)

Se houver match com score alto, o sistema propõe:
> *"Você pode ser o irmão perdido de Aldric. Aceitar esta origem?"*

Slots não preenchidos por jogadores são temporariamente ocupados por **NPCs dinâmicos** que agem no mundo até um jogador assumir o slot.

---

## 5. Hardcore e Legado

### 5.1 Morte Permanente

Quando uma personagem morre:

1. O personagem morto é **imediatamente inserido na Crônica do Mundo**
2. Se tiver reputação significativa → vira **NPC lendário ou espectro**
3. Se for pai/mãe de alguém → vira **ancestral referenciado** nas memórias dos filhos
4. O slot de jogador fica vazio → NPC temporário assume enquanto ninguém o reclama

### 5.2 Sistema de Herança

O jogador pode criar uma nova personagem que:
- É **filho/filha** da personagem morta → herda traços, reputação (boa ou má) e parte do inventário
- É **irmão/primo** da morta → herda missões abertas e relações familiares
- Começa **completamente novo** → mas o sistema ainda pode conectá-lo à teia de outros jogadores

**Cooldown de criação:** 24 horas reais após a morte antes de criar nova personagem — isso incentiva cuidado e adiciona peso emocional à perda.

### 5.3 O Peso Narrativo

A morte não é punição — é transformação:
- Personagens mortos viram parte da **história permanente** do mapa onde morreram
- Outros jogadores encontram misturas de lore com nomes reais de jogadores mortos
- Memorial ruins podem ser construídos por aliados
- A Crônica registra causas de morte, aliados presentes, inimigos vencedores

---

## 6. A Crônica do Mundo

A Crônica é o **livro de história permanente e coletivo** do mundo. É implementada como event sourcing — cada ação significativa é um evento imutável.

Eventos registrados:
- Primeira exploração de cada célula do mapa
- Fundação e destruição de cidades
- Mortes de personagens jogadores
- Guerras entre nações/guildas
- Conclusão de dungeons únicas (primeiro a limpar)
- Criação de novos laços familiares entre jogadores
- Descobertas de segredos e artefatos únicos

A Crônica é **acessível in-game** como pergaminhos, bardos que cantam histórias, monumentos e rumores de NPCs.

---

## 7. Civilizações Procedurais

Cada cidade gerada no mapa pertence a uma civilização. Civilizações são geradas com:

- **Nome e língua próprios** (gerados por LLM com parâmetros culturais)
- **Sistema de governo** (monarquia, república de guildas, teocracia etc.)
- **Relações com vizinhos** (aliança, neutralidade, guerra fria, conflito aberto)
- **História de 3-5 eventos passados** que moldam a política atual
- **Missões dinâmicas** refletindo o estado político atual
- **Evolução ao longo do tempo**: civilizações crescem, decaem, conquistam e são conquistadas

---

## 8. Arquitetura Técnica (Visão)

| Sistema                     | Tecnologia Sugerida                        |
|-----------------------------|--------------------------------------------|
| Mapa-mundo persistente      | Sharded DB espacial (PostGIS / DynamoDB)   |
| Geração de terreno          | Wave Function Collapse + pesos de afinidade|
| Geração de civilizações     | LLM com templates paramétricos             |
| Pool familiar               | Grafo relacional (Neo4j ou similar)        |
| Crônica permanente          | Event sourcing (Kafka + storage imutável)  |
| Dungeons procedurais        | Algoritmo BSP / Drunkard Walk              |
| Estado de personagem        | Event sourcing com flag de morte permanente|
| NPCs com memória            | State machine + banco de memórias por NPC  |
| Geração de missões          | Template + LLM contextual                  |

---

## 9. Escala e Exploração

```
Mundo:        31.623 × 31.623 = ~1 bilhão de células
Cada célula:  1 mapa completo de 128×128 tiles
Dungeons:     média de 2 por mapa = ~2 bilhões de dungeons únicas
NPCs únicos:  potencialmente dezenas por mapa = trilhões de entidades
```

Com 200 milhões de jogadores ativos explorando um mapa por dia cada:

```
200.000.000 mapas/dia → 5.000 dias para explorar tudo (~13,7 anos)
```

E como novos slots familiares, guerras e eventos continuamente transformam regiões já exploradas, o mundo **nunca fica "completo"** na prática.

---

## 10. Filosofia de Design

> **O jogo não é sobre stats ou levels. É sobre viver uma vida que importa em um mundo que lembra.**

Três princípios inegociáveis:

1. **Cada ação tem consequências permanentes** — nada é reversível, nada é descartável
2. **O mundo é maior do que qualquer jogador pode ver** — sempre há mais além do horizonte
3. **Cada personagem é única e irrepetível** — quando morre, o mundo muda para sempre

---

## 11. Estado Atual do Protótipo (Abril 2026)

As mecânicas abaixo já estão previstas como base funcional do protótipo atual e passam a fazer parte da documentação viva do jogo.

### 11.1 Loot, Ouro e Inventário

- Loot de monstros e baús deve entrar imediatamente no inventário quando houver espaço.
- Ouro recebido em combate ou em baús precisa sincronizar no mesmo tick com a HUD e com a ficha do personagem.
- Itens empilháveis devem consolidar pilhas automaticamente para reduzir perda por limitação de slots.
- Quando o inventário estiver cheio, o sistema deve informar explicitamente quais drops não puderam ser guardados.

### 11.2 Classe Derivada por Uso e Equipamento

- A classe da personagem não é fixa no nascimento: ela emerge do equipamento usado e do aprendizado acumulado.
- O sistema rastreia disciplinas como `martial`, `survival`, `arcane`, `guile`, `faith` e `civic`.
- Equipamentos, tags de itens e experiência de disciplina definem a classe derivada atual.
- Exemplos de classes emergentes do protótipo:
  - Guardião de Aço
  - Batedor do Ermo
  - Arcanista de Ruína
  - Ladino de Fronteira
  - Juramentado
  - Mediador de Guilda

### 11.3 Sistema de Skills

- Skills são desbloqueadas por aprendizado contínuo dentro de cada disciplina, e não por árvore rígida de classe inicial.
- Armas, anéis, focos, armaduras e ações de exploração alimentam a progressão de disciplina.
- Cada skill concede passivos permanentes enquanto estiver aprendida, alterando atributos e reforçando a identidade da build.
- O protótipo atual já prevê unlocks por limiar de experiência de disciplina, com envio imediato ao cliente quando uma skill é aprendida.

### 11.4 Status Positivos e Negativos

- O personagem pode sofrer efeitos positivos e negativos ao mesmo tempo.
- Efeitos positivos previstos: bênção, foco e guarda arcana.
- Efeitos negativos previstos: veneno, sangramento, fraqueza e lentidão.
- Efeitos negativos podem causar dano periódico, reduzir atributos e bloquear regeneração natural.
- A HUD deve exibir os efeitos ativos com distinção visual clara entre buffs e debuffs.

### 11.5 Morte Permanente e Respawn de Teste

- Em jogo normal, a morte continua permanente e aciona cooldown real de 24 horas para novo personagem.
- Para ambiente de desenvolvimento e testes locais, deve existir um bypass controlado para limpar o cooldown sem alterar a regra hardcore de produção.
- A morte continua sendo registrada na Crônica do Mundo e no estado da conta, mesmo quando o bypass de desenvolvimento estiver habilitado.

### 11.6 Cidades, Mobs e População Viva

- Cidades não devem parecer zonas vazias: precisam gerar NPCs civis de forma procedural.
- Mobs urbanos não devem agir como hostis por padrão; o comportamento esperado na cidade é neutro.
- Guardas, corvos e cães urbanos podem existir como entidades do mapa, mas sem agressão automática ao jogador em condições normais.
- NPCs civis precisam surgir com nomes, sobrenomes, profissão, distrito, personalidade, função social e pequeno histórico local.

### 11.7 NPCs com Contexto e Conversa Assistida por LLM

- NPCs devem responder de forma coerente com sua profissão, bairro, personalidade e papel no mundo.
- Cada NPC gerado precisa carregar contexto mínimo persistente para conversa:
  - nome e sobrenome
  - profissão
  - personalidade
  - distrito ou área da cidade
  - papel familiar ou social
  - assunto principal sobre o qual costuma falar
- O sistema usa respostas padrão para intenções comuns, reduzindo custo e latência.
- Quando houver pergunta mais livre do jogador, o NPC pode escalar para um modelo simples, como uma variante mini da OpenAI.
- O NPC nunca deve responder fora do personagem nem agir como assistente global do sistema.
- Conversas frequentes com o mesmo personagem devem elevar afinidade e familiaridade.
- Quando a afinidade crescer, o NPC precisa lembrar o personagem explicitamente em reencontros futuros.
- A memória curta do NPC deve guardar pelo menos:
  - quantidade de conversas já tidas com aquele personagem
  - último assunto marcante
  - resumo curto do vínculo formado
  - fatos recentes relevantes para orientar a próxima resposta

### 11.8 Cache de Diálogo

- Respostas comuns precisam ser cacheadas por NPC e por intenção/pergunta normalizada.
- O cache existe para reduzir consumo do modelo e manter respostas consistentes em conversas repetidas.
- O fluxo ideal é:
  1. tentar template local para intenções frequentes
  2. procurar resposta cacheada
  3. consultar o modelo apenas quando necessário
  4. salvar a resposta gerada no cache

### 11.9 Observações de Implementação

- O protótipo atual mantém essas mecânicas distribuídas entre servidor em tempo real, persistência SQLite e cliente HTML5/WebSocket.
- O documento deve continuar sendo atualizado conforme novas camadas forem adicionadas, especialmente herança, comércio, facções, memória longa de NPC e missões dinâmicas.

---

*Documento vivo — sujeito a expansão conforme o conceito evolui.*
