import axios from 'axios'

export default {
  async getGames (): Promise<any[]> {
    const response = await axios.get('https://www.cbf.com.br/api/livescore')

    return response.data
  }
}
