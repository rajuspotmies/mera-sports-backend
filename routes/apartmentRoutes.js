import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.join(__dirname, "../data/apartments.json");

// Helper to read data
const readApartments = () => {
    if (!fs.existsSync(DATA_FILE)) {
        return [];
    }
    const data = fs.readFileSync(DATA_FILE, "utf-8");
    return JSON.parse(data);
};

// GET all apartments
router.get("/", (req, res) => {
    try {
        const apartments = readApartments();
        res.json({ success: true, apartments });
    } catch (error) {
        console.error("READ APARTMENTS ERROR:", error);
        res.status(500).json({ success: false, message: "Failed to fetch apartments" });
    }
});

// POST add new apartment
router.post("/", (req, res) => {
    try {
        const { name } = req.body;
        if (!name || typeof name !== "string") {
            return res.status(400).json({ success: false, message: "Invalid name" });
        }

        const apartments = readApartments();
        const trimmedName = name.trim();

        // Check for duplicates (case-insensitive)
        if (apartments.some(apt => apt.toLowerCase() === trimmedName.toLowerCase())) {
            return res.json({ success: true, message: "Apartment already exists", apartments });
        }

        apartments.push(trimmedName);

        // Sort alphabetically
        apartments.sort();

        fs.writeFileSync(DATA_FILE, JSON.stringify(apartments, null, 2));

        res.json({ success: true, message: "Apartment added", apartments });
    } catch (error) {
        console.error("WRITE APARTMENTS ERROR:", error);
        res.status(500).json({ success: false, message: "Failed to save apartment" });
    }
});

export default router;
