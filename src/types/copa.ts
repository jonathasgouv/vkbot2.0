import { Document } from 'mongoose'

export interface ICopaMatch extends Document {
	id: number | null
	keyName?: string
	phaseId: string
	date: Date
	dateStr: string
	homeTeam: string
	awayTeam: string
	homeFlag: string
	awayFlag: string
	groupId: number | null
	roundNumber: number | null
	homeScore?: number | null
	awayScore?: number | null
	finished: boolean
}

export interface IGeTeam {
	id?: number
	nome_popular: string
	sigla: string
	escudo: string
	label?: string
}

export interface IGeSede {
	nome_popular: string
}

export interface IGeGame {
	id: number | null
	data_realizacao: string
	hora_realizacao: string
	placar_oficial_mandante: number | null
	placar_oficial_visitante: number | null
	equipes: {
		mandante: IGeTeam
		visitante: IGeTeam
	}
	sede: IGeSede
}
