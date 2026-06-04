import cron from 'node-cron'
import reminder from '@crons/reminder'
import members from '@crons/members'
import topics from '@crons/topics'
import bolao from '@crons/bolao'
import comments from '@crons/comments'
import copa from '@crons/copa'
import mural from '@crons/mural'
import quiz from '@crons/quiz'
import resenha from '@crons/resenha'

cron.schedule('* * * * *', () => reminder.sendResponses(), {
	scheduled: true,
	timezone: 'America/Sao_Paulo',
})
cron.schedule('0 17 * * SAT', () => members.mostPosts(8), {
	scheduled: true,
	timezone: 'America/Sao_Paulo',
})
cron.schedule('*/10 * * * *', () => topics.saveTopics(), {
	scheduled: true,
	timezone: 'America/Sao_Paulo',
})
cron.schedule('0 */3 * * *', () => comments.syncCommentsAndLikes(), {
	scheduled: true,
	timezone: 'America/Sao_Paulo',
})
cron.schedule('0 2 * * *', () => bolao.checkAndCreateNextRound(), {
	scheduled: true,
	timezone: 'America/Sao_Paulo',
})
cron.schedule('0 * * * *', () => bolao.resolveRoundBets(), {
	scheduled: true,
	timezone: 'America/Sao_Paulo',
})
cron.schedule('15 2 * * *', () => copa.checkAndCreateNextCopaRound(), {
	scheduled: true,
	timezone: 'America/Sao_Paulo',
})
cron.schedule('30 * * * *', () => copa.resolveCopaRoundBets(), {
	scheduled: true,
	timezone: 'America/Sao_Paulo',
})
cron.schedule('0 9 * * MON', () => mural.createWeeklyMural(), {
	scheduled: true,
	timezone: 'America/Sao_Paulo',
})
cron.schedule('0 18 * * *', () => quiz.postDailyQuiz(), {
	scheduled: true,
	timezone: 'America/Sao_Paulo',
})
cron.schedule('* * * * *', () => quiz.checkQuizTimeout(), {
	scheduled: true,
	timezone: 'America/Sao_Paulo',
})
cron.schedule('0 12 * * TUE', () => resenha.createRoundResenha(), {
	scheduled: true,
	timezone: 'America/Sao_Paulo',
})
