import { Request, Response } from 'express'
import bot from '@utils/bot'

export default {
	async post(req: Request, res: Response) {
		try {
			// Check if is confirmation
			if (req.body.type === 'confirmation') return res.status(200).send(process.env.CONFIRMATION_KEY)

			// Check key
			if (req.body.secret !== process.env.SECRET) return res.status(200).send('ok')

			// Check event type
			if (req.body.type !== 'board_post_new') return res.status(200).send('ok')

			const { group_id: cmmId } = req.body
			const { topic_id: topicId, from_id: userId, id: postId, text: message } = req.body.object
			const banned = JSON.parse(process.env.BANNED_IDS || '[]')

			// Check if post is from a new topic
			// const isNewTopic = await bot.isTopic(cmmId, topicId, postId)

			// Check if member is banned from using the bot
			if (banned.includes(userId)) return res.status(200).send('ok')

			// Send 'ok' immediately to VK to prevent duplicate callback delivery due to timeout retries
			res.status(200).send('ok')

			// Process in the background asynchronously
			Promise.resolve().then(async () => {
				try {
					// Updates member posts number on db
					await bot.updateMemberPosts(cmmId, userId, topicId, postId)

					// Scan keywords in the comment
					await bot.scanKeywords(cmmId, topicId, userId, postId, message)

					// Check if it's a comment in an active Bolao topic
					const isBolao = await bot.isBolaoTopic(cmmId, topicId)
					if (isBolao) {
						await bot.processRoundGuesses(cmmId, userId, topicId, postId, message)
						return
					}

					// Check if there is a command
					const command = bot.getCommand(message)
					if (!command) return

					// If there is a command execute it
					await bot.execCommand(command, userId, topicId, postId, cmmId, message)
				} catch (error) {
					console.error('Erro ao processar mensagem do webhook em segundo plano:', error)
				}
			})
		} catch (error) {
			console.log('Erro ao processar request', error)
			return res.status(200).send('ok')
		}
	},
}
