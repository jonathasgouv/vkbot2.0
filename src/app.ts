import '@config/environment'
import './schedule'

import express from 'express'
import hookRouter from '@routes/hook'
import cors from 'cors'
import mongoose from 'mongoose'
import Member from '@models/Member'
import Bet from '@models/Bet'
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

app.get('/api/ranking', async (request, response) => {
	try {
		let cmmId: number
		if (request.query.cmmId) {
			cmmId = parseInt(request.query.cmmId as string)
		} else {
			const communities = await Member.distinct('cmmId')
			if (communities.length === 0) {
				return response.json({ rpg: [], bolao: [], cmmId: null })
			}
			cmmId = communities[0]
		}

		const cacheKey = `cmm_${cmmId}`
		const cached = rankingCache.get(cacheKey)
		const now = Date.now()

		if (cached && (now - cached.timestamp < CACHE_TTL)) {
			return response.json(cached.data)
		}

		// 1. RPG ranking (Top 20)
		const members = await Member.aggregate([
			{ $match: { cmmId } },
			{ $addFields: { totalPosts: { $sum: '$posts' } } },
			{ $sort: { totalPosts: -1 } },
			{ $limit: 20 }
		])

		// 2. Bolão ranking (Top 20)
		const bolao = await Bet.aggregate([
			{ $match: { cmmId, processed: true } },
			{ $group: { _id: '$userId', totalPoints: { $sum: '$points' } } },
			{ $sort: { totalPoints: -1 } },
			{ $limit: 20 }
		])

		// 3. Obter dados dos usuários do VK em lote
		const allUserIds = Array.from(new Set([
			...members.map(m => m.userId),
			...bolao.map(b => b._id)
		]))

		let vkUsers: any[] = []
		if (allUserIds.length > 0) {
			vkUsers = await vkApi.users.get({
				userIds: allUserIds,
				fields: ['photo_100']
			})
		}

		// Map VK details to RPG ranking
		const rpgRanking = members.map(m => {
			const vkUser = vkUsers.find(u => u.id === m.userId)
			const name = vkUser ? `${vkUser.first_name} ${vkUser.last_name}` : `Membro ${m.userId}`
			const photo = vkUser?.photo_100 || 'https://vk.com/images/camera_100.png'
			const lvlInfo = generalFncs.getLevelInfo(m.totalPosts)
			
			// Calcular tempo de casa
			const initialDate = process.env.INITIAL_DATE ? new Date(process.env.INITIAL_DATE) : new Date()
			const firstActiveWeek = m.posts.findIndex((p: number) => (p || 0) > 0)
			let weeksOfHouse = 0
			let monthsOfHouse = 0
			if (firstActiveWeek !== -1) {
				const joinDate = new Date(initialDate.getTime() + firstActiveWeek * 7 * 24 * 60 * 60 * 1000)
				const diffTime = Math.abs(new Date().getTime() - joinDate.getTime())
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
				badges
			}
		})

		// Map VK details to Bolão ranking
		const bolaoRanking = bolao.map((b, idx) => {
			const vkUser = vkUsers.find(u => u.id === b._id)
			const name = vkUser ? `${vkUser.first_name} ${vkUser.last_name}` : `Membro ${b._id}`
			const photo = vkUser?.photo_100 || 'https://vk.com/images/camera_100.png'
			return {
				userId: b._id,
				name,
				photo,
				points: b.totalPoints,
				rank: idx + 1
			}
		})

		const responseData = {
			rpg: rpgRanking,
			bolao: bolaoRanking,
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

export default app
