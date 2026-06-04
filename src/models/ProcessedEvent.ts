import mongoose from '@config/database'

interface IProcessedEvent {
	eventId: string
	createdAt: Date
}

const ProcessedEventSchema = new mongoose.Schema<IProcessedEvent>(
	{
		eventId: { type: String, required: true, unique: true },
		createdAt: { type: Date, default: Date.now, expires: 86400 } // 24 hours (in seconds)
	},
	{ collection: 'processed_events' }
)

// Index eventId for quick unique lookups
ProcessedEventSchema.index({ eventId: 1 })

const ProcessedEvent = mongoose.model<IProcessedEvent>('ProcessedEvent', ProcessedEventSchema)

export default ProcessedEvent
