import mongoose from '@config/database'
import { IBet } from '@appTypes/bolao'

const BetSchema = new mongoose.Schema<IBet>(
	{
		cmmId: { type: Number, required: true },
		userId: { type: Number, required: true },
		roundId: { type: String, required: true },
		gameId: { type: String, required: true },
		homeScore: { type: Number, required: true },
		awayScore: { type: Number, required: true },
		points: { type: Number, default: null },
		processed: { type: Boolean, default: false },
		createdAt: { type: Date, default: Date.now },
	},
	{ collection: 'bets' }
)

// Compound index to guarantee a unique bet per user per game
BetSchema.index({ userId: 1, gameId: 1 }, { unique: true })

const Bet = mongoose.model<IBet>('Bet', BetSchema)

export default Bet
