// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next'
import { fetchworkspace, getConfig, setConfig } from '@/utils/configEngine'
import prisma from '@/utils/database';
import { withSessionRoute } from '@/lib/withSession'
import { withPermissionCheck } from '@/utils/permissionsManager'
import { getUsername, getThumbnail, getDisplayName } from '@/utils/userinfoEngine'
import { inactivityNotice } from '@prisma/client';

type SerializedInactivityNotice = Omit<inactivityNotice, 'userId'> & {
	userId: string;
};

type Data = {
	success: boolean
	error?: string
	notices?: SerializedInactivityNotice[]
};

export default withPermissionCheck(handler, 'manage_notices');

export async function handler(
	req: NextApiRequest,
	res: NextApiResponse<Data>
) {
	if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' })
	if (!req.session.userid) {
		return res.status(401).json({ success: false, error: 'Not logged in' });
	}
	if (req.session.userid !== parseInt(req.query.user as string)) return res.status(401).json({ success: false, error: 'Not allowed' });

	const notices = await prisma.inactivityNotice.findMany({
		where: {
			userId: BigInt(req.session.userid),
			workspaceGroupId: parseInt(req.query.id as string),
			approved: false
		}
	});

	const serializedNotices = notices.map(notice => ({
		...notice,
		userId: notice.userId.toString()
	}));

	return res.status(200).json({ success: true, notices: serializedNotices });
}
