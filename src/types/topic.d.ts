export default interface ITopic {
	cmmId: number
	_id: number
	title: string
	first_comment?: string
	created_by: number
	is_fixed: boolean
}
