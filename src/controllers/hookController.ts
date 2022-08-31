import { Request, Response } from 'express'
import bot from '@utils/bot'

export default {
  async post (req: Request, res: Response) {
    try {
      // Check if is confirmation
      if (req.body.type === 'confirmation') return res.status(200).send(process.env.CONFIRMATION_KEY)

      // Check key
      if (req.body.secret !== process.env.SECRET) return res.status(200).send('ok')

      // Check event type
      if (req.body.type !== 'board_post_new') return res.status(200).send('ok')

      const { group_id: cmmId } = req.body
      const { topic_id: topicId, from_id: userId, id: postId, text: message } = req.body.object

      // Check if post is from a new topic
      // const isNewTopic = await bot.isTopic(cmmId, topicId, postId)

      // Updates member posts number on db
      await bot.updateMemberPosts(cmmId, userId)

      // Check if there is a command
      const command = bot.getCommand(message)
      if (!command) return res.status(200).send('ok')

      // If there is a command execute it
      await bot.execCommand(command, userId, topicId, postId, cmmId, message)

      return res.status(200).send('ok')
    } catch (error) {
      console.log('Erro ao processar request', error)
      return res.status(200).send('ok')
    }
  }
}
