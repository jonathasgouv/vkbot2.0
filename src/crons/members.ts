import Member from '@models/Member'
import vkApi from '@api/vk'
import bot from '@utils/bot'
import IMember from '@appTypes/member'

const getMostPostsText = async (members: IMember[]): Promise<string> => {
	const missingIds = members
		.filter((m) => !m.firstName)
		.map((m) => m.userId)

	let vkUsers: any[] = []
	if (missingIds.length > 0) {
		try {
			vkUsers = (await vkApi.users.get({ userIds: missingIds })) || []
			for (const u of vkUsers) {
				Member.updateMany(
					{ userId: u.id },
					{ $set: { firstName: u.first_name, lastName: u.last_name } }
				).catch(() => {})
			}
		} catch (err) {
			console.error('Erro ao buscar usuários do VK para cron de posts:', err)
		}
	}

	const membersNameResults = members.map((member) => {
		const vkUser = vkUsers.find((u) => u.id === member.userId)
		if (vkUser) {
			return `[id${member.userId}|${vkUser.first_name} ${vkUser.last_name}]`
		}
		if (member.firstName) {
			return `[id${member.userId}|${member.firstName} ${member.lastName || ''}]`
		}
		return `[id${member.userId}|Membro]`
	})

	const topMembersResults = members
		.map((member, index) => `${index + 1}º lugar - ${membersNameResults[index]}, com ${member.posts.slice(-1)[0]} posts.`)
		.join('\n')

	return `Segue a lista de membros com mais postagens durante a última semana:\n${topMembersResults}`
}

export default {
	async mostPosts(numberOfMembers: number): Promise<void> {
		console.info('Creating most posts topic')
		try {
			// Get all communities
			const cmms = await Member.distinct('cmmId')

			for (const cmmId of cmms) {
				const members: IMember[] = await Member.find({ cmmId })
				const membersSortedByLastWeekPosts = members
					.sort((a, b) => {
						const aPosts = a.posts.slice(-1)[0] || 0
						const bPosts = b.posts.slice(-1)[0] || 0
						return bPosts - aPosts
					})
					.filter((member) => member.userId !== parseInt(process.env.BOT_ID || process.env.VK_BOT_ID || '0'))

				const membersWithMostPosts = membersSortedByLastWeekPosts.slice(0, numberOfMembers)
				if (membersWithMostPosts.length === 0) continue

				const topicData = {
					cmmId,
					title: `OFF - Top ${numberOfMembers} semanal de postagens`,
					text: await getMostPostsText(membersWithMostPosts),
				}

				await vkApi.board.addTopic(topicData)
				console.info(`Most posts topic created successfully for community ${cmmId}`)
			}
		} catch (error) {
			console.error('Erro ao gerar ranking semanal de postagens:', error)
		}
	},
}
