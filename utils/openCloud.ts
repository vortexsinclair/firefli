const OPENCLOUD = "https://apis.roblox.com/cloud/v2";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface CloudV2UserInfo {
  username: string;
  displayName: string;
}

interface CloudV2BatchResult {
  resolved: Map<number, CloudV2UserInfo>;
  notFound: number[];
}

export async function fetchCloudV2UserInfoBatch(
  userIds: number[],
  apiKey: string
): Promise<CloudV2BatchResult> {
  const resolved = new Map<number, CloudV2UserInfo>();
  const notFound: number[] = [];
  if (userIds.length === 0) return { resolved, notFound };

  const BATCH_DELAY = 100;
  const MAX_RETRIES = 6;

  for (let i = 0; i < userIds.length; i++) {
    const userId = userIds[i];
    let retries = 0;

    while (retries <= MAX_RETRIES) {
      try {
        const res = await fetch(`${OPENCLOUD}/users/${userId}`, {
          headers: { "x-api-key": apiKey },
        });

        if (res.ok) {
          const data = await res.json();
          if (data.name && data.displayName) {
            resolved.set(userId, {
              username: data.name,
              displayName: data.displayName,
            });
          }
          break;
        } else if (res.status === 429) {
          retries++;
          const backoff = 5000 * retries;
          console.warn(`[CloudV2] Rate limited on user ${userId}, retry ${retries}/${MAX_RETRIES} after ${backoff / 1000}s`);
          await delay(backoff);
          continue;
        } else if (res.status === 404) {
          notFound.push(userId);
          break;
        } else {
          console.warn(`[CloudV2] Failed to fetch user ${userId}: ${res.status}`);
          break;
        }
      } catch (err) {
        console.error(`[CloudV2] Error fetching user ${userId}:`, err);
        break;
      }
    }

    if (i < userIds.length - 1) {
      await delay(BATCH_DELAY);
    }
  }

  return { resolved, notFound };
}

interface OpenCloudMember {
  path: string;
  user: string;
  role: string;
  createTime: string;
  updateTime: string;
}

interface OpenCloudMembershipResponse {
  groupMemberships: OpenCloudMember[];
  nextPageToken?: string;
}

export interface GroupMember {
  userId: number;
  roleId: number;
}

export async function fetchOpenCloudGroupMembers(
  groupId: number,
  apiKey: string,
  maxPages: number = 0
): Promise<{ members: GroupMember[] }> {
  const allMembers: GroupMember[] = [];
  let pageToken: string | undefined;
  let pageCount = 0;
  while (true) {
    const url = new URL(`${OPENCLOUD}/groups/${groupId}/memberships`);
    url.searchParams.set("maxPageSize", "100");
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }
    const response = await fetch(url.toString(), {
      headers: {
        "x-api-key": apiKey,
      },
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Roblox Open Cloud API error (${response.status}): ${body}`);
    }
    const data: OpenCloudMembershipResponse = await response.json();
    if (data.groupMemberships) {
      for (const membership of data.groupMemberships) {
        const userIdMatch = membership.user?.match(/users\/(\d+)/);
        const roleIdMatch = membership.role?.match(/roles\/(\d+)/);

        if (userIdMatch) {
          allMembers.push({
            userId: parseInt(userIdMatch[1]),
            roleId: roleIdMatch ? parseInt(roleIdMatch[1]) : 0,
          });
        }
      }
    }
    pageCount++;
    if (maxPages > 0 && pageCount >= maxPages) break;
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }
  return { members: allMembers };
}

export async function fetchOpenCloudRoleMembers(
  groupId: number,
  roleId: number,
  apiKey: string
): Promise<GroupMember[]> {
  const url = new URL(`${OPENCLOUD}/groups/${groupId}/memberships`);
  url.searchParams.set("maxPageSize", "100");
  url.searchParams.set("filter", `role == 'groups/${groupId}/roles/${roleId}'`);
  const allMembers: GroupMember[] = [];
  let pageToken: string | undefined;
  while (true) {
    const requestUrl = new URL(url.toString());
    if (pageToken) {
      requestUrl.searchParams.set("pageToken", pageToken);
    }
    const response = await fetch(requestUrl.toString(), {
      headers: {
        "x-api-key": apiKey,
      },
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Roblox Open Cloud API error (${response.status}): ${body}`);
    }
    const data: OpenCloudMembershipResponse = await response.json();
    if (data.groupMemberships) {
      for (const membership of data.groupMemberships) {
        const userIdMatch = membership.user?.match(/users\/(\d+)/);
        if (userIdMatch) {
          allMembers.push({
            userId: parseInt(userIdMatch[1]),
            roleId: roleId,
          });
        }
      }
    }

    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }

  return allMembers;
}

export async function getWorkspaceRobloxApiKey(
  groupId: number
): Promise<string | null> {
  const prisma = (await import("./database")).default;
  
  const services = await prisma.workspaceExternalServices.findUnique({
    where: { workspaceGroupId: groupId },
    select: { robloxApiKey: true },
  });

  return services?.robloxApiKey || null;
}

export interface RankingResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export class RobloxCloudRankingAPI {
  private apiKey: string;
  private groupId: number;

  constructor(apiKey: string, groupId: number) {
    this.apiKey = apiKey;
    this.groupId = groupId;
  }

