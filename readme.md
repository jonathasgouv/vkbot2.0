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
| `!wiki` | `!w` | `-m` `[termo]` | Pesquisa e exibe o resumo e link de um artigo na Wikipédia em português. |

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
