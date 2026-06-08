import '@config/environment'
import './schedule'

import express from 'express'
import hookRouter from '@routes/hook'
import cors from 'cors'
import mongoose from 'mongoose'
import Member from '@models/Member'
import Bet from '@models/Bet'
import BolaoRound from '@models/BolaoRound'
import vkApi from '@api/vk'
import generalFncs from '@utils/general'
import path from 'path'

const app = express()

app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use('/api/hook', hookRouter)

app.get('/health', (request, response) => {
	const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
	const status = dbStatus === 'connected' ? 'healthy' : 'unhealthy'
	
	return response.status(status === 'healthy' ? 200 : 500).json({
		status,
		uptime: process.uptime(),
		database: dbStatus,
		timestamp: new Date().toISOString()
	})
})

app.get('/healthcheck', (request, response) => {
	const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
	const status = dbStatus === 'connected' ? 'healthy' : 'unhealthy'
	
	return response.status(status === 'healthy' ? 200 : 500).json({
		status,
		uptime: process.uptime(),
		database: dbStatus,
		timestamp: new Date().toISOString()
	})
})

app.use(express.static('public'))

app.get('/ranking', (request, response) => {
	return response.sendFile(path.join(process.cwd(), 'public', 'ranking.html'))
})

interface ICacheEntry {
	timestamp: number
	data: any
}
const rankingCache = new Map<string, ICacheEntry>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

interface IVkUserCache {
	first_name: string
	last_name: string
	photo_100?: string
	timestamp: number
}
const vkUserCache = new Map<number, IVkUserCache>()
const VK_USER_CACHE_TTL = 30 * 60 * 1000 // 30 minutes

