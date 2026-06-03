import axios from 'axios'
import { IGeGame } from '@appTypes/copa'

const geInstance = axios.create({
	baseURL: 'https://api.globoesporte.globo.com/tabela/b5ff9c28-476e-4816-a699-7645acc94cd0',
	timeout: 30000,
	headers: {
		'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
	}
})

export default {
	async getGroupStageGames(groupId: number, roundNumber: number): Promise<IGeGame[]> {
		const response = await geInstance.get(`/fase/fase-de-grupos-copa-do-mundo-2026/rodada/${roundNumber}/grupo/${groupId}/jogos/`)
		return response.data || []
	},

	async getKnockoutGames(phaseId: string): Promise<any[]> {
		const response = await geInstance.get(`/fase/${phaseId}/classificacao/`)
		const games: any[] = []
		
		const parsed = response.data
		if (parsed && parsed.secao && Array.isArray(parsed.secao)) {
			for (const sec of parsed.secao) {
				if (sec.chave && Array.isArray(sec.chave)) {
					for (const ch of sec.chave) {
						if (ch.jogos && Array.isArray(ch.jogos)) {
							for (const jogo of ch.jogos) {
								// Add bracket name metadata
								games.push({
									...jogo,
									keyName: ch.nome
								})
							}
						}
					}
				}
			}
		}
		
		return games
	}
}
