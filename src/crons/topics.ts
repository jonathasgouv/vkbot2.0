import Member from '@models/Member'
import Topic from '@models/Topic'
import bot from '@utils/bot'

export default {
	async saveTopics(): Promise<void> {
		console.info('Saving topics')

		const cmms = await Member.distinct('cmmId')

		cmms.forEach(async (cmm) => {
			const topics = await bot.getLastTopics(100, cmm)

			topics.forEach(async topic => {
				const alreadyExists = await Topic.findById(topic._id)

				if (!alreadyExists) Topic.create(topic)
			})

			console.info('Topics saved successfully')
		})
	},
}
