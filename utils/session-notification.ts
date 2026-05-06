import prisma from './database';
import { DiscordAPI, decryptToken, DiscordMessage } from './discord';
import { getUsername } from './userinfoEngine';

interface SessionDetails {
  id: string;
  name: string;
  type: string;
  date: Date;
  duration: number;
  hostUserId: number | null;
  sessionTypeName?: string;
}

async function resolveHostName(hostUserId: number | null): Promise<string> {
  if (!hostUserId) return 'Unassigned';
  try {
    const hostUser = await prisma.user.findUnique({
      where: { userid: BigInt(hostUserId) },
      select: { username: true },
    });
    if (hostUser?.username) return hostUser.username;
    return await getUsername(hostUserId) || String(hostUserId);
  } catch {
    return String(hostUserId);
  }
}

export function getSessionStatus(
  date: Date,
  duration: number,
  statues: any[],
  ended?: Date | null,
): string | null {
  const now = new Date();
  const endTime = new Date(new Date(date).getTime() + duration * 60 * 1000);

  if (ended || now > endTime) return 'Concluded';

  const minutesFromStart = (now.getTime() - new Date(date).getTime()) / 1000 / 60;

  const sorted = [...statues].sort((a: any, b: any) => b.timeAfter - a.timeAfter);
  for (const status of sorted) {
    if (minutesFromStart >= status.timeAfter) {
      return status.name;
    }
  }
  return null;
}