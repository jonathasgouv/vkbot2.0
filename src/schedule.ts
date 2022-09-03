import cron from 'node-cron'
import reminder from '@crons/reminder'
import members from '@crons/members'

cron.schedule('* * * * *', reminder.sendResponses, { scheduled: true, timezone: 'America/Sao_Paulo' })
cron.schedule('0 17 * * SAT', () => members.mostPosts(8), { scheduled: true, timezone: 'America/Sao_Paulo' })
