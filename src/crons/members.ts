import Member from '@models/Member'
import vkApi from '@api/vk'
import bot from '@utils/bot'
import IMember from '@types/member'

const getMostPostsText = async (members: IMember[]): Promise<string> => {
	const membersNamePromises = members.map(async (member) => {
		return bot.getTagString(member.userId)
	})

	const membersNameResults = await Promise.all(membersNamePromises)

	const topMembersResults = members
		.map((member, index) => `${index + 1}º lugar - ${membersNameResults[index]}, com ${member.posts.slice(-1)[0]} posts.`)
		.join('\n')

	return `Segue a lista de membros com mais postagens durante a última semana:\n${topMembersResults}`
}

export default {
	async mostPosts(numberOfMembers: number): Promise<void> {
		// Get all communities
		const cmms = await Member.distinct('cmmId')

		cmms.forEach(async (cmmId) => {
			const members: IMember[] = await Member.find({ cmmId })
			const membersSortedByLastWeekPosts = members
				.sort((a, b) => {
					return b.posts.slice(-1)[0] - a.posts.slice(-1)[0]
				})
				.filter((member) => member.userId !== parseInt(process.env.BOT_ID))

			const membersWithMostPosts = membersSortedByLastWeekPosts.slice(0, numberOfMembers)

			const topicData = {
				cmmId,
				title: `OFF - Top ${numberOfMembers} semanal de postagens`,
				text: await getMostPostsText(membersWithMostPosts),
			}

			await vkApi.board.addTopic(topicData)
		})
	},
}
