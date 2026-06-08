import axios from 'axios'
import https from 'https'
import { ICbfResponse } from '@appTypes/cbf'
import { ICbfRoundResponse } from '@appTypes/bolao'

// Agente HTTPS que ignora a verificação do certificado da CBF de forma isolada nesta chamada
// keepAlive: false libera sockets imediatamente após cada resposta
const httpsAgent = new https.Agent({
	rejectUnauthorized: false,
	keepAlive: false,
})

export default {
	async getGames(date?: string): Promise<ICbfResponse> {
		let targetDate = date

		if (!targetDate) {
			const now = new Date()
			// Formata a data atual para o fuso horário de Brasília/São Paulo no formato DD/MM/YYYY
			const spDateStr = now.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
			const [day, month, year] = spDateStr.split('/')
			targetDate = `${year}/${month}/${day}`
		}

		const response = await axios.get(`https://www.cbf.com.br/api/cbf/calendario/jogos/${targetDate}`, {
			httpsAgent,
			timeout: 10000,
		})

		return response.data
	},

	async getGamesByRound(championshipId: number, roundNumber: number): Promise<ICbfRoundResponse> {
		const response = await axios.get(`https://www.cbf.com.br/api/cbf/jogos/campeonato/${championshipId}/rodada/${roundNumber}/fase`, {
			httpsAgent,
			timeout: 10000,
		})

		return response.data
	},
}
