import Member from '@models/Member'
import Topic from '@models/Topic'
import bot from '@utils/bot'

export default {
	async saveTopics(): Promise<void> {
		console.info('Saving topics')
		try {
			const cmms = await Member.distinct('cmmId')

			for (const cmm of cmms) {
				const topics = await bot.getLastTopics(100, cmm)
				if (!topics || topics.length === 0) continue

				const topicIds = topics.map((t) => t._id)

				// Busca tópicos já existentes no banco para este lote em uma única consulta
				const existingTopics = await Topic.find({ _id: { $in: topicIds } }, '_id')
				const existingIds = new Set(existingTopics.map((t) => t._id))

				// Filtra apenas os novos tópicos que não estão no banco
				const newTopics = topics.filter((t) => !existingIds.has(t._id))

				if (newTopics.length > 0) {
					// Inserção em lote (Bulk Insert) de alta performance
					await Topic.insertMany(newTopics)
				}
			}

			console.info('Topics saved successfully')
		} catch (error) {
			console.error('Erro ao salvar tópicos:', error)
		}
	},
}
