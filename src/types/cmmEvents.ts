/* eslint-disable camelcase */
export interface IConfirmationEvent {
	type: 'confirmation'
	group_id: number
}

export interface IBoardPost {
	group_id: number
	type: string
	event_id: string
	v: string
	object: {
		id: number
		from_id: number
		date: number
		text: string
		topic_owner_id: number
		topic_id: number
	}
	secret: string
}
