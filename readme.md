# VKBot 2.0 🤖

O **VKBot 2.0** é um assistente inteligente em TypeScript e Node.js para a rede social **VKontakte (VK)**. Ele gerencia e automatiza interações em tópicos de discussão comunitários, oferecendo recursos como agendamento de lembretes, pesquisas em banco de dados, placares de futebol em tempo real, sistema de apostas (bolão), consultas à Wikipédia e relatórios automáticos de engajamento semanal.

---

## 🚀 Funcionalidades principais

- **Integração com Callback API do VK**: Responde instantaneamente a novas mensagens nos fóruns do grupo.
- **Sistema de Bolão da Rodada**: Cria automaticamente tópicos de bolão para a Série A do Brasileirão, coleta palpites em tempo real por comentários e apura pontuações automaticamente via API da CBF.
- **Busca e Resumo da Wikipédia**: Permite realizar pesquisas no Wikipédia em português diretamente por comandos, com suporte a envio por mensagem privada.
- **Notificação Automática de Level Up**: Parabeniza e exibe barras de progresso ASCII nos tópicos quando membros passam de nível com base no engajamento (postagens).
- **Lembretes Dinâmicos**: Permite que membros agendem lembretes no formato `!remind <tempo>` diretamente no tópico.
- **Top Membros Semanal**: Um cron job que parabeniza e ranqueia automaticamente os membros que mais postaram.
- **Consulta de Futebol**: Integração direta com a API de calendário da **CBF** para retornar placares das séries A, B, C e D.
- **Busca em Banco de Dados**: Armazena tópicos no MongoDB e permite pesquisas via comando.

---

## 🛠️ Stack Tecnológica

