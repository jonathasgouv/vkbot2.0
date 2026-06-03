import Member from '@models/Member'
import BolaoRound from '@models/BolaoRound'
import Bet from '@models/Bet'
import CopaMatch from '@models/CopaMatch'
import geApi from '@api/ge'
import vkApi from '@api/vk'
import { ICopaMatch } from '@appTypes/copa'

const knockoutPhases = [
	'segunda-fase-copa-do-mundo-2026',
	'oitavas-copa-do-mundo-2026',
	'quartas-copa-do-mundo-2026',
	'semifinal-copa-do-mundo-2026',
	'terceiro-copa-do-mundo-2026',
	'final-copa-do-mundo-2026'
]

async function seedWorldCupCalendar(): Promise<void> {
	console.info('Seeding World Cup 2026 Calendar from GloboEsporte API...')
	try {
		// 1. Group Stage
		for (let groupId = 5811; groupId <= 5822; groupId++) {
			for (let roundNumber = 1; roundNumber <= 3; roundNumber++) {
				try {
					const games = await geApi.getGroupStageGames(groupId, roundNumber)
					for (const game of games) {
						if (!game.id) continue
						
						const dateStr = game.data_realizacao.split('T')[0]
						await CopaMatch.updateOne(
							{ id: game.id },
							{
								$set: {
									id: game.id,
									phaseId: 'fase-de-grupos-copa-do-mundo-2026',
									date: new Date(game.data_realizacao),
									dateStr,
									homeTeam: game.equipes.mandante.nome_popular,
									awayTeam: game.equipes.visitante.nome_popular,
									homeFlag: game.equipes.mandante.escudo,
									awayFlag: game.equipes.visitante.escudo,
									groupId,
									roundNumber,
									homeScore: game.placar_oficial_mandante,
									awayScore: game.placar_oficial_visitante,
									finished: game.placar_oficial_mandante !== null && game.placar_oficial_visitante !== null
								}
							},
							{ upsert: true }
						)
					}
					// Small delay to respect rate limit
					await new Promise(resolve => setTimeout(resolve, 50))
				} catch (err: any) {
					console.error(`Error seeding group ${groupId} round ${roundNumber}:`, err.message)
				}
			}
		}

		// 2. Knockout Stage Placeholders
		for (const phaseId of knockoutPhases) {
			try {
				const games = await geApi.getKnockoutGames(phaseId)
				for (const game of games) {
					const dateStr = game.data_realizacao // YYYY-MM-DD
					const time = game.hora_realizacao || '16:00:00'
					const date = new Date(`${dateStr}T${time}-03:00`)
					
					const homeTeam = game.equipes.mandante.nome_popular || game.equipes.mandante.label || 'A definir'
					const awayTeam = game.equipes.visitante.nome_popular || game.equipes.visitante.label || 'A definir'
					
					const filter = game.id ? { id: game.id } : { keyName: game.keyName, phaseId }
					
					await CopaMatch.updateOne(
						filter,
						{
							$set: {
								id: game.id || null,
								keyName: game.keyName,
								phaseId,
								date,
								dateStr,
								homeTeam,
								awayTeam,
								homeFlag: game.equipes.mandante.escudo || 'https://vk.com/images/camera_100.png',
								awayFlag: game.equipes.visitante.escudo || 'https://vk.com/images/camera_100.png',
								homeScore: game.placar_oficial_mandante,
								awayScore: game.placar_oficial_visitante,
								finished: game.placar_oficial_mandante !== null && game.placar_oficial_visitante !== null
							}
						},
						{ upsert: true }
					)
				}
				await new Promise(resolve => setTimeout(resolve, 50))
			} catch (err: any) {
				console.error(`Error seeding knockout phase ${phaseId}:`, err.message)
			}
		}
		console.info('World Cup 2026 Calendar seeded successfully!')
	} catch (err: any) {
		console.error('Fatal error seeding World Cup calendar:', err.message)
	}
}

async function syncKnockoutBrackets(): Promise<void> {
	console.info('Syncing World Cup 2026 Knockout Brackets from GE...')
	for (const phaseId of knockoutPhases) {
		try {
			const games = await geApi.getKnockoutGames(phaseId)
			for (const game of games) {
				const homeTeam = game.equipes.mandante.nome_popular || game.equipes.mandante.label || 'A definir'
				const awayTeam = game.equipes.visitante.nome_popular || game.equipes.visitante.label || 'A definir'
				const dateStr = game.data_realizacao
				const time = game.hora_realizacao || '16:00:00'
				const date = new Date(`${dateStr}T${time}-03:00`)
				
				const filter = game.id ? { id: game.id } : { keyName: game.keyName, phaseId }
				
				await CopaMatch.updateOne(
					filter,
					{
						$set: {
							id: game.id || null,
							keyName: game.keyName,
							phaseId,
							date,
							dateStr,
							homeTeam,
							awayTeam,
							homeFlag: game.equipes.mandante.escudo || 'https://vk.com/images/camera_100.png',
							awayFlag: game.equipes.visitante.escudo || 'https://vk.com/images/camera_100.png',
							homeScore: game.placar_oficial_mandante,
							awayScore: game.placar_oficial_visitante,
							finished: game.placar_oficial_mandante !== null && game.placar_oficial_visitante !== null
						}
					}
				)
			}
		} catch (err: any) {
			console.error(`Error syncing knockout phase ${phaseId}:`, err.message)
		}
	}
}

