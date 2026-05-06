import type { NextApiRequest, NextApiResponse } from "next";
import { withSessionRoute } from "@/lib/withSession";
import axios from "axios";
import prisma from "@/utils/database";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

type Data = {
  success: boolean;
  thumbnailUrl?: string;
  error?: string;
};

export default withSessionRoute(handler);

async function handler(req: NextApiRequest, res: NextApiResponse<Data>) {
  if (req.method !== "GET")
    return res.status(405).json({ success: false, error: "Method not allowed" });
  if (!req.session.userid)
    return res.status(401).json({ success: false, error: "Not logged in" });

  const placeId = req.query.placeId as string;
  if (!placeId || !/^\d+$/.test(placeId))
    return res.status(400).json({ success: false, error: "Invalid placeId" });

  const cached = await (prisma as any).thumbnails.findUnique({
    where: { placeId: BigInt(placeId) },
  }).catch(() => null);

  if (cached && Date.now() - new Date(cached.updatedAt).getTime() < CACHE_TTL_MS) {
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.status(200).json({ success: true, thumbnailUrl: cached.imageUrl });
  }

  const noThrow = { timeout: 8000, validateStatus: () => true };

  const getThumbnailByUniverseId = async (universeId: string | number) => {
    const r = await axios.get(
      `https://thumbnails.roblox.com/v1/games/multiget/thumbnails?universeIds=${universeId}&size=768x432&format=Png&isCircular=false`,
      noThrow
    );
    const entry = r.data?.data?.[0];
    const url: string | undefined = entry?.thumbnails?.[0]?.imageUrl;
    return url && entry?.thumbnails?.[0]?.state === "Completed" ? url : undefined;
  };

  try {
    let robloxUrl: string | undefined;
    let resolvedUniverseId: number | undefined;
    robloxUrl = await getThumbnailByUniverseId(placeId);
    if (robloxUrl) resolvedUniverseId = Number(placeId);
    if (!robloxUrl) {
      const universeRes = await axios.get(
        `https://apis.roblox.com/universes/v1/places/${placeId}/universe`,
        noThrow
      );
      resolvedUniverseId = universeRes.data?.universeId;
      if (resolvedUniverseId) robloxUrl = await getThumbnailByUniverseId(resolvedUniverseId);
    }

    if (!robloxUrl) {
      if (cached?.imageUrl) {
        return res.status(200).json({ success: true, thumbnailUrl: cached.imageUrl });
      }
      return res.status(404).json({ success: false, error: "Thumbnail not found" });
    }

    (prisma as any).thumbnails.upsert({
      where: { placeId: BigInt(placeId) },
      update: { universeId: resolvedUniverseId ? BigInt(resolvedUniverseId) : null, imageUrl: robloxUrl, updatedAt: new Date() },
      create: { placeId: BigInt(placeId), universeId: resolvedUniverseId ? BigInt(resolvedUniverseId) : null, imageUrl: robloxUrl },
    }).catch(() => {});

    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.status(200).json({ success: true, thumbnailUrl: robloxUrl });
  } catch {
    if (cached?.imageUrl) {
      return res.status(200).json({ success: true, thumbnailUrl: cached.imageUrl });
    }
    return res.status(502).json({ success: false, error: "Failed to fetch thumbnail" });
  }
}