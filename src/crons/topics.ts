import Member from '@models/Member'
import Topic from '@models/Topic'
import bot from '@utils/bot'

export default {
	async saveTopics(): Promise<void> {
		console.info('Saving topics and updating engagement stats')
		try {
			const cmms = await Member.distinct('cmmId')

			for (const cmm of cmms) {
				const topics = await bot.getLastTopics(100, cmm)
				if (!topics || topics.length === 0) continue

				// Use bulkWrite to upsert/update all topics in a single call
				const bulkOps = topics.map((t) => ({
					updateOne: {
						filter: { _id: t._id },
						update: {
							$set: {
								cmmId: t.cmmId,
								title: t.title,
								first_comment: t.first_comment,
								created_by: t.created_by,
								is_fixed: t.is_fixed,
								createdAt: t.createdAt,
								commentsCount: t.commentsCount,
							}
						},
						upsert: true
					}
				}))

				if (bulkOps.length > 0) {
					await Topic.bulkWrite(bulkOps)
				}

				// Aggregate topic creator stats for this community
				const creatorsStats = await Topic.aggregate([
					{ $match: { cmmId: cmm } },
					{ $group: { _id: '$created_by', topicsCount: { $sum: 1 }, totalComments: { $sum: '$commentsCount' } } }
				])

				// Reset all members stats first to handle deleted/removed topics
				await Member.updateMany({ cmmId: cmm }, { totalTopicsCreated: 0, totalCommentsOnTopics: 0 })

				// Update creators stats
				const memberBulkOps = creatorsStats.map((stat) => ({
					updateOne: {
						filter: { cmmId: cmm, userId: stat._id },
						update: {
							$set: {
								totalTopicsCreated: stat.topicsCount,
								totalCommentsOnTopics: stat.totalComments,
							}
						}
					}
				}))

				if (memberBulkOps.length > 0) {
					await Member.bulkWrite(memberBulkOps)
				}
			}

			console.info('Topics saved successfully')
		} catch (error) {
			console.error('Erro ao salvar tópicos:', error)
		}
	},
}
