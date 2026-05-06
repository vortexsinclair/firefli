import type { NextApiRequest, NextApiResponse } from "next"
import prisma from "@/utils/database"
import { validateApiKey } from "@/utils/api-auth"
import { withPublicApiRateLimit } from "@/utils/prtl"

type Data = {
  success: boolean
  error?: string
  session?: { id: string }
}

async function handler(req: NextApiRequest, res: NextApiResponse<Data>) {
  if (req.method !== "POST")
    return res.status(405).json({ success: false, error: "Method not allowed" })

  const apiKey = req.headers.authorization?.replace("Bearer ", "")
  if (!apiKey) return res.status(401).json({ success: false, error: "Missing API key" })

  const workspaceId = Number.parseInt(req.query.id as string)
  if (!workspaceId) return res.status(400).json({ success: false, error: "Missing workspace ID" })

  const { userId } = req.query
  if (!userId) return res.status(400).json({ success: false, error: "Missing user ID" })

  const { time } = req.body
  if (!time) return res.status(400).json({ success: false, error: "Missing time (UTC ISO string)" })

  const endTime = new Date(time)
  if (isNaN(endTime.getTime()))
    return res.status(400).json({ success: false, error: "Invalid time format. Provide a UTC ISO 8601 string." })

  try {
    const key = await validateApiKey(apiKey, workspaceId.toString())
    if (!key) return res.status(401).json({ success: false, error: "Invalid API key" })

    const activeSession = await prisma.activitySession.findFirst({
      where: {
        userId: BigInt(userId as string),
        workspaceGroupId: workspaceId,
        active: true,
      },
    })

    if (!activeSession)
      return res.status(404).json({ success: false, error: "No active session found for this user in this workspace" })

    if (endTime <= activeSession.startTime)
      return res.status(400).json({ success: false, error: "End time must be after the session start time" })

    const session = await prisma.activitySession.update({
      where: { id: activeSession.id },
      data: { active: false, endTime },
    })

    return res.status(200).json({ success: true, session: { id: session.id } })
  } catch (error) {
    console.error("[public/activity/end]", error)
    return res.status(500).json({ success: false, error: "Something went wrong" })
  }
}

export default withPublicApiRateLimit(handler)
