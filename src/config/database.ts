import mongoose from 'mongoose'

mongoose.connect(process.env.MONGODBURL)
mongoose.Promise = global.Promise

export default mongoose
