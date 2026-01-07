import dotenv from "dotenv";
import jwt from "jsonwebtoken";

dotenv.config({ quiet: true });

export const authenticateUser = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({ error: "Missing token" });
        }

        const token = authHeader.split(" ")[1];

        // ✅ CORRECT: Verify using the SAME secret used in your Login route
        // Do NOT use supabaseAdmin.auth.getUser(token) here
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        req.user = decoded;
        next();
    } catch (err) {
        console.error("AUTH ERROR:", err.message);
        return res.status(403).json({ error: "Invalid token" });
    }
};