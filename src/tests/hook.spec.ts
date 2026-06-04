import hookController from '@controllers/hookController'
import vkApi from '@api/vk'
import bot from '@utils/bot'
import ProcessedEvent from '@models/ProcessedEvent'
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

const mockIsMember = jest.fn()
const mockSend = jest.fn()
const mockCreateComment = jest.fn()
jest.mock('@api/vk', () => {
	return {
		__esModule: true,
		default: {
			groups: {
				isMember: (...args: any[]) => mockIsMember(...args),
			},
			messages: {
				send: (...args: any[]) => mockSend(...args),
			},
			board: {
				createComment: (...args: any[]) => mockCreateComment(...args),
			}
		}
	}
})

const mockCreateProcessedEvent = jest.fn()
jest.mock('@models/ProcessedEvent', () => {
	return {
		__esModule: true,
		default: {
			create: (...args: any[]) => mockCreateProcessedEvent(...args),
		}
	}
})

const mockExecCommand = jest.fn()
const mockGetCommand = jest.fn()
const mockIsBolaoTopic = jest.fn()
const mockUpdateMemberPosts = jest.fn()
const mockScanKeywords = jest.fn()
const mockProcessRoundGuesses = jest.fn()
jest.mock('@utils/bot', () => {
	return {
		__esModule: true,
		default: {
			execCommand: (...args: any[]) => mockExecCommand(...args),
			getCommand: (...args: any[]) => mockGetCommand(...args),
			isBolaoTopic: (...args: any[]) => mockIsBolaoTopic(...args),
			updateMemberPosts: (...args: any[]) => mockUpdateMemberPosts(...args),
			scanKeywords: (...args: any[]) => mockScanKeywords(...args),
			processRoundGuesses: (...args: any[]) => mockProcessRoundGuesses(...args),
		}
	}
})

