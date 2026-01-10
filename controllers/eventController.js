import QRCode from 'qrcode';
import { supabaseAdmin } from "../config/supabaseClient.js";
import { uploadBase64 } from "../utils/uploadHelper.js";

// GET /api/events/list
export const listEvents = async (req, res) => {
    try {
        const { created_by, admin_id } = req.query;
        let query = supabaseAdmin.from('events').select('*, event_registrations(count)').order('start_date', { ascending: true });

        if (created_by) query = query.eq('created_by', created_by);
        if (admin_id) query = query.or(`created_by.eq.${admin_id},assigned_to.eq.${admin_id}`);

        const { data, error } = await query;
        if (error) throw error;
        res.json({ success: true, events: data });
    } catch (err) {
        console.error("Fetch Events Error:", err);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

// GET /api/events/:id
export const getEventDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const { data: eventData, error: eventError } = await supabaseAdmin.from('events').select('*').eq('id', id).single();
        if (eventError || !eventData) return res.status(404).json({ success: false, message: "Event not found" });

        if (eventData.assigned_to) {
            const { data: assignedUser } = await supabaseAdmin.from('users').select('id, name, email').eq('id', eventData.assigned_to).single();
            if (assignedUser) eventData.assigned_user = assignedUser;
        }

        const { data: newsData } = await supabaseAdmin.from('event_news').select('*').eq('event_id', id).order('created_at', { ascending: false });
        eventData.news = newsData || [];

        // Stats
        const { data: regStats } = await supabaseAdmin.from("event_registrations").select("categories, status").eq("event_id", id).in("status", ["verified", "paid", "confirmed", "approved", "registered", "pending", "Pending", "pending_verification", "Submitted"]);

        const registrationCounts = {};
        if (regStats) {
            regStats.forEach(reg => {
                const addCount = (key) => registrationCounts[key] = (registrationCounts[key] || 0) + 1;
                if (Array.isArray(reg.categories)) {
                    reg.categories.forEach(cat => addCount(typeof cat === 'object' ? (cat.id || cat.name || cat.category) : cat));
                } else if (reg.categories) {
                    addCount(typeof reg.categories === 'object' ? (reg.categories.id || reg.categories.name || reg.categories.category) : reg.categories);
                }
            });
        }
        eventData.registration_counts = registrationCounts;
        eventData.total_registrations_count = regStats ? regStats.length : 0;

        res.json({ success: true, event: eventData });
    } catch (err) {
        console.error("Fetch Event Error:", err);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

// POST /api/events/create
export const createEvent = async (req, res) => {
    try {
        const { name, sport, start_date, banner_image, document_url, sponsors, ...rest } = req.body;
        if (!name || !sport || !start_date) return res.status(400).json({ message: "Missing required fields" });

        const created_by = req.user.id;

        const banner_url = await uploadBase64(banner_image, 'event-assets', 'banners');
        const uploadedDocUrl = await uploadBase64(document_url, 'event-documents', 'docs');
        const payment_qr_image = await uploadBase64(req.body.payment_qr_image, 'event-assets', 'payment-qrs');

        let processedSponsors = [];
        if (sponsors && Array.isArray(sponsors)) {
            processedSponsors = await Promise.all(sponsors.map(async (sp) => {
                const logoUrl = await uploadBase64(sp.logo, 'event-assets', 'sponsors');
                let mediaItems = [];
                if (sp.mediaItems) {
                    mediaItems = await Promise.all(sp.mediaItems.map(async (media) => ({ ...media, url: await uploadBase64(media.url, 'event-assets', 'sponsor-media') })));
                }
                return { ...sp, logo: logoUrl, mediaItems };
            }));
        }

        const { data, error } = await supabaseAdmin.from('events').insert({
            name, sport, start_date, created_by,
            banner_url, document_url: uploadedDocUrl, payment_qr_image,
            sponsors: processedSponsors,
            status: 'upcoming',
            ...rest
        }).select().single();

        if (error) throw error;

        // QR Code
        try {
            const link = `${process.env.FRONTEND_URL || 'http://localhost:8081'}/events/${data.id}`;
            const qrDataUrl = await QRCode.toDataURL(link);
            const qrPublicUrl = await uploadBase64(qrDataUrl, 'event-assets', 'qrcodes');
            await supabaseAdmin.from('events').update({ qr_code: qrPublicUrl }).eq('id', data.id);
            data.qr_code = qrPublicUrl;
        } catch (e) { console.error("QR Gen Failed:", e); }

        res.json({ success: true, event: data });
    } catch (err) {
        console.error("Create Event Logic Error:", err);
        res.status(500).json({ message: err.message });
    }
};

// PUT /api/events/:id
export const updateEvent = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        if (updates.banner_image) {
            updates.banner_url = await uploadBase64(updates.banner_image, 'event-assets', 'banners');
            delete updates.banner_image;
        }
        if (updates.payment_qr_image?.startsWith('data:')) {
            updates.payment_qr_image = await uploadBase64(updates.payment_qr_image, 'event-assets', 'payment-qrs');
        }
        if (updates.document_file) {
            updates.document_url = await uploadBase64(updates.document_file, 'event-documents', 'docs');
            delete updates.document_file;
        }

        if (updates.sponsors && Array.isArray(updates.sponsors)) {
            updates.sponsors = await Promise.all(updates.sponsors.map(async (sp) => {
                const logo = await uploadBase64(sp.logo, 'event-assets', 'sponsors');
                const mediaItems = sp.mediaItems ? await Promise.all(sp.mediaItems.map(async m => ({ ...m, url: await uploadBase64(m.url, 'event-assets', 'sponsor-media') }))) : [];
                return { ...sp, logo, mediaItems };
            }));
        }

        ['start_date', 'end_date', 'registration_deadline'].forEach(f => { if (updates[f] === "") updates[f] = null; });
        delete updates.id; delete updates.created_at; delete updates.created_by;

        // Always remove 'document_file' from updates as it is not a DB column
        delete updates.document_file;
        delete updates.data; // Also remove potential junk

        const { data, error } = await supabaseAdmin.from('events').update(updates).eq('id', id).select().single();
        if (error) throw error;
        res.json({ success: true, event: data });
    } catch (err) {
        console.error("Update Event Error:", err);
        res.status(500).json({ message: err.message });
    }
};

