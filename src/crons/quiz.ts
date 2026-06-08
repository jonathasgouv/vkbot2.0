import Quiz, { IQuiz } from '@models/Quiz'
import Member from '@models/Member'
import vkApi from '@api/vk'
import axios from 'axios'
import { httpAgent, httpsAgent } from '@config/axios'

export const normalizeAnswer = (text: string): string => {
	const withoutMentions = text.replace(/\[(?:id|club)\d+\|[^\]]+\]/gi, '')
	return withoutMentions
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '') // Remove accents
		.replace(/[-/]/g, ' ') // Replace hyphens and slashes with space
		.replace(/[^a-z0-9\s]/g, '') // Remove other punctuation
		.trim()
		.replace(/\s+/g, ' ') // Collapse whitespace
}

export const getSaoPauloDate = (): Date => {
	const spString = new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })
	return new Date(spString)
}

export const getMondayOfCurrentWeek = (): Date => {
	const today = getSaoPauloDate()
	const day = today.getDay()
	const diff = today.getDate() - day + (day === 0 ? -6 : 1) // adjust when day is sunday
	const monday = new Date(today.setDate(diff))
	monday.setHours(0, 0, 0, 0)
	return monday
}

export const getDailyLeaderboardText = async (dailyLeaderboard: Map<string, number> | undefined): Promise<string> => {
	if (!dailyLeaderboard || dailyLeaderboard.size === 0) return 'Nenhum acerto ainda.'
	const entries = Array.from(dailyLeaderboard.entries()).sort((a, b) => b[1] - a[1])
	const lines = []
	for (let i = 0; i < entries.length; i++) {
		const [userIdStr, score] = entries[i]
		const userId = parseInt(userIdStr)
		const cached = await Member.findOne({ userId })
		const name = cached?.firstName ? `${cached.firstName} ${cached.lastName || ''}`.trim() : `Membro ${userId}`
		lines.push(`${i + 1}º [id${userId}|${name}] - ${score} pt(s)`)
	}
	return lines.join('\n')
}

export const getWeeklyLeaderboardText = async (leaderboard: Map<string, number> | undefined): Promise<string> => {
	if (!leaderboard || leaderboard.size === 0) return 'Nenhum acerto na semana.'
	const entries = Array.from(leaderboard.entries()).sort((a, b) => b[1] - a[1])
	const lines = []
	for (let i = 0; i < entries.length; i++) {
		const [userIdStr, score] = entries[i]
		const userId = parseInt(userIdStr)
		const cached = await Member.findOne({ userId })
		const name = cached?.firstName ? `${cached.firstName} ${cached.lastName || ''}`.trim() : `Membro ${userId}`
		lines.push(`${i + 1}º [id${userId}|${name}] - ${score} pt(s)`)
	}
	return lines.join('\n')
}

export const generateWeeklyQuestions = async (): Promise<any[]> => {
	const geminiKey = process.env.GEMINI_API_KEY
	if (!geminiKey) {
		throw new Error('Chave de API do Gemini (GEMINI_API_KEY) não configurada.')
	}

	const prompt = `Gere exatamente 7 dias de perguntas sobre curiosidades e história do futebol brasileiro e internacional (10 perguntas por dia, totalizando 70 perguntas).
As perguntas devem ter dificuldade variada (fáceis, médias e difíceis) e respostas curtas e objetivas (geralmente uma única palavra, nome de jogador, nome de time ou número).

Regras cruciais de validação e qualidade:
1. **Fatos 100% Corretos**: Certifique-se de que a pergunta e a resposta são factualmente verdadeiras. Nunca invente dados ou atribua conquistas erradas (ex: não diga que o Independiente é um time brasileiro ou que Parreira é um técnico italiano).
2. **Sem Contradições**: Verifique se as restrições da pergunta (ex: nacionalidade do jogador, país do clube) batem perfeitamente com a resposta.
3. **Respostas Diretas e Curtas**: Use o nome mais comum e conhecido do jogador ou time (ex: use 'Parreira' em vez de 'Carlos Alberto Parreira', 'Pele' em vez de 'Edson Arantes do Nascimento', 'Gremio' em vez de 'Gremio Foot-Ball Porto Alegrense'). Não use respostas longas.
4. **Sem Ambiguidade**: Evite perguntas onde possa existir mais de uma resposta correta, a menos que uma seja indiscutivelmente a mais famosa.

O formato de retorno DEVE ser estritamente um array JSON válido, com o seguinte formato:
[
  {
    "dayIndex": 0,
    "questions": [
      {
        "index": 1,
        "question": "Qual time é conhecido como o Imortal?",
        "answer": "Gremio"
      },
      ...
    ]
  },
  ...
]
Retorne apenas o JSON puro, sem formatação markdown de código.`

	const response = await axios.post(
		`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${geminiKey}`,
		{
			contents: [{ parts: [{ text: prompt }] }]
		},
		{ timeout: 15000, httpAgent, httpsAgent }
	)

	let text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
	text = text.trim()
	if (text.startsWith('```')) {
		text = text.replace(/^```[a-zA-Z]*\n/, '').replace(/\n```$/, '')
	}

	try {
		const parsed = JSON.parse(text)
		return parsed
	} catch (e) {
		console.error('Erro ao fazer parse das perguntas geradas pelo Gemini:', text)
		throw e
	}
}

