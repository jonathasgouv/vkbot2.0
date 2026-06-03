import mongoose from '@config/database'
import IMembers from '@appTypes/member'

// Create a Schema corresponding to the document interface
const MembersSchema = new mongoose.Schema<IMembers>(
	{
		userId: {
			type: 'number',
			required: true,
		},
		cmmId: {
			type: 'number',
			required: true,
		},
		posts: {
			type: ['number'],
			required: true,
		},
		coruja: {
			type: 'boolean',
			required: false,
		},
		totalLikesReceived: {
			type: 'number',
			default: 0,
		},
		totalTopicsCreated: {
			type: 'number',
			default: 0,
		},
		totalCommentsOnTopics: {
			type: 'number',
			default: 0,
		},
		lastProfileCommandAt: {
			type: 'date',
			required: false,
		},
		lastRankingCommandAt: {
			type: 'date',
			required: false,
		},
		firstName: {
			type: 'string',
			required: false,
		},
		lastName: {
			type: 'string',
			required: false,
		},
		photoUrl: {
			type: 'string',
			required: false,
		},
	},
	{ collection: 'members' }
)

// Create a Model
const Member = mongoose.model<IMembers>('Member', MembersSchema)

export default Member
