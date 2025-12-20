import express from "express";
import { supabaseAdmin } from "../config/supabaseClient.js";
import { verifyAdmin } from "../middleware/rbacMiddleware.js";

const router = express.Router();

// GET /api/admin/players
// Fetch all users with role = 'player'
router.get("/players", verifyAdmin, async (req, res) => {
    try {
        const { data: players, error } = await supabaseAdmin
            .from("users")
            .select("*")
            .eq("role", "player")
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.json({ success: true, players });
    } catch (err) {
        console.error("ADMIN PLAYERS ERROR:", err);
        res.status(500).json({ message: "Failed to fetch players" });
    }
});

// GET /api/admin/players/:id
// Fetch single player details
router.get("/players/:id", verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        // 1. Fetch User
        const { data: player, error } = await supabaseAdmin
            .from("users")
            .select("*")
            .eq("id", id)
            .single();

        if (error) throw error;

        // 2. Fetch School Details (if any)
        const { data: schoolDetails } = await supabaseAdmin
            .from("player_school_details")
            .select("*")
            .eq("player_id", id)
            .single();

        // 3. Attach school details
        if (schoolDetails) {
            player.school = {
                name: schoolDetails.school_name,
                address: schoolDetails.school_address,
                city: schoolDetails.school_city,
                pincode: schoolDetails.school_pincode
            };
        }

        res.json({ success: true, player });
    } catch (err) {
        console.error("ADMIN PLAYER DETAIL ERROR:", err);
        res.status(500).json({ message: "Failed to fetch player details" });
    }
});

// GET /api/admin/settings
// Fetch platform settings
router.get("/settings", verifyAdmin, async (req, res) => {
    try {
        const { data: settings, error } = await supabaseAdmin
            .from("platform_settings")
            .select("*")
            .eq("id", 1)
            .single();

        if (error) throw error;
        res.json({ success: true, settings });
    } catch (err) {
        console.error("GET SETTINGS ERROR:", err);
        res.status(500).json({ message: "Failed to fetch settings" });
    }
});

// POST /api/admin/settings
// Update platform settings
router.post("/settings", verifyAdmin, async (req, res) => {
    try {
        const { platformName, supportEmail, supportPhone } = req.body;
        console.log("Saving Settings - Body:", req.body); // DEBUG LOG

        const { data: settings, error } = await supabaseAdmin
            .from("platform_settings")
            .update({
                platform_name: platformName,
                support_email: supportEmail,
                support_phone: supportPhone,
                logo_url: req.body.logoUrl,
                updated_at: new Date()
            })
            .eq("id", 1)
            .select()
            .single();

        if (error) throw error;
        res.json({ success: true, settings });
    } catch (err) {
        console.error("UPDATE SETTINGS ERROR:", err);
        res.status(500).json({ message: "Failed to update settings" });
    }
});



// GET /api/admin/dashboard-stats
// Fetch aggregated stats for dashboard
router.get("/dashboard-stats", verifyAdmin, async (req, res) => {
    try {
        // 1. Player Counts
        const { count: totalPlayers, error: countError } = await supabaseAdmin
            .from("users")
            .select("*", { count: 'exact', head: true })
            .eq("role", "player");

        const { count: verifiedPlayers } = await supabaseAdmin
            .from("users")
            .select("*", { count: 'exact', head: true })
            .eq("role", "player")
            .eq("verification", "verified");

        const { count: pendingPlayers } = await supabaseAdmin
            .from("users")
            .select("*", { count: 'exact', head: true })
            .eq("role", "player")
            .eq("verification", "pending");

        const { count: rejectedPlayersCount } = await supabaseAdmin
            .from("users")
            .select("*", { count: 'exact', head: true })
            .eq("role", "player")
            .eq("verification", "rejected");

        // 2. Recent Players (Limit 6)
        const { data: recentPlayers } = await supabaseAdmin
            .from("users")
            .select("*")
            .eq("role", "player")
            .order("created_at", { ascending: false })
            .limit(6);

        // 3. Rejected Players List (Limit 5)
        const { data: rejectedPlayersList } = await supabaseAdmin
            .from("users")
            .select("*")
            .eq("role", "player")
            .eq("verification", "rejected")
            .order("created_at", { ascending: false })
            .limit(5);

        if (countError) throw countError;

        res.json({
            success: true,
            stats: {
                totalPlayers: totalPlayers || 0,
                verifiedPlayers: verifiedPlayers || 0,
                pendingPlayers: pendingPlayers || 0,
                rejectedPlayers: rejectedPlayersCount || 0
            },
            recentPlayers: recentPlayers || [],
            rejectedPlayersList: rejectedPlayersList || []
        });
    } catch (err) {
        console.error("DASHBOARD STATS ERROR:", err);
        res.status(500).json({ message: "Failed to fetch dashboard stats" });
    }
});

export default router;