app.get('/api/ranking', async (request, response) => {
	try {
		let cmmId: number
		if (request.query.cmmId) {
			cmmId = parseInt(request.query.cmmId as string)
		} else {
			const cmmCounts = await Member.aggregate([
				{ $group: { _id: '$cmmId', count: { $sum: 1 } } },
				{ $sort: { count: -1 } },
				{ $limit: 1 }
			])
			if (cmmCounts.length === 0) {
				return response.json({ rpg: [], bolao: [], cmmId: null })
			}
			cmmId = cmmCounts[0]._id
		}

		const period = (request.query.period as string) || 'overall'
		const searchQuery = (request.query.search as string || '').trim().toLowerCase()
		const type = (request.query.type as string) || 'activity'
		const championship = (request.query.championship as string) || 'brasileirao'
		const cacheKey = `cmm_${cmmId}_${period}_${type}_${championship}_${searchQuery}`
		const cached = rankingCache.get(cacheKey)
		const now = Date.now()

		if (cached && (now - cached.timestamp < CACHE_TTL)) {
			return response.json(cached.data)
		}

		const botId = parseInt(process.env.BOT_ID || process.env.VK_BOT_ID || '0')

		// Calculate current week number
		const initialDate = process.env.INITIAL_DATE ? new Date(process.env.INITIAL_DATE) : new Date()
		const weekNumber = generalFncs.weeksBetween(initialDate, new Date())

		// Dynamic RPG post sum expression
		let postsExpression: any
		if (period === 'week') {
			postsExpression = {
				$ifNull: [{ $arrayElemAt: ['$posts', weekNumber] }, 0]
			}
		} else if (period === 'month') {
			postsExpression = {
				$reduce: {
					input: { $slice: [{ $ifNull: ['$posts', []] }, Math.max(0, weekNumber - 3), 4] },
					initialValue: 0,
					in: { $add: ['$$value', { $ifNull: ['$$this', 0] }] }
				}
			}
		} else if (period === 'year') {
			postsExpression = {
				$reduce: {
					input: { $slice: [{ $ifNull: ['$posts', []] }, Math.max(0, weekNumber - 51), 52] },
					initialValue: 0,
					in: { $add: ['$$value', { $ifNull: ['$$this', 0] }] }
				}
			}
		} else {
			// 'overall' / default
			postsExpression = {
				$reduce: {
					input: { $ifNull: ['$posts', []] },
					initialValue: 0,
					in: { $add: ['$$value', { $ifNull: ['$$this', 0] }] }
				}
			}
		}

		// RPG Ranking (Fetch all members of the community)
		const members = await Member.aggregate([
			{ $match: { cmmId, userId: { $ne: botId } } },
			{ $addFields: { totalPosts: postsExpression } }
		])

		// Calculate engagement and general XP in memory
		const calculatedMembers = members.map((m) => {
			const totalLikes = m.totalLikesReceived || 0
			const totalTopics = m.totalTopicsCreated || 0
			const totalComments = m.totalCommentsOnTopics || 0
			const engagementXp = (totalLikes * 10) + (totalTopics * 5) + (totalComments * 10)
			const generalXp = (m.totalPosts * 10) + engagementXp
			return {
				member: m,
				engagementXp,
				generalXp
			}
		})

		// Sort in memory by the selected type to assign ranks
		if (type === 'activity') {
			calculatedMembers.sort((a, b) => b.member.totalPosts - a.member.totalPosts)
		} else if (type === 'engagement') {
			calculatedMembers.sort((a, b) => b.engagementXp - a.engagementXp)
		} else if (type === 'general') {
			calculatedMembers.sort((a, b) => b.generalXp - a.generalXp)
		}

		// Assign ranks based on sorted order
		const sortedMembersWithRank = calculatedMembers.map((item, index) => ({
			...item,
			rank: index + 1
		}))

		// Dynamic Bolão matches date matching query
		const betsMatchQuery: any = { cmmId, processed: true, userId: { $ne: botId } }
		if (period === 'week') {
			betsMatchQuery.createdAt = { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
		} else if (period === 'month') {
			betsMatchQuery.createdAt = { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
		} else if (period === 'year') {
			betsMatchQuery.createdAt = { $gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) }
		}

		let targetChampionshipName = 'Campeonato Brasileiro'
		if (championship === 'copa') {
			targetChampionshipName = 'Copa do Mundo 2026'
		}
		const matchingRounds = await BolaoRound.find({ championshipName: targetChampionshipName, cmmId }).select('_id').lean()
		const roundIds = matchingRounds.map(r => r._id)
		betsMatchQuery.roundId = { $in: roundIds }

		// Bolão Ranking (Fetch all to assign absolute ranks)
		const bolao = await Bet.aggregate([
			{ $match: betsMatchQuery },
			{ $group: { _id: '$userId', totalPoints: { $sum: '$points' } } },
			{ $sort: { totalPoints: -1 } }
		])

		// Resolve VK profile details with memory caching
		// Ensure all IDs are valid numbers, filtering out falsy/invalid values
		const allUserIds = Array.from(new Set([
			...sortedMembersWithRank.map(m => Number(m.member.userId)),
			...bolao.map(b => Number(b._id))
		])).filter(id => typeof id === 'number' && !isNaN(id) && id > 0)

		// Optimize name resolution: 
		// 1. If search is empty, only fetch profiles for the top 50 displayed users of the sorted list.
		// 2. If search is numeric, only fetch profile for that specific user.
		// 3. Otherwise (name search), fetch all to allow substring matching.
		let targetUserIds: number[] = []
		if (!searchQuery) {
			targetUserIds = Array.from(new Set([
				...sortedMembersWithRank.slice(0, 50).map(m => Number(m.member.userId)),
				...bolao.slice(0, 50).map(b => Number(b._id))
			]))
		} else if (/^\d+$/.test(searchQuery)) {
			targetUserIds = [Number(searchQuery)]
		} else {
			targetUserIds = allUserIds
		}

		const missingUserIds = targetUserIds
			.filter(id => typeof id === 'number' && !isNaN(id) && id > 0)
			.filter(id => {
				const cachedUser = vkUserCache.get(id)
				return !cachedUser || (now - cachedUser.timestamp > VK_USER_CACHE_TTL)
			})

		if (missingUserIds.length > 0) {
			for (let i = 0; i < missingUserIds.length; i += 100) {
				const chunk = missingUserIds.slice(i, i + 100)
				try {
					const fetched = await vkApi.users.get({
						userIds: chunk,
						fields: ['photo_100']
					})
					if (fetched) {
						for (const u of fetched) {
							vkUserCache.set(u.id, {
								first_name: u.first_name,
								last_name: u.last_name,
								photo_100: u.photo_100,
								timestamp: now
							})
							// Cache in MongoDB asynchronously
							Member.updateMany(
								{ userId: u.id },
								{ $set: { firstName: u.first_name, lastName: u.last_name, photoUrl: u.photo_100 } }
							).catch(err => console.error('Error saving user cache in DB:', err))
						}
					}
					// Add a small 50ms delay between chunks to respect rate limits if we are fetching multiple pages
					if (missingUserIds.length > 100 && i + 100 < missingUserIds.length) {
						await new Promise(resolve => setTimeout(resolve, 50))
					}
				} catch (err) {
					console.error('Error fetching missing VK users:', err)
				}
			}
		}

		// Map RPG ranking and assign absolute ranks
		const rpgRanking = sortedMembersWithRank.map((item) => {
			const m = item.member
			const cachedUser = vkUserCache.get(Number(m.userId))
			const name = cachedUser 
				? `${cachedUser.first_name} ${cachedUser.last_name}` 
				: (m.firstName ? `${m.firstName} ${m.lastName || ''}`.trim() : `Membro ${m.userId}`)
			const photo = cachedUser?.photo_100 || m.photoUrl || 'https://vk.com/images/camera_100.png'
			
			const lvlInfo = generalFncs.getLevelInfo(m.totalPosts * 10)
			const engagementLvlInfo = generalFncs.getLevelInfo(item.engagementXp)
			const generalLvlInfo = generalFncs.getLevelInfo(item.generalXp)
			
			// Calcular tempo de casa
			const firstActiveWeek = m.posts ? m.posts.findIndex((p: number) => (p || 0) > 0) : -1
			let weeksOfHouse = 0
			let monthsOfHouse = 0
			if (firstActiveWeek !== -1) {
				const joinDate = new Date(initialDate.getTime() + firstActiveWeek * 7 * 24 * 60 * 60 * 1000)
				const diffTime = Math.abs(now - joinDate.getTime())
				weeksOfHouse = Math.floor(diffTime / (7 * 24 * 60 * 60 * 1000))
				monthsOfHouse = Math.floor(weeksOfHouse / 4.34)
			}

			// Construir medalhas
			const badges: string[] = []
			if (m.totalPosts >= 100) badges.push('🥉 Bronze')
			if (m.totalPosts >= 500) badges.push('🥈 Prata')
			if (m.totalPosts >= 2000) badges.push('🥇 Ouro')
			if (m.totalPosts >= 5000) badges.push('💎 Platina')
			if (m.totalPosts >= 10000) badges.push('🏆 Lenda')
			if (m.totalPosts >= 25000) badges.push('👑 Imperador')
			if (m.totalPosts >= 50000) badges.push('🚀 Mestre')
			if (m.totalPosts >= 75000) badges.push('💫 Mítico')
			if (m.totalPosts >= 100000) badges.push('🔱 Deus')

			if (weeksOfHouse >= 20) {
				badges.push('👴 Old')
			} else if (weeksOfHouse <= 4 && firstActiveWeek !== -1) {
				badges.push('👶 Modinha')
			}

			if (m.coruja) {
				badges.push('🦉 Coruja')
			}

			return {
				userId: m.userId,
				name,
				photo,
				totalPosts: m.totalPosts,
				level: lvlInfo.level,
				progressBar: lvlInfo.progressBar,
				percentage: lvlInfo.percentage,
				houseTime: `${monthsOfHouse} meses (${weeksOfHouse} semanas)`,
				badges,
				rank: item.rank,
				totalLikes: m.totalLikesReceived || 0,
				totalTopics: m.totalTopicsCreated || 0,
				totalComments: m.totalCommentsOnTopics || 0,
				engagementXp: item.engagementXp,
				engagementLevel: engagementLvlInfo.level,
				engagementProgressBar: engagementLvlInfo.engagementProgressBar || engagementLvlInfo.progressBar,
				engagementPercentage: engagementLvlInfo.engagementPercentage || engagementLvlInfo.percentage,
				generalXp: item.generalXp,
				generalLevel: generalLvlInfo.generalLevel || generalLvlInfo.level,
				generalProgressBar: generalLvlInfo.generalProgressBar || generalLvlInfo.progressBar,
				generalPercentage: generalLvlInfo.generalPercentage || generalLvlInfo.percentage
			}
		})

		const bolaoRanking = bolao.map((b, index) => {
			const cachedUser = vkUserCache.get(Number(b._id))
			const dbMember = members.find(m => Number(m.userId) === Number(b._id))
			const name = cachedUser 
				? `${cachedUser.first_name} ${cachedUser.last_name}` 
				: (dbMember?.firstName ? `${dbMember.firstName} ${dbMember.lastName || ''}`.trim() : `Membro ${b._id}`)
			const photo = cachedUser?.photo_100 || dbMember?.photoUrl || 'https://vk.com/images/camera_100.png'
			return {
				userId: b._id,
				name,
				photo,
				points: b.totalPoints,
				rank: index + 1
			}
		})

		// Filter by search query if present, otherwise slice to top 50
		let filteredRpg = rpgRanking
		let filteredBolao = bolaoRanking

		if (searchQuery) {
			filteredRpg = rpgRanking.filter(m => 
				m.name.toLowerCase().includes(searchQuery) || 
				String(m.userId) === searchQuery
			)
			filteredBolao = bolaoRanking.filter(b => 
				b.name.toLowerCase().includes(searchQuery) || 
				String(b.userId) === searchQuery
			)
		} else {
			filteredRpg = rpgRanking.slice(0, 50)
			filteredBolao = bolaoRanking.slice(0, 50)
		}

		const responseData = {
			rpg: filteredRpg,
			bolao: filteredBolao,
			cmmId
		}

		rankingCache.set(cacheKey, {
			timestamp: now,
			data: responseData
		})

		return response.json(responseData)
	} catch (error) {
		console.error('Error fetching ranking API:', error)
		return response.status(500).json({ error: 'Internal Server Error' })
	}
})

app.get('/', (request, response) => {
	return response.send('bip bop')
})

if (process.env.NODE_ENV !== 'test') {
	mongoose.connection.once('open', () => {
		console.info('Database connected. Triggering startup sync')
		import('@crons/topics')
			.then((m) => m.default.saveTopics())
			.catch((err) => console.error('Error in startup topics sync:', err))
		import('@crons/comments')
			.then((m) => m.default.syncCommentsAndLikes())
			.catch((err) => console.error('Error in startup comments sync:', err))
		import('@crons/quiz')
			.then((m) => m.default.bootstrapQuizForCurrentWeek())
			.catch((err) => console.error('Error in startup quiz bootstrap:', err))
		import('@crons/resenha')
			.then((m) => m.default.bootstrapResenhaForCurrentWeek())
			.catch((err) => console.error('Error in startup resenha bootstrap:', err))
	})
}

export default app
