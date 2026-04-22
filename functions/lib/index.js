"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkStaleTokens = exports.publishSocialQueue = void 0;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const admin = __importStar(require("firebase-admin"));
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
exports.publishSocialQueue = (0, scheduler_1.onSchedule)({
    schedule: "every 5 minutes",
    timeZone: "UTC",
    secrets: ["AI_API_KEY"],
}, async () => {
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
        const data = (await response.json());
        if (data.success) {
            const { processed, failed, skipped } = data.data;
            console.log(`[social-cron] Processed: ${processed}, Failed: ${failed}, Skipped: ${skipped}`);
            if (data.data.errors && data.data.errors.length > 0) {
                console.error("[social-cron] Errors:", JSON.stringify(data.data.errors));
            }
        }
        else {
            console.error("[social-cron] API returned failure:", JSON.stringify(data));
        }
    }
    catch (err) {
        console.error("[social-cron] Fetch error:", err);
    }
});
/**
 * Scheduled function: daily check for stale social account tokens.
 * Runs at 3 AM UTC. The actual refresh is handled during publish attempts.
 * This cron just logs which accounts haven't been refreshed in 30+ days.
 */
exports.checkStaleTokens = (0, scheduler_1.onSchedule)({
    schedule: "0 3 * * *",
    timeZone: "UTC",
}, async () => {
    const db = admin.firestore();
    const thirtyDaysAgo = admin.firestore.Timestamp.fromMillis(Date.now() - 30 * 24 * 60 * 60 * 1000);
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
        console.log(`[token-check] ${account.platform}/${account.username} — last refresh: ${lastRefresh ? new Date(lastRefresh.seconds * 1000).toISOString() : "never"}`);
        needAttention++;
    }
    console.log(`[token-check] Checked ${staleAccounts.size} accounts, ${needAttention} need attention`);
});
//# sourceMappingURL=index.js.map