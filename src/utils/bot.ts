import vkApi from '@api/vk'
import cbfApi from '@api/cbf'
import Reminder from '@models/Reminder'
import ICommandsInput from '@types/bot'

export default {
  async getQuoteString (postId: number, userId: number): Promise<string> {
    const userData = await vkApi.users.get({ userIds: [userId] })
    const firstName = userData[0].first_name

    return `[post${postId}|${firstName}],`
  },

  async getGamesFormatted (serie?: string): Promise<string> {
    const games = await cbfApi.getGames()
    const gamesFiltered = games.filter(game => game.competicao === `Campeonato Brasileiro Série ${serie?.toUpperCase() || 'A'}`)

    const gamesFormatted = gamesFiltered
      .map(game => `${game.nm_mandante} ${game.mandante} x ${game.visitante} ${game.nm_visitante} - ${game.status} - ${game.data}`)
      .join('\n')

    return gamesFormatted
  },

  async getTopicTitle (cmmId: number, topicId: number): Promise<string> {
    const topics = await vkApi.board.getTopics({ groupId: cmmId, topicIds: [topicId] })

    return topics.items[0].title
  },

  async isTopic (cmmId: number, topicId: number, postId: number): Promise<boolean> {
    const comments = await vkApi.board.getComments({ groupId: cmmId, topicId: topicId })

    return comments.items[0].id === postId
  },

  getTopicDataFromMessage (message: string): { cmm: number; tid: number; } | null {
    const [, cmm, tid] = message.match(/topic-([0-9]*)_([0-9]*)/m)

    if (!cmm || !tid) return null

    return { cmm: parseInt(cmm), tid: parseInt(tid) }
  },

  getCommand (text: string): string | undefined {
    return text.match(/!([a-z]*)/m)?.[1]
  },

  getCommandParameters (text: string): string[] | undefined {
    return text.match(/-[a-z]/gm)?.map(e => e.replace('-', ''))
  },

  getReminderDate (message: string): Date | false {
    const reminderDateString = message.replaceAll(/!([a-z]*)/gm, '').replaceAll(/-[a-z]/gm, '').trim()
    const reminderData = reminderDateString.match(/([0-9]*) (minuto|minutos|hora|horas|dia|dias|mês|mes|meses)/m)

    if (!reminderData) return false

    const timeInSeconds = {
      minuto: 60,
      minutos: 60,
      hora: 60 * 60,
      horas: 60 * 60,
      dia: 60 * 60 * 24,
      dias: 60 * 60 * 24,
      mês: 60 * 60 * 24 * 30,
      mes: 60 * 60 * 24 * 30,
      meses: 60 * 60 * 24 * 30
    }

    const secondsToBeAdded = (timeInSeconds[reminderData[2]] * parseInt(reminderData[1]))

    const now = new Date()
    const reminderDate = new Date(now.setSeconds(now.getSeconds() + secondsToBeAdded))

    return reminderDate
  },

  async execCommand (command: string, userId: number, topicId: number, postId: number, cmmId: number, message: string): Promise<void> {
    const fncts = {
      citar: this.quotePost,
      tag: this.quotePostWithTag,
      like: this.likePost,
      mensagem: this.sendMessage,
      jogos: this.sendGames,
      remind: this.remindMe,
      save: this.saveToTopic
    }

    // Shorthand versions of commands
    const commandShort = {
      c: 'citar',
      t: 'tag',
      l: 'like',
      m: 'mensagem',
      j: 'jogos',
      r: 'remind',
      s: 'save'
    }

    // If it is a shorthand transpiles it to complete version
    if (commandShort[command]) command = commandShort[command]

    // Check if command exists
    if (!fncts[command]) return

    await fncts[command].call(this, { cmmId, postId, userId, topicId, message })
  },

  async quotePost (data: ICommandsInput): Promise<void> {
    const { topicId, cmmId, postId, userId, message } = data
    const params = this.getCommandParameters(message)
    const isMessage = params?.includes('m')

    if (isMessage) return this.sendMessage(data)

    const text = await this.getQuoteString(postId, userId)

    await vkApi.board.createComment({ topicId, cmmId, text })
  },

  async quotePostWithTag (data: ICommandsInput): Promise<void> {
    const { userId, postId, topicId, cmmId, message } = data
    const params = this.getCommandParameters(message)
    const isMessage = params?.includes('m')

    const quote = !isMessage ? await this.getQuoteString(postId, userId) : ''
    const tag = (message.split('!tag')[1] || message.split('!t')[1])?.replace('-m', '').trim()

    const text = `${quote} ${tag}`

    isMessage ? await vkApi.messages.send({ peerId: userId, message: text }) : await vkApi.board.createComment({ topicId, cmmId, text })
  },

  async likePost (data: ICommandsInput): Promise<void> {
    const { cmmId, postId } = data

    await vkApi.likes.add({ type: 'topic_comment', ownerId: cmmId * -1, itemId: postId })
  },

  async sendMessage (data: ICommandsInput): Promise<void> {
    const { userId, topicId, cmmId } = data
    const topicTitle = await this.getTopicTitle(cmmId, topicId)

    const message = `Segue o link do tópico que você solicitou:
    ${topicTitle}
    https://vk.com/topic-${cmmId}_${topicId}`

    await vkApi.messages.send({ peerId: userId, message })
  },

  async sendGames (data: ICommandsInput): Promise<void> {
    const { topicId, cmmId, postId, userId, message } = data
    const params = this.getCommandParameters(message)?.sort()
    const isMessage = params?.includes('m')
    const serie = ['a', 'b', 'c', 'd'].includes(params?.[0]) ? params[0] : undefined

    const quote = !isMessage ? await this.getQuoteString(postId, userId) : ''
    const games = await this.getGamesFormatted(serie)

    const text = games ? `${quote}\n${games}` : `${quote} não encontrei nenhum jogo da série ${serie || 'a'}`

    isMessage ? await vkApi.messages.send({ peerId: userId, message: text }) : await vkApi.board.createComment({ topicId, cmmId, text })
  },

  async remindMe (data: ICommandsInput): Promise<void> {
    const { topicId, cmmId, postId, userId, message } = data
    const params = this.getCommandParameters(message)
    const isMessage = params?.includes('m')

    const reminderDate = this.getReminderDate(message)

    if (!reminderDate) return

    const reminderObj = {
      cmmId: cmmId,
      topicId: topicId,
      userId: userId,
      postId: postId,
      isMessage: !!isMessage,
      requestDate: new Date(),
      expires: reminderDate
    }

    Reminder.create(reminderObj)
  },

  async saveToTopic (data: ICommandsInput): Promise<void> {
    const { topicId, cmmId, message } = data
    const topicTitle = await this.getTopicTitle(cmmId, topicId)
    const { cmm: cmmFromMessage, tid: tidFromMessage } = this.getTopicDataFromMessage(message)

    if (!cmmFromMessage || !tidFromMessage) return

    const text = `${topicTitle}
    https://vk.com/topic-${cmmId}_${topicId}`

    await vkApi.board.createComment({ topicId: tidFromMessage, cmmId: cmmFromMessage, text })
  }
}
