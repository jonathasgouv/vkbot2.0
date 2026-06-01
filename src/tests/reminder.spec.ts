const mockSend = jest.fn().mockResolvedValue(null)
const mockCreateComment = jest.fn().mockResolvedValue(null)

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
		},
	}
})

const mockFindReminders = jest.fn()
jest.mock('@models/Reminder', () => {
	return {
		__esModule: true,
		default: {
			find: mockFindReminders,
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

import reminderCron from '@crons/reminder'
import bot from '@utils/bot'

describe('reminder cron job tests', () => {
	beforeEach(() => {
		jest.clearAllMocks()
	})

	test('should not process if there are no expired reminders', async () => {
		mockFindReminders.mockResolvedValue([])

		await reminderCron.sendResponses()

		expect(mockSend).not.toHaveBeenCalled()
		expect(mockCreateComment).not.toHaveBeenCalled()
	})

	test('should process expired reminders and call appropriate dispatch method', async () => {
		const mockReminder1 = {
			_id: 'rem1',
			cmmId: 100,
			topicId: 200,
			userId: 300,
			postId: 400,
			isMessage: true,
			deleteOne: jest.fn().mockResolvedValue(null),
		}

		const mockReminder2 = {
			_id: 'rem2',
			cmmId: 100,
			topicId: 200,
			userId: 300,
			postId: 401,
			isMessage: false,
			deleteOne: jest.fn().mockResolvedValue(null),
		}

		mockFindReminders.mockResolvedValue([mockReminder1, mockReminder2])
		jest.spyOn(bot, 'getQuoteString').mockResolvedValue('[post401|John],')

		await reminderCron.sendResponses()

		// For Reminder 1: isMessage is true, so messages.send is called
		expect(mockSend).toHaveBeenCalledWith(
			expect.objectContaining({
				peerId: 300,
				message: expect.stringContaining('https://vk.com/topic-100_200?post=400'),
			})
		)
		expect(mockReminder1.deleteOne).toHaveBeenCalled()

		// For Reminder 2: isMessage is false, so board.createComment is called
		expect(mockCreateComment).toHaveBeenCalledWith(
			expect.objectContaining({
				cmmId: 100,
				topicId: 200,
				text: expect.stringContaining('[post401|John],'),
			})
		)
		expect(mockReminder2.deleteOne).toHaveBeenCalled()
	})
})
