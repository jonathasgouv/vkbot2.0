import bot from '@utils/bot'
import vkApi from '@api/vk'
import Quiz from '@models/Quiz'
import Member from '@models/Member'
import Comment from '@models/Comment'
import Topic from '@models/Topic'
import Bet from '@models/Bet'
import BolaoRound from '@models/BolaoRound'
import hookController from '@controllers/hookController'
import quizCron, { normalizeAnswer, getMondayOfCurrentWeek } from '@crons/quiz'
import muralCron from '@crons/mural'
import resenhaCron from '@crons/resenha'
import generalFncs from '@utils/general'
import { Request, Response } from 'express'

jest.mock('@config/database', () => {
	return {
		__esModule: true,
		default: {
			connect: jest.fn().mockResolvedValue(null),
			Schema: class {
				index() {}
			},
			model: jest.fn().mockReturnValue({}),
		}
	}
})

const mockSend = jest.fn().mockResolvedValue(null)
const mockCreateComment = jest.fn().mockResolvedValue(null)
const mockAddTopic = jest.fn().mockResolvedValue(12345)
const mockEditTopic = jest.fn().mockResolvedValue(null)
const mockGetComments = jest.fn().mockResolvedValue({ items: [] })
const mockGetUsers = jest.fn().mockResolvedValue([{ first_name: 'John', last_name: 'Doe' }])

jest.mock('@api/vk', () => {
	return {
		__esModule: true,
		default: {
			messages: {
				send: (...args: any[]) => mockSend(...args),
			},
			board: {
				createComment: (...args: any[]) => mockCreateComment(...args),
				addTopic: (...args: any[]) => mockAddTopic(...args),
				editTopic: (...args: any[]) => mockEditTopic(...args),
				getComments: (...args: any[]) => mockGetComments(...args),
			},
			users: {
				get: (...args: any[]) => mockGetUsers(...args),
			}
		}
	}
})

const mockAxiosPost = jest.fn()
jest.mock('axios', () => {
	return {
		__esModule: true,
		default: {
			post: (...args: any[]) => mockAxiosPost(...args),
		}
	}
})

// Mock Models
const mockFindOneQuiz = jest.fn()
const mockFindQuiz = jest.fn()
const mockCreateQuiz = jest.fn()
const mockUpdateOneQuiz = jest.fn()
jest.mock('@models/Quiz', () => {
	return {
		__esModule: true,
		default: {
			findOne: (...args: any[]) => mockFindOneQuiz(...args),
			find: (...args: any[]) => mockFindQuiz(...args),
			create: (...args: any[]) => mockCreateQuiz(...args),
			updateOne: (...args: any[]) => mockUpdateOneQuiz(...args),
		}
	}
})

const mockFindOneMember = jest.fn()
const mockUpdateOneMember = jest.fn()
const mockUpdateManyMembers = jest.fn()
const mockFindMembers = jest.fn()
const mockDistinctMembers = jest.fn()
const mockCreateMember = jest.fn()
jest.mock('@models/Member', () => {
	return {
		__esModule: true,
		default: {
			findOne: (...args: any[]) => mockFindOneMember(...args),
			updateOne: (...args: any[]) => mockUpdateOneMember(...args),
			updateMany: (...args: any[]) => mockUpdateManyMembers(...args),
			find: (...args: any[]) => mockFindMembers(...args),
			distinct: (...args: any[]) => mockDistinctMembers(...args),
			create: (...args: any[]) => mockCreateMember(...args),
		}
	}
})

const mockFindOneComment = jest.fn()
const mockAggregateComment = jest.fn()
let mockFindOneCommentValue: any = null
jest.mock('@models/Comment', () => {
	return {
		__esModule: true,
		default: {
			findOne: (...args: any[]) => mockFindOneComment(...args),
			aggregate: (...args: any[]) => mockAggregateComment(...args),
		}
	}
})

const mockAggregateTopic = jest.fn()
jest.mock('@models/Topic', () => {
	return {
		__esModule: true,
		default: {
			aggregate: (...args: any[]) => mockAggregateTopic(...args),
		}
	}
})

