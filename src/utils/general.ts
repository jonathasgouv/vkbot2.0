export default {
	weeksBetween(initialDate: Date, finalDate: Date): number {
		const weeksInMilliseconds = 7 * 24 * 60 * 60 * 1000

		return Math.abs(Math.floor((finalDate.getTime() - initialDate.getTime()) / weeksInMilliseconds))
	},
}
