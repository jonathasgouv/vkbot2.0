import Member from '@models/Member'
import Topic from '@models/Topic'
import bot from '@utils/bot'

export default {
	async saveTopics(): Promise<void> {
		const cmms = await Member.distinct('cmmId')

		cmms.forEach(async (cmm) => {
			const topics = await bot.getLastTopics(100, cmm)

			Topic.bulkWrite(
				topics.map((topic) => ({
					updateOne: {
						filter: { _id: topic._id },
						update: {$setOnInsert : { $set: topic }},
						upsert: true,
					},
				}))
			)
		})
	},
}
