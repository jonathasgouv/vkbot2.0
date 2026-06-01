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
const mockGetUsers = jest.fn().mockResolvedValue([{ first_name: 'John', last_name: 'Doe' }])

jest.mock('@api/vk', () => {
	return {
		__esModule: true,
		default: {
			messages: {
				send: mockSend,
			},
			board: {
				createComment: mockCreateComment,
			},
			users: {
				get: mockGetUsers,
			}
		},
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
})
