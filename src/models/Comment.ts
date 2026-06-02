import mongoose from '@config/database'
import IComment from '@appTypes/comment'

const CommentSchema = new mongoose.Schema<IComment>(
	{
		cmmId: {
			type: 'number',
			required: true,
		},
		topicId: {
			type: 'number',
			required: true,
		},
		commentId: {
			type: 'number',
			required: true,
		},
		userId: {
			type: 'number',
			required: true,
		},
		likes: {
			type: 'number',
			default: 0,
		},
		createdAt: {
			type: Date,
			required: true,
		},
	},
	{ collection: 'comments' }
)

// Add compound unique index to prevent duplicate comments
CommentSchema.index({ topicId: 1, commentId: 1 }, { unique: true })

const Comment = mongoose.model<IComment>('Comment', CommentSchema)

export default Comment
