import Member from '@models/Member'
import Comment from '@models/Comment'
import Topic from '@models/Topic'
import vkApi from '@api/vk'
import bot from '@utils/bot'
import generalFncs from '@utils/general'
import axios from 'axios'

const getWeeklyMuralText = async (
	cmmId: number,
	topPosterData: { userId: number; posts: number; name: string } | null,
	topLikesData: { userId: number; likes: number; name: string } | null,
	topCreatorData: { userId: number; topics: number; name: string } | null,
	topTopicData: { topicId: number; title: string; count: number } | null,
	topCommentData: { userId: number; text: string; likes: number; name: string; topicId: number; commentId: number } | null
): Promise<string> => {
	const geminiKey = process.env.GEMINI_API_KEY
	if (!geminiKey) {
		throw new Error('Chave de API do Gemini (GEMINI_API_KEY) não configurada.')
	}

	const statsText = `Estatísticas Semanais Coletadas:
- Tagarela da Semana (Mais posts): ${topPosterData ? `[id${topPosterData.userId}|${topPosterData.name}] com ${topPosterData.posts} posts` : 'Nenhum'}
- Mito do Engajamento (Mais likes recebidos): ${topLikesData ? `[id${topLikesData.userId}|${topLikesData.name}] com ${topLikesData.likes} likes` : 'Nenhum'}
- Criador da Rodada (Mais tópicos criados): ${topCreatorData ? `[id${topCreatorData.userId}|${topCreatorData.name}] com ${topCreatorData.topics} tópicos` : 'Nenhum'}
- Tópico Mais Badalado: ${topTopicData ? `"${topTopicData.title}" com ${topTopicData.count} comentários na semana` : 'Nenhum'}
- Pérola da Semana (Comentário mais curtido): ${topCommentData ? `[id${topCommentData.userId}|${topCommentData.name}] com ${topCommentData.likes} likes no comentário: "${topCommentData.text}"` : 'Nenhum'}`

	const systemInstruction = `Você é o anfitrião e moderador de nossa comunidade de futebol e Cartola FC. 
Você é responsável por redigir o "Mural de Destaques da Semana" de forma muito carismática, alegre, entusiasmada e com pitadas de humor futebolístico.
Escreva um post no estilo de blog esportivo cobrindo cada um dos destaques informados nas estatísticas.
Importante:
- Mantenha a menção exata aos membros usando a tag do VK: [idXXXXX|Nome do Membro]. Não altere o ID ou a formatação [id|Nome].
- Mencione os links para os tópicos de futebol usando a formatação exata que forneceremos no post.
- Faça brincadeiras saudáveis sobre quem postou muito ou quem recebeu muitos likes.
A resposta deve ser em português e ter de 3 a 5 parágrafos médios.`

	const prompt = `${statsText}

Escreva o Mural de Destaques Semanal:`

	try {
		const geminiResponse = await axios.post(
			`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${geminiKey}`,
			{
				contents: [{ parts: [{ text: prompt }] }],
				systemInstruction: { parts: [{ text: systemInstruction }] }
			}
		)

		const generatedText = geminiResponse.data?.candidates?.[0]?.content?.parts?.[0]?.text
		if (!generatedText) {
			throw new Error('Falha ao gerar texto do mural pela IA.')
		}

		// Build final formatted text
		let finalDoc = `🏆 *MURAL DE DESTAQUES DA SEMANA* 🏆\n\n${generatedText.trim()}\n\n`
		
		finalDoc += `🔗 *Links úteis e referências:*`
		if (topTopicData) {
			finalDoc += `\n👉 Tópico mais comentado: https://vk.com/topic-${cmmId}_${topTopicData.topicId}`
		}
		if (topCommentData) {
			finalDoc += `\n👉 Comentário destaque (Pérola): https://vk.com/topic-${cmmId}_${topCommentData.topicId}?post=${topCommentData.commentId}`
		}

		return finalDoc
	} catch (error) {
		console.error('Erro ao gerar mural com Gemini:', error)
		// Fallback standard text
		let fallback = `🏆 *MURAL DE DESTAQUES DA SEMANA* 🏆\n\nAqui estão os membros em destaque nos últimos 7 dias na comunidade:\n\n`
		if (topPosterData) {
			fallback += `💬 *Tagarela da Semana*: [id${topPosterData.userId}|${topPosterData.name}] escreveu ${topPosterData.posts} postagens!\n`
		}
		if (topLikesData) {
			fallback += `❤️ *Mito do Engajamento*: [id${topLikesData.userId}|${topLikesData.name}] recebeu um total de ${topLikesData.likes} curtidas!\n`
		}
		if (topCreatorData) {
			fallback += `📝 *Criador da Rodada*: [id${topCreatorData.userId}|${topCreatorData.name}] criou ${topCreatorData.topics} novos tópicos!\n`
		}
		if (topTopicData) {
			fallback += `🔥 *Tópico mais Badalado*: "${topTopicData.title}" com ${topTopicData.count} comentários!\n`
		}
		if (topCommentData) {
			fallback += `⭐ *Pérola da Semana*: [id${topCommentData.userId}|${topCommentData.name}] com ${topCommentData.likes} likes no comentário: "${topCommentData.text}"\n`
		}
		return fallback
	}
}

