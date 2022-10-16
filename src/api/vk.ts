import vkApi from '@config/axios'
import { IAddLike, IAddTopic, ICreateBoardComment, IGetBoardComments, IGetTopicsComments, IGetUser, ISendMessage } from '@types/vk'

export default {
	board: {
		async createComment(data: ICreateBoardComment) {
			const attachments = data?.attachments?.join(',')

			const queryParams = {
				group_id: data.cmmId,
				topic_id: data.topicId,
				message: data.text,
				attachments,
			}

			const response = await vkApi.get('/board.createComment', {
				params: queryParams,
			})

			return response.data.response
		},

		async addTopic(data: IAddTopic) {
			const attachments = data?.attachments?.join(',')

			const queryParams = {
				group_id: data.cmmId,
				title: data.title,
				text: data.text,
				attachments,
			}

			const response = await vkApi.get('/board.addTopic', {
				params: queryParams,
			})

			return response.data.response
		},

		async getTopics(data: IGetTopicsComments) {
			const topicIds = data.topicIds?.join(',')

			const queryParams = {
				group_id: data.groupId,
				topic_ids: topicIds,
				order: data.order,
				offset: data.offset,
				count: data.count,
				extended: data.extended,
				preview: data.preview,
				preview_length: data.previewLength,
			}

			const response = await vkApi.get('/board.getTopics', {
				params: queryParams,
			})

			return response.data.response
		},

		async getComments(data: IGetBoardComments) {
			const queryParams = {
				group_id: data.groupId,
				topic_id: data.topicId,
				need_likes: data.needLikes,
				start_comment_id: data.startCommentId,
				offset: data.offset,
				count: data.count,
				extended: data.extended,
				sort: data.sort,
			}

			const response = await vkApi.get('/board.getComments', {
				params: queryParams,
			})

			return response.data.response
		},
	},

	users: {
		async get(data: IGetUser) {
			const userIds = data?.userIds?.join(',')
			const fields = data?.fields?.join(',')

			const queryParams = {
				user_ids: userIds,
				fields,
			}

			const response = await vkApi.get('/users.get', {
				params: queryParams,
			})

			return response.data.response
		},
	},

	messages: {
		async send(data: ISendMessage) {
			const peerIds = data?.peerIds?.join(',')

			const queryParams = {
				peer_id: data.peerId,
				peer_ids: peerIds,
				message: data.message,
				random_id: Math.floor(Math.random() * (99999 - 1 + 1)) + 1,
			}

			const response = await vkApi.get('/messages.send', {
				params: queryParams,
			})

			return response.data.response
		},
	},

	likes: {
		async add(data: IAddLike) {
			const queryParams = {
				type: data.type,
				owner_id: data.ownerId,
				item_id: data.itemId,
			}

			const response = await vkApi.get('/likes.add', {
				params: queryParams,
			})

			return response.data.response
		},
	},
}
