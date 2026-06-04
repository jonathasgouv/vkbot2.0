import Member from '@models/Member'
import Bet from '@models/Bet'
import BolaoRound from '@models/BolaoRound'
import vkApi from '@api/vk'
import axios from 'axios'

const getResenhaText = async (
	roundNumber: number,
	mitoData: { userId: number; name: string; score: number } | null,
	peFrioData: { userId: number; name: string; score: number } | null,
	averageScore: string,
	bestGameData: { homeTeam: string; awayTeam: string; hits: number } | null
): Promise<string> => {
	const geminiKey = process.env.GEMINI_API_KEY
	if (!geminiKey) {
		throw new Error('Chave de API do Gemini (GEMINI_API_KEY) não configurada.')
	}

	const statsText = `Estatísticas do Bolão da Rodada ${roundNumber}:
- Mito da Rodada (Maior pontuação): ${mitoData ? `[id${mitoData.userId}|${mitoData.name}] com ${mitoData.score} pontos` : 'Nenhum'}
- Pé Frio da Rodada (Menor pontuação): ${peFrioData ? `[id${peFrioData.userId}|${peFrioData.name}] com ${peFrioData.score} pontos` : 'Nenhum'}
- Média de pontuação geral dos participantes: ${averageScore} pontos
- Jogo com mais acertos de placar exato: ${bestGameData ? `"${bestGameData.homeTeam} x ${bestGameData.awayTeam}" com ${bestGameData.hits} acertos exatos` : 'Nenhum'}`

	const systemInstruction = `Você é um jornalista esportivo bem-humorado, fanático por futebol e analista oficial do nosso Bolão da comunidade.
Escreva a "Resenha da Rodada ${roundNumber}" em português (de 3 a 4 parágrafos) analisando o desempenho dos membros no bolão.
Destaque o "Mito da Rodada" coroando-o pelo feito, e brinque com o "Pé Frio da Rodada" de forma saudável. 
Analise se a média de pontos geral foi alta ou baixa para os padrões do futebol brasileiro.
Importante:
- Mantenha a menção exata aos membros usando a tag do VK: [idXXXXX|Nome do Membro]. Não altere o ID ou a formatação [id|Nome].`

	const prompt = `${statsText}

Escreva a Resenha da Rodada:`

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
			throw new Error('Falha ao gerar texto da resenha pela IA.')
		}

		return `⚽ *RESENHA DA RODADA ${roundNumber} - BOLÃO* ⚽\n\n${generatedText.trim()}`
	} catch (error) {
		console.error('Erro ao gerar resenha com Gemini:', error)
		// Fallback standard text
		let fallback = `⚽ *RESENHA DA RODADA ${roundNumber} - BOLÃO* ⚽\n\nAqui está a análise da rodada finalizada do bolão:\n\n`
		if (mitoData) {
			fallback += `🏆 *Mito da Rodada*: [id${mitoData.userId}|${mitoData.name}] mitou com ${mitoData.score} pontos!\n`
		}
		if (peFrioData) {
			fallback += `🤡 *Pé Frio da Rodada*: [id${peFrioData.userId}|${peFrioData.name}] ficou na lanterna com ${peFrioData.score} pontos.\n`
		}
		fallback += `📊 *Média Geral*: A pontuação média da rodada foi de ${averageScore} pontos por participante.\n`
		if (bestGameData) {
			fallback += `🎯 *Pontaria Afiada*: O jogo "${bestGameData.homeTeam} x ${bestGameData.awayTeam}" teve o maior número de placares exatos acertados (${bestGameData.hits}).\n`
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
	async createRoundResenha(): Promise<void> {
		console.info('Triggering Resenha da Rodada creation')
		try {
			const cmms = await Member.distinct('cmmId')

			for (const cmmId of cmms) {
				// Find the latest resolved Brasileirão round for this cmm
				const round = await BolaoRound.findOne({
					cmmId,
					championshipName: 'Campeonato Brasileiro',
					processed: true
				}).sort({ roundNumber: -1 })

				if (!round) {
					console.info(`No processed round found for cmmId ${cmmId} to draft resenha.`)
					continue
				}

				// Aggregate bets points for this specific round
				const botId = parseInt(process.env.BOT_ID || process.env.VK_BOT_ID || '0')
				const betsAggregation = await Bet.aggregate([
					{ $match: { roundId: round._id, processed: true, userId: { $ne: botId } } },
					{ $group: { _id: '$userId', totalPoints: { $sum: '$points' } } },
					{ $sort: { totalPoints: -1 } }
				])

				if (betsAggregation.length === 0) {
					console.info(`No bets registered for round ${round.roundNumber} in cmmId ${cmmId}`)
					continue
				}

				// Calculate Mito (Max Points)
				const topBet = betsAggregation[0]
				const mitoName = await getUserName(topBet._id)
				const mitoData = {
					userId: topBet._id,
					name: mitoName,
					score: topBet.totalPoints
				}

				// Calculate Pé Frio (Min Points)
				const bottomBet = betsAggregation[betsAggregation.length - 1]
				const peFrioName = await getUserName(bottomBet._id)
				const peFrioData = {
					userId: bottomBet._id,
					name: peFrioName,
					score: bottomBet.totalPoints
				}

				// Calculate average points
				const sumPoints = betsAggregation.reduce((acc, curr) => acc + curr.totalPoints, 0)
				const averageScore = (sumPoints / betsAggregation.length).toFixed(1)

				// Calculate game with most exact score hits (points == 5)
				const exactHitsAggregation = await Bet.aggregate([
					{ $match: { roundId: round._id, points: 5 } },
					{ $group: { _id: '$gameId', hits: { $sum: 1 } } },
					{ $sort: { hits: -1 } },
					{ $limit: 1 }
				])

				let bestGameData = null
				if (exactHitsAggregation.length > 0 && exactHitsAggregation[0].hits > 0) {
					const gid = exactHitsAggregation[0]._id
					const gameInfo = round.games.find((g) => g.id_jogo === gid)
					if (gameInfo) {
						bestGameData = {
							homeTeam: gameInfo.homeTeam,
							awayTeam: gameInfo.awayTeam,
							hits: exactHitsAggregation[0].hits
						}
					}
				}

				// Award Badges
				// 1. Mito da Rodada
				await Member.updateOne(
					{ cmmId, userId: mitoData.userId },
					{ $addToSet: { customBadges: '🏆 Mito da Rodada (Fez mais pontos na rodada do Bolão)' } }
				).catch(() => {})

				// 2. Pé Frio da Rodada
				await Member.updateOne(
					{ cmmId, userId: peFrioData.userId },
					{ $addToSet: { customBadges: '🤡 Pé Frio (Ficou na lanterna da rodada do Bolão)' } }
				).catch(() => {})

				const resenhaText = await getResenhaText(
					round.roundNumber,
					mitoData,
					peFrioData,
					averageScore,
					bestGameData
				)

				// Create Topic
				await vkApi.board.addTopic({
					cmmId,
					title: `OFF -⚽ Resenha da Rodada - Rodada ${round.roundNumber} (Bolão)`,
					text: resenhaText
				})

				console.info(`Resenha da Rodada topic created successfully for round ${round.roundNumber} in cmm ${cmmId}`)
			}
		} catch (error) {
			console.error('Erro ao gerar resenha da rodada do bolão:', error)
		}
	}
}
