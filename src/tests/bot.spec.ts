jest.mock('@config/database', () => {
	return {
		__esModule: true,
		default: {
			connect: jest.fn().mockResolvedValue(null),
			Schema: class {
				index() {}
			},
			model: jest.fn().mockReturnValue({
				findOne: jest.fn(),
				create: jest.fn(),
				updateOne: jest.fn(),
				find: jest.fn(),
				findById: jest.fn(),
				distinct: jest.fn(),
				insertMany: jest.fn(),
				aggregate: jest.fn().mockResolvedValue([]),
			}),
		}
	}
})

const mockGetGames = jest.fn()
jest.mock('@api/cbf', () => {
	return {
		__esModule: true,
		default: {
			getGames: mockGetGames,
		}
	}
})

const mockSend = jest.fn().mockResolvedValue(null)
const mockCreateComment = jest.fn().mockResolvedValue(null)
const mockGetComments = jest.fn().mockResolvedValue({ count: 0, items: [] })
const mockGetUsers = jest.fn().mockResolvedValue([{ first_name: 'John', last_name: 'Doe' }])
const mockGetMembers = jest.fn().mockResolvedValue({ items: [] })

jest.mock('@api/vk', () => {
	return {
		__esModule: true,
		default: {
			messages: {
				send: mockSend,
			},
			board: {
				createComment: mockCreateComment,
				getComments: mockGetComments,
			},
			users: {
				get: mockGetUsers,
			},
			groups: {
				getMembers: mockGetMembers,
			}
		},
	}
})

const mockAxiosPost = jest.fn()
jest.mock('axios', () => {
	return {
		__esModule: true,
		default: {
			post: mockAxiosPost,
		}
	}
})

const mockFindOneMember = jest.fn()
const mockUpdateOneMember = jest.fn()
const mockCreateMember = jest.fn()
jest.mock('@models/Member', () => {
	return {
		__esModule: true,
		default: {
			findOne: mockFindOneMember,
			updateOne: mockUpdateOneMember,
			create: mockCreateMember,
		}
	}
})

const mockCountDocuments = jest.fn()
jest.mock('@models/Reminder', () => {
	return {
		__esModule: true,
		default: {
			countDocuments: mockCountDocuments,
		}
	}
})

const mockFindOneBet = jest.fn()
const mockAggregateBet = jest.fn()
jest.mock('@models/Bet', () => {
	return {
		__esModule: true,
		default: {
			findOne: mockFindOneBet,
			aggregate: mockAggregateBet,
		}
	}
})

import bot from '@utils/bot'

