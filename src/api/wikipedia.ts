import axios from 'axios'

export interface IWikiSummary {
	title: string
	extract: string
	pageUrl: string
}

export default {
	async searchAndGetSummary(query: string): Promise<IWikiSummary | null> {
		try {
			const headers = {
				'User-Agent': 'VKBot2.0/1.0 (contact@vkbot2.com) Axios/0.27.2',
			}

			// 1. Search for the query
			const searchResponse = await axios.get('https://pt.wikipedia.org/w/api.php', {
				params: {
					action: 'query',
					list: 'search',
					srsearch: query,
					utf8: 1,
					format: 'json',
				},
				headers,
				timeout: 10000,
			})

			const searchResults = searchResponse.data?.query?.search
			if (!searchResults || searchResults.length === 0) {
				return null
			}

			const title = searchResults[0].title

			// 2. Fetch the summary for the first result's title
			const summaryResponse = await axios.get(`https://pt.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, {
				headers,
				timeout: 10000,
			})

			const data = summaryResponse.data
			return {
				title: data.title,
				extract: data.extract,
				pageUrl: data.content_urls?.desktop?.page || `https://pt.wikipedia.org/wiki/${encodeURIComponent(title)}`,
			}
		} catch (error: any) {
			console.error(`Erro ao buscar Wikipédia para o termo "${query}":`, error?.message || error)
			return null
		}
	},
}
