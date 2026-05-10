import { NextApiRequest, NextApiResponse } from "next";
import { withPermissionCheck } from "@/utils/permissionsManager";
import prisma from "@/utils/database";
import {
  saveEvidenceFile,
  parseBase64File,
  deleteEvidenceFile,
} from "@/utils/evidenceManager";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "25mb",
    },
  },
};

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id: workspaceId, caseId } = req.query;
  const groupId = BigInt(workspaceId as string);

  if (req.method === "POST") {
    try {
      const { fileName, fileData, description, isExternalLink, fileUrl } = req.body;
      if (!fileName || (!fileData && !isExternalLink)) {
        return res.status(400).json({
          success: false,
          error: "fileName and fileData (or fileUrl for external links) are required",
        });
      }

      const moderationCase = await prisma.moderationCase.findFirst({
        where: {
          id: caseId as string,
          workspaceGroupId: groupId,
        },
      });

      if (!moderationCase) {
        return res.status(404).json({
          success: false,
          error: "Case not found",
        });
      }

      let evidenceData;

      if (isExternalLink) {
        evidenceData = {
          caseId: caseId as string,
          uploadedBy: req.session.userid!,
          fileUrl: fileUrl,
          fileName: fileName,
          fileType: "external_link",
          fileSize: 0,
          description,
        };
      } else {
        const fileBuffer = parseBase64File(fileData);
        const { fileUrl: savedFileUrl, fileName: sanitizedFileName, fileType, fileSize } =
          await saveEvidenceFile(caseId as string, fileName, fileBuffer);

        evidenceData = {
          caseId: caseId as string,
          uploadedBy: req.session.userid!,
          fileUrl: savedFileUrl,
          fileName: sanitizedFileName,
          fileType,
          fileSize,
          description,
        };
      }

      const evidence = await prisma.moderationEvidence.create({
        data: evidenceData,
        include: {
          uploader: {
            select: {
              userid: true,
              username: true,
              picture: true,
            },
          },
        },
      });

      await prisma.moderationLog.create({
        data: {
          workspaceGroupId: groupId,
          actionBy: req.session.userid!,
          action: "evidence_added",
          targetUser: moderationCase.targetUserId,
          targetUsername: moderationCase.targetUsername,
          caseId: caseId as string,
          details: {
            evidenceId: evidence.id,
            fileName: evidence.fileName,
            fileType: evidence.fileType,
          },
        },
      });

      return res.status(201).json({
        success: true,
        data: evidence,
      });
    } catch (error) {
      console.error("Error uploading evidence:", error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Failed to upload evidence",
      });
    }
  }

  if (req.method === "GET") {
    try {
      const evidence = await prisma.moderationEvidence.findMany({
        where: {
          caseId: caseId as string,
        },
        include: {
          uploader: {
            select: {
              userid: true,
              username: true,
              picture: true,
            },
          },
        },
        orderBy: {
          createdAt: "asc",
        },
      });

      return res.status(200).json({
        success: true,
        data: evidence,
      });
    } catch (error) {
      console.error("Error fetching evidence:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to fetch evidence",
      });
    }
  }

  return res.status(405).json({
    success: false,
    error: "Method not allowed",
  });
}

export default withPermissionCheck(handler, ["upload_evidence", "view_moderation"]);
