import { supabaseAdmin } from "../config/supabaseClient.js";
import { createNotification } from "../services/notificationService.js";
import { uploadBase64 } from "../utils/uploadHelper.js";

/* ================= CATEGORIES ================= */
export const getAllCategories = async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin.from("events").select("categories");
        if (error) throw error;

        const uniqueCategories = new Set(["All Categories"]);
        data.forEach(event => {
            let cats = event.categories;
            if (typeof cats === 'string') try { if (cats.startsWith('[')) cats = JSON.parse(cats); } catch (e) { }

            const addCat = (cat) => {
                const name = cat.name || cat.category || cat.Category || cat.id;
                if (name) uniqueCategories.add(name);
                else if (typeof cat === 'string') uniqueCategories.add(cat);
            };

            if (Array.isArray(cats)) cats.forEach(addCat);
            else if (typeof cats === 'object' && cats !== null) addCat(cats);
            else if (cats) uniqueCategories.add(String(cats));
        });

        res.json({ success: true, categories: Array.from(uniqueCategories).sort() });
    } catch (err) {
        console.error("Error fetching categories:", err);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

/* ================= REGISTRATIONS & TRANSACTIONS ================= */
export const getRegistrations = async (req, res) => {
    try {
        const { eventId } = req.query;
        let query = supabaseAdmin.from("event_registrations")
            .select(`
                id, event_id, player_id, team_id, registration_no, status, amount_paid, payment_proof:screenshot_url, manual_transaction_id, transaction_id, created_at, categories, document_url,
                events ( id, name, sport, start_date, end_date, start_time, location, venue, categories, status ),
                users:player_id ( id, first_name, last_name, player_id, mobile, gender, apartment ),
                player_teams ( id, team_name, captain_name, captain_mobile, members )
            `)
            .order('created_at', { ascending: false });

        if (eventId) query = query.eq('event_id', eventId);

        const { data: registrations, error } = await query;
        if (error) throw error;
        res.json({ success: true, registrations });
    } catch (err) {
        console.error("ADMIN REGISTRATIONS ERROR:", err);
        res.status(500).json({ message: "Failed to fetch registrations" });
    }
};

export const getTransactions = async (req, res) => {
    try {
        const { eventId, admin_id } = req.query;
        let query = supabaseAdmin.from("event_registrations")
            .select(`
                id, event_id, player_id, registration_no, status, amount_paid, payment_proof:screenshot_url, manual_transaction_id, transaction_id, created_at, categories,
                events!inner ( id, name, created_by, assigned_to ),
                users:player_id ( id, first_name, last_name, player_id, mobile, email, apartment )
            `)
            .order('created_at', { ascending: false });

        if (eventId) query = query.eq('event_id', eventId);
        if (admin_id) query = query.or(`created_by.eq.${admin_id},assigned_to.eq.${admin_id}`, { foreignTable: 'events' });

        const { data: transactions, error } = await query;
        if (error) throw error;
        res.json({ success: true, transactions });
    } catch (err) {
        console.error("ADMIN TRANSACTIONS ERROR:", err);
        res.status(500).json({ message: "Failed to fetch transactions" });
    }
};

export const verifyTransaction = async (req, res) => {
    try {
        const { id } = req.params;
        const { data: updatedReg, error } = await supabaseAdmin
            .from("event_registrations")
            .update({ status: "verified" })
            .eq("id", id)
            .select("player_id, registration_no, events(name)")
            .single();

        if (error) throw error;
        if (updatedReg) {
            createNotification(
                updatedReg.player_id,
                "Registration Verified",
                `Your registration for ${updatedReg.events?.name} (Reg No: ${updatedReg.registration_no}) has been verified.`,
                "success"
            );
        }
        res.json({ success: true, message: "Transaction verified" });
    } catch (err) {
        console.error("VERIFY ERROR:", err);
        res.status(500).json({ message: "Verification failed" });
    }
};

export const rejectTransaction = async (req, res) => {
    try {
        const { id } = req.params;
        const { data: updatedReg, error } = await supabaseAdmin
            .from("event_registrations")
            .update({ status: "rejected" })
            .eq("id", id)
            .select("player_id, registration_no, events(name)")
            .single();

        if (error) throw error;
        if (updatedReg) {
            createNotification(
                updatedReg.player_id,
                "Registration Rejected",
                `Your registration for ${updatedReg.events?.name} (Reg No: ${updatedReg.registration_no}) was rejected.`,
                "error"
            );
        }
        res.json({ success: true, message: "Transaction rejected" });
    } catch (err) {
        console.error("REJECT ERROR:", err);
        res.status(500).json({ message: "Rejection failed" });
    }
};

export const bulkUpdateTransactions = async (req, res) => {
    try {
        const { ids, status } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: "Invalid IDs" });
        if (!['verified', 'rejected'].includes(status)) return res.status(400).json({ message: "Invalid status" });

        const { data: updatedRegs, error, count } = await supabaseAdmin
            .from("event_registrations")
            .update({ status })
            .in("id", ids)
            .select('id, player_id, registration_no, events(name)');

        if (error) throw error;

        if (updatedRegs) {
            updatedRegs.forEach(reg => {
                const title = status === 'verified' ? "Registration Verified" : "Registration Rejected";
                const type = status === 'verified' ? "success" : "error";
                const msg = `Your registration for ${reg.events?.name} (Reg No: ${reg.registration_no}) was ${status}.`;
                createNotification(reg.player_id, title, msg, type);
            });
        }
        res.json({ success: true, message: `Transactions ${status}`, count });
    } catch (err) {
        console.error("BULK UPDATE ERROR:", err);
        res.status(500).json({ message: "Batch update failed" });
    }
};

