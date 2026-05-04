import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/utils/database";

type Resp = {
  success: boolean;
  updatedStarted?: number;
  updatedEnded?: number;
  error?: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse<Resp>) {
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "Method not allowed" });

  const secret = req.headers["x-cron-secret"] || req.headers.authorization;
  const expected = process.env.CRON_SECRET;
  if (!expected) return res.status(500).json({ success: false, error: "CRON_SECRET not configured" });
  if (!secret || String(secret) !== expected) return res.status(401).json({ success: false, error: "Unauthorized" });

  try {
    const now = new Date();
    const lookahead = new Date(now.getTime() + 30 * 60 * 1000);
    const candidates = await prisma.session.findMany({
      where: {
        ended: null,
        date: {
          lte: lookahead,
        },
      },
      include: {
        sessionType: true,
      },
    });

    let updatedStarted = 0;
    let updatedEnded = 0;

    for (const s of candidates) {
      const duration = s.duration;
      const endTime = new Date(new Date(s.date).getTime() + duration * 60 * 1000);

      if (endTime <= now) {
        await prisma.session.update({ where: { id: s.id }, data: { ended: endTime } });
        updatedEnded++;
      } else {
        if (!s.startedAt && s.date <= now) {
          await prisma.session.update({ where: { id: s.id }, data: { startedAt: s.date } });
          updatedStarted++;
        }
      }
    }

    return res.status(200).json({ success: true, updatedStarted, updatedEnded });
  } catch (e: any) {
    console.error("Cron update-sessions error:", e);
    return res.status(500).json({ success: false, error: String(e?.message || e) });
  }
}
