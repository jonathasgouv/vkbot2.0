import general from '@utils/general'

describe('generalFncs.weeksBetween', () => {
	test('should return 0 when the dates are on the same day', () => {
		const date = new Date('2022-08-15')
		const result = general.weeksBetween(date, date)
		expect(result).toBe(0)
	})

	test('should calculate correct weeks between two dates', () => {
		const initialDate = new Date('2022-08-15')
		const oneWeekLater = new Date('2022-08-22')
		const twoWeeksLater = new Date('2022-08-29')

		expect(general.weeksBetween(initialDate, oneWeekLater)).toBe(1)
		expect(general.weeksBetween(initialDate, twoWeeksLater)).toBe(2)
	})

	test('should be absolute (always positive) regardless of date ordering', () => {
		const date1 = new Date('2022-08-15')
		const date2 = new Date('2022-08-22')

		const order1 = general.weeksBetween(date1, date2)
		const order2 = general.weeksBetween(date2, date1)

		expect(order1).toBe(1)
		expect(order2).toBe(1)
	})

	test('should ignore fractional weeks and round down', () => {
		const date1 = new Date('2022-08-15')
		const date2 = new Date('2022-08-21') // 6 days later (not a full week)
		const date3 = new Date('2022-08-28') // 13 days later (1 full week + 6 days)

		expect(general.weeksBetween(date1, date2)).toBe(0)
		expect(general.weeksBetween(date1, date3)).toBe(1)
	})
})

describe('generalFncs.getLevelInfo', () => {
	test('should return level 1 with 0 total posts and correct progress', () => {
		const result = general.getLevelInfo(0)
		expect(result).toEqual({
			level: 1,
			xpProgress: 0,
			xpNeededForNext: 100,
			percentage: 0,
			progressBar: '[░░░░░░░░░░]',
		})
	})

	test('should return level 1 for 5 posts (50% progress)', () => {
		const result = general.getLevelInfo(5)
		expect(result.level).toBe(1)
		expect(result.xpProgress).toBe(50)
		expect(result.xpNeededForNext).toBe(100)
		expect(result.percentage).toBe(50)
		expect(result.progressBar).toBe('[█████░░░░░]')
	})

	test('should level up to 2 at exactly 10 posts', () => {
		const result = general.getLevelInfo(10)
		expect(result.level).toBe(2)
		expect(result.xpProgress).toBe(0)
		expect(result.xpNeededForNext).toBe(200)
		expect(result.percentage).toBe(0)
		expect(result.progressBar).toBe('[░░░░░░░░░░]')
	})

	test('should level up to 3 at exactly 30 posts (10 + 20)', () => {
		const result = general.getLevelInfo(30)
		expect(result.level).toBe(3)
		expect(result.xpProgress).toBe(0)
		expect(result.xpNeededForNext).toBe(300)
	})

	test('should handle high post counts correctly', () => {
		const result = general.getLevelInfo(300)
		expect(result.level).toBe(8)
		expect(result.xpProgress).toBe(200)
		expect(result.xpNeededForNext).toBe(800)
		expect(result.percentage).toBe(25)
	})
})
