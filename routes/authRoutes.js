import crypto from "crypto"; // Added for UUID generation
import express from "express";
import jwt from "jsonwebtoken";
// import bcrypt from "bcrypt"; // REMOVED per user request
import { supabaseAdmin } from "../config/supabaseClient.js";

const router = express.Router();

/* ================= HELPER: UPLOAD BASE64 TO SUPABASE ================= */
async function uploadImageToSupabase(base64Data) {
    try {
        if (!base64Data || typeof base64Data !== 'string') {
            console.log("❌ UploadImage: No base64 data provided or not a string.");
            return null;
        }

        console.log("UploadImage: Received string length:", base64Data.length, "Preview:", base64Data.substring(0, 50));

        const matches = base64Data.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) {
            console.log("❌ UploadImage: Regex match failed.");
            return null;
        }

        const extension = matches[1] === 'jpeg' ? 'jpg' : matches[1];
        const rawBase64 = matches[2];
        const buffer = Buffer.from(rawBase64, 'base64');
        const filename = `user_${Date.now()}_${Math.floor(Math.random() * 10000)}.${extension}`;

        const { data, error: uploadError } = await supabaseAdmin
            .storage
            .from('player-photos')
            .upload(filename, buffer, {
                contentType: `image/${extension}`,
                upsert: true
            });

        if (uploadError) {
            console.error("❌ UploadImage: Supabase Upload Error:", uploadError);
            throw uploadError;
        }

        const { data: urlData } = supabaseAdmin
            .storage
            .from('player-photos')
            .getPublicUrl(filename);

        console.log("✅ UploadImage: Success. URL:", urlData.publicUrl);
        return urlData.publicUrl;

    } catch (error) {
        console.error("❌ UPLOAD EXCEPTION:", error.message);
        return null;
    }
}

/* ================= REGISTER PLAYER ================= */
router.post("/register-player", async (req, res) => {
    try {
        const {
            firstName,
            lastName,
            mobile,
            dob,
            apartment,
            street,
            city,
            state,
            pincode,
            country,
            aadhaar,
            schoolDetails,
            photos
        } = req.body;

        if (!firstName || !lastName || !mobile || !dob) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        // 1. Calculate Age
        const calculateAge = (dob) => {
            const birth = new Date(dob);
            const today = new Date();
            let age = today.getFullYear() - birth.getFullYear();
            const m = today.getMonth() - birth.getMonth();
            if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
                age--;
            }
            return age;
        };
        const age = calculateAge(dob);

        // 2. Generate Password (DDMMYYYY) - PLAINTEXT
        const [year, month, day] = dob.split("-");
        const password = `${day}${month}${year}`;
        // const hashedPassword = await bcrypt.hash(plainPassword, 10); // REMOVED

        // 3. Duplicate Check (Mobile OR Aadhaar)
        const { data: existing } = await supabaseAdmin
            .from("users")
            .select("id")
            .or(`mobile.eq.${mobile},aadhaar.eq.${aadhaar}`)
            .maybeSingle();

        if (existing) {
            return res.status(400).json({ message: "User with this Mobile or Aadhaar already exists." });
        }

        // 4. Upload Image
        let photoUrl = await uploadImageToSupabase(photos);

        // 5. Generate Player ID (Explicitly from Backend)
        // We call the database function we just created to get the next ID safely.
        console.log("Generating Player ID...");
        const { data: newPlayerId, error: idError } = await supabaseAdmin
            .rpc('get_next_player_id');

        if (idError || !newPlayerId) {
            console.error("RPC Error:", idError);
            throw new Error("Failed to generate Player ID. Ensure 'get_next_player_id' function exists in DB.");
        }
        console.log("Generated New Player ID:", newPlayerId);

        // 6. Insert into USERS table
        const newUserId = crypto.randomUUID();

        const { data: user, error } = await supabaseAdmin
            .from("users")
            .insert({
                id: newUserId, // Explicitly provide UUID
                player_id: newPlayerId, // P10000X (Explicitly set)
                first_name: firstName,
                last_name: lastName,
                name: `${firstName} ${lastName}`.trim(),
                email: `${mobile}@merasports.com`,
                mobile,
                dob,
                age,
                apartment,
                street,
                city,
                state,
                country,
                pincode,
                aadhaar,
                photos: photoUrl,
                password: password, // PLAINTEXT
                role: 'player',
                verification: 'pending' // Explicitly set status
            })
            .select()
            .single();

        if (error) throw error;

        console.log("✅ Registration Successful for:", user.email, "| Player ID:", user.player_id);

        // 7. Insert School Details (optional)
        if (schoolDetails) {
            console.log("Inserting School Details for:", user.id);
            const { error: schoolError } = await supabaseAdmin
                .from("player_school_details")
                .insert({
                    player_id: user.id,
                    school_name: schoolDetails.name,
                    school_address: schoolDetails.address,
                    school_city: schoolDetails.city,
                    school_pincode: schoolDetails.pincode,
                });

            if (schoolError) {
                console.error("SCHOOL DETAILS ERROR:", schoolError);
                // We don't throw here to avoid failing the whole registration if school details fail,
                // but you could change this depending on requirements.
            }
        }

        // 8. Generate Token
        const token = jwt.sign(
            { id: user.id, role: 'player' },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        res.json({
            success: true,
            token,
            playerId: user.player_id, // Return the Linear ID
            user: {
                id: user.id,
                firstName: user.first_name,
                lastName: user.last_name,
                role: 'player',
                photos: user.photos,
                age: user.age // Added Age
            },
        });
    } catch (err) {
        console.error("REGISTER ERROR:", err);
        res.status(400).json({ message: err.message });
    }
});

/* ================= LOGIN PLAYER ================= */
router.post("/login", async (req, res) => {
    try {
        const { playerIdOrAadhaar, password } = req.body;

        if (!playerIdOrAadhaar || !password) {
            return res.status(400).json({ message: "Missing credentials" });
        }

        // 1. Find User by Mobile OR Aadhaar OR Player ID
        let query = supabaseAdmin
            .from("users")
            .select("*")
            .or(`mobile.eq.${playerIdOrAadhaar},aadhaar.eq.${playerIdOrAadhaar}`);

        // If input looks like a number, it might be a Player ID
        // Also check if it starts with 'P' for new format
        const input = playerIdOrAadhaar.toString().trim();
        if (input.toUpperCase().startsWith('P')) {
            query = supabaseAdmin
                .from("users")
                .select("*")
                .eq('player_id', input);
        } else if (!isNaN(input)) {
            query = supabaseAdmin
                .from("users")
                .select("*")
                .or(`mobile.eq.${input},aadhaar.eq.${input},player_id.eq.${input}`);
        }

        const { data: user, error } = await query.single();

        if (error || !user) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        // 2. Security Check: Strict Separation
        if (user.role !== 'player') {
            return res.status(403).json({
                message: "This account is an Administrator. Please use the Admin Dashboard."
            });
        }

        // 3. Compare Password - PLAINTEXT
        if (user.password !== password) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        // 4. Generate Token
        const token = jwt.sign(
            { id: user.id, role: 'player' },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                firstName: user.first_name,
                lastName: user.last_name,
                role: 'player',
                photos: user.photos,
                age: user.age // Added Age
            },
        });
    } catch (err) {
        console.error("LOGIN ERROR:", err);
        res.status(500).json({ message: err.message });
    }
});

export default router;