describe('bot.ts utility functions', () => {
	describe('getTopicDataFromMessage', () => {
		test('should extract cmmId and topicId from a valid VK topic link', () => {
			const link = 'https://vk.com/topic-123456_789012'
			const result = bot.getTopicDataFromMessage(link)
			expect(result).toEqual({ cmm: 123456, tid: 789012 })
		})

		test('should return null if the message does not contain a topic link', () => {
			const text = 'Esta é uma mensagem qualquer sem link'
			const result = bot.getTopicDataFromMessage(text)
			expect(result).toBeNull()
		})
	})

	describe('getCommand', () => {
		test('should extract command in lowercase when valid format is provided', () => {
			expect(bot.getCommand('!citar')).toBe('citar')
			expect(bot.getCommand('!CITAR')).toBe('citar')
			expect(bot.getCommand('!Remind 10 minutos')).toBe('remind')
		})

		test('should return undefined if command prefix is missing', () => {
			expect(bot.getCommand('citar')).toBeUndefined()
			expect(bot.getCommand('mensagem de texto sem prefixo')).toBeUndefined()
		})
	})

	describe('getCommandParameters', () => {
		test('should extract single parameters correctly', () => {
			expect(bot.getCommandParameters('!citar -m')).toEqual(['m'])
			expect(bot.getCommandParameters('!jogos -a')).toEqual(['a'])
		})

		test('should extract multiple parameters correctly', () => {
			const params = bot.getCommandParameters('!pesquisar -c -t -m')
			expect(params).toEqual(['c', 't', 'm'])
		})

		test('should return undefined if no parameters exist', () => {
			expect(bot.getCommandParameters('!citar')).toBeUndefined()
		})
	})

	describe('getReminderDate', () => {
		test('should calculate correct date for minutes', () => {
			const now = new Date()
			const result = bot.getReminderDate('!remind 10 minutos')
			expect(result).toBeInstanceOf(Date)
			if (result) {
				const difference = (result.getTime() - now.getTime()) / 1000
				expect(difference).toBeCloseTo(600, 0) // ~600 seconds
			}
		})

		test('should calculate correct date for hours', () => {
			const now = new Date()
			const result = bot.getReminderDate('!remind -m 3 horas')
			expect(result).toBeInstanceOf(Date)
			if (result) {
				const difference = (result.getTime() - now.getTime()) / 1000
				expect(difference).toBeCloseTo(3 * 3600, 0)
			}
		})

		test('should calculate correct date for days', () => {
			const now = new Date()
			const result = bot.getReminderDate('!remind 5 dias')
			expect(result).toBeInstanceOf(Date)
			if (result) {
				const difference = (result.getTime() - now.getTime()) / 1000
				expect(difference).toBeCloseTo(5 * 24 * 3600, 0)
			}
		})

		test('should return false if time format is not matched', () => {
			expect(bot.getReminderDate('!remind amanha')).toBe(false)
			expect(bot.getReminderDate('!remind 5 anos')).toBe(false)
		})
	})

	describe('execCommand', () => {
		test('should invoke quotePost for quote command', async () => {
			const spy = jest.spyOn(bot, 'quotePost').mockResolvedValue(undefined)

			await bot.execCommand('citar', 1, 2, 3, 4, '!citar')

			expect(spy).toHaveBeenCalledWith({
				cmmId: 4,
				postId: 3,
				userId: 1,
				topicId: 2,
				message: '!citar',
			})

			spy.mockRestore()
		})

		test('should transpile short version to complete version', async () => {
			const spy = jest.spyOn(bot, 'likePost').mockResolvedValue(undefined)

			await bot.execCommand('l', 1, 2, 3, 4, '!l')

			expect(spy).toHaveBeenCalled()

			spy.mockRestore()
		})
	})

	describe('getGamesFormatted', () => {
		test('should format games correctly when there are matches for the given series', async () => {
			mockGetGames.mockResolvedValue({
				jogos: {
					'Campeonato Brasileiro': {
						'Série A': [
							{
								mandante: { nome: 'Flamengo', gols: '2' },
								visitante: { nome: 'Fluminense', gols: '1' },
								hora: '16:00',
								local: 'Maracanã',
							}
						]
					}
				}
			})

			const result = await bot.getGamesFormatted('a')
			expect(result).toBe('Flamengo 2 x 1 Fluminense - 16:00 - Maracanã')
		})

		test('should return empty string if no games are found for the given series', async () => {
			mockGetGames.mockResolvedValue({
				jogos: {}
			})

			const result = await bot.getGamesFormatted('b')
			expect(result).toBe('')
		})
	})

	describe('sendProfile', () => {
		beforeEach(() => {
			jest.clearAllMocks()
			mockFindOneBet.mockResolvedValue(null)
			mockAggregateBet.mockResolvedValue([])
		})

		test('should format and send profile to board when isMessage is false', async () => {
			mockFindOneMember.mockResolvedValue({
				userId: 300,
				cmmId: 100,
				posts: [50, 100, 150], // total 300 posts (level 4)
			})
			mockCountDocuments.mockResolvedValue(2) // 2 reminders
			mockGetUsers.mockResolvedValue([{ first_name: 'John', last_name: 'Doe' }])

			await bot.sendProfile({
				userId: 300,
				cmmId: 100,
				topicId: 200,
				postId: 400,
				message: '!perfil',
			})

			expect(mockCreateComment).toHaveBeenCalledWith(
				expect.objectContaining({
					cmmId: 100,
					topicId: 200,
					text: expect.stringContaining('estatísticas na comunidade de [id300|John Doe]:'),
				})
			)
			expect(mockCreateComment).toHaveBeenCalledWith(
				expect.objectContaining({
					text: expect.stringContaining('⭐ Nível: 8'),
				})
			)
			expect(mockCreateComment).toHaveBeenCalledWith(
				expect.objectContaining({
					text: expect.stringContaining('📝 Total de postagens: 300'),
				})
			)
			expect(mockCreateComment).toHaveBeenCalledWith(
				expect.objectContaining({
					text: expect.stringContaining('⏰ Lembretes pendentes: 2'),
				})
			)
			expect(mockCreateComment).toHaveBeenCalledWith(
				expect.objectContaining({
					text: expect.stringContaining('📅 Tempo de casa:'),
				})
			)
			expect(mockCreateComment).toHaveBeenCalledWith(
				expect.objectContaining({
					text: expect.stringContaining('🥉 Bronze'),
				})
			)
		})

		test('should send profile via DM when -m flag is present', async () => {
			mockFindOneMember.mockResolvedValue(null) // defaults to 0 posts, level 1
			mockCountDocuments.mockResolvedValue(0)
			mockGetUsers.mockResolvedValue([{ first_name: 'John', last_name: 'Doe' }])

			await bot.sendProfile({
				userId: 300,
				cmmId: 100,
				topicId: 200,
				postId: 400,
				message: '!perfil -m',
			})

			expect(mockSend).toHaveBeenCalledWith(
				expect.objectContaining({
					peerId: 300,
					message: expect.stringContaining('Nível: 1'),
				})
			)
			expect(mockCreateComment).not.toHaveBeenCalled()
		})
	})

	describe('updateMemberPosts with Level Up notifications', () => {
		beforeEach(() => {
			jest.clearAllMocks()
		})

		test('should trigger Level Up message when crossing level threshold', async () => {
			mockFindOneMember.mockResolvedValue({
				userId: 300,
				cmmId: 100,
				posts: [9], // total 9 posts (level 1) -> 10 posts (level 2)
			})
			mockGetUsers.mockResolvedValue([{ first_name: 'John', last_name: 'Doe' }])
			jest.spyOn(bot, 'getQuoteString').mockResolvedValue('[post400|John],')

			await bot.updateMemberPosts(100, 300, 200, 400)

			expect(mockCreateComment).toHaveBeenCalledWith(
				expect.objectContaining({
					cmmId: 100,
					topicId: 200,
					text: expect.stringContaining('[post400|John], parabéns! Você subiu para o Nível 2! 🎉'),
				})
			)
		})

		test('should NOT trigger Level Up message if level does not change', async () => {
			mockFindOneMember.mockResolvedValue({
				userId: 300,
				cmmId: 100,
				posts: [5], // total 5 posts (level 1) -> 6 posts (level 1)
			})

			await bot.updateMemberPosts(100, 300, 200, 400)

			expect(mockCreateComment).not.toHaveBeenCalled()
		})
	})

	describe('sendComparison', () => {
		beforeEach(() => {
			jest.clearAllMocks()
			mockFindOneBet.mockResolvedValue(null)
			mockAggregateBet.mockResolvedValue([])
		})

		test('should request target user mention if none provided', async () => {
			await bot.sendComparison({
				userId: 300,
				cmmId: 100,
				topicId: 200,
				postId: 400,
				message: '!vs',
			})

			expect(mockCreateComment).toHaveBeenCalledWith(
				expect.objectContaining({
					cmmId: 100,
					topicId: 200,
					text: expect.stringContaining('⚠️ Por favor, mencione o membro que deseja comparar'),
				})
			)
		})

		test('should format and send comparison if target user is valid', async () => {
			mockGetUsers.mockResolvedValue([
				{ id: 300, first_name: 'John', last_name: 'Doe' },
				{ id: 301, first_name: 'Jane', last_name: 'Smith' },
			])

			mockFindOneMember.mockImplementation(async (query) => {
				if (query.userId === 300) {
					return { userId: 300, cmmId: 100, posts: [20, 40] } // total 60 (level 4)
				}
				if (query.userId === 301) {
					return { userId: 301, cmmId: 100, posts: [50, 100] } // total 150 (level 6)
				}
				return null
			})

			mockAggregateBet.mockResolvedValue([])

			await bot.sendComparison({
				userId: 300,
				cmmId: 100,
				topicId: 200,
				postId: 400,
				message: '!vs [id301|Jane Smith]',
			})

			expect(mockCreateComment).toHaveBeenCalledWith(
				expect.objectContaining({
					cmmId: 100,
					topicId: 200,
					text: expect.stringContaining('comparativo direto entre os membros:'),
				})
			)
			expect(mockCreateComment).toHaveBeenCalledWith(
				expect.objectContaining({
					text: expect.stringContaining('Membro A: Nível 4'),
				})
			)
			expect(mockCreateComment).toHaveBeenCalledWith(
				expect.objectContaining({
					text: expect.stringContaining('Membro B: Nível 6'),
				})
			)
			expect(mockCreateComment).toHaveBeenCalledWith(
				expect.objectContaining({
					text: expect.stringContaining('Vencedor: Jane Smith'),
				})
			)
		})
	})

	describe('sendTopicSummary', () => {
		beforeEach(() => {
			jest.clearAllMocks()
			mockGetMembers.mockResolvedValue({ items: [] }) // default: not moderator
			mockGetComments.mockResolvedValue({ count: 0, items: [] })
			mockAxiosPost.mockResolvedValue({
				data: {
					candidates: [{ content: { parts: [{ text: 'Resumo mockado de IA.' }] } }]
				}
			})
			process.env.GEMINI_API_KEY = 'test-api-key'
		})

		test('should reply with error if no comments are found', async () => {
			mockGetComments.mockResolvedValue({ count: 0, items: [] })

			await bot.sendTopicSummary({
				userId: 300,
				cmmId: 100,
				topicId: 200,
				postId: 400,
				message: '!resumo',
			})

			expect(mockCreateComment).toHaveBeenCalledWith(
				expect.objectContaining({
					cmmId: 100,
					topicId: 200,
					text: expect.stringContaining('Não há comentários suficientes para resumir'),
				})
			)
		})

		test('should fetch comments, call Gemini, and post summary', async () => {
			mockGetComments.mockResolvedValue({
				count: 2,
				items: [
					{ id: 1, from_id: 301, text: 'Gostei da escalação do Hulk!' },
					{ id: 2, from_id: 302, text: 'Acho melhor ir de Arrascaeta.' },
				]
			})
			mockGetUsers.mockResolvedValue([
				{ id: 301, first_name: 'Jane', last_name: 'Smith' },
				{ id: 302, first_name: 'Bob', last_name: 'Johnson' },
			])

			await bot.sendTopicSummary({
				userId: 300,
				cmmId: 100,
				topicId: 200,
				postId: 400,
				message: '!resumo',
			})

			expect(mockGetComments).toHaveBeenCalledWith(
				expect.objectContaining({
					groupId: 100,
					topicId: 200,
					count: 50,
				})
			)

			expect(mockAxiosPost).toHaveBeenCalledWith(
				expect.stringContaining('generativelanguage.googleapis.com'),
				expect.objectContaining({
					contents: expect.arrayContaining([
						expect.objectContaining({
							parts: expect.arrayContaining([
								expect.objectContaining({
									text: expect.stringContaining('[Jane Smith]: Gostei da escalação')
								})
							])
						})
					])
				})
			)

			expect(mockCreateComment).toHaveBeenCalledWith(
				expect.objectContaining({
					cmmId: 100,
					topicId: 200,
					text: expect.stringContaining('Resumo mockado de IA.'),
				})
			)
		})

		test('should enforce 1h cooldown for normal users', async () => {
			mockGetComments.mockResolvedValue({
				count: 1,
				items: [{ id: 1, from_id: 301, text: 'Comentário teste.' }]
			})

			// First call (sets cooldown)
			await bot.sendTopicSummary({
				userId: 300,
				cmmId: 100,
				topicId: 999, // new topic
				postId: 400,
				message: '!resumo',
			})

			expect(mockCreateComment).toHaveBeenLastCalledWith(
				expect.objectContaining({
					text: expect.stringContaining('Resumo mockado de IA.'),
				})
			)

			// Second call (hits cooldown)
			await bot.sendTopicSummary({
				userId: 300,
				cmmId: 100,
				topicId: 999,
				postId: 401,
				message: '!resumo',
			})

			expect(mockCreateComment).toHaveBeenLastCalledWith(
				expect.objectContaining({
					text: expect.stringContaining('⚠️ O comando !resumo possui cooldown de 1h por tópico'),
				})
			)
		})

		test('should bypass cooldown for moderators', async () => {
			mockGetComments.mockResolvedValue({
				count: 1,
				items: [{ id: 1, from_id: 301, text: 'Comentário teste.' }]
			})

			// Mock user is manager
			mockGetMembers.mockResolvedValue({
				items: [{ id: 300, role: 'administrator' }]
			})

			// First call
			await bot.sendTopicSummary({
				userId: 300,
				cmmId: 100,
				topicId: 888,
				postId: 400,
				message: '!resumo',
			})

			// Second call should NOT hit cooldown
			await bot.sendTopicSummary({
				userId: 300,
				cmmId: 100,
				topicId: 888,
				postId: 401,
				message: '!resumo',
			})

			expect(mockCreateComment).toHaveBeenLastCalledWith(
				expect.objectContaining({
					text: expect.stringContaining('Resumo mockado de IA.'),
				})
			)
		})
	})
})
