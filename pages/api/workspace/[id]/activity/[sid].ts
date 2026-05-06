// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '@/utils/database';
import { withPermissionCheck } from '@/utils/permissionsManager'
import { withSessionRoute } from '@/lib/withSession'
import { getUsername, getThumbnail, getDisplayName } from '@/utils/userinfoEngine'
import { fetchUniverseInfo } from '@/utils/roblox';
import axios from 'axios';
type Data = {
	success: boolean;
	message?: object;
	universe?: object;
	error?: string;
}

export default withSessionRoute(handler);

export async function handler(
	req: NextApiRequest,
	res: NextApiResponse<Data>
) {
	if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });
	if (!req.session.userid) return res.status(401).json({ success: false, error: 'Not logged in' });
	if (!req.query.sid) return res.status(400).json({ success: false, error: "ID missing" });

	const session = await prisma.activitySession.findUnique({
		where: {
			id: (req.query.sid as string)
		}
	});
	if (!session) return res.status(404).json({ success: false, error: "Session not found" });

	const workspaceGroupId = parseInt(req.query.id as string);
	const sessionUserId = req.session.userid;
	const isOwnSession = session.userId.toString() === sessionUserId.toString();

	if (!isOwnSession) {
		const user = await prisma.user.findFirst({
			where: {
				userid: BigInt(sessionUserId),
			},
			include: {
				roles: {
					where: {
						workspaceGroupId: workspaceGroupId,
					},
				},
				workspaceMemberships: {
					where: {
						workspaceGroupId: workspaceGroupId,
					},
				},
			},
		});

		if (!user) {
			return res.status(401).json({ success: false, error: "Unauthorized" });
		}

		const membership = user.workspaceMemberships[0];
		const isAdmin = membership?.isAdmin || false;
		const userRole = user.roles[0];

		if (!userRole) {
			return res.status(401).json({ success: false, error: "Unauthorized" });
		}

		if (
			!isAdmin &&
			!userRole.permissions?.includes("view_activity")
		) {
			return res.status(401).json({ success: false, error: "Unauthorized" });
		}
	}

	if(!session.universeId){
		return res.status(200).json({
			success: true,
			message: (JSON.parse(JSON.stringify(session, (key, value) => (typeof value === 'bigint' ? value.toString() : value))) as typeof session),
		});
	}

	try {
const universeInfo: any[] = await fetchUniverseInfo(Number(session.universeId));

		const { data, status } = await axios.get(`https://thumbnails.roblox.com/v1/games/multiget/thumbnails?universeIds=${session.universeId}&size=768x432&format=Png&isCircular=false`);
		const universeName = universeInfo?.[0]?.name || "Unknown Game";
		const universeThumbnail = data?.data?.[0]?.thumbnails?.[0]?.imageUrl || null;

		return res.status(200).json({
			success: true,
			message: (JSON.parse(JSON.stringify(session, (key, value) => (typeof value === 'bigint' ? value.toString() : value))) as typeof session),
			universe: {
				name: universeName,
				thumbnail: universeThumbnail
			}
		});
	} catch (error) {
		console.error("Failed to fetch universe info:", error);
		return res.status(200).json({
			success: true,
			message: (JSON.parse(JSON.stringify(session, (key, value) => (typeof value === 'bigint' ? value.toString() : value))) as typeof session),
			universe: undefined
		});
	}
}
