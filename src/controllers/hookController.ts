import { Request, Response } from 'express'
import bot from '@utils/bot'

export default {
  async post (req: Request, res: Response) {
    // Check key
    if (req.body.secret !== process.env.SECRET) return res.status(401).send('Unauthorized.')

    // Check event type
    if (req.body.type !== 'board_post_new') return res.status(204).send('Invalid event.')

    const { group_id: cmmId } = req.body
    const { topic_id: topicId, from_id: userId, id: postId, text } = req.body.object

    // Check if there is a command
    const command = bot.getCommand(text)
    if (!command) return res.status(204).send('No command found.')

    // If there is a command execute it
    await bot.execCommand(command, userId, topicId, postId, cmmId)

    return res.status(200).json()
  }
}
