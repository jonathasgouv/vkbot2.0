export default {
	weeksBetween(initialDate: Date, finalDate: Date): number {
		const weeksInMilliseconds = 7 * 24 * 60 * 60 * 1000

		return Math.abs(Math.floor((finalDate.getTime() - initialDate.getTime()) / weeksInMilliseconds))
	},

	getLevelInfo(totalPosts: number): { level: number; xpProgress: number; xpNeededForNext: number; progressBar: string; percentage: number } {
		let level = 1
		let remaining = totalPosts

		const getRequiredPosts = (lvl: number): number => {
			if (lvl <= 10) {
				return lvl * 10
			} else if (lvl <= 30) {
				return 100 + (lvl - 10) * 50
			} else {
				return 1100 + (lvl - 30) * 200
			}
		}

		let postsNeeded = getRequiredPosts(level)
		while (remaining >= postsNeeded) {
			remaining -= postsNeeded
			level++
			postsNeeded = getRequiredPosts(level)
		}

		const xpProgress = remaining * 10
		const xpNeededForNext = postsNeeded * 10
		const percentage = Math.round((xpProgress / xpNeededForNext) * 100)

		// Gera uma barra de progresso ASCII de 10 caracteres
		const filledBlocks = Math.round(percentage / 10)
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
