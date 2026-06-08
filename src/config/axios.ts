import axios from 'axios'
import http from 'http'
import https from 'https'

// Agents com keepAlive desabilitado para liberar sockets após cada resposta
// e evitar acúmulo de conexões que satura o limite do Fly.io (25 conexões)
export const httpAgent = new http.Agent({ keepAlive: false })
export const httpsAgent = new https.Agent({ keepAlive: false })

// VK API axios instance with credentials
const vkInstance = axios.create({
	baseURL: 'https://api.vk.com/method',
	timeout: 10000,
	httpAgent,
	httpsAgent,
})

vkInstance.interceptors.request.use(
	(config) => {
		config.params = {
			...config.params,
			access_token: config.url === '/messages.send' ? process.env.ACCESS_TOKEN_MESSAGE : process.env.ACCESS_TOKEN,
			v: process.env.API_VERSION,
		}

		return config
	},
	(error) => {
		return Promise.reject(error)
	}
)

vkInstance.interceptors.response.use(
	(response) => {
		if (response.data && response.data.error) {
			console.error('VK API Error:', response.config.url, response.data.error)
		}
		return response
	},
	(error) => {
		console.error('VK HTTP Error:', error.message)
		return Promise.reject(error)
	}
)

export default vkInstance
