const mockGetGroupStageGames = jest.fn()
const mockGetKnockoutGames = jest.fn()

jest.mock('@api/ge', () => {
	return {
		__esModule: true,
		default: {
			getGroupStageGames: mockGetGroupStageGames,
			getKnockoutGames: mockGetKnockoutGames,
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
const mockFindMembers = jest.fn().mockResolvedValue([])
const mockFindOneMember = jest.fn()
const mockUpdateManyMembers = jest.fn().mockResolvedValue({})
jest.mock('@models/Member', () => {
	return {
		__esModule: true,
		default: {
			distinct: mockDistinctMembers,
			find: mockFindMembers,
			findOne: mockFindOneMember,
			updateMany: mockUpdateManyMembers,
		},
	}
})

const mockCountCopaMatches = jest.fn()
const mockUpdateOneCopaMatch = jest.fn()
const mockFindCopaMatches = jest.fn()

jest.mock('@models/CopaMatch', () => {
	return {
		__esModule: true,
		default: {
			countDocuments: mockCountCopaMatches,
			updateOne: mockUpdateOneCopaMatch,
			find: mockFindCopaMatches,
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

import copaCron from '@crons/copa'
import bot from '@utils/bot'

describe('Copa Bolao tests', () => {
	beforeEach(() => {
		jest.clearAllMocks()
		mockFindOneMember.mockResolvedValue({
			userId: 300,
			firstName: 'John',
			lastName: 'Doe',
		})
		mockFindCopaMatches.mockImplementation(() => {
			return {
				sort: jest.fn().mockReturnValue([
					{
						id: 1,
						phaseId: 'fase-de-grupos-copa-do-mundo-2026',
						date: new Date('2026-06-11T13:00:00-03:00'),
						dateStr: '2026-06-11',
						homeTeam: 'Brasil',
						awayTeam: 'Croácia',
						homeFlag: 'flag1',
						awayFlag: 'flag2',
						groupId: 5811,
						roundNumber: 1,
						homeScore: null,
						awayScore: null,
						finished: false,
					}
				])
			}
		})
	})

	describe('checkAndCreateNextCopaRound cron', () => {
		test('should seed calendar and create first daily round if DB is empty', async () => {
			mockCountCopaMatches.mockResolvedValue(0)
			mockDistinctMembers.mockResolvedValue([100])
			mockFindRoundById.mockResolvedValue(null) // Round doesn't exist

			// Mock GE group stage games response
			mockGetGroupStageGames.mockResolvedValue([
				{
					id: 1,
					data_realizacao: '2026-06-11T13:00:00',
					placar_oficial_mandante: null,
					placar_oficial_visitante: null,
					equipes: {
						mandante: { nome_popular: 'Brasil', escudo: 'flag1' },
						visitante: { nome_popular: 'Croácia', escudo: 'flag2' },
					},
					sede: { nome_popular: 'São Paulo' }
				}
			])

			// Mock GE knockout response (empty for test simplicity)
			mockGetKnockoutGames.mockResolvedValue([])

			// Modify Date.now() to mock time close to the World Cup start (e.g. 2026-06-09)
			const mockNow = new Date('2026-06-09T12:00:00-03:00').getTime()
			const realDateNow = Date.now
			Date.now = () => mockNow

			try {
				await copaCron.checkAndCreateNextCopaRound()

				// Should call updateOne to seed CopaMatches
				expect(mockUpdateOneCopaMatch).toHaveBeenCalled()

				// Should create VK topic for the day
				expect(mockAddTopic).toHaveBeenCalledWith(
					expect.objectContaining({
						cmmId: 100,
						title: expect.stringContaining('Dia 1 (11/06/2026)'),
						text: expect.stringContaining('1. Brasil x Croácia (11/06/2026 13:00)')
					})
				)

				// Should save BolaoRound
				expect(mockCreateRound).toHaveBeenCalledWith(
					expect.objectContaining({
						_id: 'copa_2026_2026-06-11',
						championshipId: 2026,
						championshipName: 'Copa do Mundo 2026',
						roundNumber: 1,
						topicId: 12345,
					})
				)
			} finally {
				Date.now = realDateNow
			}
		})

		test('should not create round if first match kickoff is more than 3 days away', async () => {
			mockCountCopaMatches.mockResolvedValue(10) // Database already seeded
			mockDistinctMembers.mockResolvedValue([100])
			mockFindRoundById.mockResolvedValue(null)

			// Time is June 05, match is June 11 (6 days gap)
			const mockNow = new Date('2026-06-05T12:00:00-03:00').getTime()
			const realDateNow = Date.now
			Date.now = () => mockNow

			try {
				await copaCron.checkAndCreateNextCopaRound()

				expect(mockAddTopic).not.toHaveBeenCalled()
				expect(mockCreateRound).not.toHaveBeenCalled()
			} finally {
				Date.now = realDateNow
			}
		})
	})

	describe('resolveCopaRoundBets cron', () => {
		test('should resolve bets and close round when all games are finished', async () => {
			// Mock round from DB
			const mockRound = {
				_id: 'copa_2026_2026-06-11',
				cmmId: 100,
				championshipId: 2026,
				championshipName: 'Copa do Mundo 2026',
				roundNumber: 1,
				topicId: 12345,
				games: [
					{
						id_jogo: 'copa_2026_1',
						homeTeam: 'Brasil',
						awayTeam: 'Croácia',
						date: '11/06/2026',
						time: '13:00',
					}
				],
				processed: false,
				save: jest.fn().mockResolvedValue(null)
			}

			mockFindRound.mockResolvedValue([mockRound])

			// Mock find matching matches in DB
			mockFindCopaMatches.mockResolvedValue([
				{
					id: 1,
					dateStr: '2026-06-11',
					groupId: 5811,
					roundNumber: 1,
					homeTeam: 'Brasil',
					awayTeam: 'Croácia',
					homeScore: 3,
					awayScore: 1,
					finished: true,
					date: new Date('2026-06-11T13:00:00-03:00'),
				}
			])

			// Mock GE response matching the finished game
			mockGetGroupStageGames.mockResolvedValue([
				{
					id: 1,
					placar_oficial_mandante: 3,
					placar_oficial_visitante: 1,
					equipes: {
						mandante: { nome_popular: 'Brasil' },
						visitante: { nome_popular: 'Croácia' }
					}
				}
			])

			// Mock active bets
			const mockBetExact = {
				userId: 300,
				gameId: 'copa_2026_1',
				homeScore: 3,
				awayScore: 1,
				points: null,
				processed: false,
				save: jest.fn().mockResolvedValue(null)
			}
			const mockBetDiffWinner = {
				userId: 301,
				gameId: 'copa_2026_1',
				homeScore: 2,
				awayScore: 0,
				points: null,
				processed: false,
				save: jest.fn().mockResolvedValue(null)
			}
			const mockBetWrong = {
				userId: 302,
				gameId: 'copa_2026_1',
				homeScore: 0,
				awayScore: 1,
				points: null,
				processed: false,
				save: jest.fn().mockResolvedValue(null)
			}

			mockFindBets.mockResolvedValue([mockBetExact, mockBetDiffWinner, mockBetWrong])

			// Mock Date.now() to be post-match (e.g. 11/06/2026 18:00)
			const mockNow = new Date('2026-06-11T18:00:00-03:00').getTime()
			const realDateNow = Date.now
			Date.now = () => mockNow

			try {
				await copaCron.resolveCopaRoundBets()

				// Check exact guess (should get 5 points)
				expect(mockBetExact.points).toBe(5)
				expect(mockBetExact.processed).toBe(true)
				expect(mockBetExact.save).toHaveBeenCalled()

				// Check partial guess (winner only, should get 3 points)
				expect(mockBetDiffWinner.points).toBe(3)
				expect(mockBetDiffWinner.processed).toBe(true)
				expect(mockBetDiffWinner.save).toHaveBeenCalled()

				// Check wrong guess (0 points)
				expect(mockBetWrong.points).toBe(0)
				expect(mockBetWrong.processed).toBe(true)
				expect(mockBetWrong.save).toHaveBeenCalled()

				// Check round closed and published to VK
				expect(mockRound.processed).toBe(true)
				expect(mockRound.save).toHaveBeenCalled()
				expect(mockCreateComment).toHaveBeenCalledWith(
					expect.objectContaining({
						cmmId: 100,
						topicId: 12345,
						text: expect.stringContaining('Brasil 3 x 1 Croácia')
					})
				)
			} finally {
				Date.now = realDateNow
			}
		})
	})

	describe('processRoundGuesses bot integration', () => {
		test('should accept predictions only for games that have not started', async () => {
			const mockRound = {
				_id: 'copa_2026_2026-06-11',
				games: [
					{
						id_jogo: 'copa_2026_1',
						homeTeam: 'Brasil',
						awayTeam: 'Croácia',
						date: '11/06/2026',
						time: '13:00', // Past
					},
					{
						id_jogo: 'copa_2026_2',
						homeTeam: 'Alemanha',
						awayTeam: 'Japão',
						date: '11/06/2026',
						time: '16:00', // Future
					}
				],
				processed: false,
			}

			mockFindOneRound.mockResolvedValue(mockRound)

			// Mock time to be June 11 at 14:00 (after game 1, before game 2)
			const mockNow = new Date('2026-06-11T14:00:00-03:00').getTime()
			const realDateNow = Date.now
			Date.now = () => mockNow

			try {
				const commentMessage = '1. 2x1\n2. 3x0'
				await bot.processRoundGuesses(100, 300, 12345, 999, commentMessage)

				// Should update Bet for game 2 (future)
				expect(mockUpdateOneBet).toHaveBeenCalledWith(
					{ userId: 300, gameId: 'copa_2026_2' },
					expect.objectContaining({
						homeScore: 3,
						awayScore: 0,
					}),
					{ upsert: true }
				)

				// Should NOT update Bet for game 1 (past)
				expect(mockUpdateOneBet).not.toHaveBeenCalledWith(
					{ userId: 300, gameId: 'copa_2026_1' },
					expect.any(Object),
					expect.any(Object)
				)

				// Should report partial registry comment
				expect(mockCreateComment).toHaveBeenCalledWith(
					expect.objectContaining({
						cmmId: 100,
						topicId: 12345,
						text: expect.stringContaining('Alemanha 3 x 0 Japão')
					})
				)
				expect(mockCreateComment).toHaveBeenCalledWith(
					expect.objectContaining({
						text: expect.stringContaining('já iniciado')
					})
				)
			} finally {
				Date.now = realDateNow
			}
		})
	})
})