/* ================= NEWS ================= */
export const getEventNews = async (req, res) => {
    try {
        const { eventId } = req.query;
        if (!eventId) return res.status(400).json({ message: "Event ID required" });
        const { data: news, error } = await supabaseAdmin.from("event_news").select("*").eq("event_id", eventId).order("created_at", { ascending: false });
        if (error) throw error;
        res.json({ success: true, news });
    } catch (err) {
        res.status(500).json({ message: "Failed to fetch news" });
    }
};

export const createEventNews = async (req, res) => {
    try {
        const { eventId, title, content, imageUrl, isHighlight } = req.body;
        const { data, error } = await supabaseAdmin.from("event_news")
            .insert({ event_id: eventId, title, content, image_url: imageUrl, is_highlight: isHighlight })
            .select().single();
        if (error) throw error;
        res.json({ success: true, news: data });
    } catch (err) { res.status(500).json({ message: "Failed to create news" }); }
};

export const updateEventNews = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, content, imageUrl, isHighlight } = req.body;
        const { data, error } = await supabaseAdmin.from("event_news")
            .update({ title, content, image_url: imageUrl, is_highlight: isHighlight }).eq("id", id).select().single();
        if (error) throw error;
        res.json({ success: true, news: data });
    } catch (err) { res.status(500).json({ message: "Failed to update news" }); }
};

export const deleteEventNews = async (req, res) => {
    try {
        const { error } = await supabaseAdmin.from("event_news").delete().eq("id", req.params.id);
        if (error) throw error;
        res.json({ success: true, message: "News deleted" });
    } catch (err) { res.status(500).json({ message: "Failed to delete news" }); }
};

/* ================= BRACKETS ================= */
export const getBrackets = async (req, res) => {
    try {
        const { eventId } = req.query;
        if (!eventId) return res.status(400).json({ message: "Event ID required" });
        const { data, error } = await supabaseAdmin.from("event_brackets").select("*").eq("event_id", eventId).order("created_at", { ascending: true });
        if (error) throw error;
        res.json({ success: true, brackets: data });
    } catch (err) { res.status(500).json({ message: "Failed to fetch brackets" }); }
};

export const saveBracket = async (req, res) => {
    try {
        const { eventId, category, roundName, drawType, drawData } = req.body;
        let finalDrawData = drawData;
        if (drawType === 'image' && drawData?.url?.startsWith('data:')) {
            const url = await uploadBase64(drawData.url, 'event-assets', 'draws');
            if (url) finalDrawData = { ...drawData, url };
        }

        const { data: existing } = await supabaseAdmin.from("event_brackets").select("id").eq("event_id", eventId).eq("category", category).eq("round_name", roundName).maybeSingle();

        let result;
        if (existing) {
            const { data, error } = await supabaseAdmin.from("event_brackets").update({ draw_type: drawType, draw_data: finalDrawData }).eq("id", existing.id).select().single();
            if (error) throw error;
            result = data;
        } else {
            const { data, error } = await supabaseAdmin.from("event_brackets").insert({ event_id: eventId, category, round_name: roundName, draw_type: drawType, draw_data: finalDrawData }).select().single();
            if (error) throw error;
            result = data;
        }
        res.json({ success: true, bracket: result });
    } catch (err) {
        console.error("SAVE BRACKET ERROR:", err);
        res.status(500).json({ message: "Failed to save bracket" });
    }
};

export const deleteBracket = async (req, res) => {
    try {
        const { error } = await supabaseAdmin.from("event_brackets").delete().eq("id", req.params.id);
        if (error) throw error;
        res.json({ success: true, message: "Bracket deleted" });
    } catch (err) { res.status(500).json({ message: "Failed to delete bracket" }); }
};