export default {
	async checkAndCreateNextCopaRound(): Promise<void> {
		console.info('Checking for next World Cup Copa round to create')
		try {
			const count = await CopaMatch.countDocuments()
			if (count === 0) {
				await seedWorldCupCalendar()
			} else {
				// Always update knockout stages placeholders in case teams qualify
				await syncKnockoutBrackets()
			}

			const cmms = await Member.distinct('cmmId')
			if (cmms.length === 0) return

			// Find all unique dateStr of games in chronological order
			const matches = await CopaMatch.find().sort({ date: 1 })
			const matchesByDate = new Map<string, ICopaMatch[]>()
			for (const match of matches) {
				if (!matchesByDate.has(match.dateStr)) {
					matchesByDate.set(match.dateStr, [])
				}
				matchesByDate.get(match.dateStr)!.push(match)
			}

			const sortedDates = Array.from(matchesByDate.keys()).sort()

			for (const cmmId of cmms) {
				for (const dateStr of sortedDates) {
					const roundId = `copa_2026_${dateStr}`
					const existingRound = await BolaoRound.findById(roundId)
					if (existingRound) continue

					const dayMatches = matchesByDate.get(dateStr) || []
					if (dayMatches.length === 0) continue

					// Check start time of the first match of this day
					const earliestGame = dayMatches[0]
					const timeUntilFirstGame = earliestGame.date.getTime() - Date.now()
					const threeDaysInMs = 3 * 24 * 60 * 60 * 1000

					// Create the round if it's within 3 days of starting
					if (timeUntilFirstGame > threeDaysInMs) {
						// Since it is sorted, subsequent dates are also in the future
						break
					}

					// Calculate sequential Day Number from June 11, 2026
					const startDate = new Date('2026-06-11T12:00:00-03:00')
					const currentDate = new Date(`${dateStr}T12:00:00-03:00`)
					const dayNumber = Math.round((currentDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)) + 1

					console.info(`Creating new Copa Bolao topic for Day ${dayNumber} (${dateStr}) in community ${cmmId}`)

					// Format dates for VK Topic
					const [year, month, day] = dateStr.split('-')
					const formattedDate = `${day}/${month}/${year}`

					const title = `⚽ [BOLÃO COPA 2026] Copa do Mundo - Dia ${dayNumber} (${formattedDate}) ⚽`
					let text = `Olá, pessoal! Bem-vindos ao Bolão da Copa do Mundo - Dia ${dayNumber}! 🏆\n\nEscreva seus palpites respondendo a este tópico no formato exato:\n[Número do Jogo]. GolsMandante x GolsVisitante\n\nJogos do Dia ${dayNumber}:\n`

					const gamesToSave = dayMatches.map((match, idx) => {
						const [matchYear, matchMonth, matchDay] = match.dateStr.split('-')
						const matchDateFormatted = `${matchDay}/${matchMonth}/${matchYear}`
						
						// Time formatting (HH:MM)
						const hour = String(match.date.getHours()).padStart(2, '0')
						const min = String(match.date.getMinutes()).padStart(2, '0')
						const matchTimeFormatted = `${hour}:${min}`

						text += `${idx + 1}. ${match.homeTeam} x ${match.awayTeam} (${matchDateFormatted} ${matchTimeFormatted})\n`

						const gameId = match.id ? `copa_2026_${match.id}` : `copa_2026_key_${match.phaseId}_${match.keyName}`

						return {
							id_jogo: gameId,
							homeTeam: match.homeTeam,
							awayTeam: match.awayTeam,
							date: matchDateFormatted,
							time: matchTimeFormatted,
						}
					})

					text += '\n⚠️ ATENÇÃO: Seu comentário deve conter todos os seus palpites. Palpites enviados ou modificados após o início de cada jogo serão desconsiderados!'

					// Create VK Topic
					const topicId = await vkApi.board.addTopic({
						cmmId,
						title,
						text,
					})

					// Save BolaoRound in DB
					await BolaoRound.create({
						_id: roundId,
						cmmId,
						championshipId: 2026,
						championshipName: 'Copa do Mundo 2026',
						roundNumber: dayNumber,
						topicId,
						games: gamesToSave,
						processed: false,
					})

					console.info(`Copa Bolao topic created successfully with ID ${topicId}`)
				}
			}
		} catch (error) {
			console.error('Erro ao verificar/criar rodada da Copa:', error)
		}
	},

	async resolveCopaRoundBets(): Promise<void> {
		console.info('Resolving Copa World Cup bolao bets')
		try {
			const openRounds = await BolaoRound.find({ championshipName: 'Copa do Mundo 2026', processed: false })

			for (const round of openRounds) {
				try {
					// 1. Gather all groups and phases represented in the round matches
					const dateStr = round._id.replace('copa_2026_', '')
					const matches = await CopaMatch.find({ dateStr })
					
					const groupsToFetch = new Set<{ groupId: number; roundNumber: number }>()
					const phasesToFetch = new Set<string>()

					for (const m of matches) {
						if (m.groupId !== null && m.roundNumber !== null) {
							// Group stage
							groupsToFetch.add({ groupId: m.groupId, roundNumber: m.roundNumber })
						} else {
							// Knockout stage
							phasesToFetch.add(m.phaseId)
						}
					}

					// 2. Fetch latest scores from GE API
					// Group stage updates
					for (const g of groupsToFetch) {
						try {
							const apiGames = await geApi.getGroupStageGames(g.groupId, g.roundNumber)
							for (const game of apiGames) {
								if (!game.id) continue
								await CopaMatch.updateOne(
									{ id: game.id },
									{
										$set: {
											homeScore: game.placar_oficial_mandante,
											awayScore: game.placar_oficial_visitante,
											finished: game.placar_oficial_mandante !== null && game.placar_oficial_visitante !== null
										}
									}
								)
							}
						} catch (err: any) {
							console.error(`Error updating group stage scores for group ${g.groupId}:`, err.message)
						}
					}

					// Knockout stage updates
					for (const phaseId of phasesToFetch) {
						try {
							const apiGames = await geApi.getKnockoutGames(phaseId)
							for (const game of apiGames) {
								const filter = game.id ? { id: game.id } : { keyName: game.keyName, phaseId }
								await CopaMatch.updateOne(
									filter,
									{
										$set: {
											id: game.id || null,
											homeTeam: game.equipes.mandante.nome_popular || game.equipes.mandante.label || 'A definir',
											awayTeam: game.equipes.visitante.nome_popular || game.equipes.visitante.label || 'A definir',
											homeScore: game.placar_oficial_mandante,
											awayScore: game.placar_oficial_visitante,
											finished: game.placar_oficial_mandante !== null && game.placar_oficial_visitante !== null
										}
									}
								)
							}
						} catch (err: any) {
							console.error(`Error updating knockout stage scores for phase ${phaseId}:`, err.message)
						}
					}

					// 3. Resolve Bets
					const updatedMatches = await CopaMatch.find({ dateStr })
					const matchesMap = new Map<string, ICopaMatch>()
					for (const m of updatedMatches) {
						const gameKey = m.id ? `copa_2026_${m.id}` : `copa_2026_key_${m.phaseId}_${m.keyName}`
						matchesMap.set(gameKey, m)
					}

					let allFinished = true
					const finishedGames = new Map<string, { homeScore: number; awayScore: number }>()

					for (const game of round.games) {
						const match = matchesMap.get(game.id_jogo)
						if (!match || match.homeScore === null || match.awayScore === null) {
							allFinished = false
							continue
						}

						// Safe check: kickoff time + 150 minutes
						if (Date.now() < match.date.getTime() + 150 * 60 * 1000) {
							allFinished = false
							continue
						}

						finishedGames.set(game.id_jogo, {
							homeScore: match.homeScore,
							awayScore: match.awayScore,
						})
					}

					// Process point awards for finished games
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

					// Close round if all games are finished
					if (allFinished && round.games.length > 0) {
						round.processed = true
						await round.save()

						const resultsLines = round.games.map((g) => {
							const match = matchesMap.get(g.id_jogo)
							return `- ${g.homeTeam} ${match?.homeScore} x ${match?.awayScore} ${g.awayTeam}`
						})

						const closingText = `🏆 O Bolão da Copa do Mundo - Dia ${round.roundNumber} foi finalizado! 🏆\n\nResultados reais:\n${resultsLines.join('\n')}\n\nObrigado a todos por participar! Digite !rkcopa no fórum para ver o ranking da copa atualizado.`

						await vkApi.board.createComment({
							cmmId: round.cmmId,
							topicId: round.topicId,
							text: closingText,
						})

						console.info(`Copa round Day ${round.roundNumber} for community ${round.cmmId} fully resolved`)
					}
				} catch (innerError) {
					console.error(`Erro ao processar rodada Day ${round.roundNumber} da Copa:`, innerError)
				}
			}
		} catch (error) {
			console.error('Erro ao apurar palpites do bolão da Copa:', error)
		}
	}
}
