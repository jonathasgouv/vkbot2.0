import mongoose from '@config/database'

interface IQuestion {
	index: number
	question: string
	answer: string
	status: 'pending' | 'active' | 'resolved' | 'timeout'
	winnerId?: number
	activatedAt?: Date
	resolvedAt?: Date
}

interface IDailyBatch {
	dayIndex: number
	postedAt?: Date
	questions: IQuestion[]
}

export interface IQuiz {
	cmmId: number
	topicId: number
	weekStartDate: Date
	dailyBatches: IDailyBatch[]
	leaderboard: Map<string, number>
	dailyLeaderboard: Map<string, number>
	winnerId?: number
}

const QuestionSchema = new mongoose.Schema<IQuestion>({
	index: { type: Number, required: true },
	question: { type: String, required: true },
	answer: { type: String, required: true },
	status: { type: String, enum: ['pending', 'active', 'resolved', 'timeout'], default: 'pending' },
	winnerId: { type: Number },
	activatedAt: { type: Date },
	resolvedAt: { type: Date }
})

const DailyBatchSchema = new mongoose.Schema<IDailyBatch>({
	dayIndex: { type: Number, required: true },
	postedAt: { type: Date },
	questions: [QuestionSchema]
})

const QuizSchema = new mongoose.Schema<IQuiz>(
	{
		cmmId: { type: Number, required: true },
		topicId: { type: Number, required: true },
		weekStartDate: { type: Date, required: true },
		dailyBatches: [DailyBatchSchema],
		leaderboard: { type: Map, of: Number, default: {} },
		dailyLeaderboard: { type: Map, of: Number, default: {} },
		winnerId: { type: Number }
	},
	{ collection: 'quizzes' }
)

// Index for query performance
QuizSchema.index({ cmmId: 1, weekStartDate: -1 })
QuizSchema.index({ topicId: 1 })

const Quiz = mongoose.model<IQuiz>('Quiz', QuizSchema)

export default Quiz
