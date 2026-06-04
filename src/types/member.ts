export default interface IMember {
	userId: number
	cmmId: number
	posts: number[]
	coruja?: boolean
	totalLikesReceived?: number
	totalTopicsCreated?: number
	totalCommentsOnTopics?: number
	lastProfileCommandAt?: Date
	lastRankingCommandAt?: Date
	firstName?: string
	lastName?: string
	photoUrl?: string
	customBadges?: string[]
}
