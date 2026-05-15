import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/utils/database';
import { withPermissionCheck } from '@/utils/permissionsManager';
export default withPermissionCheck(async (req: NextApiRequest, res: NextApiResponse) => {
	if (req.method !== 'GET') {
		return res.status(405).json({ error: 'Method not allowed' });
	}
	const { id } = req.query;
	try {
		const workspaceGroupId = parseInt(id as string);
		const workspaceUsers = await prisma.user.findMany({
			where: {
				roles: {
					some: {
						workspaceGroupId: workspaceGroupId
					}
				}
			},
			select: {
				userid: true,
				username: true,
				picture: true,
				registered: true,
				ranks: {
					where: { workspaceGroupId: workspaceGroupId },
					select: { rankId: true }
				},
				roles: {
					where: { workspaceGroupId: workspaceGroupId },
					select: { id: true }
				}
			}
		});
		const users = workspaceUsers.map(user => {
			const rankId = user.ranks?.[0]?.rankId != null
				? Number(user.ranks[0].rankId)
				: null;
			const roleIds = (user.roles || []).map(r => r.id);
			return {
				userid: user.userid.toString(),
				username: user.username,
				picture: user.picture,
				registered: user.registered ?? false,
				rankId,
				roleIds
			};
		});
		res.status(200).json(users);
	} catch (error) {
		console.error('Error fetching workspace users:', error);
		res.status(500).json({ error: 'Failed to fetch users' });
	}
});