const mockFindBet = jest.fn()
const mockFindOneBet = jest.fn()
const mockAggregateBet = jest.fn()
jest.mock('@models/Bet', () => {
	return {
		__esModule: true,
		default: {
			find: (...args: any[]) => mockFindBet(...args),
			findOne: (...args: any[]) => mockFindOneBet(...args),
			aggregate: (...args: any[]) => mockAggregateBet(...args),
		}
	}
})

const mockFindOneRound = jest.fn()
const mockFindRound = jest.fn()
let mockFindOneRoundValue: any = null
jest.mock('@models/BolaoRound', () => {
	return {
		__esModule: true,
		default: {
			findOne: (...args: any[]) => mockFindOneRound(...args),
			find: (...args: any[]) => mockFindRound(...args),
		}
	}
})

const mockFindKeywords = jest.fn()
jest.mock('@models/Keyword', () => {
	return {
		__esModule: true,
		default: {
			find: (...args: any[]) => mockFindKeywords(...args),
		}
	}
})

jest.mock('@models/ProcessedEvent', () => {
	return {
		__esModule: true,
		default: {
			create: jest.fn().mockResolvedValue({}),
		}
	}
})

describe('New Features Integration Tests', () => {
	beforeEach(() => {
		jest.clearAllMocks()
		process.env.GEMINI_API_KEY = 'test_key'
		
		mockFindOneMember.mockResolvedValue(null)
		mockUpdateOneMember.mockResolvedValue({})
		mockUpdateManyMembers.mockResolvedValue({})
		mockFindMembers.mockResolvedValue([])
		mockDistinctMembers.mockResolvedValue([])
		mockCreateMember.mockResolvedValue({})
		
		mockFindOneQuiz.mockResolvedValue(null)
		mockFindQuiz.mockResolvedValue([])
		mockCreateQuiz.mockResolvedValue({})
		mockUpdateOneQuiz.mockResolvedValue({})
		
		mockFindOneCommentValue = null
		mockAggregateComment.mockResolvedValue([])
		mockAggregateTopic.mockResolvedValue([])
		
		mockFindBet.mockResolvedValue([])
		mockFindOneBet.mockResolvedValue(null)
		mockAggregateBet.mockResolvedValue([])
		
		mockFindOneRoundValue = null
		mockFindRound.mockResolvedValue([])
		mockFindKeywords.mockResolvedValue([])
		
		mockFindOneRound.mockImplementation(() => {
			return {
				sort: jest.fn().mockReturnThis(),
				then: jest.fn((resolve) => resolve(mockFindOneRoundValue)),
			}
		})
		
		mockFindOneComment.mockImplementation(() => {
			return {
				sort: jest.fn().mockReturnThis(),
				then: jest.fn((resolve) => resolve(mockFindOneCommentValue)),
			}
		})
	})

	describe('Craque Neto Persona (!neto)', () => {
		test('should call Gemini with system instruction for !neto and reply', async () => {
			mockAxiosPost.mockResolvedValue({
				data: {
					candidates: [
						{
							content: {
								parts: [{ text: 'Pão com ovo! Esse guri é um orelhudo!' }]
							}
						}
					]
				}
			})

			await bot.execCommand('neto', 123, 456, 789, 100, '!neto Quem é melhor: Messi ou Cristiano Ronaldo?')

			expect(mockAxiosPost).toHaveBeenCalledWith(
				expect.stringContaining('gemini-2.5-flash-lite'),
				expect.objectContaining({
					contents: expect.arrayContaining([
						expect.objectContaining({
							parts: expect.arrayContaining([
								expect.objectContaining({
									text: expect.stringContaining('Messi ou Cristiano Ronaldo?')
								})
							])
						})
					]),
					systemInstruction: expect.objectContaining({
						parts: expect.arrayContaining([
							expect.objectContaining({
								text: expect.stringContaining('Craque Neto')
							})
						])
					})
				})
			)
			expect(mockCreateComment).toHaveBeenCalledWith({
				cmmId: 100,
				topicId: 456,
				text: expect.stringContaining('Pão com ovo!')
			})
		})

		test('should handle empty neto question gracefully', async () => {
			await bot.execCommand('n', 123, 456, 789, 100, '!n')
			expect(mockCreateComment).toHaveBeenCalledWith({
				cmmId: 100,
				topicId: 456,
				text: expect.stringContaining('garotinho')
			})
			expect(mockAxiosPost).not.toHaveBeenCalled()
		})
	})

	describe('Answer Normalization Helper', () => {
		test('should correctly normalize strings', () => {
			expect(normalizeAnswer('São Paulo!')).toBe('sao paulo')
			expect(normalizeAnswer(' Pelé  ')).toBe('pele')
			expect(normalizeAnswer('Atlético-MG')).toBe('atletico mg')
			expect(normalizeAnswer('10/10')).toBe('10 10')
		})
	})

	describe('Quiz Webhook Guess Interceptor', () => {
		let req: Partial<Request>
		let res: Partial<Response>

		beforeEach(() => {
			res = {
				status: jest.fn().mockReturnThis(),
				send: jest.fn().mockReturnThis(),
			}
			process.env.SECRET = 'sec'
			process.env.BANNED_IDS = '[]'
		})

		test('should intercept guesses and award point to first correct answer', async () => {
			req = {
				body: {
					secret: 'sec',
					type: 'board_post_new',
					group_id: 100,
					object: {
						topic_id: 999, // quiz topic
						from_id: 123,
						id: 888,
						text: 'Palmeiras',
					}
				}
			}

			// Mock active quiz
			const mockQuizSave = jest.fn()
			const mockQuiz = {
				cmmId: 100,
				topicId: 999,
				dailyLeaderboard: new Map<string, number>(),
				leaderboard: new Map<string, number>(),
				dailyBatches: [
					{
						dayIndex: new Date().getDay() - 1 < 0 ? 6 : new Date().getDay() - 1,
						questions: [
							{
								index: 1,
								question: 'Qual time venceu a Libertadores em 2020?',
								answer: 'Palmeiras',
								status: 'active',
								activatedAt: new Date(Date.now() - 30000) // 30s ago
							},
							{
								index: 2,
								question: 'Quem é o camisa 10 da seleção brasileira?',
								answer: 'Neymar',
								status: 'pending'
							}
						]
					}
				],
				save: mockQuizSave
			}
			mockFindOneQuiz.mockResolvedValue(mockQuiz)

			await hookController.post(req as Request, res as Response)

			expect(res.status).toHaveBeenCalledWith(200)
			expect(res.send).toHaveBeenCalledWith('ok')

			// Wait for promise chain
			await new Promise((resolve) => setTimeout(resolve, 10))

			expect(mockQuiz.dailyBatches[0].questions[0].status).toBe('resolved')
			expect((mockQuiz.dailyBatches[0].questions[0] as any).winnerId).toBe(123)
			expect(mockQuiz.dailyLeaderboard.get('123')).toBe(1)
			expect(mockQuiz.leaderboard.get('123')).toBe(1)

			// Mente brilhante awarded (< 60s)
			expect(mockUpdateOneMember).toHaveBeenCalledWith(
				{ cmmId: 100, userId: 123 },
				{ $addToSet: { customBadges: '⚡ Mente Brilhante (Respondeu o quiz em < 60s)' } }
			)

			// Instantly posted next question
			expect(mockQuiz.dailyBatches[0].questions[1].status).toBe('active')
			expect(mockCreateComment).toHaveBeenCalledWith({
				cmmId: 100,
				topicId: 999,
				text: expect.stringContaining('acertou a Pergunta #1')
			})
			expect(mockCreateComment).toHaveBeenCalledWith(expect.objectContaining({
				text: expect.stringContaining('Pergunta #2')
			}))
			expect(mockQuizSave).toHaveBeenCalled()
		})
	})

	describe('Quiz Timeout Logic', () => {
		test('should advance quiz to next question on 20-minute timeout', async () => {
			const mockQuizSave = jest.fn()
			const mockQuiz = {
				_id: 'q1',
				cmmId: 100,
				topicId: 999,
				dailyLeaderboard: new Map<string, number>(),
				leaderboard: new Map<string, number>(),
				dailyBatches: [
					{
						dayIndex: new Date().getDay() - 1 < 0 ? 6 : new Date().getDay() - 1,
						questions: [
							{
								index: 1,
								question: 'Q1',
								answer: 'A1',
								status: 'active',
								activatedAt: new Date(Date.now() - 25 * 60 * 1000) // 25 mins ago (timed out)
							},
							{
								index: 2,
								question: 'Q2',
								answer: 'A2',
								status: 'pending'
							}
						]
					}
				],
				save: mockQuizSave
			}
			mockFindQuiz.mockResolvedValue([mockQuiz])

			await quizCron.checkQuizTimeout()

			expect(mockQuiz.dailyBatches[0].questions[0].status).toBe('timeout')
			expect(mockQuiz.dailyBatches[0].questions[1].status).toBe('active')
			
			expect(mockCreateComment).toHaveBeenCalled()
			const callArgs = mockCreateComment.mock.calls[0][0]
			expect(callArgs.cmmId).toBe(100)
			expect(callArgs.topicId).toBe(999)
			expect(callArgs.text).toContain('Tempo esgotado!')
			expect(callArgs.text).toContain('Ninguém acertou a Pergunta #1')
			
			expect(mockQuizSave).toHaveBeenCalled()
		})
	})

	describe('Badge Calculations', () => {
		test('should return Copa badges correctly', async () => {
			mockFindRound.mockResolvedValue([{ _id: 'copa1', championshipName: 'Copa do Mundo 2026' }])
			mockAggregateBet.mockResolvedValue([
				{ _id: 501, totalPoints: 50 }, // Gold
				{ _id: 502, totalPoints: 40 }, // Silver
				{ _id: 503, totalPoints: 30 }, // Bronze
			])
			mockFindBet.mockResolvedValue([])

			const badges = await bot.calculateBadges(
				{ userId: 501, customBadges: ['🧠 Sabichão do Fórum'] },
				10, // total posts
				0, // weekly posts
				0, // weeks of house
				-1, // first active week
				501, // userId
				100 // cmmId
			)

			expect(badges).toContain('🥇 Copa Ouro (Vencedor do Bolão da Copa)')
			expect(badges).toContain('🧠 Sabichão do Fórum')
		})

		test('should return Devagar e Sempre badge when palpitou all without exact hit', async () => {
			mockFindRound.mockResolvedValue([])
			mockFindOneRoundValue = null
			
			// Processed Brasileirão round with 2 games
			mockDistinctMembers.mockResolvedValue([100])
			mockFindRound.mockResolvedValue([
				{
					_id: 'round1',
					championshipName: 'Campeonato Brasileiro',
					processed: true,
					games: [{ id_jogo: 'g1' }, { id_jogo: 'g2' }]
				}
			])
			// User bets on all 2 games, but got points < 5 (no exact hit)
			mockFindBet.mockResolvedValue([
				{ userId: 123, roundId: 'round1', gameId: 'g1', points: 2 },
				{ userId: 123, roundId: 'round1', gameId: 'g2', points: 0 },
			])

			const badges = await bot.calculateBadges(
				{ userId: 123, customBadges: [] },
				10, 0, 0, -1, 123, 100
			)

			expect(badges).toContain('🐢 Devagar e Sempre (Palpitou em todos os jogos de uma rodada sem acertar placar exato)')
		})

		test('should return Profeta badge on classic exact hits', async () => {
			mockFindRound.mockResolvedValue([])
			// User has a bet with 5 points
			mockFindOneBet.mockResolvedValue({ userId: 123, points: 5 })
			mockFindBet.mockResolvedValue([
				{ userId: 123, roundId: 'round_c', gameId: 'g_c', points: 5 }
			])
			mockFindRound.mockResolvedValue([
				{
					_id: 'round_c',
					processed: true,
					games: [{ id_jogo: 'g_c', homeTeam: 'Corinthians', awayTeam: 'Palmeiras' }]
				}
			])

			const badges = await bot.calculateBadges(
				{ userId: 123, customBadges: [] },
				10, 0, 0, -1, 123, 100
			)

			expect(badges).toContain('🎯 Profeta (Acertou placar exato de um Clássico)')
		})
	})

	describe('Cron Jobs drafting', () => {
		test('Weekly Mural should gather stats, award badges, and post topic', async () => {
			mockDistinctMembers.mockResolvedValue([100])
			
			const initialDate = process.env.INITIAL_DATE ? new Date(process.env.INITIAL_DATE) : new Date()
			const currentWeek = generalFncs.weeksBetween(initialDate, new Date())
			const lastWeek = currentWeek - 1

			const mockPosts = []
			mockPosts[lastWeek] = 10

			mockFindMembers.mockResolvedValue([
				{ userId: 501, posts: mockPosts, customBadges: [] }
			])
			// Mock aggregates
			mockAggregateComment.mockResolvedValue([
				{ _id: 501, totalLikes: 25 }
			])
			mockAggregateTopic.mockResolvedValue([
				{ _id: 501, totalTopics: 2 }
			])
			
			mockFindOneCommentValue = {
				cmmId: 100,
				topicId: 1,
				commentId: 2,
				userId: 501,
				likes: 10
			}
			
			mockGetComments.mockResolvedValue({
				items: [{ id: 2, text: 'Que golaço!' }]
			})
			mockAxiosPost.mockResolvedValue({
				data: {
					candidates: [
						{ content: { parts: [{ text: 'Resenha gerada!' }] } }
					]
				}
			})

			await muralCron.createWeeklyMural()

			expect(mockUpdateOneMember).toHaveBeenCalledWith(
				{ cmmId: 100, userId: 501 },
				expect.objectContaining({ $addToSet: { customBadges: '💬 Tagarela de Ouro (Membro com mais posts na semana)' } })
			)
			expect(mockAddTopic).toHaveBeenCalledWith(expect.objectContaining({
				cmmId: 100,
				title: expect.stringContaining('Mural de Destaques'),
				text: expect.stringContaining('Resenha gerada!')
			}))
		})

		test('Resenha da Rodada should post round results and award badges', async () => {
			mockDistinctMembers.mockResolvedValue([100])
			
			mockFindOneRoundValue = {
				_id: 'r_brasileirao',
				roundNumber: 22,
				games: [{ id_jogo: 'g1', homeTeam: 'Corinthians', awayTeam: 'São Paulo' }]
			}
			
			mockAggregateBet.mockResolvedValueOnce([
				{ _id: 601, totalPoints: 12 }, // Mito
				{ _id: 602, totalPoints: 2 },  // Pé Frio
			])
			mockAggregateBet.mockResolvedValueOnce([
				{ _id: 'g1', hits: 3 }
			])
			mockAxiosPost.mockResolvedValue({
				data: {
					candidates: [
						{ content: { parts: [{ text: 'Neto analisando a rodada!' }] } }
					]
				}
			})

			await resenhaCron.createRoundResenha()

			expect(mockUpdateOneMember).toHaveBeenCalledWith(
				{ cmmId: 100, userId: 601 },
				{ $addToSet: { customBadges: '🏆 Mito da Rodada (Fez mais pontos na rodada do Bolão)' } }
			)
			expect(mockUpdateOneMember).toHaveBeenCalledWith(
				{ cmmId: 100, userId: 602 },
				{ $addToSet: { customBadges: '🤡 Pé Frio (Ficou na lanterna da rodada do Bolão)' } }
			)
			expect(mockAddTopic).toHaveBeenCalledWith(expect.objectContaining({
				cmmId: 100,
				title: '⚽ Resenha da Rodada - Rodada 22 (Bolão)',
				text: expect.stringContaining('Neto analisando a rodada!')
			}))
		})
	})
})
