import { supabaseAdmin } from "../config/supabaseClient.js";
import { createNotification } from "../services/notificationService.js";
import { uploadBase64 } from "../utils/uploadHelper.js";

// POST /api/admin/broadcast
export const sendBroadcast = async (req, res) => {
    try {
        const { title, message, recipients, image, recipientType, targetCount } = req.body;

        if (!title || !message || !recipients || !Array.isArray(recipients)) {
            return res.status(400).json({ message: "Invalid payload: title, message, and recipients array required." });
        }


        let imageUrl = null;
        if (image && image.startsWith('data:')) {
            imageUrl = await uploadBase64(image, 'admin-assets', 'broadcasts');
        }

        // 1. Create In-App Notifications
        // We do this asynchronously to not block the response if the list is huge, 
        // but for <1000 users, await Promise.all is okay-ish. 
        // For robustness, we'll process in chunks.

        const chunkSize = 50;
        const recipientChunks = [];
        for (let i = 0; i < recipients.length; i += chunkSize) {
            recipientChunks.push(recipients.slice(i, i + chunkSize));
        }

        let successCount = 0;
        let failureCount = 0;

        // Process chunks
        for (const chunk of recipientChunks) {
            await Promise.all(chunk.map(async (user) => {
                try {
                    await createNotification(
                        user.id,
                        title,
                        message, // In a real app, this might be truncated or formatted
                        'info',
                        imageUrl // Storing image url in link field for now, or we need a new field
                    );
                    successCount++;
                } catch (e) {
                    console.error(`Failed to notify user ${user.id}:`, e);
                    failureCount++;
                }
            }));
        }

        // 2. Log to Database
        const { error: logError } = await supabaseAdmin.from("broadcast_logs").insert({
            title,
            message,
            recipient_type: recipientType,
            target_count: targetCount,
            success_count: successCount,
            failure_count: failureCount,
            image_url: imageUrl,
            meta: { sent_to_ids: recipients.map(r => r.id) } // Optional: Store IDs for reference
        });

        if (logError) console.error("Failed to log broadcast history:", logError);


        res.json({
            success: true,
            message: `Broadcast processed. Sent to ${successCount} users.`,
            stats: { total: recipients.length, success: successCount, failed: failureCount }
        });

    } catch (err) {
        console.error("BROADCAST ERROR:", err);
        res.status(500).json({ message: "Internal Server Error processing broadcast." });
    }
};
