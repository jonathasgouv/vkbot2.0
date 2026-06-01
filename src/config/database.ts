import mongoose from 'mongoose'

const dbUrl = process.env.MONGODBURL

if (!dbUrl) {
	console.error('ERRO: MONGODBURL não foi informada nas variáveis de ambiente.')
	process.exit(1)
}

mongoose.connect(dbUrl)
	.then(() => console.info('Conectado ao MongoDB com sucesso.'))
	.catch((err) => {
		console.error('Erro ao conectar ao MongoDB:', err)
		process.exit(1)
	})

export default mongoose