* **Runtime**: [Node.js](https://nodejs.org/) (v18+)
* **Linguagem**: [TypeScript](https://www.typescriptlang.org/)
* **Servidor**: [Express](https://expressjs.com/)
* **Banco de Dados**: [MongoDB](https://www.mongodb.com/) via [Mongoose](https://mongoosejs.com/)
* **Agendamento**: [node-cron](https://github.com/node-cron/node-cron)
* **Integração HTTP**: [Axios](https://axios-http.com/)
* **Build**: [Babel](https://babeljs.io/)
* **Deploy/Container**: [Docker](https://www.docker.com/) & [Fly.io](https://fly.io/)

---

## 📂 Estrutura do Projeto

O código do projeto está estruturado em módulos claros e desacoplados dentro da pasta `src/`:

```text
├── src/
│   ├── api/          # Chamadas a APIs externas (VK, CBF e Wikipédia)
│   ├── config/       # Configuração de banco, axios e variáveis de ambiente
│   ├── controllers/  # Webhooks do Callback API (hookController intercepta posts comuns e de bolão)
│   ├── crons/        # Lógica das tarefas agendadas (reminders, weekly top, topic syncing, bolão)
│   ├── models/       # Schemas Mongoose (Member, Reminder, Topic, BolaoRound, Bet)
│   ├── routes/       # Definição das rotas HTTP do servidor Express
│   ├── types/        # Definições de tipo e interfaces do TypeScript
│   ├── utils/        # Lógica principal do bot (bot.ts) e helpers gerais
│   ├── app.ts        # Inicialização do Express e middlewares
│   ├── schedule.ts   # Configuração e inicialização das tarefas Cron
│   └── server.ts     # Ponto de entrada que inicia o servidor HTTP
```

---

## 💬 Comandos Disponíveis

Os comandos do bot devem ser digitados em tópicos de discussão do VK e iniciados com o caractere `!`.

| Comando | Atalho | Parâmetros | Descrição |
| :--- | :--- | :--- | :--- |
| `!citar` | `!c` | `-m` | Responde ao comentário marcando o autor. O parâmetro `-m` envia por mensagem direta (DM). |
| `!tag` | `!t` | `-m` `[texto]` | Responde ao autor com uma tag customizada. Aceita o parâmetro `-m` para DM. |
| `!like` | `!l` | - | Dá uma curtida (like) no comentário em que o comando foi digitado. |
| `!mensagem` | `!m` | - | Envia o título e link do tópico atual por DM. |
| `!jogos` | `!j` | `-[série]` `-m` | Retorna rodada atual do Brasileirão. Ex: `!jogos -b` (Série B). `-m` envia por DM. |
| `!remind` | `!r` | `-m` `[tempo]` | Agenda um lembrete (Ex: `!remind 30 minutos` ou `!remind 2 dias`). |
| `!save` | `!s` | `[link]` | Salva uma referência deste tópico dentro do tópico especificado no link. |
| `!pesquisar` | `!p` | `-c` `-t` `-m` `[termo]` | Busca tópicos salvos no MongoDB. `-c` (pesquisa conteúdo), `-t` (pesquisa título), `-m` (DM). |
| `!perfil` | `!pf` | `-m` | Exibe o nível (RPG), barra de progresso ASCII, medalhas e lembretes ativos do membro. |
| `!bolao` | `!b` | `-m` | Envia o link do tópico ativo do Bolão da Rodada atual. |
| `!ranking` | `!rk` | `-m` | Exibe o Top 10 de pontuadores acumulados do Bolão da comunidade. |
| `!rankingrpg` | `!rkpf` | `-m` | Exibe o Top 10 de Nível/Posts do RPG de postagens da comunidade. |
| `!wiki` | `!w` | `-m` `[termo]` | Pesquisa e exibe o resumo e link de um artigo na Wikipédia em português. |
| `!resumo` | `!rs` | `-m` | Gera um resumo de inteligência artificial (Gemini) das discussões do tópico atual (cooldown de 1h para membros comuns). |
| `!monitorar` | `!mon` | `-e` `-d` `[termo]` | Cadastra termo para receber notificação privada (DM) quando for citado. `-e` busca palavra exata, `-d` remove. |
| `!desmonitorar` | `!dmon` | `[termo]` | Cancela o monitoramento de uma palavra-chave específica. |
| `!monitorados` | `!mons` | - | Lista todas as palavras-chave ativas que o usuário monitora nesta comunidade. |

---

## 🎮 Sistema de RPG e Medalhas

O bot conta com um sistema de engajamento gamificado (RPG) integrado que acompanha a atividade dos membros nos tópicos da comunidade.

### 📈 Mecânica de Nível e XP
- **XP (Pontos de Experiência)**: Cada postagem válida registrada pelo bot concede **10 XP** ao usuário.
- **Progressão**: O limiar de postagens para subir de nível segue uma curva de progressão não linear piecewise:
  - **Até o Nível 10**: Cada nível exige `Nível * 10` posts (Ex: Nível 1➔2 precisa de 10 posts, alcançando o Nível 10 no marco de 450 posts).
  - **Nível 11 ao Nível 30**: Cada nível exige `100 + (Nível - 10) * 50` posts (Alcançando o Nível 30 no marco de 11.950 posts).
  - **Acima do Nível 30**: Cada nível exige `1100 + (Nível - 30) * 200` posts (Suporta progressão suave e escalonamento contínuo até mais de 100.000 posts).
- **Gráfico ASCII**: O comando `!perfil` renderiza uma barra de progresso ASCII dinâmica de 10 blocos (Ex: `[████░░░░░░] 40%`) demonstrando a porcentagem de conclusão para o próximo nível.
- **Notificação Automática**: Sempre que um usuário atinge os requisitos do próximo nível, o bot envia uma mensagem parabenizando o membro diretamente no fórum da comunidade com sua nova barra de progresso.

### 🏆 Medalhas e Conquistas
As medalhas e conquistas ganhas pelos membros são computadas automaticamente e listadas no comando `!perfil`. Elas se dividem em:

| Medalha | Requisito de Conquista |
| :--- | :--- |
| **🥉 Bronze** | Alcançar um total acumulado de **100 postagens**. |
| **🥈 Prata** | Alcançar um total acumulado de **500 postagens**. |
| **🥇 Ouro** | Alcançar um total acumulado de **2.000 postagens**. |
| **💎 Platina** | Alcançar um total acumulado de **5.000 postagens**. |
| **🏆 Lenda** | Alcançar um total acumulado de **10.000 postagens**. |
| **👑 Imperador** | Alcançar um total acumulado de **25.000 postagens**. |
| **🚀 Mestre do Cartola** | Alcançar um total acumulado de **50.000 postagens**. |
| **💫 Mítico** | Alcançar um total acumulado de **75.000 postagens**. |
| **🔱 Deus do Cartola** | Alcançar um total acumulado de **100.000 postagens**. |
| **⚡ Pé Quente** | Estar ativo na semana corrente (pelo menos 1 postagem registrada na semana atual). |
| **🛡️ Pioneiro** | Ter postagens ativas dentro das primeiras 10 semanas de vida útil do bot na comunidade. |
| **📅 Constante** | Estar ativo (pelo menos 1 postagem) em pelo menos **10 semanas diferentes**. |
| **🎖️ Veterano** | Estar ativo (pelo menos 1 postagem) em pelo menos **24 semanas diferentes**. |
| **🔥 Hiperativo** | Registrar **mais de 100 postagens** em uma única semana. |
| **👴 Old** | Estar ativo na base/comunidade há pelo menos **20 semanas**. |
| **👶 Modinha** | Estar ativo na base/comunidade há menos de **4 semanas**. |
| **🦉 Coruja** | Ter registrado ao menos uma postagem de madrugada (entre 00:00 e 05:59 BRT). |
| **🎯 Pé de Anjo** | Acertar ao menos um palpite exato de placar no Bolão (conquistando 5 pontos). |
| **👑 Rei do Bolão** | Estar empatado ou isolado na liderança do Ranking Geral do Bolão. |

---

## 🏆 Painel de Classificação Web
O bot dispõe de um painel web moderno com suporte a visualização de rankings em tempo real:
- **URL**: `/ranking` (Página Web com visualização lado a lado do Top 50 RPG e Top 50 Bolão).
- **Recursos**:
  - Estilo moderno Dark Mode Premium com Glassmorphism (vidro desfocado).
  - Fotos e avatares oficiais integrados com links aos perfis dos usuários no VK (`https://vk.com/id{userId}`).
  - Barras de progresso animadas e listagem dinâmica de conquistas e medalhas individuais.
  - **Filtro de Períodos**: Botões interativos em gradiente para alternar entre as classificações Geral, Semana, Mês ou Ano.
  - **Barra de Pesquisa de Membro**: Campo de busca com debounce (300ms) para pesquisar qualquer membro por nome ou ID e visualizar seu cartão com sua posição absoluta real (mesmo fora do Top 50).
  - **Resolução Otimizada**: Cache de perfis do VK em memória (`vkUserCache`) com TTL de 30 minutos e cache global da API (`rankingCache`) de 5 minutos por combinação de filtros.

---

## ⏰ Cron Jobs (Tarefas Agendadas)

O bot executa crons automáticos com base no fuso horário de `America/Sao_Paulo`:

1. **A cada minuto (`* * * * *`)**: Envia lembretes que já expiraram e os remove do banco de dados.
2. **A cada 10 minutos (`*/10 * * * *`)**: Sincroniza e salva os últimos 100 tópicos de cada grupo no banco de dados para alimentar a pesquisa.
3. **Aos sábados, às 17h (`0 17 * * SAT`)**: Gera e publica um tópico especial de discussões com a listagem dos 8 membros que mais postaram na semana.
4. **Diariamente, às 02h (`0 2 * * *`)**: Verifica se há uma nova rodada Série A ocorrendo e cria automaticamente o tópico do bolão.
5. **A cada hora (`0 * * * *`)**: Consulta a API de rodadas da CBF para processar palpites de jogos finalizados e atualizar o ranking.

---

## ⚙️ Instalação e Configuração

### Pré-requisitos
- Node.js (v18 ou superior)
- Yarn ou NPM
- Instância do MongoDB rodando (local ou na nuvem via Atlas)

### Configurando o ambiente
Copie o arquivo `.env.example` para `.env` e preencha as variáveis necessárias:

```bash
cp .env.example .env
```

```ini
ACCESS_TOKEN=              # Token do VK com permissões de leitura/escrita
ACCESS_TOKEN_MESSAGE=      # Token do VK com permissões de envio de mensagens
API_VERSION=5.131          # Versão da API do VK
SECRET=                    # Chave secreta para validação do Callback API
CONFIRMATION_KEY=          # Chave gerada pelo painel do VK para validar o webhook
MONGODBURL=                # String de conexão do MongoDB
INITIAL_DATE=2022-08-15    # Data inicial de referência para contagem das semanas de postagens
BANNED_IDS=[]              # Array com IDs de usuários que não podem usar o bot
BOT_ID=                    # ID numérico da conta do bot no VK
CHAMPIONSHIP_ID=1260611    # ID do campeonato na CBF (padrão Série A 2026: 1260611)
```

### Rodando o projeto localmente

1. Instale as dependências:
   ```bash
   yarn install
   ```

2. Execute o servidor de desenvolvimento:
   ```bash
   yarn dev
   ```

3. Para rodar em modo de produção:
   ```bash
   yarn build
   ```

   ```bash
   yarn start
   ```

4. Executar a suíte de testes (39 testes):
   ```bash
   yarn test
   ```

---

## 🐳 Docker e Deploy

O projeto inclui um `Dockerfile` e arquivo de configuração `fly.toml` pronto para deploy na nuvem.

Para rodar em container Docker localmente:

```bash
docker build -t vkbot2 .
docker run -p 8080:8080 --env-file .env vkbot2
```
