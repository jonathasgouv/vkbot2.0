import cron from 'node-cron'
import reminder from '@crons/reminder'
import members from '@crons/members'
import topics from '@crons/topics'
import bolao from '@crons/bolao'
import comments from '@crons/comments'

cron.schedule('* * * * *', reminder.sendResponses, {
	scheduled: true,
	timezone: 'America/Sao_Paulo',
})
cron.schedule('0 17 * * SAT', () => members.mostPosts(8), {
	scheduled: true,
	timezone: 'America/Sao_Paulo',
})
cron.schedule('*/10 * * * *', topics.saveTopics, {
	scheduled: true,
	timezone: 'America/Sao_Paulo',
})
cron.schedule('0 */3 * * *', comments.syncCommentsAndLikes, {
	scheduled: true,
	timezone: 'America/Sao_Paulo',
})
cron.schedule('0 2 * * *', bolao.checkAndCreateNextRound, {
	scheduled: true,
	timezone: 'America/Sao_Paulo',
})
cron.schedule('0 * * * *', bolao.resolveRoundBets, {
	scheduled: true,
	timezone: 'America/Sao_Paulo',
})
