import { Request, Response } from 'express'
import bot from '@utils/bot'
import vkApi from '@api/vk'
import ProcessedEvent from '@models/ProcessedEvent'
import Quiz from '@models/Quiz'
import Member from '@models/Member'
import { normalizeAnswer, getDailyLeaderboardText, getWeeklyLeaderboardText, getMondayOfCurrentWeek } from '@crons/quiz'

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

						// Check if it's a comment in the active Quiz topic
						const activeQuiz = await Quiz.findOne({ cmmId, topicId })
						if (activeQuiz) {
							let dayIndex = new Date().getDay() - 1
							if (dayIndex < 0) dayIndex = 6
							
							const batch = activeQuiz.dailyBatches.find(b => b.dayIndex === dayIndex)
							if (batch) {
								const activeQ = batch.questions.find(q => q.status === 'active')
								if (activeQ) {
									const guessNorm = normalizeAnswer(message)
									const correctNorm = normalizeAnswer(activeQ.answer)
									if (guessNorm === correctNorm) {
										// 1. Mark as resolved
										activeQ.status = 'resolved'
										activeQ.winnerId = userId
										activeQ.resolvedAt = new Date()

										// 2. Increment score
										const dailyScore = activeQuiz.dailyLeaderboard.get(String(userId)) || 0
										activeQuiz.dailyLeaderboard.set(String(userId), dailyScore + 1)

										const weeklyScore = activeQuiz.leaderboard.get(String(userId)) || 0
										activeQuiz.leaderboard.set(String(userId), weeklyScore + 1)

										// 3. Award badges
										// ⚡ Mente Brilhante: < 60s
										if (activeQ.activatedAt && (Date.now() - activeQ.activatedAt.getTime() < 60000)) {
											await Member.updateOne(
												{ cmmId, userId },
												{ $addToSet: { customBadges: '⚡ Mente Brilhante (Respondeu o quiz em < 60s)' } }
											).catch(() => {})
										}

										// 🎯 Papa-Tudo: 5+ acertos no mesmo dia
										const resolvedCount = batch.questions.filter(q => q.winnerId === userId).length
										if (resolvedCount >= 5) {
											await Member.updateOne(
												{ cmmId, userId },
												{ $addToSet: { customBadges: '🎯 Papa-Tudo (5+ acertos no Quiz no mesmo dia)' } }
											).catch(() => {})
										}

										// 4. Resolve quote name
										let quote = `[id${userId}|Membro]`
										try {
											const userData = await vkApi.users.get({ userIds: [userId] })
											if (userData?.[0]) {
												quote = `[id${userId}|${userData[0].first_name} ${userData[0].last_name}]`
												await Member.updateMany(
													{ userId },
													{ $set: { firstName: userData[0].first_name, lastName: userData[0].last_name } }
												).catch(() => {})
											}
										} catch (e) {}

										// 5. Post congratulatory and next question or stats
										const nextIndex = activeQ.index + 1
										const nextQ = batch.questions.find(q => q.index === nextIndex)

										if (nextQ) {
											nextQ.status = 'active'
											nextQ.activatedAt = new Date()

											await vkApi.board.createComment({
												cmmId,
												topicId,
												text: `✅ ${quote} acertou a Pergunta #${activeQ.index}! A resposta era *${activeQ.answer}*.\n\n❓ *Pergunta #${nextIndex}:* ${nextQ.question}`
											})
										} else {
											// Finished round
											const dailyText = await getDailyLeaderboardText(activeQuiz.dailyLeaderboard)
											const weeklyText = await getWeeklyLeaderboardText(activeQuiz.leaderboard)

											await vkApi.board.createComment({
												cmmId,
												topicId,
												text: `✅ ${quote} acertou a Pergunta #${activeQ.index}! A resposta era *${activeQ.answer}*.\n\n🏆 *Fim do Quiz de Hoje!* 🏆\n\n📊 *Ranking da Rodada:* \n${dailyText}\n\n👑 *Ranking Geral da Semana:* \n${weeklyText}`
											})

											// Check if sunday round to finalize week
											let isSunday = new Date().getDay() - 1
											if (isSunday < 0) isSunday = 6
											if (isSunday === 6) {
												const entries = Array.from(activeQuiz.leaderboard.entries()).sort((a, b) => b[1] - a[1])
												if (entries.length > 0 && entries[0][1] > 0) {
													const winnerId = parseInt(entries[0][0])
													await Member.updateOne(
														{ cmmId, userId: winnerId },
														{ $addToSet: { customBadges: '🧠 Sabichão do Fórum (Venceu o Quiz da Semana)' } }
													).catch(() => {})

													const monday = getMondayOfCurrentWeek()
													const todayStr = monday.toLocaleDateString('pt-BR')
													await vkApi.board.editTopic({
														cmmId,
														topicId,
														title: `[ENCERRADO] QUIZ - Semana de ${todayStr}`
													}).catch((e) => console.error('Erro ao renomear para encerrado:', e))

													activeQuiz.winnerId = winnerId
												}
											}
										}

										await activeQuiz.save()
										return
									}
								}
							}
						}

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
