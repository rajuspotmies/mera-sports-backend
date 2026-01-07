import { supabaseAdmin } from "../config/supabaseClient.js";

// GET /api/notifications
export const getNotifications = async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin.from('notifications').select('*').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(50);
        if (error) throw error;

        const { count } = await supabaseAdmin.from('notifications').select('*', { count: 'exact', head: true }).eq('user_id', req.user.id).eq('is_read', false);
        res.json({ success: true, notifications: data, unreadCount: count || 0 });
    } catch (err) {
        console.error("Get Notifications Error:", err);
        res.status(500).json({ message: "Failed to fetch notifications" });
    }
};

// POST /api/notifications/mark-read
export const markNotificationsRead = async (req, res) => {
    try {
        const { notificationId, markAll } = req.body;
        if (markAll) {
            await supabaseAdmin.from('notifications').update({ is_read: true }).eq('user_id', req.user.id).eq('is_read', false);
        } else if (notificationId) {
            await supabaseAdmin.from('notifications').update({ is_read: true }).eq('id', notificationId).eq('user_id', req.user.id);
        }
        res.json({ success: true });
    } catch (err) {
        console.error("Mark Read Error:", err);
        res.status(500).json({ message: "Failed to update notification" });
    }
};