// DELETE /api/events/:id
export const deleteEvent = async (req, res) => {
    try {
        const { id } = req.params;
        await supabaseAdmin.from('event_registrations').delete().eq('event_id', id);
        await supabaseAdmin.from('event_news').delete().eq('event_id', id);
        await supabaseAdmin.from('event_brackets').delete().eq('event_id', id);
        const { error } = await supabaseAdmin.from('events').delete().eq('id', id);
        if (error) throw error;
        res.json({ success: true, message: "Event deleted" });
    } catch (err) {
        console.error("Delete Event Error:", err);
        res.status(500).json({ message: err.message });
    }
};

// GET /api/events/:id/brackets
export const getEventBrackets = async (req, res) => {
    try {
        const eventId = req.params.id;
        console.log("Fetching brackets for event_id:", eventId, "Type:", typeof eventId);
        
        // Convert event_id to number if possible (events table uses bigint)
        const eventIdNum = parseInt(eventId, 10);
        const eventIdQuery = !isNaN(eventIdNum) ? eventIdNum : eventId;
        
        const { data, error } = await supabaseAdmin
            .from('event_brackets')
            .select('id, event_id, category, round_name, draw_type, draw_data, pdf_url, created_at')
            .eq('event_id', eventIdQuery)
            .order('category', { ascending: true })
            .order('round_name', { ascending: true })
            .order('created_at', { ascending: true });
        
        if (error) {
            console.error("Supabase error fetching brackets:", error);
            throw error;
        }
        
        console.log("Raw brackets from DB:", data?.length || 0, "brackets");
        if (data && data.length > 0) {
            console.log("Sample raw bracket:", JSON.stringify(data[0], null, 2));
        }
        
        // Format brackets - return all brackets (frontend will handle filtering for display)
        const formattedBrackets = (data || []).map(bracket => {
            const drawType = bracket.draw_type || 'image';
            const drawData = bracket.draw_data || {};
            
            return {
                id: bracket.id,
                event_id: bracket.event_id,
                category: bracket.category || 'Unknown',
                round_name: bracket.round_name || 'Round 1',
                draw_type: drawType,
                draw_data: drawData,
                pdf_url: bracket.pdf_url || null,
                created_at: bracket.created_at
            };
        });
        
        console.log("Formatted brackets count:", formattedBrackets.length);
        
        res.json({ success: true, brackets: formattedBrackets });
    } catch (err) {
        console.error("GET EVENT BRACKETS ERROR:", err);
        res.status(500).json({ success: false, message: err.message, brackets: [] });
    }
};

// GET /api/events/:id/sponsors
export const getEventSponsors = async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin.from('events').select('sponsors').eq('id', req.params.id).single();
        if (error) throw error;
        res.json({ success: true, sponsors: data?.sponsors || [] });
    } catch (err) { res.status(500).json({ message: err.message }); }
};
