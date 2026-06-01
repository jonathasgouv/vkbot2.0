const mockSend = jest.fn().mockResolvedValue(null)
const mockCreateComment = jest.fn().mockResolvedValue(null)
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
			},
			users: {
				get: mockGetUsers,
			},
		},
	}
})

const mockSearchAndGetSummary = jest.fn()
jest.mock('@api/wikipedia', () => {
	return {
		__esModule: true,
		default: {
			searchAndGetSummary: mockSearchAndGetSummary,
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

import bot from '@utils/bot'

describe('Wikipedia command tests', () => {
	beforeEach(() => {
		jest.clearAllMocks()
	})

	test('should return warning message if search term is empty', async () => {
		jest.spyOn(bot, 'getQuoteString').mockResolvedValue('[post400|John],')

		await bot.searchWiki({
			cmmId: 100,
			userId: 300,
			topicId: 200,
			postId: 400,
			message: '!wiki',
		})

		expect(mockCreateComment).toHaveBeenCalledWith(
			expect.objectContaining({
				cmmId: 100,
				topicId: 200,
				text: expect.stringContaining('[post400|John], por favor insira um termo para pesquisa. Exemplo: !wiki inteligência artificial'),
			})
		)
		expect(mockSearchAndGetSummary).not.toHaveBeenCalled()
	})

	test('should display summary if article is found', async () => {
		mockSearchAndGetSummary.mockResolvedValue({
			title: 'Inteligência artificial',
			extract: 'Inteligência artificial é...',
			pageUrl: 'https://pt.wikipedia.org/wiki/Intelig%C3%AAncia_artificial',
		})
		jest.spyOn(bot, 'getQuoteString').mockResolvedValue('[post400|John],')

		await bot.searchWiki({
			cmmId: 100,
			userId: 300,
			topicId: 200,
			postId: 400,
			message: '!wiki inteligência artificial',
		})

		expect(mockSearchAndGetSummary).toHaveBeenCalledWith('inteligência artificial')
		expect(mockCreateComment).toHaveBeenCalledWith(
			expect.objectContaining({
				cmmId: 100,
				topicId: 200,
				text: expect.stringContaining('[post400|John], 📖 *Wikipédia: Inteligência artificial* 📖\n\nInteligência artificial é...\n\nLeia mais em: https://pt.wikipedia.org/wiki/Intelig%C3%AAncia_artificial'),
			})
		)
	})

	test('should display summary if article is found and flag -m is present (send DM)', async () => {
		mockSearchAndGetSummary.mockResolvedValue({
			title: 'Inteligência artificial',
			extract: 'Inteligência artificial é...',
			pageUrl: 'https://pt.wikipedia.org/wiki/Intelig%C3%AAncia_artificial',
		})
		jest.spyOn(bot, 'getQuoteString').mockResolvedValue('[post400|John],')

		await bot.searchWiki({
			cmmId: 100,
			userId: 300,
			topicId: 200,
			postId: 400,
			message: '!wiki -m inteligência artificial',
		})

		expect(mockSearchAndGetSummary).toHaveBeenCalledWith('inteligência artificial')
		expect(mockSend).toHaveBeenCalledWith(
			expect.objectContaining({
				peerId: 300,
				message: expect.stringContaining('📖 *Wikipédia: Inteligência artificial* 📖\n\nInteligência artificial é...\n\nLeia mais em: https://pt.wikipedia.org/wiki/Intelig%C3%AAncia_artificial'),
			})
		)
		expect(mockCreateComment).not.toHaveBeenCalled()
	})

	test('should return warning message if query yields no results', async () => {
		mockSearchAndGetSummary.mockResolvedValue(null)
		jest.spyOn(bot, 'getQuoteString').mockResolvedValue('[post400|John],')

		await bot.searchWiki({
			cmmId: 100,
			userId: 300,
			topicId: 200,
			postId: 400,
			message: '!wiki unexistentialSubject',
		})

		expect(mockSearchAndGetSummary).toHaveBeenCalledWith('unexistentialSubject')
		expect(mockCreateComment).toHaveBeenCalledWith(
			expect.objectContaining({
				cmmId: 100,
				topicId: 200,
				text: expect.stringContaining('[post400|John], não consegui encontrar nenhuma informação sobre "unexistentialSubject" na Wikipédia.'),
			})
		)
	})
})
