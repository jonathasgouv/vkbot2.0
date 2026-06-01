const mockGetGames = jest.fn()
const mockGetGamesByRound = jest.fn()
jest.mock('@api/cbf', () => {
	return {
		__esModule: true,
		default: {
			getGames: mockGetGames,
			getGamesByRound: mockGetGamesByRound,
		},
	}
})

const mockSend = jest.fn().mockResolvedValue(null)
const mockCreateComment = jest.fn().mockResolvedValue(null)
const mockAddTopic = jest.fn().mockResolvedValue(12345)
const mockGetUsers = jest.fn().mockResolvedValue([{ id: 300, first_name: 'John', last_name: 'Doe' }])

jest.mock('@api/vk', () => {
	return {
		__esModule: true,
		default: {
			messages: {
				send: mockSend,
			},
			board: {
				createComment: mockCreateComment,
				addTopic: mockAddTopic,
			},
			users: {
				get: mockGetUsers,
			},
		},
	}
})

const mockFindOneRound = jest.fn()
const mockFindRoundById = jest.fn()
const mockCreateRound = jest.fn()
const mockFindRound = jest.fn()

jest.mock('@models/BolaoRound', () => {
	return {
		__esModule: true,
		default: {
			findOne: mockFindOneRound,
			findById: mockFindRoundById,
			create: mockCreateRound,
			find: mockFindRound,
		},
	}
})

const mockUpdateOneBet = jest.fn()
const mockFindBets = jest.fn()
const mockAggregateBets = jest.fn()
const mockCreateBet = jest.fn()

jest.mock('@models/Bet', () => {
	return {
		__esModule: true,
		default: {
			updateOne: mockUpdateOneBet,
			find: mockFindBets,
			aggregate: mockAggregateBets,
			create: mockCreateBet,
		},
	}
})

const mockDistinctMembers = jest.fn()
jest.mock('@models/Member', () => {
	return {
		__esModule: true,
		default: {
			distinct: mockDistinctMembers,
		},
	}
})

jest.mock('@config/database', () => {
	return {
		__esModule: true,
		default: {
			connect: jest.fn().mockResolvedValue(null),
			Schema: class {
				index() {}
			},
			model: jest.fn(),
		},
	}
})

import bolaoCron from '@crons/bolao'
import bot from '@utils/bot'

