-- Remove Discord session integration columns from Session table
ALTER TABLE "Session" DROP COLUMN IF EXISTS "discordMessageId";
ALTER TABLE "Session" DROP COLUMN IF EXISTS "discordChannelId";
ALTER TABLE "Session" DROP COLUMN IF EXISTS "lastDiscordStatus";

-- Remove Discord session integration columns from DiscordIntegration table
ALTER TABLE "DiscordIntegration" DROP COLUMN IF EXISTS "sessionChannelId";
ALTER TABLE "DiscordIntegration" DROP COLUMN IF EXISTS "sessionChannelName";
ALTER TABLE "DiscordIntegration" DROP COLUMN IF EXISTS "sessionNotifyOnCreate";
ALTER TABLE "DiscordIntegration" DROP COLUMN IF EXISTS "sessionNotifyOnClaim";
ALTER TABLE "DiscordIntegration" DROP COLUMN IF EXISTS "sessionNotifyOnStart";
ALTER TABLE "DiscordIntegration" DROP COLUMN IF EXISTS "sessionEmbedTitle";
ALTER TABLE "DiscordIntegration" DROP COLUMN IF EXISTS "sessionEmbedColor";
ALTER TABLE "DiscordIntegration" DROP COLUMN IF EXISTS "sessionEmbedDescription";
ALTER TABLE "DiscordIntegration" DROP COLUMN IF EXISTS "sessionEmbedFooter";
ALTER TABLE "DiscordIntegration" DROP COLUMN IF EXISTS "sessionCreateEmbedTitle";
ALTER TABLE "DiscordIntegration" DROP COLUMN IF EXISTS "sessionCreateEmbedColor";
ALTER TABLE "DiscordIntegration" DROP COLUMN IF EXISTS "sessionCreateEmbedDescription";
ALTER TABLE "DiscordIntegration" DROP COLUMN IF EXISTS "sessionCreateEmbedFooter";
ALTER TABLE "DiscordIntegration" DROP COLUMN IF EXISTS "sessionClaimEmbedTitle";
ALTER TABLE "DiscordIntegration" DROP COLUMN IF EXISTS "sessionClaimEmbedColor";
ALTER TABLE "DiscordIntegration" DROP COLUMN IF EXISTS "sessionClaimEmbedDescription";
ALTER TABLE "DiscordIntegration" DROP COLUMN IF EXISTS "sessionClaimEmbedFooter";
ALTER TABLE "DiscordIntegration" DROP COLUMN IF EXISTS "sessionStartEmbedTitle";
ALTER TABLE "DiscordIntegration" DROP COLUMN IF EXISTS "sessionStartEmbedColor";
ALTER TABLE "DiscordIntegration" DROP COLUMN IF EXISTS "sessionStartEmbedDescription";
ALTER TABLE "DiscordIntegration" DROP COLUMN IF EXISTS "sessionStartEmbedFooter";
ALTER TABLE "DiscordIntegration" DROP COLUMN IF EXISTS "sessionReviewEmbedTitle";
ALTER TABLE "DiscordIntegration" DROP COLUMN IF EXISTS "sessionReviewEmbedColor";
ALTER TABLE "DiscordIntegration" DROP COLUMN IF EXISTS "sessionReviewEmbedDescription";
ALTER TABLE "DiscordIntegration" DROP COLUMN IF EXISTS "sessionReviewEmbedFooter";
ALTER TABLE "DiscordIntegration" DROP COLUMN IF EXISTS "sessionPingRoleId";
ALTER TABLE "DiscordIntegration" DROP COLUMN IF EXISTS "sessionPingRoleName";
ALTER TABLE "DiscordIntegration" DROP COLUMN IF EXISTS "pingRoles";
