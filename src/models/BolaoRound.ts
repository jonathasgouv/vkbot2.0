import mongoose from '@config/database'
import { IBolaoRound } from '@appTypes/bolao'

const BolaoRoundSchema = new mongoose.Schema<IBolaoRound>(
	{
		_id: { type: String, required: true },
		cmmId: { type: Number, required: true },
		championshipId: { type: Number, required: true },
		championshipName: { type: String, required: true },
		roundNumber: { type: Number, required: true },
		topicId: { type: Number, required: true },
		games: [
			{
				id_jogo: { type: String, required: true },
				homeTeam: { type: String, required: true },
				awayTeam: { type: String, required: true },
				date: { type: String, required: true },
				time: { type: String, required: true },
			},
		],
		processed: { type: Boolean, default: false },
		createdAt: { type: Date, default: Date.now },
	},
	{ collection: 'bolao_rounds' }
)

const BolaoRound = mongoose.model<IBolaoRound>('BolaoRound', BolaoRoundSchema)

export default BolaoRound
