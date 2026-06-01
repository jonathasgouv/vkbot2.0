import mongoose from '@config/database'
import IKeyword from '@appTypes/keyword'

// Create a Schema corresponding to the document interface
const KeywordSchema = new mongoose.Schema<IKeyword>(
	{
		userId: {
			type: 'number',
			required: true,
		},
		cmmId: {
			type: 'number',
			required: true,
		},
		keyword: {
			type: 'string',
			required: true,
		},
		isExact: {
			type: 'boolean',
			required: true,
			default: false,
		},
		createdAt: {
			type: 'date',
			required: true,
			default: Date.now,
		},
	},
	{ collection: 'keywords' }
)

// Set unique index to prevent duplicate user-keyword pairs in the same community
KeywordSchema.index({ userId: 1, keyword: 1, cmmId: 1 }, { unique: true })
KeywordSchema.index({ cmmId: 1, userId: 1 })

// Create a Model
const Keyword = mongoose.model<IKeyword>('Keyword', KeywordSchema)

export default Keyword
