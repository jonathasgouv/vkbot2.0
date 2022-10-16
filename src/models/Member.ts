import mongoose from '@config/database'
import IMembers from '@types/member'

// Create a Schema corresponding to the document interface
const MembersSchema = new mongoose.Schema<IMembers>(
    {
        userId: {
            type: "number",
            required: true,
        },
        cmmId: {
            type: "number",
            required: true,
        },
        posts: {
            type: ["number"],
            required: true,
        },
    },
    { collection: "members" }
);

// Create a Model
const Member = mongoose.model<IMembers>('Member', MembersSchema)

export default Member
