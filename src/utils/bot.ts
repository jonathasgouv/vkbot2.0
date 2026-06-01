import vkApi from '@api/vk'
import cbfApi from '@api/cbf'
import wikipediaApi from '@api/wikipedia'
import generalFncs from '@utils/general'
import Reminder from '@models/Reminder'
import Member from '@models/Member'
import Topic from '@models/Topic'
import BolaoRound from '@models/BolaoRound'
import Bet from '@models/Bet'
import Keyword from '@models/Keyword'
import axios from 'axios'
import type ICommandsInput from '@appTypes/bot'
import type ITopic from '@appTypes/topic'

const resumoCooldowns = new Map<string, number>()

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

		const brtHour = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })).getHours()
		const isMidnightRange = brtHour >= 0 && brtHour < 6

		// If member doesn't exists, create it with the new post
		if (!member) {
			const posts = []
			posts[weekNumber] = 1

			await Member.create({ cmmId, userId, posts, coruja: isMidnightRange ? true : undefined })
		} else {
			// If member is already created, just update posts
			const posts = member.posts
			posts[weekNumber] = (posts[weekNumber] || 0) + 1

			const updateFields: any = { posts }
			if (isMidnightRange && !member.coruja) {
				updateFields.coruja = true
			}
			await Member.updateOne({ _id: member._id }, updateFields)
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
		const fncts: any = {
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
			rankingrpg: this.sendRpgRanking,
			wiki: this.searchWiki,
			vs: this.sendComparison,
			resumo: this.sendTopicSummary,
			monitorar: this.monitorarKeyword,
			desmonitorar: this.desmonitorarKeyword,
			monitorados: this.listarKeywords,
		}

		// Shorthand versions of commands
		const commandShort: any = {
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
			rkpf: 'rankingrpg',
			w: 'wiki',
			rs: 'resumo',
			mon: 'monitorar',
			dmon: 'desmonitorar',
			mons: 'monitorados',
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

	async calculateBadges(
		member: any,
		totalPosts: number,
		weeklyPosts: number,
		weeksOfHouse: number,
		firstActiveWeek: number,
		userId: number,
		cmmId: number
	): Promise<string[]> {
		const badges: string[] = []
		if (totalPosts >= 100) badges.push('🥉 Bronze (100+ posts)')
		if (totalPosts >= 500) badges.push('🥈 Prata (500+ posts)')
		if (totalPosts >= 2000) badges.push('🥇 Ouro (2.000+ posts)')
		if (totalPosts >= 5000) badges.push('💎 Platina (5.000+ posts)')
		if (totalPosts >= 10000) badges.push('🏆 Lenda (10.000+ posts)')
		if (totalPosts >= 25000) badges.push('👑 Imperador (25.000+ posts)')
		if (totalPosts >= 50000) badges.push('🚀 Mestre do Cartola (50.000+ posts)')
		if (totalPosts >= 75000) badges.push('💫 Mítico (75.000+ posts)')
		if (totalPosts >= 100000) badges.push('🔱 Deus do Cartola (100.000+ posts)')

		if (weeklyPosts > 0) badges.push('⚡ Pé Quente (Ativo esta semana)')
		
		const hasEarlyPost = member?.posts?.slice(0, 10).some((posts: number) => posts > 0)
		if (hasEarlyPost) badges.push('🛡️ Pioneiro (Primeiras 10 semanas)')

		const activeWeeks = member?.posts?.filter((posts: number) => posts > 0).length || 0
		if (activeWeeks >= 10) badges.push('📅 Constante (Ativo em 10+ semanas)')
		if (activeWeeks >= 24) badges.push('🎖️ Veterano (Ativo em 24+ semanas)')

		const hasHyperactiveWeek = member?.posts?.some((posts: number) => posts >= 100)
		if (hasHyperactiveWeek) badges.push('🔥 Hiperativo (100+ posts em 1 semana)')

		if (firstActiveWeek !== -1) {
			if (weeksOfHouse >= 20) {
				badges.push('👴 Old (Membro antigo)')
			} else if (weeksOfHouse <= 4) {
				badges.push('👶 Modinha (Membro recente)')
			}
		}

		if (member?.coruja) {
			badges.push('🦉 Coruja (Postou de madrugada)')
		}

		const peDeAnjoBet = await Bet.findOne({ userId, points: 5 })
		if (peDeAnjoBet) {
			badges.push('🎯 Pé de Anjo (Acertou placar exato no Bolão)')
		}

		const bolaoRanking = await Bet.aggregate([
			{ $match: { cmmId, processed: true } },
			{ $group: { _id: '$userId', totalPoints: { $sum: '$points' } } },
			{ $sort: { totalPoints: -1 } },
			{ $limit: 1 }
		])
		if (bolaoRanking.length > 0) {
			const topPoints = bolaoRanking[0].totalPoints
			if (topPoints > 0) {
				const userBolaoPoints = await Bet.aggregate([
					{ $match: { cmmId, userId, processed: true } },
					{ $group: { _id: '$userId', totalPoints: { $sum: '$points' } } }
				])
				const userPoints = userBolaoPoints[0]?.totalPoints || 0
				if (userPoints === topPoints) {
					badges.push('👑 Rei do Bolão (Líder do Bolão)')
				}
			}
		}

		return badges
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

		// 5. Calcular tempo de casa
		let weeksOfHouse = 0
		let monthsOfHouse = 0
		let houseTimeString = '0 meses (0 semanas)'
		let firstActiveWeek = -1
		if (member && member.posts) {
			firstActiveWeek = member.posts.findIndex((p) => (p || 0) > 0)
			if (firstActiveWeek !== -1) {
				const joinDate = new Date(initialDate.getTime() + firstActiveWeek * 7 * 24 * 60 * 60 * 1000)
				const diffTime = Math.abs(new Date().getTime() - joinDate.getTime())
				weeksOfHouse = Math.floor(diffTime / (7 * 24 * 60 * 60 * 1000))
				monthsOfHouse = Math.floor(weeksOfHouse / 4.34)
				houseTimeString = `${monthsOfHouse} meses (${weeksOfHouse} semanas)`
			}
		}

		// 6. Calcular conquistas/medalhas
		const badges = await this.calculateBadges(
			member,
			totalPosts,
			weeklyPosts,
			weeksOfHouse,
			firstActiveWeek,
			userId,
			cmmId
		)

		const badgesList = badges.length > 0 ? badges.join('\n') : 'Nenhuma medalha ainda :('

		// 7. Formatar mensagem de perfil
		const quote = !isMessage ? await this.getQuoteString(postId, userId) : ''
		const responseMessage = `${quote} estatísticas na comunidade de ${userTag}:

⭐ Nível: ${lvlInfo.level} (XP: ${lvlInfo.xpProgress} / ${lvlInfo.xpNeededForNext})
${lvlInfo.progressBar} ${lvlInfo.percentage}%

📝 Total de postagens: ${totalPosts}
📅 Postagens nesta semana: ${weeklyPosts}
📅 Tempo de casa: ${houseTimeString}
⏰ Lembretes pendentes: ${remindersCount}

🏆 Medalhas ganhas:
${badgesList}`

		// 8. Enviar resposta via DM ou fórum
		isMessage
			? await vkApi.messages.send({ peerId: userId, message: responseMessage })
			: await vkApi.board.createComment({ topicId, cmmId, text: responseMessage })
	},

	async sendComparison(data: ICommandsInput): Promise<void> {
		const { topicId, cmmId, userId, postId, message } = data
		const params = this.getCommandParameters(message)
		const isMessage = params?.includes('m')
		const quote = !isMessage ? await this.getQuoteString(postId, userId) : ''

		const match = message.match(/\[id(\d+)\|/i) || message.match(/id(\d+)/i) || message.match(/!vs\s+(\d+)/i)
		const targetUserId = match ? parseInt(match[1]) : null

		if (!targetUserId) {
			const responseText = `${quote} ⚠️ Por favor, mencione o membro que deseja comparar. Exemplo: !vs @membro`
			isMessage
				? await vkApi.messages.send({ peerId: userId, message: responseText })
				: await vkApi.board.createComment({ topicId, cmmId, text: responseText })
			return
		}

		try {
			const vkUsers = await vkApi.users.get({ userIds: [userId, targetUserId] })
			const callerUser = vkUsers.find((u: any) => u.id === userId)
			const targetUser = vkUsers.find((u: any) => u.id === targetUserId)

			const callerName = callerUser ? `${callerUser.first_name} ${callerUser.last_name}` : `Membro ${userId}`
			const targetName = targetUser ? `${targetUser.first_name} ${targetUser.last_name}` : `Membro ${targetUserId}`

			const callerMember = await Member.findOne({ cmmId, userId })
			const targetMember = await Member.findOne({ cmmId, userId: targetUserId })

			const initialDate = process.env.INITIAL_DATE ? new Date(process.env.INITIAL_DATE) : new Date()
			const weekNumber = generalFncs.weeksBetween(initialDate, new Date())

			const callerTotalPosts = callerMember?.posts?.reduce((acc, curr) => acc + (curr || 0), 0) || 0
			const callerWeeklyPosts = callerMember?.posts?.[weekNumber] || 0
			const callerLvlInfo = generalFncs.getLevelInfo(callerTotalPosts)

			let callerWeeksOfHouse = 0
			let callerMonthsOfHouse = 0
			let callerFirstActiveWeek = -1
			if (callerMember && callerMember.posts) {
				callerFirstActiveWeek = callerMember.posts.findIndex((p) => (p || 0) > 0)
				if (callerFirstActiveWeek !== -1) {
					const joinDate = new Date(initialDate.getTime() + callerFirstActiveWeek * 7 * 24 * 60 * 60 * 1000)
					const diffTime = Math.abs(new Date().getTime() - joinDate.getTime())
					callerWeeksOfHouse = Math.floor(diffTime / (7 * 24 * 60 * 60 * 1000))
					callerMonthsOfHouse = Math.floor(callerWeeksOfHouse / 4.34)
				}
			}

			const callerBolao = await Bet.aggregate([
				{ $match: { cmmId, userId, processed: true } },
				{ $group: { _id: '$userId', totalPoints: { $sum: '$points' } } }
			])
			const callerPoints = callerBolao[0]?.totalPoints || 0
			const callerBadges = await this.calculateBadges(
				callerMember,
				callerTotalPosts,
				callerWeeklyPosts,
				callerWeeksOfHouse,
				callerFirstActiveWeek,
				userId,
				cmmId
			)

			const targetTotalPosts = targetMember?.posts?.reduce((acc, curr) => acc + (curr || 0), 0) || 0
			const targetWeeklyPosts = targetMember?.posts?.[weekNumber] || 0
			const targetLvlInfo = generalFncs.getLevelInfo(targetTotalPosts)

			let targetWeeksOfHouse = 0
			let targetMonthsOfHouse = 0
			let targetFirstActiveWeek = -1
			if (targetMember && targetMember.posts) {
				targetFirstActiveWeek = targetMember.posts.findIndex((p) => (p || 0) > 0)
				if (targetFirstActiveWeek !== -1) {
					const joinDate = new Date(initialDate.getTime() + targetFirstActiveWeek * 7 * 24 * 60 * 60 * 1000)
					const diffTime = Math.abs(new Date().getTime() - joinDate.getTime())
					targetWeeksOfHouse = Math.floor(diffTime / (7 * 24 * 60 * 60 * 1000))
					targetMonthsOfHouse = Math.floor(targetWeeksOfHouse / 4.34)
				}
			}

			const targetBolao = await Bet.aggregate([
				{ $match: { cmmId, userId: targetUserId, processed: true } },
				{ $group: { _id: '$userId', totalPoints: { $sum: '$points' } } }
			])
			const targetPoints = targetBolao[0]?.totalPoints || 0
			const targetBadges = await this.calculateBadges(
				targetMember,
				targetTotalPosts,
				targetWeeklyPosts,
				targetWeeksOfHouse,
				targetFirstActiveWeek,
				targetUserId,
				cmmId
			)

			const getWinner = (valA: number, valB: number, nameA: string, nameB: string): string => {
				if (valA > valB) return nameA
				if (valB > valA) return nameB
				return 'Empate 🤝'
			}

			let levelWinner = 'Empate 🤝'
			if (callerLvlInfo.level > targetLvlInfo.level) {
				levelWinner = callerName
			} else if (targetLvlInfo.level > callerLvlInfo.level) {
				levelWinner = targetName
			} else {
				levelWinner = getWinner(callerLvlInfo.xpProgress, targetLvlInfo.xpProgress, callerName, targetName)
			}

			const postsWinner = getWinner(callerTotalPosts, targetTotalPosts, callerName, targetName)
			const weeklyWinner = getWinner(callerWeeklyPosts, targetWeeklyPosts, callerName, targetName)
			const houseWinner = getWinner(callerWeeksOfHouse, targetWeeksOfHouse, callerName, targetName)
			const bolaoWinner = getWinner(callerPoints, targetPoints, callerName, targetName)
			const badgesWinner = getWinner(callerBadges.length, targetBadges.length, callerName, targetName)

			const text = `${quote} comparativo direto entre os membros:

📊 *Comparativo Geral* 📊

👤 *Membro A*: [id${userId}|${callerName}]
👤 *Membro B*: [id${targetUserId}|${targetName}]

⭐ Nível:
- Membro A: Nível ${callerLvlInfo.level} (XP: ${callerLvlInfo.xpProgress} / ${callerLvlInfo.xpNeededForNext})
- Membro B: Nível ${targetLvlInfo.level} (XP: ${targetLvlInfo.xpProgress} / ${targetLvlInfo.xpNeededForNext})
➔ Vencedor: ${levelWinner}

📝 Total de postagens:
- Membro A: ${callerTotalPosts} posts
- Membro B: ${targetTotalPosts} posts
➔ Vencedor: ${postsWinner}

📅 Postagens nesta semana:
- Membro A: ${callerWeeklyPosts} posts
- Membro B: ${targetWeeklyPosts} posts
➔ Vencedor: ${weeklyWinner}

📅 Tempo de casa:
- Membro A: ${callerMonthsOfHouse} meses (${callerWeeksOfHouse} semanas)
- Membro B: ${targetMonthsOfHouse} meses (${targetWeeksOfHouse} semanas)
➔ Vencedor: ${houseWinner}

⚽ Pontos no Bolão:
- Membro A: ${callerPoints} pts
- Membro B: ${targetPoints} pts
➔ Vencedor: ${bolaoWinner}

🏆 Total de Medalhas:
- Membro A: ${callerBadges.length}
- Membro B: ${targetBadges.length}
➔ Vencedor: ${badgesWinner}`

			isMessage
				? await vkApi.messages.send({ peerId: userId, message: text })
				: await vkApi.board.createComment({ topicId, cmmId, text: text })

		} catch (error) {
			console.error('Erro ao realizar comparativo direto:', error)
		}
	},

	async sendTopicSummary(data: ICommandsInput): Promise<void> {
		const { topicId, cmmId, postId, userId, message } = data
		const params = this.getCommandParameters(message)
		const isMessage = params?.includes('m')
		const quote = !isMessage ? await this.getQuoteString(postId, userId) : ''

		try {
			// 1. Verificar se é administrador/moderador (manager) no VK
			let isMod = false
			try {
				const managersResponse = await vkApi.groups.getMembers({
					groupId: cmmId,
					filter: 'managers',
				})
				if (managersResponse && managersResponse.items) {
					isMod = managersResponse.items.some((m: any) => m.id === userId)
				}
			} catch (err) {
				console.error('Erro ao verificar moderadores:', err)
			}

			// 2. Verificar Cooldown (1h) se não for moderador
			const cooldownKey = `${cmmId}_${topicId}`
			if (!isMod) {
				const nextAvailable = resumoCooldowns.get(cooldownKey) || 0
				if (Date.now() < nextAvailable) {
					const remainingMs = nextAvailable - Date.now()
					const remainingMin = Math.ceil(remainingMs / (60 * 1000))
					const responseText = `${quote} ⚠️ O comando !resumo possui cooldown de 1h por tópico. Tempo restante: ${remainingMin} minuto(s).`
					
					isMessage
						? await vkApi.messages.send({ peerId: userId, message: responseText })
						: await vkApi.board.createComment({ topicId, cmmId, text: responseText })
					return
				}
			}

			// 3. Obter primeiros 50 comentários
			const firstCommentsResponse = await vkApi.board.getComments({
				groupId: cmmId,
				topicId,
				count: 50,
				sort: 'asc',
			})

			if (!firstCommentsResponse || !firstCommentsResponse.items || firstCommentsResponse.items.length === 0) {
				const responseText = `${quote} Não há comentários suficientes para resumir.`
				isMessage
					? await vkApi.messages.send({ peerId: userId, message: responseText })
					: await vkApi.board.createComment({ topicId, cmmId, text: responseText })
				return
			}

			let allComments = [...firstCommentsResponse.items]
			const totalCount = firstCommentsResponse.count || 0

			// 4. Se houver mais de 50 comentários, buscar os últimos 50
			if (totalCount > 50) {
				const offset = Math.max(50, totalCount - 50)
				const lastCommentsResponse = await vkApi.board.getComments({
					groupId: cmmId,
					topicId,
					count: 50,
					sort: 'asc',
					offset,
				})
				if (lastCommentsResponse && lastCommentsResponse.items) {
					allComments = [...allComments, ...lastCommentsResponse.items]
				}
			}

			// 5. Remover duplicados (por id)
			const uniqueComments = Array.from(
				new Map(allComments.map((c) => [c.id, c])).values()
			)

			// 6. Filtrar comentários irrelevantes (comandos, bot, etc.)
			const botId = parseInt(process.env.BOT_ID || '0')
			const filteredComments = uniqueComments.filter((c) => {
				const isBot = c.from_id === botId || c.from_id === -botId || c.from_id === -cmmId
				const isCommand = c.text?.trim().startsWith('!')
				return !isBot && !isCommand && c.text?.trim()
			})

			if (filteredComments.length === 0) {
				const responseText = `${quote} Não há comentários relevantes para resumir.`
				isMessage
					? await vkApi.messages.send({ peerId: userId, message: responseText })
					: await vkApi.board.createComment({ topicId, cmmId, text: responseText })
				return
			}

			// 7. Obter nomes reais dos usuários em lote
			const senderIds = Array.from(new Set(filteredComments.map((c) => c.from_id).filter((id) => id > 0)))
			let vkUsers: any[] = []
			if (senderIds.length > 0) {
				try {
					vkUsers = await vkApi.users.get({ userIds: senderIds })
				} catch (err) {
					console.error('Erro ao buscar usuários do VK em lote:', err)
				}
			}

			// 8. Formatar mensagens para enviar ao Gemini
			const formattedMessages = filteredComments
				.map((c) => {
					const vkUser = vkUsers.find((u) => u.id === c.from_id)
					const name = vkUser ? `${vkUser.first_name} ${vkUser.last_name}` : `Membro ${c.from_id}`
					return `[${name}]: ${c.text}`
				})
				.join('\n')

			// 9. Chamar API do Gemini
			const geminiKey = process.env.GEMINI_API_KEY
			if (!geminiKey) {
				throw new Error('Chave de API do Gemini (GEMINI_API_KEY) não configurada.')
			}

			const prompt = `Você é um assistente de moderação de fórum. Abaixo estão as postagens iniciais e finais de uma discussão em nossa comunidade sobre Cartola FC e futebol.
Escreva um resumo claro, conciso e direto em português (máximo de 2 a 3 parágrafos) destacando os principais tópicos debatidos pelos membros, as opiniões predominantes e os destaques.

Comentários do tópico:
${formattedMessages}

Resumo:`

			const geminiResponse = await axios.post(
				`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
				{
					contents: [{ parts: [{ text: prompt }] }]
				}
			)

			const summary = geminiResponse.data?.candidates?.[0]?.content?.parts?.[0]?.text
			if (!summary) {
				throw new Error('Falha ao obter o resumo da IA.')
			}

			// 10. Responder no fórum e setar cooldown
			const responseText = `${quote}\n📝 *Resumo do Tópico (IA)* 📝\n\n${summary.trim()}`

			isMessage
				? await vkApi.messages.send({ peerId: userId, message: responseText })
				: await vkApi.board.createComment({ topicId, cmmId, text: responseText })

			if (!isMod) {
				resumoCooldowns.set(cooldownKey, Date.now() + 60 * 60 * 1000) // Cooldown de 1h
			}
		} catch (error: any) {
			console.error('Erro ao gerar resumo do tópico:', error)
			const errorText = `${quote} Desculpe, ocorreu um erro ao tentar resumir as discussões deste tópico.`
			isMessage
				? await vkApi.messages.send({ peerId: userId, message: errorText })
				: await vkApi.board.createComment({ topicId, cmmId, text: errorText })
		}
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
			const botId = parseInt(process.env.BOT_ID || '0')
			const betsAggregation = await Bet.aggregate([
				{ $match: { cmmId, processed: true, userId: { $ne: botId } } },
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
	async sendRpgRanking(data: ICommandsInput): Promise<void> {
		const { topicId, cmmId, postId, userId, message } = data
		const params = this.getCommandParameters(message)
		const isMessage = params?.includes('m')
		const quote = !isMessage ? await this.getQuoteString(postId, userId) : ''

		try {
			const botId = parseInt(process.env.BOT_ID || '0')
			const members = await Member.aggregate([
				{ $match: { cmmId, userId: { $ne: botId } } },
				{ $addFields: { totalPosts: {
					$reduce: {
						input: { $ifNull: ['$posts', []] },
						initialValue: 0,
						in: { $add: ['$$value', { $ifNull: ['$$this', 0] }] }
					}
				} } },
				{ $sort: { totalPosts: -1 } },
				{ $limit: 10 }
			])

			if (members.length === 0) {
				const responseText = `${quote} Nenhum membro registrado no RPG ainda.`
				isMessage
					? await vkApi.messages.send({ peerId: userId, message: responseText })
					: await vkApi.board.createComment({ topicId, cmmId, text: responseText })
				return
			}

			const userIds = members.map(m => m.userId)
			const vkUsers = await vkApi.users.get({ userIds })

			const rankingLines = members.map((row, idx) => {
				const vkUser = vkUsers.find((u: any) => u.id === row.userId)
				const name = vkUser ? `${vkUser.first_name} ${vkUser.last_name}` : `Membro ${row.userId}`
				const lvlInfo = generalFncs.getLevelInfo(row.totalPosts)
				return `${idx + 1}. [id${row.userId}|${name}] - Nível ${lvlInfo.level} (${row.totalPosts} posts)`
			})

			const text = `${quote}\n🏆 *Ranking Geral do RPG* 🏆\n\n${rankingLines.join('\n')}`

			isMessage
				? await vkApi.messages.send({ peerId: userId, message: text })
				: await vkApi.board.createComment({ topicId, cmmId, text })
		} catch (error) {
			console.error('Erro ao buscar ranking do RPG:', error)
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

	async monitorarKeyword(data: ICommandsInput): Promise<void> {
		const { topicId, cmmId, postId, userId, message } = data
		const params = this.getCommandParameters(message)
		const isExact = params?.includes('e')
		const isDelete = params?.includes('d')

		// If -d flag is present, redirect to desmonitorar
		if (isDelete) {
			return this.desmonitorarKeyword(data)
		}

		const quote = await this.getQuoteString(postId, userId)
		
		// Extract raw keyword by removing command (!monitorar or !mon) and options (-e, -d, etc.)
		const keyword = message
			.replaceAll(/!(monitorar|mon)/gm, '')
			.replaceAll(/-[a-z]/gm, '')
			.trim()

		if (!keyword) {
			const text = `${quote} ⚠️ Por favor, insira um termo para monitorar. Exemplo: !monitorar ingresso`
			await vkApi.board.createComment({ topicId, cmmId, text })
			return
		}

		try {
			// Check limit of 5 keywords per user in this community
			const count = await Keyword.countDocuments({ userId, cmmId })
			if (count >= 5) {
				const text = `${quote} ⚠️ Limite de 5 palavras-chave atingido. Use !monitorados para listar e !desmonitorar <termo> para remover alguma.`
				await vkApi.board.createComment({ topicId, cmmId, text })
				return
			}

			// Validate if bot can send a private message to this user
			try {
				await vkApi.messages.send({
					peerId: userId,
					message: `🔔 Olá! Este é um teste para confirmar que seu monitoramento da palavra-chave "${keyword}" foi ativado com sucesso nesta comunidade.`
				})
			} catch (dmError) {
				// VK API throws when user hasn't allowed messages
				console.info(`Falha ao testar DM para usuário ${userId}:`, dmError)
				const text = `${quote} ⚠️ Não consegui te enviar uma mensagem privada.\nPara receber alertas de monitoramento, você precisa abrir um chat com o bot (iniciar conversa/enviar mensagem) e tentar registrar o termo novamente.`
				await vkApi.board.createComment({ topicId, cmmId, text })
				return
			}

			// Register / Update keyword in database
			await Keyword.updateOne(
				{ userId, cmmId, keyword: new RegExp('^' + this.escapeRegExp(keyword) + '$', 'i') },
				{
					userId,
					cmmId,
					keyword,
					isExact: !!isExact,
					createdAt: new Date()
				},
				{ upsert: true }
			)

			const mode = isExact ? 'Exata' : 'Parcial'
			const text = `${quote} ✅ Monitoramento da palavra-chave "${keyword}" (${mode}) ativado com sucesso! Você receberá alertas no privado.`
			await vkApi.board.createComment({ topicId, cmmId, text })
		} catch (error) {
			console.error('Erro no comando monitorar:', error)
			const text = `${quote} ❌ Ocorreu um erro ao tentar salvar o monitoramento.`
			await vkApi.board.createComment({ topicId, cmmId, text })
		}
	},

	async desmonitorarKeyword(data: ICommandsInput): Promise<void> {
		const { topicId, cmmId, postId, userId, message } = data
		const quote = await this.getQuoteString(postId, userId)
		
		const keyword = message
			.replaceAll(/!(desmonitorar|dmon|monitorar|mon)/gm, '')
			.replaceAll(/-[a-z]/gm, '')
			.trim()

		if (!keyword) {
			const text = `${quote} ⚠️ Por favor, insira o termo que deseja desmonitorar. Exemplo: !desmonitorar ingresso`
			await vkApi.board.createComment({ topicId, cmmId, text })
			return
		}

		try {
			const result = await Keyword.deleteOne({
				userId,
				cmmId,
				keyword: new RegExp('^' + this.escapeRegExp(keyword) + '$', 'i')
			})

			if (result.deletedCount === 0) {
				const text = `${quote} ⚠️ Você não está monitorando a palavra-chave "${keyword}".`
				await vkApi.board.createComment({ topicId, cmmId, text })
			} else {
				const text = `${quote} ❌ Monitoramento da palavra-chave "${keyword}" removido.`
				await vkApi.board.createComment({ topicId, cmmId, text })
			}
		} catch (error) {
			console.error('Erro no comando desmonitorar:', error)
			const text = `${quote} ❌ Ocorreu um erro ao tentar remover o monitoramento.`
			await vkApi.board.createComment({ topicId, cmmId, text })
		}
	},

	async listarKeywords(data: ICommandsInput): Promise<void> {
		const { topicId, cmmId, postId, userId } = data
		const quote = await this.getQuoteString(postId, userId)

		try {
			const userKeywords = await Keyword.find({ userId, cmmId }).sort({ createdAt: 1 })

			if (userKeywords.length === 0) {
				const text = `${quote} Você não tem nenhuma palavra-chave cadastrada para monitoramento nesta comunidade.`
				await vkApi.board.createComment({ topicId, cmmId, text })
				return
			}

			const lines = userKeywords.map((kw, idx) => {
				const type = kw.isExact ? 'Exata' : 'Parcial'
				return `${idx + 1}. "${kw.keyword}" (${type})`
			})

			const text = `${quote} Suas palavras-chave monitoradas nesta comunidade:\n\n${lines.join('\n')}\n\nUse !desmonitorar <termo> para remover.`
			await vkApi.board.createComment({ topicId, cmmId, text })
		} catch (error) {
			console.error('Erro ao listar palavras-chave:', error)
			const text = `${quote} ❌ Ocorreu um erro ao tentar buscar suas palavras-chave.`
			await vkApi.board.createComment({ topicId, cmmId, text })
		}
	},

	escapeRegExp(string: string): string {
		return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
	},

	async scanKeywords(cmmId: number, topicId: number, authorId: number, postId: number, text: string): Promise<void> {
		try {
			const botId = parseInt(process.env.BOT_ID || '0')
			if (authorId === botId || authorId === -botId || authorId === -cmmId) return
			if (text?.trim().startsWith('!')) return
			if (!text?.trim()) return

			// 1. Fetch all keywords for this cmmId, excluding the author's own keywords
			const keywords = await Keyword.find({ cmmId, userId: { $ne: authorId } })
			if (keywords.length === 0) return

			// 2. Resolve topic title
			const topicTitle = await this.getTopicTitle(cmmId, topicId)

			// 3. Keep track of users we want to notify and the keyword that matched
			// Use a map to notify each user only once per comment, even if multiple keywords match
			const notifications = new Map<number, string>()

			for (const kw of keywords) {
				if (kw.userId === authorId) continue
				if (notifications.has(kw.userId)) continue

				let isMatch = false
				if (kw.isExact) {
					// Word boundary match that respects Portuguese characters (accents)
					const regex = new RegExp(`(?<=^|[^a-zA-Z0-9áéíóúâêôçãõàüí])` + this.escapeRegExp(kw.keyword) + `(?=$|[^a-zA-Z0-9áéíóúâêôçãõàüí])`, 'i')
					isMatch = regex.test(text)
				} else {
					isMatch = text.toLowerCase().includes(kw.keyword.toLowerCase())
				}

				if (isMatch) {
					notifications.set(kw.userId, kw.keyword)
				}
			}

			// 4. Send VK DM to matching users concurrently
			if (notifications.size > 0) {
				const promises = Array.from(notifications.entries()).map(async ([userId, kw]) => {
					try {
						// Clean preview comment to avoid huge DMs
						const commentSnippet = text.length > 200 ? text.substring(0, 200) + '...' : text
						const notificationMsg = `🔔 *Alerta de Palavra-chave* 🔔
A palavra "${kw}" foi mencionada no tópico:
👉 "${topicTitle}"

Comentário: "${commentSnippet}"
Link: https://vk.com/topic-${cmmId}_${topicId}?post=${postId}`

						await vkApi.messages.send({ peerId: userId, message: notificationMsg })
					} catch (err) {
						// Log error but keep processing others
						console.error(`Erro ao notificar usuário ${userId} para keyword "${kw}":`, err)
					}
				})

				await Promise.all(promises)
			}
		} catch (error) {
			console.error('Erro ao escanear palavras-chave:', error)
		}
	},
}
