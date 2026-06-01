import vkApi from '@api/vk'
import cbfApi from '@api/cbf'
import wikipediaApi from '@api/wikipedia'
import generalFncs from '@utils/general'
import Reminder from '@models/Reminder'
import Member from '@models/Member'
import Topic from '@models/Topic'
import BolaoRound from '@models/BolaoRound'
import Bet from '@models/Bet'
import type ICommandsInput from '@appTypes/bot'
import type ITopic from '@appTypes/topic'

export default {
	async getQuoteString(postId: number, userId: number): Promise<string> {
		try {
			const userData = await vkApi.users.get({ userIds: [userId] })
			const firstName = userData?.[0]?.first_name || 'Membro'
			return `[post${postId}|${firstName}],`
		} catch (error) {
			console.error(`Erro ao obter dados do usuário para quote (${userId}):`, error)
			return `[post${postId}|Membro],`
		}
	},

	async getTagString(userId: number): Promise<string> {
		try {
			const userData = await vkApi.users.get({ userIds: [userId] })
			if (userData?.[0]) {
				const { first_name, last_name } = userData[0]
				return `[id${userId}|${first_name} ${last_name}]`
			}
			return `[id${userId}|Membro]`
		} catch (error) {
			console.error(`Erro ao obter dados do usuário para tag (${userId}):`, error)
			return `[id${userId}|Membro]`
		}
	},

	async getSearchResult(query: string, isText: string, isTitle: string): Promise<string> {
		if (isText) {
			const result = await Topic.find({
				first_comment: new RegExp(query, 'i'),
			})

			return result
				.map(
					(topic) => `${topic.title}
      https://vk.com/topic-${topic.cmmId}_${topic._id}`
				)
				.join('\n')
		}

		if (isTitle) {
			const result = await Topic.find({ title: new RegExp(query, 'i') })

			return result
				.map(
					(topic) => `${topic.title}
      https://vk.com/topic-${topic.cmmId}_${topic._id}`
				)
				.join('\n')
		}

		const result = await Topic.find({
			$or: [{ title: new RegExp(query, 'i') }, { first_comment: new RegExp(query, 'i') }],
		})

		return result
			.map(
				(topic) => `${topic.title}
    https://vk.com/topic-${topic.cmmId}_${topic._id}`
			)
			.join('\n\n')
	},

	async getGamesFormatted(serie?: string): Promise<string> {
		const targetSerie = `Série ${serie?.toUpperCase() || 'A'}`
		const response = await cbfApi.getGames()
		
		const brasileiroGames = response.jogos?.['Campeonato Brasileiro']
		const gamesFiltered = brasileiroGames?.[targetSerie] || []

		if (gamesFiltered.length === 0) return ''

		const gamesFormatted = gamesFiltered
			.map((game) => {
				const hasScore =
					game.mandante.gols !== null &&
					game.mandante.gols !== undefined &&
					String(game.mandante.gols) !== 'null' &&
					game.visitante.gols !== null &&
					game.visitante.gols !== undefined &&
					String(game.visitante.gols) !== 'null'

				return hasScore
					? `${game.mandante.nome} ${game.mandante.gols} x ${game.visitante.gols} ${game.visitante.nome} - ${game.hora} - ${game.local}`
					: `${game.mandante.nome} x ${game.visitante.nome} - ${game.hora} - ${game.local}`
			})
			.join('\n')

		return gamesFormatted
	},

	async getLastTopics(count: number, cmm: number): Promise<ITopic[]> {
		const topicsResponse = await vkApi.board.getTopics({
			groupId: cmm,
			order: 1,
			count,
			preview: 1,
			previewLength: 0,
		})

		const topics: ITopic[] = topicsResponse.items.map((item) => {
			return {
				cmmId: cmm,
				_id: item.id,
				title: item.title,
				first_comment: item.first_comment,
				created_by: item.created_by,
				is_fixed: item.is_fixed,
			}
		})

		return topics
	},

	async getTopicTitle(cmmId: number, topicId: number): Promise<string> {
		const topics = await vkApi.board.getTopics({
			groupId: cmmId,
			topicIds: [topicId],
		})

		return topics.items[0].title
	},

	async isTopic(cmmId: number, topicId: number, postId: number): Promise<boolean> {
		const comments = await vkApi.board.getComments({
			groupId: cmmId,
			topicId,
		})

		return comments.items[0].id === postId
	},

	async updateMemberPosts(cmmId: number, userId: number, topicId?: number, postId?: number): Promise<void> {
		const initialDate = process.env.INITIAL_DATE ? new Date(process.env.INITIAL_DATE) : new Date()
		const member = await Member.findOne({ cmmId, userId })
		const weekNumber = generalFncs.weeksBetween(initialDate, new Date())

		const totalPostsBefore = member?.posts?.reduce((acc, curr) => acc + (curr || 0), 0) || 0
		const totalPostsAfter = totalPostsBefore + 1

		// If member doesn't exists, create it with the new post
		if (!member) {
			const posts = []
			posts[weekNumber] = 1

			await Member.create({ cmmId, userId, posts })
		} else {
			// If member is already created, just update posts
			const posts = member.posts
			posts[weekNumber] = (posts[weekNumber] || 0) + 1

			await Member.updateOne({ _id: member._id }, { posts })
		}

		// Detect and notify Level Up
		if (topicId && postId) {
			const infoBefore = generalFncs.getLevelInfo(totalPostsBefore)
			const infoAfter = generalFncs.getLevelInfo(totalPostsAfter)

			if (infoAfter.level > infoBefore.level) {
				try {
					const quote = await this.getQuoteString(postId, userId)
					const congratsText = `${quote} parabéns! Você subiu para o Nível ${infoAfter.level}! 🎉\nSua barra de progresso: ${infoAfter.progressBar}`
					
					await vkApi.board.createComment({ cmmId, topicId, text: congratsText })
				} catch (error) {
					console.error('Erro ao enviar mensagem de level up:', error)
				}
			}
		}
	},

	getTopicDataFromMessage(message: string): { cmm: number; tid: number } | null {
		const match = message.match(/topic-([0-9]*)_([0-9]*)/m)
		if (!match) return null

		const [, cmm, tid] = match
		if (!cmm || !tid) return null

		return { cmm: parseInt(cmm), tid: parseInt(tid) }
	},

	getCommand(text: string): string | undefined {
		return text.match(/!([a-zA-Z]*)/m)?.[1]?.toLowerCase()
	},

	getCommandParameters(text: string): string[] | undefined {
		return text.match(/-[a-z]/gm)?.map((e) => e.replace('-', ''))
	},

	getReminderDate(message: string): Date | false {
		const reminderDateString = message
			.replaceAll(/!([a-z]*)/gm, '')
			.replaceAll(/-[a-z]/gm, '')
			.trim()
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
			meses: 60 * 60 * 24 * 30,
		}

		const secondsToBeAdded = timeInSeconds[reminderData[2]] * parseInt(reminderData[1])

		const now = new Date()
		const reminderDate = new Date(now.setSeconds(now.getSeconds() + secondsToBeAdded))

		return reminderDate
	},

	async execCommand(command: string, userId: number, topicId: number, postId: number, cmmId: number, message: string): Promise<void> {
		const fncts = {
			citar: this.quotePost,
			tag: this.quotePostWithTag,
			like: this.likePost,
			mensagem: this.sendMessage,
			jogos: this.sendGames,
			remind: this.remindMe,
			save: this.saveToTopic,
			pesquisar: this.searchTopic,
			perfil: this.sendProfile,
			bolao: this.sendBolaoLink,
			ranking: this.sendRanking,
			wiki: this.searchWiki,
		}

		// Shorthand versions of commands
		const commandShort = {
			c: 'citar',
			t: 'tag',
			l: 'like',
			m: 'mensagem',
			j: 'jogos',
			r: 'remind',
			s: 'save',
			p: 'pesquisar',
			pf: 'perfil',
			b: 'bolao',
			rk: 'ranking',
			w: 'wiki',
		}

		// If it is a shorthand transpiles it to complete version
		if (commandShort[command]) command = commandShort[command]

		// Check if command exists
		if (!fncts[command]) return

		await fncts[command].call(this, {
			cmmId,
			postId,
			userId,
			topicId,
			message,
		})
	},

	async quotePost(data: ICommandsInput): Promise<void> {
		const { topicId, cmmId, postId, userId, message } = data
		const params = this.getCommandParameters(message)
		const isMessage = params?.includes('m')

		if (isMessage) return this.sendMessage(data)

		const text = await this.getQuoteString(postId, userId)

		await vkApi.board.createComment({ topicId, cmmId, text })
	},

	async quotePostWithTag(data: ICommandsInput): Promise<void> {
		const { userId, postId, topicId, cmmId, message } = data
		const params = this.getCommandParameters(message)
		const isMessage = params?.includes('m')

		const quote = !isMessage ? await this.getQuoteString(postId, userId) : ''
		const tag = (message.split('!tag')[1] || message.split('!t')[1])?.replace('-m', '').trim()

		const text = `${quote} ${tag}`

		isMessage
			? await vkApi.messages.send({ peerId: userId, message: text })
			: await vkApi.board.createComment({ topicId, cmmId, text })
	},

	async likePost(data: ICommandsInput): Promise<void> {
		const { cmmId, postId } = data

		await vkApi.likes.add({
			type: 'topic_comment',
			ownerId: cmmId * -1,
			itemId: postId,
		})
	},

	async sendMessage(data: ICommandsInput): Promise<void> {
		const { userId, topicId, cmmId } = data
		const topicTitle = await this.getTopicTitle(cmmId, topicId)

		const message = `Segue o link do tópico que você solicitou:
    ${topicTitle}
    https://vk.com/topic-${cmmId}_${topicId}`

		await vkApi.messages.send({ peerId: userId, message })
	},

	async sendGames(data: ICommandsInput): Promise<void> {
		const { topicId, cmmId, postId, userId, message } = data
		const params = this.getCommandParameters(message)?.sort()
		const isMessage = params?.includes('m')
		const serie = ['a', 'b', 'c', 'd'].includes(params?.[0]) ? params[0] : undefined

		const quote = !isMessage ? await this.getQuoteString(postId, userId) : ''
		const games = await this.getGamesFormatted(serie)

		const text = games ? `${quote}\n${games}` : `${quote} não encontrei nenhum jogo da série ${serie || 'a'}`

		isMessage
			? await vkApi.messages.send({ peerId: userId, message: text })
			: await vkApi.board.createComment({ topicId, cmmId, text })
	},

	async remindMe(data: ICommandsInput): Promise<void> {
		const { topicId, cmmId, postId, userId, message } = data
		const params = this.getCommandParameters(message)
		const isMessage = params?.includes('m')

		const reminderDate = this.getReminderDate(message)

		if (!reminderDate) return

		const reminderObj = {
			cmmId,
			topicId,
			userId,
			postId,
			isMessage: !!isMessage,
			requestDate: new Date(),
			expires: reminderDate,
		}

		await Reminder.create(reminderObj)
	},

	async saveToTopic(data: ICommandsInput): Promise<void> {
		const { topicId, cmmId, message } = data
		const topicData = this.getTopicDataFromMessage(message)
		if (!topicData) return

		const { cmm: cmmFromMessage, tid: tidFromMessage } = topicData
		const topicTitle = await this.getTopicTitle(cmmId, topicId)

		const text = `${topicTitle}
    https://vk.com/topic-${cmmId}_${topicId}`

		await vkApi.board.createComment({
			topicId: tidFromMessage,
			cmmId: cmmFromMessage,
			text,
		})
	},

	async searchTopic(data: ICommandsInput): Promise<void> {
		const { topicId, cmmId, message, userId, postId } = data
		const params = this.getCommandParameters(message)
		const isMessage = params?.includes('m')
		const isText = params?.includes('c')
		const isTitle = params?.includes('t')
		const quote = !isMessage ? await this.getQuoteString(postId, userId) : ''
		const query = (message.split(/!pesquisar/i)[1] || message.split(/!p/i)[1])
			?.replace('-m', '')
			.replace('-c', '')
			.replace('-t', '')
			.trim()

		const searchResult = await this.getSearchResult(query, isText, isTitle)

		const text = `${quote} ${searchResult ? `segue o resultado da sua pesquisa:\n\n ${searchResult}` : 'não consegui encontrar nada :('}`

		isMessage
			? await vkApi.messages.send({ peerId: userId, message: text })
			: await vkApi.board.createComment({ topicId, cmmId, text })
	},

	async sendProfile(data: ICommandsInput): Promise<void> {
		const { topicId, cmmId, userId, postId, message } = data
		const params = this.getCommandParameters(message)
		const isMessage = params?.includes('m')

		// 1. Obter nome/tag do usuário
		const userTag = await this.getTagString(userId)

		// 2. Buscar dados do membro na comunidade no banco
		const member = await Member.findOne({ cmmId, userId })
		
		const totalPosts = member?.posts?.reduce((acc, curr) => acc + (curr || 0), 0) || 0
		
		const initialDate = process.env.INITIAL_DATE ? new Date(process.env.INITIAL_DATE) : new Date()
		const weekNumber = generalFncs.weeksBetween(initialDate, new Date())
		const weeklyPosts = member?.posts?.[weekNumber] || 0

		// 3. Obter progresso de nível/XP
		const lvlInfo = generalFncs.getLevelInfo(totalPosts)

		// 4. Buscar lembretes pendentes
		const remindersCount = await Reminder.countDocuments({ userId, cmmId })

		// 5. Calcular conquistas/medalhas
		const badges: string[] = []
		if (totalPosts >= 100) badges.push('🥉 Bronze')
		if (totalPosts >= 500) badges.push('🥈 Prata')
		if (totalPosts >= 2000) badges.push('🥇 Ouro')
		if (totalPosts >= 5000) badges.push('💎 Platina')
		if (totalPosts >= 10000) badges.push('🏆 Lenda')
		if (weeklyPosts > 0) badges.push('⚡ Pé Quente')
		
		// Pioneiro: postagens registradas nas primeiras 10 semanas de vida do bot
		const hasEarlyPost = member?.posts?.slice(0, 10).some((posts) => posts > 0)
		if (hasEarlyPost) badges.push('🛡️ Pioneiro')

		// Constante: ativo em pelo menos 10 semanas diferentes
		const activeWeeks = member?.posts?.filter((posts) => posts > 0).length || 0
		if (activeWeeks >= 10) badges.push('📅 Constante')

		// Veterano: ativo em pelo menos 24 semanas diferentes
		if (activeWeeks >= 24) badges.push('🎖️ Veterano')

		// Hiperativo: mais de 100 postagens em uma única semana
		const hasHyperactiveWeek = member?.posts?.some((posts) => posts >= 100)
		if (hasHyperactiveWeek) badges.push('🔥 Hiperativo')

		const badgesList = badges.length > 0 ? badges.join('\n') : 'Nenhuma medalha ainda :('

		// 6. Formatar mensagem de perfil
		const quote = !isMessage ? await this.getQuoteString(postId, userId) : ''
		const responseMessage = `${quote} estatísticas na comunidade de ${userTag}:

⭐ Nível: ${lvlInfo.level} (XP: ${lvlInfo.xpProgress} / ${lvlInfo.xpNeededForNext})
${lvlInfo.progressBar} ${lvlInfo.percentage}%

📝 Total de postagens: ${totalPosts}
📅 Postagens nesta semana: ${weeklyPosts}
⏰ Lembretes pendentes: ${remindersCount}

🏆 Medalhas ganhas:
${badgesList}`

		// 7. Enviar resposta via DM ou fórum
		isMessage
			? await vkApi.messages.send({ peerId: userId, message: responseMessage })
			: await vkApi.board.createComment({ topicId, cmmId, text: responseMessage })
	},

	async processRoundGuesses(cmmId: number, userId: number, topicId: number, postId: number, message: string): Promise<void> {
		try {
			const round = await BolaoRound.findOne({ cmmId, topicId, processed: false })
			if (!round) return

			const regex = /(\d+)\.\s*(\d+)\s*[xX-]\s*(\d+)/g
			let match
			const registeredGuesses: string[] = []
			const rejectedGuesses: string[] = []

			const guesses: { index: number; homeScore: number; awayScore: number }[] = []
			while ((match = regex.exec(message)) !== null) {
				const index = parseInt(match[1])
				const homeScore = parseInt(match[2])
				const awayScore = parseInt(match[3])
				guesses.push({ index, homeScore, awayScore })
			}

			if (guesses.length === 0) return

			const quote = await this.getQuoteString(postId, userId)

			for (const guess of guesses) {
				const game = round.games[guess.index - 1]
				if (!game) {
					rejectedGuesses.push(`Jogo ${guess.index} não existe na rodada`)
					continue
				}

				const trimmedDate = game.date.trim()
				const [day, month, year] = trimmedDate.split('/').map(Number)
				const [hour, minute] = game.time.trim().split(':').map(Number)
				
				const pad = (num: number) => String(num).padStart(2, '0')
				const gameDate = new Date(`${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00-03:00`)

				if (Date.now() >= gameDate.getTime()) {
					rejectedGuesses.push(`${game.homeTeam} x ${game.awayTeam} (já iniciado)`)
					continue
				}

				await Bet.updateOne(
					{ userId, gameId: game.id_jogo },
					{
						cmmId,
						userId,
						roundId: round._id,
						gameId: game.id_jogo,
						homeScore: guess.homeScore,
						awayScore: guess.awayScore,
						processed: false,
						points: null,
						createdAt: new Date(),
					},
					{ upsert: true }
				)

				registeredGuesses.push(`${game.homeTeam} ${guess.homeScore} x ${guess.awayScore} ${game.awayTeam}`)
			}

			let responseText = `${quote}\n`
			if (registeredGuesses.length > 0) {
				responseText += '✅ Palpites registrados:\n' + registeredGuesses.map(g => `- ${g}`).join('\n')
			}
			if (rejectedGuesses.length > 0) {
				if (registeredGuesses.length > 0) responseText += '\n\n'
				responseText += '⚠️ Palpites não registrados (jogos iniciados ou inválidos):\n' + rejectedGuesses.map(g => `- ${g}`).join('\n')
			}

			await vkApi.board.createComment({ cmmId, topicId, text: responseText })
		} catch (error) {
			console.error('Erro ao processar palpites do bolão:', error)
		}
	},

	async sendRanking(data: ICommandsInput): Promise<void> {
		const { topicId, cmmId, postId, userId, message } = data
		const params = this.getCommandParameters(message)
		const isMessage = params?.includes('m')
		const quote = !isMessage ? await this.getQuoteString(postId, userId) : ''

		try {
			const betsAggregation = await Bet.aggregate([
				{ $match: { cmmId, processed: true } },
				{ $group: { _id: '$userId', totalPoints: { $sum: '$points' } } },
				{ $sort: { totalPoints: -1 } },
				{ $limit: 10 }
			])

			if (betsAggregation.length === 0) {
				const responseText = `${quote} Nenhum palpite foi apurado ainda neste bolão.`
				isMessage
					? await vkApi.messages.send({ peerId: userId, message: responseText })
					: await vkApi.board.createComment({ topicId, cmmId, text: responseText })
				return
			}

			const userIds = betsAggregation.map(r => r._id)
			const vkUsers = await vkApi.users.get({ userIds })

			const rankingLines = betsAggregation.map((row, idx) => {
				const vkUser = vkUsers.find((u: any) => u.id === row._id)
				const name = vkUser ? `${vkUser.first_name} ${vkUser.last_name}` : `Membro ${row._id}`
				return `${idx + 1}. [id${row._id}|${name}] - ${row.totalPoints} pts`
			})

			const text = `${quote}\n🏆 *Ranking Geral do Bolão* 🏆\n\n${rankingLines.join('\n')}`

			isMessage
				? await vkApi.messages.send({ peerId: userId, message: text })
				: await vkApi.board.createComment({ topicId, cmmId, text })
		} catch (error) {
			console.error('Erro ao buscar ranking do bolão:', error)
		}
	},

	async sendBolaoLink(data: ICommandsInput): Promise<void> {
		const { topicId, cmmId, postId, userId, message } = data
		const params = this.getCommandParameters(message)
		const isMessage = params?.includes('m')
		const quote = !isMessage ? await this.getQuoteString(postId, userId) : ''

		try {
			const activeRound = await BolaoRound.findOne({ cmmId, processed: false }).sort({ createdAt: -1 })

			let text: string
			if (activeRound) {
				text = `${quote} ⚽ Participe do Bolão ativo da Rodada ${activeRound.roundNumber} no tópico: https://vk.com/topic-${cmmId}_${activeRound.topicId}`
			} else {
				text = `${quote} Não há nenhuma rodada ativa do bolão no momento.`
			}

			isMessage
				? await vkApi.messages.send({ peerId: userId, message: text })
				: await vkApi.board.createComment({ topicId, cmmId, text })
		} catch (error) {
			console.error('Erro ao enviar link do bolão:', error)
		}
	},

	async isBolaoTopic(cmmId: number, topicId: number): Promise<boolean> {
		const round = await BolaoRound.findOne({ cmmId, topicId, processed: false })
		return !!round
	},

	async searchWiki(data: ICommandsInput): Promise<void> {
		const { topicId, cmmId, postId, userId, message } = data
		const params = this.getCommandParameters(message)
		const isMessage = params?.includes('m')
		const quote = !isMessage ? await this.getQuoteString(postId, userId) : ''

		const query = message
			.replaceAll(/!([a-zA-Z]*)/gm, '')
			.replaceAll(/-[a-z]/gm, '')
			.trim()

		if (!query) {
			const responseText = `${quote} por favor insira um termo para pesquisa. Exemplo: !wiki inteligência artificial`
			isMessage
				? await vkApi.messages.send({ peerId: userId, message: responseText })
				: await vkApi.board.createComment({ topicId, cmmId, text: responseText })
			return
		}

		try {
			const summary = await wikipediaApi.searchAndGetSummary(query)

			if (!summary) {
				const responseText = `${quote} não consegui encontrar nenhuma informação sobre "${query}" na Wikipédia.`
				isMessage
					? await vkApi.messages.send({ peerId: userId, message: responseText })
					: await vkApi.board.createComment({ topicId, cmmId, text: responseText })
				return
			}

			const responseText = `${quote} 📖 *Wikipédia: ${summary.title}* 📖\n\n${summary.extract}\n\nLeia mais em: ${summary.pageUrl}`

			isMessage
				? await vkApi.messages.send({ peerId: userId, message: responseText })
				: await vkApi.board.createComment({ topicId, cmmId, text: responseText })
		} catch (error) {
			console.error(`Erro no comando de busca da Wikipédia para "${query}":`, error)
		}
	},
}
