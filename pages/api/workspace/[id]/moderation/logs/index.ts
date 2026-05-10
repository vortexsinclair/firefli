import { NextApiRequest, NextApiResponse } from "next";
import { withPermissionCheck } from "@/utils/permissionsManager";
import prisma from "@/utils/database";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id: workspaceId } = req.query;
  const groupId = BigInt(workspaceId as string);

  if (req.method === "GET") {
    try {
      const {
        action,
        actionBy,
        targetUser,
        caseId,
        startDate,
        endDate,
        page = "1",
        limit = "100",
      } = req.query;

      const where: any = {
        workspaceGroupId: groupId,
      };

      if (action) where.action = action as string;
      if (actionBy) where.actionBy = BigInt(actionBy as string);
      if (targetUser) where.targetUser = BigInt(targetUser as string);
      if (caseId) where.caseId = caseId as string;
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate as string);
        if (endDate) where.createdAt.lte = new Date(endDate as string);
      }

      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const skip = (pageNum - 1) * limitNum;
      const [logs, total] = await Promise.all([
        prisma.moderationLog.findMany({
          where,
          include: {
            actor: {
              select: {
                userid: true,
                username: true,
                picture: true,
                displayName: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
          skip,
          take: limitNum,
        }),
        prisma.moderationLog.count({ where }),
      ]);

      return res.status(200).json({
        success: true,
        data: {
          logs,
          pagination: {
            total,
            page: pageNum,
            limit: limitNum,
            pages: Math.ceil(total / limitNum),
          },
        },
      });
    } catch (error) {
      console.error("Error fetching moderation logs:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to fetch moderation logs",
      });
    }
  }

  return res.status(405).json({
    success: false,
    error: "Method not allowed",
  });
}

export default withPermissionCheck(handler, ["view_moderation"]);
