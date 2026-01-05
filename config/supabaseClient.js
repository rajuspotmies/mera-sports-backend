import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import jwt from "jsonwebtoken"; // Import to inspect key role

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
    console.error("❌ CRITICAL: Missing Supabase Env Variables.");
    console.error("URL:", supabaseUrl ? "Set" : "Missing");
    console.error("Service Role Key:", serviceRoleKey ? "Set" : "Missing");
} else {
    console.log("✅ Supabase Configuration Loaded");
    console.log("URL:", supabaseUrl);

    // DEBUG: Check Role
    try {
        const decoded = jwt.decode(serviceRoleKey);
        if (decoded && decoded.role) {
            console.log(`🔑 Key Role: [${decoded.role.toUpperCase()}]`);
            if (decoded.role !== 'service_role') {
                console.error("❌ CRITICAL: You are using the ANON KEY as Service Role Key!");
                console.error("❌ RLS Bypassing will NOT work. Update SUPABASE_SERVICE_ROLE_KEY in .env");
            } else {
                console.log("✅ Service Role Key identified.");
            }
        }
    } catch (e) {
        console.warn("⚠️ Could not decode Service Key JWT");
    }
}

/**
 * 🔐 ADMIN CLIENT
 * - Used ONLY on backend
 * - Can create users, bypass RLS
 */
export const supabaseAdmin = createClient(
    supabaseUrl,
    serviceRoleKey,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
        global: {
            headers: {
                Authorization: `Bearer ${serviceRoleKey}`,
            },
        },
    }
);
