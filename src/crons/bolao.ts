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

			for (const cmmId of cmms) {
				// Find the last round created in the database for this community and championship
				const lastRound = await BolaoRound.findOne({ cmmId, championshipId }).sort({ roundNumber: -1 })
				
				let nextRoundNumber = 1
				
				if (lastRound) {
					nextRoundNumber = lastRound.roundNumber + 1
				} else {
					// Bootstrap: If no rounds exist yet, detect from today's calendar
					const calendarGames = await cbfApi.getGames()
					const brasileiroGames = calendarGames.jogos?.['Campeonato Brasileiro']
					const serieAGames = brasileiroGames?.['Série A'] || []
					
					if (serieAGames.length > 0) {
						const activeRound = parseInt(serieAGames[0].rodada)
						if (activeRound) {
							nextRoundNumber = activeRound
						}
					} else {
						console.info(`No active round found today to bootstrap community ${cmmId}. Waiting for game day.`)
						continue
					}
				}

				if (nextRoundNumber > 38) {
					console.info(`Championship ended (round ${nextRoundNumber - 1} was the last one). Skipping creation.`)
					continue
				}

				const roundId = `${cmmId}_${championshipId}_${nextRoundNumber}`
				const existingRound = await BolaoRound.findById(roundId)

				if (existingRound) {
					continue
				}

				// Fetch all games of the round
				const roundData = await cbfApi.getGamesByRound(championshipId, nextRoundNumber)
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
									time: game.hora ? game.hora.trim() : '16:00',
								})
							}
						}
					}
				}

				if (allGames.length === 0) {
					console.warn(`No games found for round ${nextRoundNumber} on CBF API`)
					continue
				}

				// Check if the round should be created (within 4 days of the earliest game)
				let earliestGameTime = Infinity
				const parseGameDateTime = (dStr: string, tStr: string): Date => {
					const [day, month, year] = dStr.trim().split('/').map(Number)
					let hour = 16
					let minute = 0
					if (tStr && tStr.includes(':')) {
						const parts = tStr.trim().split(':').map(Number)
						if (!isNaN(parts[0])) hour = parts[0]
						if (!isNaN(parts[1])) minute = parts[1]
					}
					const pad = (num: number) => String(num).padStart(2, '0')
					return new Date(`${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00-03:00`)
				}

				for (const game of allGames) {
					const gTime = parseGameDateTime(game.date, game.time).getTime()
					if (gTime < earliestGameTime) {
						earliestGameTime = gTime
					}
				}

				const timeUntilFirstGame = earliestGameTime - Date.now()
				const fourDaysInMs = 4 * 24 * 60 * 60 * 1000

				// Create the round if it's within 4 days of starting
				if (timeUntilFirstGame > fourDaysInMs) {
					console.info(`Round ${nextRoundNumber} is still too far in the future (${Math.round(timeUntilFirstGame / (24*60*60*1000))} days left). Skipping creation.`)
					continue
				}

				console.info(`Creating new Bolao topic for round ${nextRoundNumber} in community ${cmmId}`)

				// Format the topic title and description
				const title = `⚽ [BOLÃO] Campeonato Brasileiro - Série A - Rodada ${nextRoundNumber} ⚽`
				let text = `Olá, pessoal! Bem-vindos ao Bolão da Rodada ${nextRoundNumber}! 🏆\n\nEscreva seus palpites respondendo a este tópico no formato exato:\n[Número do Jogo]. GolsMandante x GolsVisitante\n\nJogos da Rodada ${nextRoundNumber}:\n`

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
					roundNumber: nextRoundNumber,
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
