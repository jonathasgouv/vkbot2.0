export default interface IMember {
	userId: number
	cmmId: number
	posts: number[]
	coruja?: boolean
	totalLikesReceived?: number
	totalTopicsCreated?: number
	totalCommentsOnTopics?: number
}
