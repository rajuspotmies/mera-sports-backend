import express from "express";
// import bcrypt from "bcrypt"; // REMOVED
import { supabaseAdmin } from "../config/supabaseClient.js";
import { verifyPlayer } from "../middleware/rbacMiddleware.js";

const router = express.Router();

// --------------------------------------------------------------------------
// GET PLAYER PROFILE
// Used by: Player App -> Dashboard
// --------------------------------------------------------------------------
router.get("/dashboard", verifyPlayer, async (req, res) => {
    try {
        const userId = req.user.id;

        const { data: player, error } = await supabaseAdmin
            .from("users") // Changed from 'players' to 'users'
            .select("*")
            .eq("id", userId)
            .single();

        if (error) throw error;
        if (!player) return res.status(404).json({ message: "Player not found" });

        // Fetch School Details (if available)
        const { data: schoolDetails } = await supabaseAdmin
            .from("player_school_details")
            .select("*")
            .eq("player_id", userId)
            .maybeSingle();

        if (schoolDetails) {
            player.schoolDetails = schoolDetails;
        }

        res.json({ success: true, player });
    } catch (err) {
        console.error("DASHBOARD ERROR:", err);
        res.status(500).json({ message: "Failed to load dashboard" });
    }
});

// --------------------------------------------------------------------------
// UPDATE PLAYER PROFILE
// Used by: Player App -> Edit Profile
// --------------------------------------------------------------------------
router.put("/update-profile", verifyPlayer, async (req, res) => {
    try {
        const userId = req.user.id;
        const {
            email, // Added Email
            mobile,
            apartment,
            street,
            city,
            state,
            pincode,
            country
        } = req.body;

        const { data: updatedPlayer, error } = await supabaseAdmin
            .from("users")
            .update({
                email, // Added Email
                mobile,
                apartment,
                street,
                city,
                state,
                pincode,
                country
            })
            .eq("id", userId)
            .select()
            .single();

        if (error) throw error;

        res.json({ success: true, player: updatedPlayer, message: "Profile updated successfully" });

    } catch (err) {
        console.error("UPDATE ERROR:", err);
        res.status(500).json({ message: "Failed to update profile" });
    }
});

// --------------------------------------------------------------------------
// CHANGE PASSWORD
// Used by: Player App -> Change Password
// --------------------------------------------------------------------------
router.put("/change-password", verifyPlayer, async (req, res) => {
    try {
        const userId = req.user.id;
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ message: "All fields are required" });
        }

        // 1. Fetch current password
        const { data: player, error: fetchError } = await supabaseAdmin
            .from("users")
            .select("password")
            .eq("id", userId)
            .single();

        if (fetchError || !player) {
            return res.status(404).json({ message: "User not found" });
        }

        // 2. Verify Old Password (PLAINTEXT)
        // const match = await bcrypt.compare(currentPassword, player.password);
        if (player.password !== currentPassword) {
            return res.status(401).json({ message: "Incorrect current password" });
        }

        // 3. Hash New Password --> PLAINTEXT
        // const hashedNewPassword = await bcrypt.hash(newPassword, 10);
        const newPasswordPlain = newPassword;

        // 4. Update
        const { error: updateError } = await supabaseAdmin
            .from("users")
            .update({ password: newPasswordPlain })
            .eq("id", userId);

        if (updateError) throw updateError;

        res.json({ success: true, message: "Password updated successfully" });

    } catch (err) {
        console.error("PASSWORD UPDATE ERROR:", err);
        res.status(500).json({ message: "Failed to update password" });
    }
});

export default router;