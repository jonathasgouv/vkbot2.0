import cron from 'node-cron'
import reminder from '@crons/reminder'

cron.schedule('* * * * *', reminder.sendResponses, { scheduled: true, timezone: 'America/Sao_Paulo' })
