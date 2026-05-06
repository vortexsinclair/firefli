// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";
import { fetchworkspace, getConfig, setConfig } from "@/utils/configEngine";
import prisma, { user } from "@/utils/database";
import { withSessionRoute } from "@/lib/withSession";
import {
  withPermissionCheck,
  checkGroupRoles,
} from "@/utils/permissionsManager";
import {
  getUsername,
  getThumbnail,
  getDisplayName,
} from "@/utils/userinfoEngine";
import { parse } from "path";
type Data = {
  success: boolean;
  error?: string;
};

export default withPermissionCheck(handler, "admin");

export async function handler(req: NextApiRequest, res: NextApiResponse<Data>) {
  if (req.method !== "POST")
    return res
      .status(405)
      .json({ success: false, error: "Method not allowed" });

  try {
    const workspaceId = parseInt(req.query.id as string);

    if (isNaN(workspaceId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid workspace ID",
      });
    }

    checkGroupRoles(workspaceId).catch((error) => {
      console.error("Error checking group roles:", error);
    });

    res.status(200).json({
      success: true,
    });
  } catch (error) {
    console.error("Error in checkgrouproles handler:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to start role sync",
    });
  }
}
