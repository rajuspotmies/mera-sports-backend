// routes/googleSyncRoutes.js
import express from "express";
import { supabaseAdmin } from "../config/supabaseClient.js";

const router = express.Router();

router.post('/sync', async (req, res) => {
    try {
        // 1. Verify the token sent from Frontend
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ error: 'No token provided' });

        const token = authHeader.split(' ')[1];

        // Get the user details from Supabase Auth (using the token)
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

        if (authError || !user) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        // 2. CHECK IF USER ALREADY EXISTS
        const { data: existingUser } = await supabaseAdmin
            .from('users')
            .select('*')
            .eq('id', user.id)
            .single();

        // Robust Name Parsing
        const meta = user.user_metadata || {};
        const fullName = meta.full_name || meta.name || 'Admin User';

        let firstName = meta.given_name || meta.first_name || meta.name;
        let lastName = meta.family_name || meta.last_name || '';

        if (!lastName && fullName.includes(' ')) {
            const parts = fullName.trim().split(' ');
            firstName = parts[0];
            lastName = parts.slice(1).join(' ');
        }

        const googleId = user.identities?.find(id => id.provider === 'google')?.id || null;
        const photoUrl = meta.avatar_url || meta.picture || '';

        if (existingUser) {


            // UPDATE ONLY GOOGLE FIELDS (Preserve Mobile/DOB)
            const { data: updatedUser, error: updateError } = await supabaseAdmin
                .from('users')
                .update({
                    first_name: firstName,
                    last_name: lastName,
                    name: fullName,
                    photos: photoUrl,
                    avatar: photoUrl,
                    google_id: googleId
                })
                .eq('id', user.id)
                .select()
                .single();

            if (updateError) {
                console.error("Error updating existing admin:", updateError);
                return res.json({ user: existingUser }); // Fallback to old data
            }

            return res.json({ user: updatedUser });
        }

        // 3. IF NEW USER, CREATE WITH DUMMY DATA
        const userData = {
            id: user.id,
            email: user.email,
            first_name: firstName,
            last_name: lastName,
            name: fullName,
            photos: photoUrl,
            avatar: photoUrl,
            google_id: googleId,
            role: 'admin',
            verification: 'verified', // Admins are auto-verified via Google

            // ROBUST DUMMY DATA STRATEGY
            mobile: `9${Date.now().toString().slice(-9)}`,
            dob: '2000-01-01',
            age: 25,
            aadhaar: `ADM-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`,
            apartment: 'Admin HQ',
            street: 'Admin St',
            city: 'Cloud City',
            state: 'Web',
            pincode: '000000',
            country: 'India',
            password: 'GOOGLE_AUTH_ADMIN',
            player_id: `ADM-${Date.now().toString().slice(-6)}`
        };



        // 3. Upsert into public.users
        // Use UPSERT to handle potential Race Conditions (e.g. if a DB Trigger already created the row)
        const { data: savedUser, error: dbError } = await supabaseAdmin
            .from('users')
            .upsert(userData, { onConflict: 'id' })
            .select() // Important to return the row
            .single();

        if (dbError) {
            console.error('CRITICAL DATABASE ERROR:', dbError);
            return res.status(500).json({ error: 'Failed to save user', details: dbError });
        }

        console.log("✅ Admin Sync Saved Successfully:", savedUser.id);

        // 4. Return the user data to frontend
        res.json({ user: savedUser });

    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

export default router;