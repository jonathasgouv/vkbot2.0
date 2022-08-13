import vkApi from '@api/vk'

interface ICommandsInput {
  userId: number;
  topicId: number;
  postId: number;
  cmmId: number;
}

export default {
  getCommand (text: string): string | undefined {
    return text.match(/!([a-z]*)/m)?.[1]
  },

  async getQuoteString (postId: string, userId: number): Promise<string> {
    const userData = await vkApi.users.get({ userIds: [userId] })
    const firstName = userData[0].first_name

    return `[post${postId}|${firstName}],`
  },

  async execCommand (command: string, userId: number, topicId: number, postId: number, cmmId: number): Promise<void> {
    const fncts = {
      citar: this.quotePost,
      like: this.likePost,
      mensagem: this.sendMessage
    }

    // Shorthand versions of commands
    const commandShort = {
      c: 'citar',
      l: 'like',
      m: 'mensagem'
    }

    // If it is a shorthand transpiles it to complete version
    if (commandShort[command]) command = commandShort[command]

    // Check if command exists
    if (!fncts[command]) return

    await fncts[command].call(this, { cmmId, postId, userId, topicId })
  },

  async quotePost (data: ICommandsInput): Promise<void> {
    const { topicId, cmmId, postId, userId } = data
    const text = await this.getQuoteString(postId, userId)

    await vkApi.board.createComment({ topicId, cmmId, text })
  },

  async likePost (data: ICommandsInput): Promise<void> {
    const { cmmId, postId } = data

    await vkApi.likes.add({ type: 'topic_comment', ownerId: cmmId * -1, itemId: postId })
  },

  async sendMessage (data: ICommandsInput): Promise<void> {
    const { userId, topicId, cmmId } = data

    const message = `Segue o link do tópico que você solicitou:
    https://vk.com/topic-${cmmId}_${topicId}`

    await vkApi.messages.send({ peerId: userId, message })
  }
}
