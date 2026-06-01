import Reminder from '@models/Reminder'
import vkApi from '@api/vk'
import bot from '@utils/bot'

export default {
	async sendResponses(): Promise<void> {
		console.info('Checking reminders')

		// Get reminders that are past current day
		const reminders = await Reminder.find({
			expires: { $lte: new Date() },
		})

		if (reminders.length === 0) {
			console.info('No reminders to process')
			return
		}

		// Send reminders concurrently and safely
		const promises = reminders.map(async (reminder) => {
			try {
				const { cmmId, topicId, userId, postId, isMessage } = reminder
				const quote = !isMessage ? await bot.getQuoteString(postId, userId) : ''
				const text = `${quote} estou te lembrando, como você pediu :)
      ${isMessage ? `https://vk.com/topic-${cmmId}_${topicId}?post=${postId}` : ''}`

				// Send message or comment and wait for result
				if (isMessage) {
					await vkApi.messages.send({ peerId: userId, message: text })
				} else {
					await vkApi.board.createComment({ cmmId, topicId, text })
				}

				// Delete reminder from database using non-deprecated method
				await reminder.deleteOne()
			} catch (error) {
				console.error(`Erro ao processar o lembrete com ID ${reminder._id}:`, error)
			}
		})

		await Promise.all(promises)

		console.info('Reminders answered successfully')
	},
}