describe('Bolao tests', () => {
	beforeEach(() => {
		jest.clearAllMocks()
	})

	describe('checkAndCreateNextRound cron', () => {
		test('should not create round if there are no Serie A games today', async () => {
			mockDistinctMembers.mockResolvedValue([100])
			mockGetGames.mockResolvedValue({ jogos: {} })

			await bolaoCron.checkAndCreateNextRound()

			expect(mockCreateRound).not.toHaveBeenCalled()
			expect(mockAddTopic).not.toHaveBeenCalled()
		})

		test('should create round and topic if new Serie A round is detected', async () => {
			mockDistinctMembers.mockResolvedValue([100])
			// Calendar response indicating Round 18 matches today
			mockGetGames.mockResolvedValue({
				jogos: {
					'Campeonato Brasileiro': {
						'Série A': [
							{
								id_jogo: '832060',
								rodada: '18',
								mandante: { nome: 'Flamengo' },
								visitante: { nome: 'Coritiba' },
							}
						]
					}
				}
			})
			// Round 18 already exists check returns null (not found)
			mockFindRoundById.mockResolvedValue(null)

			// Round API response mock
			mockGetGamesByRound.mockResolvedValue({
				jogos: [
					{
						grupo: 'GRUPO ÚNICO',
						jogo: [
							{
								id_jogo: '832060',
								rodada: '18',
								mandante: { nome: 'Flamengo', gols: null },
								visitante: { nome: 'Coritiba', gols: null },
								data: '15/06/2026',
								hora: '21:00',
							}
						]
					}
				]
			})

			await bolaoCron.checkAndCreateNextRound()

			expect(mockAddTopic).toHaveBeenCalledWith(
				expect.objectContaining({
					cmmId: 100,
					title: expect.stringContaining('Rodada 18'),
					text: expect.stringContaining('1. Flamengo x Coritiba'),
				})
			)
			expect(mockCreateRound).toHaveBeenCalledWith(
				expect.objectContaining({
					_id: '100_1260611_18',
					roundNumber: 18,
					topicId: 12345,
				})
			)
		})
	})

	describe('processRoundGuesses bot method', () => {
		test('should register guesses for matches in the future and ignore matches in the past', async () => {
			// Mock round in DB.
			// Game 1 is in the past, Game 2 is in the future.
			const mockRound = {
				_id: '100_1260611_18',
				games: [
					{
						id_jogo: 'game_past',
						homeTeam: 'Flamengo',
						awayTeam: 'Coritiba',
						date: '01/05/2026',
						time: '16:00',
					},
					{
						id_jogo: 'game_future',
						homeTeam: 'Palmeiras',
						awayTeam: 'Santos',
						date: '15/06/2026',
						time: '16:00',
					}
				]
			}
			mockFindOneRound.mockResolvedValue(mockRound)
			jest.spyOn(bot, 'getQuoteString').mockResolvedValue('[post400|John],')

			// Message contains guesses for game 1 and 2
			const message = 'Meus palpites:\n1. 2x1\n2. 1x0'

			await bot.processRoundGuesses(100, 300, 200, 400, message)

			// Should only call updateOne for game_future (index 2)
			expect(mockUpdateOneBet).toHaveBeenCalledTimes(1)
			expect(mockUpdateOneBet).toHaveBeenCalledWith(
				{ userId: 300, gameId: 'game_future' },
				expect.objectContaining({
					gameId: 'game_future',
					homeScore: 1,
					awayScore: 0,
				}),
				{ upsert: true }
			)

			// Response should mention Palmeiras registered and Flamengo rejected
			expect(mockCreateComment).toHaveBeenCalledWith(
				expect.objectContaining({
					cmmId: 100,
					topicId: 200,
					text: expect.stringContaining('✅ Palpites registrados:\n- Palmeiras 1 x 0 Santos'),
				})
			)
			expect(mockCreateComment).toHaveBeenCalledWith(
				expect.objectContaining({
					cmmId: 100,
					topicId: 200,
					text: expect.stringContaining('⚠️ Palpites não registrados (jogos iniciados ou inválidos):\n- Flamengo x Coritiba (já iniciado)'),
				})
			)
		})
	})

	describe('resolveRoundBets cron', () => {
		test('should resolve open round and compute correct points for users', async () => {
			const mockRound = {
				_id: '100_1260611_18',
				cmmId: 100,
				championshipId: 1260611,
				roundNumber: 18,
				topicId: 200,
				games: [
					{
						id_jogo: 'game_exact',
						homeTeam: 'Flamengo',
						awayTeam: 'Coritiba',
						date: '01/05/2026',
						time: '16:00',
					},
					{
						id_jogo: 'game_sign',
						homeTeam: 'Palmeiras',
						awayTeam: 'Santos',
						date: '01/05/2026',
						time: '16:00',
					},
					{
						id_jogo: 'game_miss',
						homeTeam: 'Cruzeiro',
						awayTeam: 'Gremio',
						date: '01/05/2026',
						time: '16:00',
					}
				],
				processed: false,
				save: jest.fn().mockResolvedValue(null),
			}
			mockFindRound.mockResolvedValue([mockRound])

			// CBF API round results
			mockGetGamesByRound.mockResolvedValue({
				jogos: [
					{
						jogo: [
							{
								id_jogo: 'game_exact',
								mandante: { gols: '2' },
								visitante: { gols: '1' },
							},
							{
								id_jogo: 'game_sign',
								mandante: { gols: '3' },
								visitante: { gols: '1' },
							},
							{
								id_jogo: 'game_miss',
								mandante: { gols: '0' },
								visitante: { gols: '2' },
							}
						]
					}
				]
			})

			// User bets
			const exactBet = {
				gameId: 'game_exact',
				homeScore: 2,
				awayScore: 1,
				points: null,
				processed: false,
				save: jest.fn().mockResolvedValue(null),
			}
			const signBet = {
				gameId: 'game_sign',
				homeScore: 1,
				awayScore: 0, // predicted 1x0, actual 3x1 (correct outcome, but wrong score)
				points: null,
				processed: false,
				save: jest.fn().mockResolvedValue(null),
			}
			const missBet = {
				gameId: 'game_miss',
				homeScore: 1,
				awayScore: 1, // predicted 1x1, actual 0x2
				points: null,
				processed: false,
				save: jest.fn().mockResolvedValue(null),
			}

			mockFindBets.mockImplementation((query) => {
				if (query.gameId === 'game_exact') return [exactBet]
				if (query.gameId === 'game_sign') return [signBet]
				if (query.gameId === 'game_miss') return [missBet]
				return []
			})

			await bolaoCron.resolveRoundBets()

			// Assert points
			expect(exactBet.points).toBe(5)
			expect(exactBet.processed).toBe(true)
			expect(exactBet.save).toHaveBeenCalled()

			expect(signBet.points).toBe(3)
			expect(signBet.processed).toBe(true)
			expect(signBet.save).toHaveBeenCalled()

			expect(missBet.points).toBe(0)
			expect(missBet.processed).toBe(true)
			expect(missBet.save).toHaveBeenCalled()

			// Round should be marked processed and comment posted
			expect(mockRound.processed).toBe(true)
			expect(mockRound.save).toHaveBeenCalled()
			expect(mockCreateComment).toHaveBeenCalledWith(
				expect.objectContaining({
					cmmId: 100,
					topicId: 200,
					text: expect.stringContaining('O Bolão da Rodada 18 foi finalizado!'),
				})
			)
		})
	})

	describe('sendRanking bot method', () => {
		test('should query database aggregation and print leaderboards', async () => {
			mockAggregateBets.mockResolvedValue([
				{ _id: 300, totalPoints: 15 },
				{ _id: 301, totalPoints: 10 },
			])
			mockGetUsers.mockResolvedValue([
				{ id: 300, first_name: 'John', last_name: 'Doe' },
				{ id: 301, first_name: 'Jane', last_name: 'Smith' },
			])
			jest.spyOn(bot, 'getQuoteString').mockResolvedValue('[post400|John],')

			await bot.sendRanking({
				cmmId: 100,
				userId: 300,
				topicId: 200,
				postId: 400,
				message: '!ranking',
			})

			expect(mockAggregateBets).toHaveBeenCalled()
			expect(mockGetUsers).toHaveBeenCalledWith({ userIds: [300, 301] })
			expect(mockCreateComment).toHaveBeenCalledWith(
				expect.objectContaining({
					cmmId: 100,
					topicId: 200,
					text: expect.stringContaining('1. [id300|John Doe] - 15 pts\n2. [id301|Jane Smith] - 10 pts'),
				})
			)
		})
	})
})