const getUserName = async (userId: number): Promise<string> => {
	try {
		const cached = await Member.findOne({ userId })
		if (cached && cached.firstName) {
			return `${cached.firstName} ${cached.lastName || ''}`.trim()
		}
		const userData = await vkApi.users.get({ userIds: [userId] })
		if (userData?.[0]) {
			await Member.updateMany(
				{ userId },
				{ $set: { firstName: userData[0].first_name, lastName: userData[0].last_name } }
			).catch(() => {})
			return `${userData[0].first_name} ${userData[0].last_name || ''}`.trim()
		}
		return `Membro ${userId}`
	} catch (err) {
		return `Membro ${userId}`
	}
}

export default {
	async createWeeklyMural(): Promise<void> {
		console.info('Triggering Weekly Mural creation')
		try {
			const cmms = await Member.distinct('cmmId')

			for (const cmmId of cmms) {
				const startOfWeek = new Date()
				startOfWeek.setDate(startOfWeek.getDate() - 7)

				// 1. Tagarela da Semana
				const initialDate = process.env.INITIAL_DATE ? new Date(process.env.INITIAL_DATE) : new Date()
				const currentWeek = generalFncs.weeksBetween(initialDate, new Date())
				const lastWeek = currentWeek - 1

				const members = await Member.find({ cmmId })
				const botId = parseInt(process.env.BOT_ID || process.env.VK_BOT_ID || '0')
				const humanMembers = members.filter((m) => m.userId !== botId && m.userId > 0)
				
				const sortedPoster = [...humanMembers].sort((a, b) => {
					const aPosts = a.posts[lastWeek] || 0
					const bPosts = b.posts[lastWeek] || 0
					return bPosts - aPosts
				})

				const topPoster = sortedPoster[0] && (sortedPoster[0].posts[lastWeek] || 0) > 0 ? sortedPoster[0] : null
				let topPosterData = null
				if (topPoster) {
					const name = await getUserName(topPoster.userId)
					topPosterData = {
						userId: topPoster.userId,
						posts: topPoster.posts[lastWeek],
						name
					}
				}

				// 2. Mito do Engajamento (Likes recebidos)
				const topLikesAggregation = await Comment.aggregate([
					{ $match: { cmmId, userId: { $ne: botId }, createdAt: { $gte: startOfWeek } } },
					{ $group: { _id: '$userId', totalLikes: { $sum: '$likes' } } },
					{ $sort: { totalLikes: -1 } },
					{ $limit: 1 }
				])
				let topLikesData = null
				if (topLikesAggregation.length > 0 && topLikesAggregation[0].totalLikes > 0) {
					const uid = topLikesAggregation[0]._id
					const name = await getUserName(uid)
					topLikesData = {
						userId: uid,
						likes: topLikesAggregation[0].totalLikes,
						name
					}
				}

				// 3. Criador da Rodada (Novos tópicos)
				const topCreatorsAggregation = await Topic.aggregate([
					{ $match: { cmmId, created_by: { $ne: botId, $gt: 0 }, createdAt: { $gte: startOfWeek } } },
					{ $group: { _id: '$created_by', totalTopics: { $sum: 1 } } },
					{ $sort: { totalTopics: -1 } },
					{ $limit: 1 }
				])
				let topCreatorData = null
				if (topCreatorsAggregation.length > 0) {
					const uid = topCreatorsAggregation[0]._id
					const name = await getUserName(uid)
					topCreatorData = {
						userId: uid,
						topics: topCreatorsAggregation[0].totalTopics,
						name
					}
				}

				// 4. Tópico Mais Badalado
				const topTopicsAggregation = await Comment.aggregate([
					{ $match: { cmmId, createdAt: { $gte: startOfWeek } } },
					{ $group: { _id: '$topicId', count: { $sum: 1 } } },
					{ $sort: { count: -1 } },
					{ $limit: 1 }
				])
				let topTopicData = null
				if (topTopicsAggregation.length > 0) {
					const tid = topTopicsAggregation[0]._id
					try {
						const title = await bot.getTopicTitle(cmmId, tid)
						topTopicData = {
							topicId: tid,
							title,
							count: topTopicsAggregation[0].count
						}
					} catch (e) {
						topTopicData = {
							topicId: tid,
							title: `Tópico #${tid}`,
							count: topTopicsAggregation[0].count
						}
					}
				}

				// 5. Pérola da Semana (Comentário mais curtido)
				const topComment = await Comment.findOne({
					cmmId,
					userId: { $ne: botId, $gt: 0 },
					createdAt: { $gte: startOfWeek }
				}).sort({ likes: -1 })

				let topCommentData = null
				if (topComment && topComment.likes > 0) {
					const name = await getUserName(topComment.userId)
					let text = ''
					try {
						const commentsResponse = await vkApi.board.getComments({
							groupId: cmmId,
							topicId: topComment.topicId,
							startCommentId: topComment.commentId,
							count: 1
						})
						text = commentsResponse?.items?.[0]?.text || ''
					} catch (e) {
						text = '(Comentário indisponível)'
					}
					topCommentData = {
						userId: topComment.userId,
						text,
						likes: topComment.likes,
						name,
						topicId: topComment.topicId,
						commentId: topComment.commentId
					}
				}

				// If we don't have enough statistics, don't post empty mural
				if (!topPosterData && !topLikesData && !topCreatorData) {
					console.info(`No highlights to post in community ${cmmId}`)
					continue
				}

				// Award Badges to highlighted members
				if (topPosterData) {
					await Member.updateOne(
						{ cmmId, userId: topPosterData.userId },
						{ $addToSet: { customBadges: '💬 Tagarela de Ouro (Membro com mais posts na semana)' } }
					).catch(() => {})
				}
				if (topCommentData) {
					await Member.updateOne(
						{ cmmId, userId: topCommentData.userId },
						{ $addToSet: { customBadges: '❤️ Amado pela Massa (Comentário mais curtido da semana)' } }
					).catch(() => {})
				}

				const eliteUserIds = Array.from(new Set([
					topPosterData?.userId,
					topLikesData?.userId,
					topCreatorData?.userId,
					topCommentData?.userId
				].filter((id): id is number => !!id)))

				for (const uid of eliteUserIds) {
					await Member.updateOne(
						{ cmmId, userId: uid },
						{ $addToSet: { customBadges: '👑 Membro de Elite (Destaque do Mural Semanal)' } }
					).catch(() => {})
				}

				// Generate text and create topic
				const muralText = await getWeeklyMuralText(
					cmmId,
					topPosterData,
					topLikesData,
					topCreatorData,
					topTopicData,
					topCommentData
				)

				const todayStr = new Date().toLocaleDateString('pt-BR')
				await vkApi.board.addTopic({
					cmmId,
					title: `🏆 Mural de Destaques da Semana - ${todayStr}`,
					text: muralText
				})

				console.info(`Weekly Mural topic posted successfully for cmm ${cmmId}`)
			}
		} catch (error) {
			console.error('Erro ao gerar mural semanal de destaques:', error)
		}
	}
}
