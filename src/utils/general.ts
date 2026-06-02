export default {
	weeksBetween(initialDate: Date, finalDate: Date): number {
		const weeksInMilliseconds = 7 * 24 * 60 * 60 * 1000

		return Math.abs(Math.floor((finalDate.getTime() - initialDate.getTime()) / weeksInMilliseconds))
	},

	getLevelInfo(xp: number): { level: number; xpProgress: number; xpNeededForNext: number; progressBar: string; percentage: number } {
		let level = 1
		let remaining = xp

		const getRequiredXp = (lvl: number): number => {
			if (lvl <= 10) {
				return lvl * 100
			} else if (lvl <= 30) {
				return 1000 + (lvl - 10) * 500
			} else {
				return 11000 + (lvl - 30) * 2000
			}
		}

		let xpNeeded = getRequiredXp(level)
		while (remaining >= xpNeeded) {
			remaining -= xpNeeded
			level++
			xpNeeded = getRequiredXp(level)
		}

		const xpProgress = remaining
		const xpNeededForNext = xpNeeded
		const percentage = Math.round((xpProgress / xpNeededForNext) * 100) || 0

		// Gera uma barra de progresso ASCII de 10 caracteres
		const filledBlocks = Math.min(10, Math.round(percentage / 10))
		const emptyBlocks = 10 - filledBlocks
		const progressBar = `[${'█'.repeat(filledBlocks)}${'░'.repeat(emptyBlocks)}]`

		return {
			level,
			xpProgress,
			xpNeededForNext,
			progressBar,
			percentage,
		}
	},
}
