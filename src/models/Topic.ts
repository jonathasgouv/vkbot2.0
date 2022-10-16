import mongoose from '@config/database'
import ITopic from '@types/topic'

// Create a Schema corresponding to the document interface
const TopicSchema = new mongoose.Schema<ITopic>(
	{
		cmmId: {
			type: 'number',
			required: true,
		},
		_id: {
			type: 'number',
			required: true,
		},
		created_by: {
			type: 'number',
			required: true,
		},
		title: {
			type: 'string',
			required: true,
		},
		first_comment: {
			type: 'string',
			required: false,
		},
		is_fixed: {
			type: 'boolean',
			required: true,
		},
	},
	{
		collection: 'topics',
		capped: {
			size: 5242880,
			max: 5000,
		},
	}
)

// Create a Model
const Topic = mongoose.model<ITopic>('Topic', TopicSchema)

export default Topic
