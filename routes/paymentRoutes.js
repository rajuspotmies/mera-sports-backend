import express from "express";
import { supabaseAdmin } from "../config/supabaseClient.js";
import { authenticateUser as verifyToken } from "../middleware/authMiddleware.js";
import { sendRegistrationEmail } from "../utils/mailer.js";

const router = express.Router();

/* ================= HELPER: UPLOAD BASE64 TO SUPABASE ================= */
async function uploadBase64(base64Data, bucket, folder = "misc") {
    if (!base64Data || typeof base64Data !== "string" || !base64Data.startsWith("data:")) {
        return null;
    }

    try {
        const matches = base64Data.match(
            /^data:(image\/[a-zA-Z]+|application\/pdf);base64,(.+)$/
        );
        if (!matches) return null;

        const mimeType = matches[1];
        let ext = "bin";
        if (mimeType === "application/pdf") ext = "pdf";
        else if (mimeType.startsWith("image/")) ext = mimeType.split("/")[1];

        const buffer = Buffer.from(matches[2], "base64");
        const filename = `${folder}/${Date.now()}_${Math.random()
            .toString(36)
            .substring(7)}.${ext}`;

        const { error } = await supabaseAdmin.storage
            .from(bucket)
            .upload(filename, buffer, {
                contentType: mimeType,
                upsert: true,
            });

        if (error) {
            console.error("Storage upload error:", error);
            return null;
        }

        const { data: urlData } = supabaseAdmin.storage
            .from(bucket)
            .getPublicUrl(filename);

        return urlData?.publicUrl || null;
    } catch (err) {
        console.error("Upload handler exception:", err);
        return null;
    }
}

/* ================= SUBMIT MANUAL PAYMENT ================= */
router.post("/submit-manual-payment", verifyToken, async (req, res) => {
    try {
        const {
            eventId,
            amount,
            categories,
            transactionId,
            screenshot,
            teamId,
            document,
        } = req.body;

        const userId = req.user?.id;

        /* -------- VALIDATION -------- */
        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        if (!eventId || !amount || !categories || !screenshot) {
            return res.status(400).json({
                message: "Event, Amount, Categories, and Screenshot are required",
            });
        }

        if (req.user.role === "admin") {
            return res.status(403).json({
                message: "Admins cannot register for events",
            });
        }

        /* -------- FILE UPLOADS -------- */
        const screenshotUrl = await uploadBase64(
            screenshot,
            "event-assets",
            "payment-proofs"
        );

        if (!screenshotUrl) {
            return res.status(500).json({
                message: "Failed to upload payment screenshot",
            });
        }

        let documentUrl = null;
        if (document) {
            documentUrl = await uploadBase64(
                document,
                "event-documents",
                "user-docs"
            );
        }

        /* -------- CREATE TRANSACTION -------- */
        const { data: transaction, error: txError } = await supabaseAdmin
            .from("transactions")
            .insert({
                order_id: `MANUAL_${Date.now()}`,
                manual_transaction_id: transactionId || null,
                payment_mode: "manual",
                screenshot_url: screenshotUrl,
                amount,
                currency: "INR",
                user_id: userId,
            })
            .select()
            .maybeSingle();

        if (txError || !transaction) {
            console.error("Transaction insert failed:", txError);
            return res.status(500).json({
                message: "Failed to submit transaction",
            });
        }

        /* -------- CREATE REGISTRATION -------- */
        const registrationNo = `REG-${Date.now()}`;

        const { error: regError } = await supabaseAdmin
            .from("event_registrations")
            .insert({
                event_id: eventId,
                player_id: userId,
                registration_no: registrationNo,
                categories,
                amount_paid: amount,
                transaction_id: transaction.id,
                screenshot_url: screenshotUrl,
                manual_transaction_id: transactionId || null,
                team_id: teamId || null,
                document_url: documentUrl,
            });

        if (regError) {
            console.error("Registration insert failed:", regError);

            // rollback transaction (best effort)
            await supabaseAdmin.from("transactions").delete().eq("id", transaction.id);

            return res.status(500).json({
                message: "Failed to create event registration",
            });
        }

        /* -------- SEND EMAIL (NON-BLOCKING) -------- */
        (async () => {
            try {
                const { data: userData } = await supabaseAdmin
                    .from("users")
                    .select("email, first_name")
                    .eq("id", userId)
                    .maybeSingle();

                const { data: eventData } = await supabaseAdmin
                    .from("events")
                    .select("name")
                    .eq("id", eventId)
                    .maybeSingle();

                if (userData?.email) {
                    await sendRegistrationEmail(userData.email, {
                        playerName: userData.first_name || "Athlete",
                        eventName: eventData?.name || "Sports Event",
                        registrationNo,
                        amount,
                        category: categories,
                        date: new Date(),
                    });
                }
            } catch (emailErr) {
                console.error("Email send failed:", emailErr);
            }
        })();

        /* -------- SUCCESS RESPONSE -------- */
        return res.json({
            success: true,
            message: "Payment submitted successfully and is under verification",
            transactionId: transaction.id,
            registrationNo,
        });
    } catch (err) {
        console.error("Manual Payment Fatal Error:", err);
        return res.status(500).json({ message: "Internal Server Error" });
    }
});

export default router;
