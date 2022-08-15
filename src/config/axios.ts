import axios from 'axios'

// VK API axios instance with credentials
const vkInstance = axios.create({
  baseURL: 'https://api.vk.com/method',
  timeout: 54000
})

vkInstance.interceptors.request.use(config => {
  config.params = {
    ...config.params,
    access_token: config.url === '/messages.send' ? process.env.ACCESS_TOKEN_MESSAGE : process.env.ACCESS_TOKEN,
    v: process.env.API_VERSION
  }

  return config
}, error => { return Promise.reject(error) })

export default vkInstance
