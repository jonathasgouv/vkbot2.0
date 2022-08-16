import '@config/environment'
import './schedule'

import express from 'express'
import hookRouter from '@routes/hook'
import cors from 'cors'

const app = express()

app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use('/api/hook', hookRouter)

app.get('/', (request, response) => {
  return response.send('bip bop')
})

export default app
