import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import adminRoutes from "./routes/adminRoutes.js"; // Added Admin Routes
import apartmentRoutes from "./routes/apartmentRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import contactRoutes from "./routes/contactRoutes.js";
import eventRoutes from "./routes/eventRoutes.js";
import googleSyncRoutes from "./routes/googleSyncRoutes.js";
import playerDashboardRoutes from "./routes/playerDashboardroutes.js";
import publicRoutes from "./routes/publicRoutes.js";
import teamRoutes from "./routes/teamRoutes.js";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ limit: "15mb", extended: true }));
app.use("/api/player", playerDashboardRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/auth", googleSyncRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/admin", adminRoutes); // Mounted Admin Routes
app.use("/api/apartments", apartmentRoutes);
app.use("/api/teams", teamRoutes);
app.use("/api/public", publicRoutes);


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
