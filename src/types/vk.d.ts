export interface ICreateBoardComment {
	cmmId: number;
	topicId: number;
	text: string;
	attachments?: string[];
}

export interface IAddTopic {
	cmmId: number;
	title: string;
	text: string;
	attachments?: string[];
}

export interface IGetTopicsComments {
	groupId: number;
	topicIds?: number[];
	order?: 1 | 2 | -1 | -2;
	offset?: number;
	count?: number;
	extended?: 1 | 0;
	preview?: 1 | 2 | 0;
	previewLength?: number;
}

export interface IGetBoardComments {
	groupId: number;
	topicId: number;
	needLikes?: 1 | 0;
	startCommentId?: number;
	offset?: number;
	count?: number;
	extended?: 1 | 0;
	sort?: 'asc' | 'desc';
}

export interface IGetUser {
	userIds: number[];
	fields?: string[];
}

export interface IAddLike {
	type: string;
	ownerId: number;
	itemId: number;
	accessKey?: string;
	action?: string;
}

export interface ISendMessage {
	peerId: number;
	peerIds?: number[];
	message: string;
}
