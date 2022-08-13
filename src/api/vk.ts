import vkApi from '@config/axios'

interface ICreateBoardComment {
    cmmId: number;
    topicId: number;
    text: string;
    attachments?: string[];
}

interface IGetBoardComments {
  groupId: number;
  topicId: number;
  needLikes?: 1 | 0;
  startCommentId?: number;
  offset?: number;
  count?: number;
  extended?: 1 | 0;
  sort?: 'asc' | 'desc';
}

interface IGetUser {
  userIds: number[];
  fields?: string[];
}

interface IAddLike {
  type: string;
  ownerId: number;
  itemId: number;
  accessKey?: string;
  action?: string;
}

interface ISendMessage {
  peerId: number;
  peerIds?: number[];
  message: string;
}

export default {
  board: {
    async createComment (data: ICreateBoardComment) {
      const attachments = data?.attachments?.join(',')

      const queryParams = {
        group_id: data.cmmId,
        topic_id: data.topicId,
        message: data.text,
        attachments
      }

      const response = await vkApi.get('/board.createComment', { params: queryParams })

      return response.data.response
    },

    async getComments (data: IGetBoardComments) {
      const queryParams = {
        group_id: data.groupId,
        topic_id: data.topicId,
        need_likes: data.needLikes,
        start_comment_id: data.startCommentId,
        offset: data.offset,
        count: data.count,
        extended: data.extended,
        sort: data.sort
      }

      const response = await vkApi.get('/board.getComments', { params: queryParams })

      return response.data.response
    }
  },

  users: {
    async get (data: IGetUser) {
      const userIds = data?.userIds?.join(',')
      const fields = data?.fields?.join(',')

      const queryParams = {
        user_ids: userIds,
        fields
      }

      const response = await vkApi.get('/users.get', { params: queryParams })

      return response.data.response
    }
  },

  messages: {
    async send (data: ISendMessage) {
      const peerIds = data?.peerIds?.join(',')

      const queryParams = {
        peer_id: data.peerId,
        peer_ids: peerIds,
        message: data.message,
        random_id: Math.floor(Math.random() * (99999 - 1 + 1)) + 1
      }

      const response = await vkApi.get('/messages.send', { params: queryParams })

      console.log(response.data)

      return response.data.response
    }
  },

  likes: {
    async add (data: IAddLike) {
      const queryParams = {
        type: data.type,
        owner_id: data.ownerId,
        item_id: data.itemId
      }

      const response = await vkApi.get('/likes.add', { params: queryParams })

      console.log(response.data)

      return response.data.response
    }
  }
}