describe('hookController', () => {
	let req: Partial<Request>
	let res: Partial<Response>
	let statusMock: jest.Mock
	let sendMock: jest.Mock

	beforeEach(() => {
		jest.clearAllMocks()
		statusMock = jest.fn().mockReturnThis()
		sendMock = jest.fn().mockReturnThis()
		res = {
			status: statusMock,
			send: sendMock,
		}
		process.env.SECRET = 'my_secret'
		process.env.BANNED_IDS = '[]'
	})

	describe('post', () => {
		test('should return confirmation key if confirmation type', async () => {
			process.env.CONFIRMATION_KEY = 'conf_key'
			req = {
				body: {
					type: 'confirmation',
				}
			}
			await hookController.post(req as Request, res as Response)
			expect(statusMock).toHaveBeenCalledWith(200)
			expect(sendMock).toHaveBeenCalledWith('conf_key')
		})

		test('should return ok and check secret key', async () => {
			req = {
				body: {
					secret: 'wrong_secret',
				}
			}
			await hookController.post(req as Request, res as Response)
			expect(statusMock).toHaveBeenCalledWith(200)
			expect(sendMock).toHaveBeenCalledWith('ok')
		})

		test('should check eventId idempotency and discard duplicate event', async () => {
			req = {
				body: {
					secret: 'my_secret',
					event_id: 'duplicate_123',
					type: 'board_post_new',
					group_id: 123,
					object: {
						topic_id: 456,
						from_id: 789,
						id: 1011,
						text: '!test',
					}
				}
			}

			// Simulate Mongo duplicate key error (11000)
			const error11000 = new Error('Duplicate key')
			;(error11000 as any).code = 11000
			mockCreateProcessedEvent.mockRejectedValue(error11000)

			await hookController.post(req as Request, res as Response)

			expect(mockCreateProcessedEvent).toHaveBeenCalledWith({ eventId: 'duplicate_123' })
			expect(statusMock).toHaveBeenCalledWith(200)
			expect(sendMock).toHaveBeenCalledWith('ok')
			
			// Should NOT execute anything else
			expect(mockExecCommand).not.toHaveBeenCalled()
		})

		test('should allow processing if eventId is unique', async () => {
			req = {
				body: {
					secret: 'my_secret',
					event_id: 'unique_123',
					type: 'board_post_new',
					group_id: 123,
					object: {
						topic_id: 456,
						from_id: 789,
						id: 1011,
						text: '!test',
					}
				}
			}

			mockCreateProcessedEvent.mockResolvedValue({})
			mockGetCommand.mockReturnValue('test')

			await hookController.post(req as Request, res as Response)

			expect(mockCreateProcessedEvent).toHaveBeenCalledWith({ eventId: 'unique_123' })
			expect(statusMock).toHaveBeenCalledWith(200)
			expect(sendMock).toHaveBeenCalledWith('ok')

			// Wait a brief moment for async promise chain to run
			await new Promise((resolve) => setTimeout(resolve, 10))

			expect(mockUpdateMemberPosts).toHaveBeenCalledWith(123, 789, 456, 1011)
			expect(mockExecCommand).toHaveBeenCalledWith('test', 789, 456, 1011, 123, '!test', false)
		})

		test('should handle message_new and verify membership', async () => {
			req = {
				body: {
					secret: 'my_secret',
					event_id: 'dm_123',
					type: 'message_new',
					group_id: 123,
					object: {
						message: {
							id: 1011,
							from_id: 789,
							text: '!ranking',
						}
					}
				}
			}

			mockCreateProcessedEvent.mockResolvedValue({})
			mockIsMember.mockResolvedValue(1) // 1 means member in VK
			mockGetCommand.mockReturnValue('ranking')

			await hookController.post(req as Request, res as Response)

			expect(statusMock).toHaveBeenCalledWith(200)
			expect(sendMock).toHaveBeenCalledWith('ok')

			await new Promise((resolve) => setTimeout(resolve, 10))

			expect(mockIsMember).toHaveBeenCalledWith({ groupId: 123, userId: 789 })
			expect(mockExecCommand).toHaveBeenCalledWith('ranking', 789, 0, 1011, 123, '!ranking', true)
		})

		test('should block message_new command if user is not a member of the group', async () => {
			req = {
				body: {
					secret: 'my_secret',
					event_id: 'dm_not_member_123',
					type: 'message_new',
					group_id: 123,
					object: {
						message: {
							id: 1011,
							from_id: 789,
							text: '!ranking',
						}
					}
				}
			}

			mockCreateProcessedEvent.mockResolvedValue({})
			mockIsMember.mockResolvedValue(0) // 0 means not a member in VK

			await hookController.post(req as Request, res as Response)

			expect(statusMock).toHaveBeenCalledWith(200)
			expect(sendMock).toHaveBeenCalledWith('ok')

			await new Promise((resolve) => setTimeout(resolve, 10))

			expect(mockIsMember).toHaveBeenCalledWith({ groupId: 123, userId: 789 })
			expect(mockSend).toHaveBeenCalledWith({
				peerId: 789,
				message: 'Você precisa ser membro do grupo para usar os comandos do bot.',
			})
			expect(mockExecCommand).not.toHaveBeenCalled()
		})

		test('should block incompatible command (e.g. !citar / !c) in private messages', async () => {
			req = {
				body: {
					secret: 'my_secret',
					event_id: 'dm_incompatible_123',
					type: 'message_new',
					group_id: 123,
					object: {
						message: {
							id: 1011,
							from_id: 789,
							text: '!citar',
						}
					}
				}
			}

			mockCreateProcessedEvent.mockResolvedValue({})
			mockIsMember.mockResolvedValue(1)
			mockGetCommand.mockReturnValue('citar')

			await hookController.post(req as Request, res as Response)

			await new Promise((resolve) => setTimeout(resolve, 10))

			expect(mockIsMember).toHaveBeenCalled()
			expect(mockSend).toHaveBeenCalledWith({
				peerId: 789,
				message: 'O comando !citar não é compatível em mensagens privadas pois requer o contexto de um tópico do fórum.',
			})
			expect(mockExecCommand).not.toHaveBeenCalled()
		})

		test('should block shorthand incompatible command (e.g. !c) in private messages', async () => {
			req = {
				body: {
					secret: 'my_secret',
					event_id: 'dm_incompatible_shorthand_123',
					type: 'message_new',
					group_id: 123,
					object: {
						message: {
							id: 1011,
							from_id: 789,
							text: '!c',
						}
					}
				}
			}

			mockCreateProcessedEvent.mockResolvedValue({})
			mockIsMember.mockResolvedValue(1)
			mockGetCommand.mockReturnValue('c')

			await hookController.post(req as Request, res as Response)

			await new Promise((resolve) => setTimeout(resolve, 10))

			expect(mockIsMember).toHaveBeenCalled()
			expect(mockSend).toHaveBeenCalledWith({
				peerId: 789,
				message: 'O comando !citar não é compatível em mensagens privadas pois requer o contexto de um tópico do fórum.',
			})
			expect(mockExecCommand).not.toHaveBeenCalled()
		})
	})
})
