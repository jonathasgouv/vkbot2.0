export default interface IReminder {
    cmmId: number,
    topicId: number,
    userId: number,
    postId: number,
    isMessage: boolean,
    requestDate: Date,
    expires: Date
}
