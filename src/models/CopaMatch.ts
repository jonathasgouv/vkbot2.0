import mongoose from '@config/database'
import { ICopaMatch } from '@appTypes/copa'

const CopaMatchSchema = new mongoose.Schema<ICopaMatch>(
	{
		id: { type: Number, unique: true, sparse: true },
		keyName: { type: String, required: false },
		phaseId: { type: String, required: true },
		date: { type: Date, required: true },
		dateStr: { type: String, required: true },
		homeTeam: { type: String, required: true },
		awayTeam: { type: String, required: true },
		homeFlag: { type: String, required: true },
		awayFlag: { type: String, required: true },
		groupId: { type: Number, required: false },
		roundNumber: { type: Number, required: false },
		homeScore: { type: Number, required: false, default: null },
		awayScore: { type: Number, required: false, default: null },
		finished: { type: Boolean, default: false },
	},
	{ collection: 'copa_matches' }
)

// Index on dateStr to quickly find games on a specific day
CopaMatchSchema.index({ dateStr: 1 })

const CopaMatch = mongoose.model<ICopaMatch>('CopaMatch', CopaMatchSchema)

export default CopaMatch