export default {
	async generateWeeklyQuiz(): Promise<void> {
		console.info('Starting weekly quiz generation')
		try {
			const cmms = await Member.distinct('cmmId')
			const monday = getMondayOfCurrentWeek()
			let cachedQuestions: any[] | null = null

			for (const cmmId of cmms) {
				try {
					// Check if already exists
					const exists = await Quiz.findOne({ cmmId, weekStartDate: monday })
					if (exists) {
						console.info(`Quiz for week ${monday.toDateString()} already exists for cmm ${cmmId}`)
						continue
					}

					// Pre-verify board access before calling Gemini to prevent quota drain
					try {
						await vkApi.board.getTopics({ groupId: cmmId, count: 1 })
					} catch (apiError: any) {
						console.warn(`Skipping weekly quiz generation for cmm ${cmmId} due to board access issues:`, apiError.message || apiError)
						continue
					}

					if (!cachedQuestions) {
						cachedQuestions = await generateWeeklyQuestions()
					}
					const parsed = cachedQuestions
					const todayStr = monday.toLocaleDateString('pt-BR')
					
					// Create topic on VK
					let topicId: number
					try {
						const topic = await vkApi.board.addTopic({
							cmmId,
							title: `QUIZ - Semana de ${todayStr}`,
							text: `⚽ *BEM-VINDO AO SUPER QUIZ VKBOT!* ⚽\n\nToda noite às 18:00 BRT, teremos uma rodada de 10 perguntas diárias sobre futebol.\nO primeiro membro que acertar cada pergunta acumula pontos para a rodada e para o ranking da semana!\n\nParticipe comentando o palpite exato da pergunta ativa. Boa sorte!`
						})
						topicId = topic // board.addTopic returns topic ID (number)
					} catch (addError: any) {
						if (addError.message?.includes('Access denied') || addError.error_code === 15) {
							console.warn(`Access denied when creating quiz topic for cmm ${cmmId}. Marking as disabled.`)
							topicId = -1
						} else {
							throw addError
						}
					}

					const dailyBatches = parsed.map((d: any) => ({
						dayIndex: d.dayIndex,
						questions: d.questions.map((q: any) => ({
							index: q.index,
							question: q.question,
							answer: q.answer,
							status: 'pending'
						}))
					}))

					await Quiz.create({
						cmmId,
						topicId,
						weekStartDate: monday,
						dailyBatches,
						leaderboard: {},
						dailyLeaderboard: {}
					})

					console.info(`Created weekly quiz topic ${topicId} for week starting ${monday.toDateString()} in cmm ${cmmId}`)
				} catch (innerError) {
					console.error(`Erro ao gerar quiz semanal para cmm ${cmmId}:`, innerError)
				}
			}
		} catch (error) {
			console.error('Erro ao gerar quiz semanal:', error)
		}
	},

	async postDailyQuiz(): Promise<void> {
		console.info('Triggering Daily Quiz posting')
		try {
			const monday = getMondayOfCurrentWeek()
			const quizzes = await Quiz.find({ weekStartDate: monday })
			let dayIndex = getSaoPauloDate().getDay() - 1
			if (dayIndex < 0) dayIndex = 6 // Sunday

			for (const quiz of quizzes) {
				if (quiz.topicId === -1) continue
				const batch = quiz.dailyBatches.find(b => b.dayIndex === dayIndex)
				if (!batch || batch.questions.length === 0) continue

				// Check if any question is already active/resolved for today to prevent reposting
				const hasStarted = batch.questions.some(q => q.status !== 'pending')
				if (hasStarted) {
					console.info(`Daily Quiz for day index ${dayIndex} already started in topic ${quiz.topicId}`)
					continue
				}

				// Reset daily leaderboard
				quiz.dailyLeaderboard = new Map<string, number>()
				
				// Activate first question
				const q1 = batch.questions.find(q => q.index === 1)
				if (q1) {
					q1.status = 'active'
					q1.activatedAt = new Date()
					batch.postedAt = new Date()

					const msg = `⚽ *QUIZ DIÁRIO - Rodada Iniciada!* ⚽\n\nResponda diretamente neste tópico para pontuar!\n\n❓ *Pergunta #1:* ${q1.question}`
					await vkApi.board.createComment({
						cmmId: quiz.cmmId,
						topicId: quiz.topicId,
						text: msg
					})
					
					await quiz.save()
					console.info(`Posted question 1 for daily quiz in topic ${quiz.topicId}`)
				}
			}
		} catch (error) {
			console.error('Erro ao postar quiz diário:', error)
		}
	},

	async checkQuizTimeout(): Promise<void> {
		try {
			const monday = getMondayOfCurrentWeek()
			const quizzes = await Quiz.find({ weekStartDate: monday })
			let dayIndex = getSaoPauloDate().getDay() - 1
			if (dayIndex < 0) dayIndex = 6

			for (const quiz of quizzes) {
				const batch = quiz.dailyBatches.find(b => b.dayIndex === dayIndex)
				if (!batch) continue

				const activeQuestion = batch.questions.find(q => q.status === 'active')
				if (!activeQuestion || !activeQuestion.activatedAt) continue

				const diffMinutes = (Date.now() - activeQuestion.activatedAt.getTime()) / (60 * 1000)
				if (diffMinutes >= 20) {
					console.info(`Question ${activeQuestion.index} timed out in quiz ${quiz._id}`)
					
					// 1. Mark as timeout
					activeQuestion.status = 'timeout'
					
					// 2. Post answer and next question (or end)
					const nextIndex = activeQuestion.index + 1
					const nextQuestion = batch.questions.find(q => q.index === nextIndex)

					if (nextQuestion) {
						nextQuestion.status = 'active'
						nextQuestion.activatedAt = new Date()
						
						const msg = `⏰ *Tempo esgotado!* Ninguém acertou a Pergunta #${activeQuestion.index} (A resposta correta era: *${activeQuestion.answer}*).\n\n❓ *Pergunta #${nextIndex}:* ${nextQuestion.question}`
						await vkApi.board.createComment({
							cmmId: quiz.cmmId,
							topicId: quiz.topicId,
							text: msg
						})
						
						await quiz.save()
					} else {
						// Finished round
						const dailyText = await getDailyLeaderboardText(quiz.dailyLeaderboard)
						const weeklyText = await getWeeklyLeaderboardText(quiz.leaderboard)
						
						const msg = `🏆 *Fim do Quiz de Hoje!* 🏆\n\nNinguém acertou a Pergunta #${activeQuestion.index} (A resposta correta era: *${activeQuestion.answer}*).\n\n📊 *Ranking da Rodada:* \n${dailyText}\n\n👑 *Ranking Geral da Semana:* \n${weeklyText}`
						await vkApi.board.createComment({
							cmmId: quiz.cmmId,
							topicId: quiz.topicId,
							text: msg
						})

						await quiz.save()
						await this.endQuizWeekIfNeeded(quiz)
					}
				}
			}
		} catch (error) {
			console.error('Erro ao verificar timeouts de quiz:', error)
		}
	},

	async endQuizWeekIfNeeded(quiz: IQuiz): Promise<void> {
		let dayIndex = getSaoPauloDate().getDay() - 1
		if (dayIndex < 0) dayIndex = 6

		// If it is Sunday (dayIndex = 6), resolve weekly winner and give them the badge
		if (dayIndex === 6) {
			const batch = quiz.dailyBatches.find(b => b.dayIndex === 6)
			if (batch) {
				const allResolved = batch.questions.every(q => q.status === 'resolved' || q.status === 'timeout')
				if (allResolved) {
					console.info(`Sunday round resolved, finalizing weekly quiz winner in cmm ${quiz.cmmId}`)
					const entries = Array.from(quiz.leaderboard.entries()).sort((a, b) => b[1] - a[1])
					if (entries.length > 0 && entries[0][1] > 0) {
						const winnerId = parseInt(entries[0][0])
						
						// Award Badge to weekly winner
						await Member.updateOne(
							{ cmmId: quiz.cmmId, userId: winnerId },
							{ $addToSet: { customBadges: '🧠 Sabichão do Fórum (Venceu o Quiz da Semana)' } }
						).catch(() => {})

						// Rename topic to [ENCERRADO]
						const monday = getMondayOfCurrentWeek()
						const todayStr = monday.toLocaleDateString('pt-BR')
						await vkApi.board.editTopic({
							cmmId: quiz.cmmId,
							topicId: quiz.topicId,
							title: `[ENCERRADO] QUIZ - Semana de ${todayStr}`
						}).catch((e) => console.error('Erro ao renomear tópico para encerrado:', e))

						// Save overall winner id to quiz
						await Quiz.updateOne({ _id: (quiz as any)._id }, { $set: { winnerId } }).catch(() => {})
					}
				}
			}
		}
	},

	async bootstrapQuizForCurrentWeek(): Promise<void> {
		console.info('Running bootstrap check for Weekly Quiz')
		try {
			const cmms = await Member.distinct('cmmId')
			const monday = getMondayOfCurrentWeek()
			let cachedQuestions: any[] | null = null

			for (const cmmId of cmms) {
				try {
					const exists = await Quiz.findOne({ cmmId, weekStartDate: monday })
					if (!exists) {
						// Pre-verify board access before calling Gemini to prevent quota drain
						try {
							await vkApi.board.getTopics({ groupId: cmmId, count: 1 })
						} catch (apiError: any) {
							console.warn(`Skipping quiz bootstrap for cmm ${cmmId} due to board access issues:`, apiError.message || apiError)
							continue
						}

						console.info(`No active quiz found for week starting ${monday.toDateString()} in cmm ${cmmId}. Bootstrapping now.`)
						
						if (!cachedQuestions) {
							cachedQuestions = await generateWeeklyQuestions()
						}
						const parsed = cachedQuestions
						const todayStr = monday.toLocaleDateString('pt-BR')
						
						let topicId: number
						try {
							const topic = await vkApi.board.addTopic({
								cmmId,
								title: `QUIZ - Semana de ${todayStr}`,
								text: `⚽ *BEM-VINDO AO SUPER QUIZ VKBOT!* ⚽\n\nToda noite às 18:00 BRT, teremos uma rodada de 10 perguntas diárias sobre futebol.\nO primeiro membro que acertar cada pergunta acumula pontos para a rodada e para o ranking da semana!\n\nParticipe comentando o palpite exato da pergunta ativa. Boa sorte!`
							})
							topicId = topic
						} catch (addError: any) {
							if (addError.message?.includes('Access denied') || addError.error_code === 15) {
								console.warn(`Access denied when bootstrapping quiz topic for cmm ${cmmId}. Marking as disabled.`)
								topicId = -1
							} else {
								throw addError
							}
						}

						const dailyBatches = parsed.map((d: any) => ({
							dayIndex: d.dayIndex,
							questions: d.questions.map((q: any) => ({
								index: q.index,
								question: q.question,
								answer: q.answer,
								status: 'pending'
							}))
						}))

						await Quiz.create({
							cmmId,
							topicId,
							weekStartDate: monday,
							dailyBatches,
							leaderboard: {},
							dailyLeaderboard: {}
						})

						console.info(`Bootstrapped weekly quiz topic ${topicId} for week starting ${monday.toDateString()} in cmm ${cmmId}`)
					}
				} catch (innerError) {
					console.error(`Erro no bootstrap do quiz semanal para cmm ${cmmId}:`, innerError)
				}
			}
			
			// Se já passou das 18h no horário de Brasília, rodar verificação para postar o quiz diário
			const nowSP = getSaoPauloDate()
			if (nowSP.getHours() >= 18) {
				console.info('It is past 18:00 BRT on startup, triggering postDailyQuiz check')
				await this.postDailyQuiz()
			}
		} catch (error) {
			console.error('Erro no bootstrap do quiz semanal:', error)
		}
	}
}
