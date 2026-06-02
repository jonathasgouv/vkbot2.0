import Member from '@models/Member'
import Comment from '@models/Comment'
import bot from '@utils/bot'
import vkApi from '@api/vk'

export default {
	async syncCommentsAndLikes(): Promise<void> {
		console.info('Syncing comments and likes from VK')
		try {
			const cmms = await Member.distinct('cmmId')

			for (const cmmId of cmms) {
				const topicsCount = 50
				const activeTopics = await bot.getLastTopics(topicsCount, cmmId)
				if (!activeTopics || activeTopics.length === 0) continue

				for (const topic of activeTopics) {
					const topicId = topic._id
					let offset = 0
					const maxCommentsToSync = 500
					if (topic.commentsCount && topic.commentsCount > maxCommentsToSync) {
						offset = Math.floor((topic.commentsCount - maxCommentsToSync) / 100) * 100
					}
					let hasMore = true
					const allCommentsToSave = []

					while (hasMore) {
						try {
							const commentsResponse = await vkApi.board.getComments({
								groupId: cmmId,
								topicId,
								needLikes: 1,
								count: 100,
								offset,
							})

							if (!commentsResponse || !commentsResponse.items || commentsResponse.items.length === 0) {
								hasMore = false
								break
							}

							for (const item of commentsResponse.items) {
								// In VK board comments, from_id can be negative for group postings
								if (item.from_id && typeof item.from_id === 'number') {
									allCommentsToSave.push({
										cmmId,
										topicId,
										commentId: item.id,
										userId: item.from_id,
										likes: item.likes?.count || 0,
										createdAt: new Date(item.date * 1000),
									})
								}
							}

							if (commentsResponse.items.length < 100) {
								hasMore = false
							} else {
								offset += 100
								// Rate limit safeguard: sleep 100ms between page requests
								await new Promise((resolve) => setTimeout(resolve, 100))
							}
						} catch (apiError) {
							console.error(`Erro ao buscar comentários do tópico ${topicId} no VK:`, apiError)
							hasMore = false // stop on error for this topic
						}
					}

					// Upsert comments in bulk
					if (allCommentsToSave.length > 0) {
						const bulkOps = allCommentsToSave.map((c) => ({
							updateOne: {
								filter: { topicId: c.topicId, commentId: c.commentId },
								update: { $set: c },
								upsert: true,
							},
						}))
						await Comment.bulkWrite(bulkOps)
					}
				}

				// Aggregate total likes received in this community
				const likesStats = await Comment.aggregate([
					{ $match: { cmmId } },
					{ $group: { _id: '$userId', totalLikes: { $sum: '$likes' } } },
				])

				// Reset all members totalLikesReceived first
				await Member.updateMany({ cmmId }, { totalLikesReceived: 0 })

				// Update members totalLikesReceived
				const memberBulkOps = likesStats.map((stat) => ({
					updateOne: {
						filter: { cmmId, userId: stat._id },
						update: { $set: { totalLikesReceived: stat.totalLikes } },
					},
				}))

				if (memberBulkOps.length > 0) {
					await Member.bulkWrite(memberBulkOps)
				}
			}

			console.info('Comments and likes synced successfully')
		} catch (error) {
			console.error('Erro ao sincronizar comentários e likes:', error)
		}
	},
}
