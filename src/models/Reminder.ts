import mongoose from '@config/database'
import IReminder from '@types/reminder'

// Create a Schema corresponding to the document interface
const ReminderSchema = new mongoose.Schema<IReminder>(
	{
		cmmId: {
			type: 'number',
			required: true,
		},
		topicId: {
			type: 'number',
			required: true,
		},
		userId: {
			type: 'number',
			required: true,
		},
		postId: {
			type: 'number',
			required: true,
		},
		isMessage: {
			type: 'boolean',
			required: true,
		},
		requestDate: {
			type: 'date',
			required: true,
		},
		expires: {
			type: 'date',
			required: true,
		},
	},
	{ collection: 'reminder' }
)

// Create a Model
const Reminder = mongoose.model<IReminder>('Reminder', ReminderSchema)

export default Reminder
