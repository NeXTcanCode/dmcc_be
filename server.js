import "dotenv/config";
import express from "express";
import cors from "cors";
import { connectDB } from "./config/db.js";
import authRoutes from "./routes/auth.js";
import walletRoutes from "./routes/wallet.js";
import tripRoutes from "./routes/trips.js";
import metroRoutes from "./routes/metro.js";

const app = express();
const port = process.env.PORT || 3000;

const NETLIFY = "https://next-calculates-dmrc-fare.netlify.app";
const allowedOrigins = [NETLIFY, ...(process.env.CLIENT_ORIGIN || "http://localhost:5173").split(",")];

app.use(
  cors({
    origin: (origin, cb) => {
      // allow same-origin (curl, health checks) and any allowlisted origin
      cb(null, !origin || allowedOrigins.includes(origin));
    },
  })
);
app.use(express.json());

app.get("/health", (_, res) => res.json({ ok: true }));
app.use("/auth", authRoutes);
app.use("/wallet", walletRoutes);
app.use("/trips", tripRoutes);
app.use("/metro", metroRoutes);

connectDB()
  .then(() => {
    app.listen(port, () => {
      console.log(`Backend started on http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error("Mongo connection error:", error.message);
    process.exit(1);
  });
