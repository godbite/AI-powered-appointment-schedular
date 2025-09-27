const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const { scheduleController } = require("./controllers/scheduleController");

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.get("/", (req, res) => {
  return res.json({
    status: "ok",
    service: "AI-Powered Appointment Scheduler Assistant",
  });
});

// Accepts text or image. For image, use multipart/form-data with field name "image".
app.post("/schedule", upload.single("image"), scheduleController);

// Get all appointments
app.get("/appointments", (req, res) => {
  try {
    const appointmentsFile = path.join(__dirname, "../appointments.json");
    if (!fs.existsSync(appointmentsFile)) {
      return res.json({ appointments: [] });
    }

    const data = fs.readFileSync(appointmentsFile, "utf8");
    const appointments = JSON.parse(data);
    res.json({ appointments });
  } catch (err) {
    console.error("Error reading appointments:", err);
    res.status(500).json({ error: "Failed to read appointments" });
  }
});

// Get specific appointment by ID
app.get("/appointments/:id", (req, res) => {
  try {
    const appointmentsFile = path.join(__dirname, "../appointments.json");
    if (!fs.existsSync(appointmentsFile)) {
      return res.status(404).json({ error: "Appointment not found" });
    }

    const data = fs.readFileSync(appointmentsFile, "utf8");
    const appointments = JSON.parse(data);
    const appointment = appointments.find((apt) => apt.id === req.params.id);

    if (!appointment) {
      return res.status(404).json({ error: "Appointment not found" });
    }

    res.json({ appointment });
  } catch (err) {
    console.error("Error reading appointment:", err);
    res.status(500).json({ error: "Failed to read appointment" });
  }
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

module.exports = app;
