import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";

// Initialize Firebase Admin (only once)
if (!admin.apps.length) {
  admin.initializeApp();
}

/**
 * Scheduled function: runs every 5 minutes to process the social post queue.
 *
 * Replaces the Vercel cron job which is limited to daily on the Hobby plan.
 * Firebase Cloud Scheduler allows sub-minute granularity on the Blaze plan.
 *
 * This function calls our own /api/cron/social endpoint with the AI_API_KEY,
 * which processes any scheduled posts that are due for publishing.
 */
export const publishSocialQueue = onSchedule(
  {
    schedule: "every 5 minutes",
    timeZone: "UTC",
    secrets: ["AI_API_KEY"],
  },
  async () => {
    const apiKey = process.env.AI_API_KEY;
    if (!apiKey) {
      console.error("[social-cron] AI_API_KEY not set in function env");
      return;
    }

    const appUrl = "https://partnersinbiz.online";
    const url = `${appUrl}/api/cron/social`;

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      if (!response.ok) {
        const body = await response.text();
        console.error(`[social-cron] HTTP ${response.status}: ${body}`);
        return;
      }

      const data = (await response.json()) as {
        success: boolean;
        data: { processed: number; failed: number; skipped: number; errors: unknown[] };
      };

      if (data.success) {
        const { processed, failed, skipped } = data.data;
        console.log(
          `[social-cron] Processed: ${processed}, Failed: ${failed}, Skipped: ${skipped}`
        );
        if (data.data.errors && data.data.errors.length > 0) {
          console.error("[social-cron] Errors:", JSON.stringify(data.data.errors));
        }
      } else {
        console.error("[social-cron] API returned failure:", JSON.stringify(data));
      }
    } catch (err) {
      console.error("[social-cron] Fetch error:", err);
    }
  }
);

/**
 * Scheduled function: daily check for stale social account tokens.
 * Runs at 3 AM UTC. The actual refresh is handled during publish attempts.
 * This cron just logs which accounts haven't been refreshed in 30+ days.
 */
export const checkStaleTokens = onSchedule(
  {
    schedule: "0 3 * * *",
    timeZone: "UTC",
  },
  async () => {
    const db = admin.firestore();
    const thirtyDaysAgo = admin.firestore.Timestamp.fromMillis(
      Date.now() - 30 * 24 * 60 * 60 * 1000
    );

    const staleAccounts = await db
      .collection("social_accounts")
      .where("status", "==", "active")
      .get();

    let needAttention = 0;

    for (const doc of staleAccounts.docs) {
      const account = doc.data();
      const lastRefresh = account.lastTokenRefresh;

      if (lastRefresh && lastRefresh.seconds > thirtyDaysAgo.seconds) {
        continue;
      }

      console.log(
        `[token-check] ${account.platform}/${account.username} — last refresh: ${lastRefresh ? new Date(lastRefresh.seconds * 1000).toISOString() : "never"}`
      );
      needAttention++;
    }

    console.log(
      `[token-check] Checked ${staleAccounts.size} accounts, ${needAttention} need attention`
    );
  }
);
