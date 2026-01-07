import axios from "axios";
import crypto from "crypto";
import { supabaseAdmin } from "../config/supabaseClient.js";

const TWO_FACTOR_API_KEY = process.env.TWO_FACTOR_API_KEY || "e6b3f27c-da5e-11f0-a6b2-0200cd936042";

/**
 * Sends a Mobile OTP using 2Factor.in
 * @param {string} mobile - Mobile number
 * @returns {Promise<{success: boolean, sessionId?: string, message?: string}>}
 */
export async function sendMobileOtp(mobile) {
    if (!mobile) throw new Error("Mobile number is required");

    try {
        const otp = Math.floor(100000 + Math.random() * 900000);
        const url = `https://2factor.in/API/V1/${TWO_FACTOR_API_KEY}/SMS/${mobile}/${otp}`;

        console.log(`Sending Mobile OTP to ${mobile}`);
        const response = await axios.get(url);

        if (response.data && response.data.Status === "Success") {
            return { success: true, sessionId: response.data.Details };
        } else {
            console.error("2Factor Error:", response.data);
            throw new Error("Failed to send SMS OTP via Provider");
        }
    } catch (err) {
        console.error("Service: sendMobileOtp Error:", err.message);
        throw err;
    }
}

/**
 * Verifies a Mobile OTP using 2Factor.in
 * @param {string} sessionId - Session ID from send step
 * @param {string} otp - OTP entered by user
 * @returns {Promise<boolean>}
 */
export async function verifyMobileOtp(sessionId, otp) {
    if (!sessionId || !otp) throw new Error("Session ID and OTP are required");

    try {
        const url = `https://2factor.in/API/V1/${TWO_FACTOR_API_KEY}/SMS/VERIFY/${sessionId}/${otp}`;
        const response = await axios.get(url);

        if (response.data && response.data.Status === "Success") {
            return true;
        }
        return false;
    } catch (err) {
        console.error("Service: verifyMobileOtp Error:", err.message);
        return false;
    }
}

/**
 * Sends an Email OTP using Supabase Auth (Magic Link logic but used as OTP)
 * @param {string} email 
 */
export async function sendEmailOtp(email) {
    if (!email) throw new Error("Email is required");

    try {
        console.log(`Sending Email OTP to ${email}`);

        // Ensure user exists as "confirmed" so we get the correct OTP template if possible, 
        // or effectively "sign them in" to generate a token.
        // NOTE: If user doesn't exist in Supabase Auth, we create them.

        // 1. Try to create (idempotent-ish if we handle error)
        // We use admin.createUser to auto-confirm so they don't get "Confirm Email" link but "Magic Link" code?
        // Actually, signInWithOtp handles creation if option is set.

        // Refined Logic from authRoutes:
        const { error: createError } = await supabaseAdmin.auth.admin.createUser({
            email: email,
            email_confirm: true,
            password: crypto.randomUUID()
        });

        // Ignore "already registered"

        const { error } = await supabaseAdmin.auth.signInWithOtp({
            email: email,
            options: { shouldCreateUser: false }
        });

        if (error) throw error;
        return { success: true };

    } catch (err) {
        // If create failed because they exist, we just proceed. 
        // If signInWithOtp failed, we throw.
        console.error("Service: sendEmailOtp Error:", err.message);
        // Retry signInWithOtp even if createUser failed (user might exist)
        const { error: retryError } = await supabaseAdmin.auth.signInWithOtp({
            email: email,
            options: { shouldCreateUser: false }
        });

        if (retryError) throw retryError;
        return { success: true };
    }
}

/**
 * Verifies Email OTP using Supabase
 * @param {string} email 
 * @param {string} otp 
 */
export async function verifyEmailOtp(email, otp) {
    if (!email || !otp) throw new Error("Email and OTP required");

    try {
        const { data, error } = await supabaseAdmin.auth.verifyOtp({
            email,
            token: otp,
            type: 'magiclink'
        });

        if (error) throw error;
        if (data.session) return true;
        return false;

    } catch (err) {
        console.error("Service: verifyEmailOtp Error:", err.message);
        return false;
    }
}
