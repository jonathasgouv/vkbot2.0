import '@config/environment'
import './schedule'

import express from 'express'
import hookRouter from '@routes/hook'
import cors from 'cors'
import mongoose from 'mongoose'

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

app.get('/', (request, response) => {
	return response.send('bip bop')
})

export default app
