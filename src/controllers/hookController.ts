import { Request, Response } from 'express'
import bot from '@utils/bot'
import vkApi from '@api/vk'
import ProcessedEvent from '@models/ProcessedEvent'

export default {
	async post(req: Request, res: Response) {
		try {
			// Check if is confirmation
			if (req.body.type === 'confirmation') return res.status(200).send(process.env.CONFIRMATION_KEY)

			// Check key
			if (req.body.secret !== process.env.SECRET) return res.status(200).send('ok')

			// Deduplication check
			const eventId = req.body.event_id
			if (eventId) {
				try {
					await ProcessedEvent.create({ eventId })
				} catch (err: any) {
					// Duplicate key error in MongoDB (11000)
					if (err.code === 11000) {
						return res.status(200).send('ok')
					}
					console.error('Erro ao salvar ID do evento processado:', err)
				}
			}

			// Check event type
			const eventType = req.body.type
			if (eventType !== 'board_post_new' && eventType !== 'message_new') {
				return res.status(200).send('ok')
			}

			const { group_id: cmmId } = req.body
			const banned = JSON.parse(process.env.BANNED_IDS || '[]')

			let topicId = 0
			let userId = 0
			let postId = 0
			let message = ''
			let isPrivate = false

			if (eventType === 'board_post_new') {
				topicId = req.body.object.topic_id
				userId = req.body.object.from_id
				postId = req.body.object.id
				message = req.body.object.text
			} else if (eventType === 'message_new') {
				const msgObj = req.body.object.message || req.body.object
				userId = msgObj.from_id
				postId = msgObj.id
				message = msgObj.text
				isPrivate = true
			}

			// Check if member is banned from using the bot, is the bot itself, or is a group/community post
			const botId = parseInt(process.env.BOT_ID || process.env.VK_BOT_ID || '0')
			if (banned.includes(userId) || userId <= 0 || userId === botId) return res.status(200).send('ok')

			// Send 'ok' immediately to VK to prevent duplicate callback delivery due to timeout retries
			res.status(200).send('ok')

			// Process in the background asynchronously
			Promise.resolve().then(async () => {
				try {
					if (isPrivate) {
						try {
							const isMember = await vkApi.groups.isMember({ groupId: cmmId, userId })
							if (isMember !== 1) {
								await vkApi.messages.send({
									peerId: userId,
									message: 'Você precisa ser membro do grupo para usar os comandos do bot.'
								})
								return
							}
						} catch (memberErr) {
							console.error('Erro ao validar membro do grupo no DM:', memberErr)
							return
						}
					}

					if (eventType === 'board_post_new') {
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
					}

					// Check if there is a command
					const command = bot.getCommand(message)
					if (!command) return

					if (isPrivate) {
						// Shorthand transpilation for incompatible commands check
						const commandShort: any = {
							c: 'citar',
							t: 'tag',
							l: 'like',
							s: 'save'
						}
						let resolvedCommand = command
						if (commandShort[command]) resolvedCommand = commandShort[command]

						const incompatibleCommands = ['citar', 'tag', 'like', 'save']
						if (incompatibleCommands.includes(resolvedCommand)) {
							await vkApi.messages.send({
								peerId: userId,
								message: `O comando !${resolvedCommand} não é compatível em mensagens privadas pois requer o contexto de um tópico do fórum.`
							})
							return
						}
					}

					// If there is a command execute it
					await bot.execCommand(command, userId, topicId, postId, cmmId, message, isPrivate)
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
