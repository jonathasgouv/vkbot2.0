export interface IBolaoGame {
	id_jogo: string
	homeTeam: string
	awayTeam: string
	date: string
	time: string
}

export interface IBolaoRound {
	_id: string
	cmmId: number
	championshipId: number
	championshipName: string
	roundNumber: number
	topicId: number
	games: IBolaoGame[]
	processed: boolean
	createdAt?: Date
}

export interface IBet {
	cmmId: number
	userId: number
	roundId: string
	gameId: string
	homeScore: number
	awayScore: number
	points?: number | null
	processed: boolean
	createdAt?: Date
}

export interface ICbfRoundGame {
	id_jogo: string
	num_jogo: string
	rodada: string
	grupo: string
	mandante: {
		id: string
		nome: string
		url_escudo: string
		gols: string | null
		panaltis: string
	}
	visitante: {
		id: string
		nome: string
		url_escudo: string
		gols: string | null
		panaltis: string
	}
	local: string
	campeonato: string
	data: string
	hora: string
}

export interface ICbfRoundResponse {
	grupos: string[]
	jogos: {
		grupo: string
		jogo: ICbfRoundGame[]
	}[]
}
