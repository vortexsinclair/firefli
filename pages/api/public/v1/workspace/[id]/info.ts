import type { NextApiRequest, NextApiResponse } from "next"
import prisma from "@/utils/database"
import { getGroupInfo, getGroupLogo } from "@/utils/roblox"
import { withPublicApiRateLimit } from "@/utils/prtl"
import { validateApiKey } from "@/utils/api-auth"
import { getConfig } from "@/utils/configEngine"

const themeMap: Record<string, string> = {
  "bg-pink-100": "#fce7f3",
  "bg-rose-100": "#ffe4e6",
  "bg-orange-100": "#ffedd5",
  "bg-amber-100": "#fef3c7",
  "bg-lime-100": "#ecfccb",
  "bg-emerald-100": "#d1fae5",
  "bg-cyan-100": "#cffafe",
  "bg-sky-100": "#e0f2fe",
  "bg-indigo-100": "#e0e7ff",
  "bg-purple-100": "#f3e8ff",
  "bg-pink-400": "#f472b6",
  "bg-rose-400": "#fb7185",
  "bg-orange-400": "#fb923c",
  "bg-amber-400": "#fbbf24",
  "bg-lime-400": "#a3e635",
  "bg-emerald-400": "#34d399",
  "bg-cyan-400": "#22d3ee",
  "bg-sky-400": "#38bdf8",
  "bg-indigo-400": "#818cf8",
  "bg-violet-400": "#a78bfa",
  "bg-firefli": "#9300df",
  "bg-rose-600": "#e11d48",
  "bg-orange-600": "#ea580c",
  "bg-amber-600": "#d97706",
  "bg-lime-600": "#65a30d",
  "bg-emerald-600": "#059669",
  "bg-cyan-600": "#0891b2",
  "bg-sky-600": "#0284c7",
  "bg-indigo-600": "#4f46e5",
  "bg-violet-600": "#7c3aed",
  "bg-blue-500": "#3b82f6",
  "bg-red-500": "#ef4444",
  "bg-red-700": "#b91c1c",
  "bg-green-500": "#22c55e",
  "bg-green-600": "#16a34a",
  "bg-yellow-500": "#eab308",
  "bg-orange-500": "#f97316",
  "bg-purple-500": "#a855f7",
  "bg-pink-500": "#ec4899",
  "bg-black": "#000000",
  "bg-zinc-500": "#6b7280",
}

function resolveColour(theme: unknown): string | null {
  if (!theme || typeof theme !== "string") return null
  if (theme.startsWith("custom-")) return `#${theme.replace("custom-", "")}`
  return themeMap[theme] || null
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ success: false, error: "Method not allowed" })

  const apiKey = req.headers.authorization?.replace("Bearer ", "")
  if (!apiKey) return res.status(401).json({ success: false, error: "Missing API key" })

  const workspaceId = Number.parseInt(req.query.id as string)
  if (!workspaceId) return res.status(400).json({ success: false, error: "Missing workspace ID" })

  try {
    const key = await validateApiKey(apiKey, workspaceId)
    if (!key) {
      return res.status(401).json({ success: false, error: "Invalid or expired API key" })
    }

    // Fetch workspace info
    const workspace = await prisma.workspace.findUnique({
      where: { groupId: workspaceId },
      include: {
        roles: {
          select: {
            id: true,
            name: true,
            groupRoles: true,
          },
        },
      },
    })

    if (!workspace) {
      return res.status(404).json({ success: false, error: "Workspace not found" })
    }

    const [groupInfo, logo, colour] = await Promise.all([
      getGroupInfo(Number(workspace.groupId)).catch(() => null) as any,
      getGroupLogo(Number(workspace.groupId)),
      getConfig("theme", workspace.groupId),
    ])

    return res.status(200).json({
      success: true,
      workspace: {
        groupId: workspace.groupId,
        name: groupInfo.name,
        description: groupInfo.description,
        logo: logo,
        memberCount: groupInfo.memberCount,
        colour: resolveColour(colour),
        roles: workspace.roles,
      },
    })
  } catch (error) {
    console.error("Error in public API:", error)
    return res.status(500).json({ success: false, error: "Internal server error" })
  }
}

export default withPublicApiRateLimit(handler)