  private normaliseRoleId(roleId: string | number): number {
    const parsed = Number(roleId);

    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
      throw new Error(`Invalid Roblox role ID: ${roleId}`);
    }

    return parsed;
  }

  async setUserRole(userId: number, robloxRoleId: string | number): Promise<RankingResponse> {
    try {
      const resolvedRoleId = this.normaliseRoleId(robloxRoleId);
      const currentMembership = await this.getUserMembership(userId);
      if (currentMembership && currentMembership.roleId === resolvedRoleId) {
        return { success: false, error: "User is already at this role" };
      }

      const url = `${OPENCLOUD}/groups/${this.groupId}/memberships/${userId}?updateMask=role`;
      const response = await fetch(url, {
        method: "PATCH",
        headers: {
          "x-api-key": this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          role: `groups/${this.groupId}/roles/${resolvedRoleId}`,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        let errorMessage = `Failed to update role (${response.status})`;

        try {
          const parsed = JSON.parse(body);
          errorMessage = parsed.message || parsed.error || errorMessage;
          console.error(`Roblox API error for user ${userId} -> role ${resolvedRoleId}:`, parsed);
        } catch {
          console.error(`Roblox API error body:`, body);
        }

        return { success: false, error: errorMessage };
      }

      await delay(1000);

      return { success: true, message: "Role updated successfully" };
    } catch (error: any) {
      console.error("setUserRole exception:", error);
      return {
        success: false,
        error: error.message || "Open Cloud ranking request failed",
      };
    }
  }

  async getGroupRoles(): Promise<{ id: number; name: string; rank: number }[]> {
    const response = await fetch(
      `https://groups.roblox.com/v1/groups/${this.groupId}/roles`
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch group roles: ${response.status}`);
    }

    const data = await response.json();

    return (data.roles || [])
      .map((r: any) => ({
        id: Number(r.id),
        name: r.name,
        rank: Number(r.rank),
      }))
      .filter((r: any) => Number.isSafeInteger(r.id) && Number.isSafeInteger(r.rank))
      .sort((a: any, b: any) => a.rank - b.rank);
  }

  async getUserMembership(
    userId: number
  ): Promise<{ roleId: number; rank: number } | null> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(
          `https://groups.roblox.com/v1/users/${userId}/groups/roles`
        );

        if (!response.ok) return null;

        const data = await response.json();

        const groupEntry = (data.data || []).find(
          (g: any) => Number(g.group?.id) === this.groupId
        );

        if (!groupEntry?.role) return null;

        return {
          roleId: Number(groupEntry.role.id),
          rank: Number(groupEntry.role.rank),
        };
      } catch {
        if (attempt < 2) {
          await delay(1000);
          continue;
        }

        return null;
      }
    }

    return null;
  }

	async promoteUser(userId: number): Promise<RankingResponse> {
	try {
		const [membership, allRoles] = await Promise.all([
		this.getUserMembership(userId),
		this.getGroupRoles(),
		]);

		if (!membership) {
		return { success: false, error: "User is not in the group" };
		}

		const roles = allRoles
		.filter((r) => r.rank > 0)
		.sort((a, b) => a.rank - b.rank);

		const currentIndex = roles.findIndex((r) => r.id === membership.roleId);

		if (currentIndex === -1) {
		return {
			success: false,
			error: `Current Roblox role ${membership.roleId} was not found in group roles`,
		};
		}

		const nextRole = roles[currentIndex + 1];

		if (!nextRole) {
		return { success: false, error: "User is already at the highest rank" };
		}

		console.log("[RobloxCloud] Promote", {
		userId,
		from: roles[currentIndex],
		to: nextRole,
		});

		return this.setUserRole(userId, nextRole.id);
	} catch (error: any) {
		return { success: false, error: error.message || "Promotion failed" };
	}
	}

async demoteUser(userId: number): Promise<RankingResponse> {
  try {
    const [membership, allRoles] = await Promise.all([
      this.getUserMembership(userId),
      this.getGroupRoles(),
    ]);

    if (!membership) {
      return { success: false, error: "User is not in the group" };
    }

    const roles = allRoles
      .filter((r) => r.rank > 0)
      .sort((a, b) => a.rank - b.rank);

    const currentIndex = roles.findIndex((r) => r.id === membership.roleId);

    if (currentIndex === -1) {
      return {
        success: false,
        error: `Current Roblox role ${membership.roleId} was not found in group roles`,
      };
    }

    const prevRole = roles[currentIndex - 1];

    if (!prevRole) {
      return { success: false, error: "User is already at the lowest rank" };
    }

    console.log("[RobloxCloud] Demote", {
      userId,
      from: roles[currentIndex],
      to: prevRole,
    });

    return this.setUserRole(userId, prevRole.id);
  } catch (error: any) {
    return { success: false, error: error.message || "Demotion failed" };
  }
}

  async terminateUser(userId: number): Promise<RankingResponse> {
    try {
      const roles = await this.getGroupRoles();
      const lowestRole = roles.find((r) => r.rank === 1);

      if (!lowestRole) {
        return { success: false, error: "Could not find lowest rank" };
      }

      return this.setUserRole(userId, lowestRole.id);
    } catch (error: any) {
      return { success: false, error: error.message || "Termination failed" };
    }
  }

  async setUserRank(userId: number, robloxRoleId: string | number): Promise<RankingResponse> {
    return this.setUserRole(userId, robloxRoleId);
  }
}