// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next'
import { fetchworkspace, getConfig, setConfig } from '@/utils/configEngine'
import prisma, { SessionType, Session, wallPost } from '@/utils/database';
import { withSessionRoute } from '@/lib/withSession'
import { withPermissionCheck } from '@/utils/permissionsManager'

import { getUsername, getThumbnail, getDisplayName } from '@/utils/userinfoEngine'
import { getGroupRoles } from '@/utils/roblox';

type WallPostWithAuthor = Omit<wallPost, 'authorId' | 'workspaceGroupId'> & {
	authorId: string;
	workspaceGroupId: number;
	reactions?: Array<{
		emoji: string;
		userId: string;
	}>;
	author: {
		userid: bigint;
		username: string | null;
		picture: string | null;
		rankId?: number | null;
		rankName?: string | null;
		departments?: Array<{
			id: string;
			name: string;
			color: string | null;
		}>;
	};
};

type Data = {
	success: boolean
	error?: string
	posts?: WallPostWithAuthor[]
}

export default withPermissionCheck(handler, 'view_wall');

export async function handler(
	req: NextApiRequest,
	res: NextApiResponse<Data>
) {
	if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });
	const workspaceGroupId = parseInt(req.query.id as string);
	const workspace = await prisma.workspace.findUnique({
		where: { groupId: workspaceGroupId }
	});
	
	const sessions = await prisma.wallPost.findMany({
		where: {
			workspaceGroupId: workspaceGroupId
		},
		include: {
			author: {
				select: {
					userid: true,
					username: true,
					picture: true,
					ranks: {
						where: {
							workspaceGroupId: workspaceGroupId
						}
					},
					workspaceMemberships: {
						where: {
							workspaceGroupId: workspaceGroupId
						},
						include: {
							departmentMembers: {
								include: {
									department: {
										select: {
											id: true,
											name: true,
											color: true
										}
									}
								}
							}
						}
					}
				}
			},
			reactions: {
				select: {
					emoji: true,
					userId: true,
				},
			}
		},
		orderBy: {
			createdAt: 'desc'
		}
	});
	
	const roleIdToInfoMap = new Map<number, { rank: number; name: string }>();
	const rolesByRank: any[] = [];
	
	if (workspace) {
		const roles = await getGroupRoles(Number(workspace.groupId));
		roles.sort((a, b) => a.rank - b.rank);
		rolesByRank.push(...roles);
		roles.forEach(role => {
			roleIdToInfoMap.set(role.id, { rank: role.rank, name: role.name });
		});
	}
	
	const postsWithDetails = sessions.map(post => {
		const rank = post.author.ranks?.[0];
		let rankName = null;
		
		if (rank) {
			const storedValue = Number(rank.rankId);
			if (storedValue > 255) {
				rankName = roleIdToInfoMap.get(storedValue)?.name || null;
			} else {
				const role = rolesByRank.find(r => r.rank === storedValue);
				rankName = role?.name || null;
			}
		}
		
		const departments = post.author.workspaceMemberships?.[0]?.departmentMembers?.map(dm => dm.department) || [];
		
		return {
			...post,
			author: {
				userid: post.author.userid,
				username: post.author.username,
				picture: post.author.picture,
				rankId: rank ? Number(rank.rankId) : null,
				rankName,
				departments
			}
		};
	});
	
	res.status(200).json({ success: true, posts: JSON.parse(JSON.stringify(postsWithDetails, (key, value) => (typeof value === 'bigint' ? value.toString() : value))) })
}
