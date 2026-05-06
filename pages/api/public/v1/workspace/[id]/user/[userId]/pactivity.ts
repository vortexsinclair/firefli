import type { NextApiRequest, NextApiResponse } from "next"
import prisma from "@/utils/database"
import { validateApiKey } from "@/utils/api-auth"
import { withPublicApiRateLimit } from "@/utils/prtl"

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ success: false, error: "Method not allowed" })

  const apiKey = req.headers.authorization?.replace("Bearer ", "")
  if (!apiKey) return res.status(401).json({ success: false, error: "Missing API key" })

  const workspaceId = Number.parseInt(req.query.id as string)
  if (!workspaceId) return res.status(400).json({ success: false, error: "Missing workspace ID" })

  const { userId } = req.query
  if (!userId) return res.status(400).json({ success: false, error: "Missing user ID" })

  const { limit = "50" } = req.query

  try {
    const key = await validateApiKey(apiKey, workspaceId.toString())
    if (!key) {
      return res.status(401).json({ success: false, error: "Invalid API key" })
    }

    const user = await prisma.user.findFirst({
      where: {
        userid: BigInt(userId as string),
        roles: {
          some: {
            workspaceGroupId: workspaceId,
          },
        },
      },
      include: {
        roles: {
          where: {
            workspaceGroupId: workspaceId,
          },
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    if (!user) {
      return res.status(404).json({ success: false, error: "User not found in this workspace" })
    }

    const lastReset = await prisma.activityReset.findFirst({
      where: { workspaceGroupId: workspaceId },
      orderBy: { resetAt: 'desc' },
      select: {
        resetAt: true,
        resetById: true,
      }
    })

    const startDate = lastReset?.resetAt || new Date("2020-01-01")
    const where: any = {
      workspaceGroupId: workspaceId,
      userId: BigInt(userId as string),
      startTime: {
        gte: startDate,
      },
    }

    const sessions = await prisma.activitySession.findMany({
      where: { ...where, archived: { not: true } },
      orderBy: {
        startTime: "desc",
      },
      take: Number(limit),
    })

    const totalActivityTime = sessions.reduce((total, session) => {
      if (session.endTime) {
        const duration = Math.floor((session.endTime.getTime() - session.startTime.getTime()) / 1000)
        return total + duration
      }
      return total
    }, 0)

    const totalMessages = sessions.reduce((total, session) => total + (session.messages || 0), 0)
    const totalIdleTime = sessions.reduce((total, session) => total + Math.round(Number(session.idleTime) || 0), 0)

    const completedSessions = sessions.filter((session) => session.endTime)
    const averageSessionLength =
      completedSessions.length > 0
        ? completedSessions.reduce((total, session) => {
            const duration = Math.floor((session.endTime!.getTime() - session.startTime.getTime()) / 1000)
            return total + duration
          }, 0) / completedSessions.length
        : 0

    const formattedSessions = sessions.map((session) => ({
      id: session.id,
      active: session.active,
      startTime: session.startTime,
      endTime: session.endTime,
      duration: session.endTime ? Math.floor((session.endTime.getTime() - session.startTime.getTime()) / 1000) : null,
      messages: session.messages,
      universeId: session.universeId ? Number(session.universeId) : null,
    }))

    const adjustments = await prisma.activityAdjustment.findMany({
      where: {
        workspaceGroupId: workspaceId,
        userId: BigInt(userId as string),
        createdAt: {
          gte: startDate,
        },
        archived: { not: true },
      },
      orderBy: {
        createdAt: "desc",
      },
      include: {
        actor: {
          select: { username: true },
        },
      },
    })

    const totalAdjustmentMinutes = adjustments.reduce((total, adj) => total + adj.minutes, 0)

    const formattedAdjustments = adjustments.map((adj) => ({
      id: adj.id,
      minutes: adj.minutes,
      reason: adj.reason,
      actorUsername: adj.actor?.username ?? null,
      createdAt: adj.createdAt,
    }))

    const notices = await prisma.inactivityNotice.findMany({
      where: {
        workspaceGroupId: workspaceId,
        userId: BigInt(userId as string),
        startTime: {
          gte: startDate,
        },
      },
      orderBy: {
        startTime: "desc",
      },
      take: 10,
    })

    const formattedNotices = notices.map((notice) => ({
      id: notice.id,
      startTime: notice.startTime,
      endTime: notice.endTime,
      reason: notice.reason,
      approved: notice.approved,
      reviewed: notice.reviewed,
      revoked: notice.revoked,
    }))

    return res.status(200).json({
      success: true,
      user: {
        userId: Number(user.userid),
        username: user.username,
        thumbnail: user.picture,
        role: user.roles[0],
      },
      resetInfo: {
        lastResetDate: lastReset?.resetAt || null,
        resetById: lastReset?.resetById ? Number(lastReset.resetById) : null,
      },
      activity: {
        sessions: formattedSessions,
        totalSessions: formattedSessions.length,
        totalActivityTime: totalActivityTime + totalAdjustmentMinutes * 60,
        averageSessionLength,
        totalMessages,
        totalIdleTime,
        adjustments: formattedAdjustments,
        notices: formattedNotices,
      },
    })
  } catch (error) {
    console.error("Error in public API:", error)
    return res.status(500).json({ success: false, error: "Internal server error" })
  }
}

export default withPublicApiRateLimit(handler)
