import app from './app'

app.listen(process.env.PORT || 8080, () => {
	console.log(`server is running in port ${process.env.PORT || 8080}`)
})
