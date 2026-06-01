import Member from '@models/Member'
import BolaoRound from '@models/BolaoRound'
import Bet from '@models/Bet'
import cbfApi from '@api/cbf'
import vkApi from '@api/vk'

interface IBolaoGame {
	id_jogo: string
	homeTeam: string
	awayTeam: string
	date: string
	time: string
}

export default {
	async checkAndCreateNextRound(): Promise<void> {
		console.info('Checking for next bolao round to create')
		try {
			const championshipId = process.env.CHAMPIONSHIP_ID ? parseInt(process.env.CHAMPIONSHIP_ID) : 1260611
			const cmms = await Member.distinct('cmmId')

			if (cmms.length === 0) return

			// Fetch today's calendar matches to detect current active round
			const calendarGames = await cbfApi.getGames()
			const brasileiroGames = calendarGames.jogos?.['Campeonato Brasileiro']
			const serieAGames = brasileiroGames?.['Série A'] || []

			if (serieAGames.length === 0) {
				console.info('No Serie A games today in calendar to detect round')
				return
			}

			const roundNumber = parseInt(serieAGames[0].rodada)
			if (!roundNumber) return

			for (const cmmId of cmms) {
				const roundId = `${cmmId}_${championshipId}_${roundNumber}`
				const existingRound = await BolaoRound.findById(roundId)

				if (existingRound) {
					continue
				}

				console.info(`Creating new Bolao topic for round ${roundNumber} in community ${cmmId}`)

				// Fetch all games of the round
				const roundData = await cbfApi.getGamesByRound(championshipId, roundNumber)
				const allGames: IBolaoGame[] = []

				if (roundData?.jogos) {
					for (const grupo of roundData.jogos) {
						if (grupo?.jogo) {
							for (const game of grupo.jogo) {
								allGames.push({
									id_jogo: game.id_jogo,
									homeTeam: game.mandante.nome,
									awayTeam: game.visitante.nome,
									date: game.data.trim(),
									time: game.hora.trim(),
								})
							}
						}
					}
				}

				if (allGames.length === 0) {
					console.warn(`No games found for round ${roundNumber} on CBF API`)
					continue
				}

				// Format the topic title and description
				const title = `⚽ [BOLÃO] Campeonato Brasileiro - Série A - Rodada ${roundNumber} ⚽`
				let text = `Olá, pessoal! Bem-vindos ao Bolão da Rodada ${roundNumber}! 🏆\n\nEscreva seus palpites respondendo a este tópico no formato exato:\n[Número do Jogo]. GolsMandante x GolsVisitante\n\nJogos da Rodada ${roundNumber}:\n`

				allGames.forEach((game, idx) => {
					text += `${idx + 1}. ${game.homeTeam} x ${game.awayTeam} (${game.date} ${game.time})\n`
				})

				text += '\n⚠️ ATENÇÃO: Seu comentário deve conter todos os seus palpites. Palpites enviados ou modificados após o início de cada jogo serão desconsiderados!'

				// Create VK Topic
				const topicId = await vkApi.board.addTopic({
					cmmId,
					title,
					text,
				})

				// Save the round in database
				await BolaoRound.create({
					_id: roundId,
					cmmId,
					championshipId,
					championshipName: 'Campeonato Brasileiro',
					roundNumber,
					topicId,
					games: allGames,
					processed: false,
				})

				console.info(`Bolao topic created successfully with ID ${topicId}`)
			}
		} catch (error) {
			console.error('Erro ao verificar/criar nova rodada do bolão:', error)
		}
	},

	async resolveRoundBets(): Promise<void> {
		console.info('Resolving bolao bets')
		try {
			const openRounds = await BolaoRound.find({ processed: false })

			for (const round of openRounds) {
				try {
					const roundData = await cbfApi.getGamesByRound(round.championshipId, round.roundNumber)
					if (!roundData?.jogos) continue

					const apiGamesMap = new Map<string, any>()
					for (const grupo of roundData.jogos) {
						if (grupo?.jogo) {
							for (const game of grupo.jogo) {
								apiGamesMap.set(game.id_jogo, game)
							}
						}
					}

					let allFinished = true
					const finishedGames = new Map<string, { homeScore: number; awayScore: number }>()

					for (const game of round.games) {
						const apiGame = apiGamesMap.get(game.id_jogo)
						if (!apiGame || apiGame.mandante.gols === null || apiGame.visitante.gols === null) {
							allFinished = false
							continue
						}

						const [day, month, year] = game.date.split('/').map(Number)
						const [hour, minute] = game.time.split(':').map(Number)
						const pad = (num: number) => String(num).padStart(2, '0')
						const gameDate = new Date(`${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00-03:00`)

						// Game is finished if current time is after start time + 2.5 hours
						if (Date.now() < gameDate.getTime() + 150 * 60 * 1000) {
							allFinished = false
							continue
						}

						finishedGames.set(game.id_jogo, {
							homeScore: parseInt(apiGame.mandante.gols),
							awayScore: parseInt(apiGame.visitante.gols),
						})
					}

					// Process bets for finished games
					for (const [gameId, result] of finishedGames.entries()) {
						const bets = await Bet.find({ gameId, processed: false })
						for (const bet of bets) {
							let points = 0
							const isExact = bet.homeScore === result.homeScore && bet.awayScore === result.awayScore
							if (isExact) {
								points = 5
							} else {
								const predSign = Math.sign(bet.homeScore - bet.awayScore)
								const actualSign = Math.sign(result.homeScore - result.awayScore)
								if (predSign === actualSign) {
									points = 3
								}
							}

							bet.points = points
							bet.processed = true
							await bet.save()
						}
					}

					// If all games of the round are resolved, close the round
					if (allFinished && round.games.length > 0) {
						round.processed = true
						await round.save()

						const resultsLines = round.games.map((g) => {
							const apiGame = apiGamesMap.get(g.id_jogo)
							return `- ${g.homeTeam} ${apiGame.mandante.gols} x ${apiGame.visitante.gols} ${g.awayTeam}`
						})

						const closingText = `🏆 O Bolão da Rodada ${round.roundNumber} foi finalizado! 🏆\n\nResultados reais:\n${resultsLines.join('\n')}\n\nObrigado a todos por participar! Digite !ranking no fórum para ver o ranking atualizado.`

						await vkApi.board.createComment({
							cmmId: round.cmmId,
							topicId: round.topicId,
							text: closingText,
						})

						console.info(`Bolao round ${round.roundNumber} for community ${round.cmmId} fully resolved`)
					}
				} catch (innerError) {
					console.error(`Erro ao processar rodada ${round.roundNumber} do bolão:`, innerError)
				}
			}
		} catch (error) {
			console.error('Erro ao resolver palpites do bolão:', error)
		}
	},
}
