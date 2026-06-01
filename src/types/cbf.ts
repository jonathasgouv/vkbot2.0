export interface ITeamInfo {
	id: string
	nome: string
	url_escudo: string
	gols: string
	panaltis: string
}

export interface IGame {
	id_jogo: string
	num_jogo: string
	rodada: string
	grupo: string
	mandante: ITeamInfo
	visitante: ITeamInfo
	local: string
	campeonato: string
	data: string
	hora: string
}

export interface ICbfResponse {
	jogos: {
		[campeonato: string]: {
			[categoria: string]: IGame[]
		}
	}
}
