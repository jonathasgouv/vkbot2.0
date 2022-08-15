import Reminder from '@models/Reminder'
import vkApi from '@api/vk'
import bot from '@utils/bot'

export default {
  async sendResponses () {
    // Get reminders that are past current day
    const reminders = await Reminder.find({ expires: { $lte: new Date() } })

    // Send reminders
    reminders.forEach(async reminder => {
      const { cmmId, topicId, userId, postId, isMessage, _id } = reminder
      const quote = !isMessage ? await bot.getQuoteString(postId, userId) : ''
      const text = `${quote} estou te lembrando, como você pediu :)
      ${isMessage ? `https://vk.com/topic-${cmmId}_${topicId}?post=${postId}` : ''}`

      // Send message or comment
      isMessage ? vkApi.messages.send({ peerId: userId, message: text }) : vkApi.board.createComment({ cmmId, topicId, text })

      // Delete reminder from database
      reminder.delete()
    })
  }
}
