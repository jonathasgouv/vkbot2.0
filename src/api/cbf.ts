import axios from 'axios'
import IGame from '@types/cbf'

export default {
  async getGames (): Promise<IGame[]> {
    const response = await axios.get('https://www.cbf.com.br/api/livescore')

    return response.data
  }
}
