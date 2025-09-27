const { geminiOcr } = require("../services/ocr");
const { extractEntities } = require("../services/entities");
const { normalizeAppointment } = require("../services/normalize");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

// Helper function to save image
function saveImage(imageBuffer, mimeType) {
  const uploadsDir = path.join(__dirname, "../../uploads");
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const fileExtension = mimeType.split("/")[1] || "jpg";
  const filename = `${uuidv4()}.${fileExtension}`;
  const filepath = path.join(uploadsDir, filename);

  fs.writeFileSync(filepath, imageBuffer);
  return { filename, filepath };
}

// Helper function to save appointment
function saveAppointment(appointmentData) {
  const appointmentsFile = path.join(__dirname, "../../appointments.json");
  let appointments = [];

  // Load existing appointments
  if (fs.existsSync(appointmentsFile)) {
    try {
      const data = fs.readFileSync(appointmentsFile, "utf8");
      appointments = JSON.parse(data);
    } catch (err) {
      console.error("Error reading appointments file:", err);
      appointments = [];
    }
  }

  // Add new appointment
  const appointment = {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    ...appointmentData,
  };

  appointments.push(appointment);

  // Save back to file
  try {
    fs.writeFileSync(appointmentsFile, JSON.stringify(appointments, null, 2));
    return appointment.id;
  } catch (err) {
    console.error("Error saving appointment:", err);
    return null;
  }
}

async function scheduleController(req, res) {
  try {
    console.log("[schedule] content-type:", req.headers["content-type"]);
    console.log("[schedule] has file:", !!(req.file && req.file.buffer));
    console.log("[schedule] body keys:", req.body ? Object.keys(req.body) : []);
    const inputText =
      req.body && (req.body.text || req.body.raw_text)
        ? String(req.body.text || req.body.raw_text)
        : "";
    const hasMulterImage = !!(req.file && req.file.buffer);
    const base64Field =
      req.body &&
      (req.body.image_base64 || req.body.imageBase64 || req.body.imageData);
    const hasBase64Image =
      typeof base64Field === "string" && base64Field.trim().length > 0;

    let ocrResult = null;
    let rawText = inputText.trim();
    let imageQualityWarning = null;
    let savedImageInfo = null;

    if (hasMulterImage || hasBase64Image) {
      let imgBuffer = null;
      let mimeType = null;
      if (hasMulterImage) {
        imgBuffer = req.file.buffer;
        mimeType = req.file.mimetype;
      } else if (hasBase64Image) {
        const b64 = String(base64Field)
          .replace(/^data:[^;]+;base64,/, "")
          .trim();
        try {
          imgBuffer = Buffer.from(b64, "base64");
          mimeType = "image/jpeg";
        } catch (_) {
          return res.status(400).json({
            status: "needs_clarification",
            message: "Invalid base64 image data",
          });
        }
      }

      // Save image to uploads folder
      savedImageInfo = saveImage(imgBuffer, mimeType);
      console.log(`[schedule] Image saved: ${savedImageInfo.filename}`);

      try {
        ocrResult = await geminiOcr(imgBuffer, mimeType);
      } catch (ocrErr) {
        console.error("[schedule] OCR failure:", ocrErr);
        return res.status(200).json({
          status: "needs_clarification",
          message:
            "OCR failed. Please upload a clearer image or provide the text.",
          debug: {
            reason: "ocr_error",
            errorStatus: ocrErr && ocrErr.status,
            errorStatusText: ocrErr && ocrErr.statusText,
          },
        });
      }
      // Continue processing even if blur detected, but note quality issue
      imageQualityWarning =
        ocrResult && ocrResult.blur_detected === true
          ? ocrResult.suggestion ||
            "Image quality could be improved for better accuracy."
          : null;
      rawText = ocrResult && ocrResult.raw_text ? ocrResult.raw_text : rawText;
    }

    if (!rawText) {
      return res.status(400).json({
        status: "needs_clarification",
        message:
          'No input text or image provided. For image, send multipart/form-data with field name "image" (type File), or JSON with "image_base64".',
        debug: {
          contentType: req.headers["content-type"] || null,
          hasFile: !!(req.file && req.file.buffer),
          bodyKeys: req.body ? Object.keys(req.body) : [],
        },
      });
    }

    // Step 1
    const step1 = {
      raw_text: rawText,
      confidence: ocrResult ? ocrResult.confidence : 1.0,
    };

    // Step 2
    const { entities, entities_confidence } = await extractEntities(rawText);
    if (
      !entities ||
      !entities.date_phrase ||
      !entities.time_phrase ||
      !entities.department
    ) {
      let missingFields = [];
      if (!entities?.date_phrase) missingFields.push("date");
      if (!entities?.time_phrase) missingFields.push("time");
      if (!entities?.department) missingFields.push("department");

      return res.status(200).json({
        status: "needs_clarification",
        message: `Missing or unclear information: ${missingFields.join(
          ", "
        )}. Please provide clear date, time, and department information.`,
        step1,
        step2: { entities, entities_confidence },
        missing_fields: missingFields,
      });
    }

    // Step 3
    const normalization = await normalizeAppointment(entities, "Asia/Kolkata");
    if (normalization.status !== "ok") {
      return res.status(200).json({
        status: "needs_clarification",
        message:
          "Unable to parse date/time. Please provide a clear date and time (e.g., 'Next Friday at 3pm' or 'Monday, 2:30 PM').",
        step1,
        step2: { entities, entities_confidence },
        step3: { normalized: null, normalization_confidence: 0.0 },
        clarification_needed: "date_time_parsing",
      });
    }

    // Step 4 - Prepare appointment data
    const appointmentData = {
      department: normalization.normalized.department_formal || "Dentistry",
      date: normalization.normalized.date,
      time: normalization.normalized.time,
      tz: normalization.normalized.tz,
      raw_text: rawText,
      entities: entities,
      entities_confidence: entities_confidence,
      normalization_confidence: normalization.normalization_confidence,
      image_filename: savedImageInfo?.filename || null,
      image_quality_warning: imageQualityWarning || null,
      ocr_confidence: ocrResult?.confidence || null,
    };

    // Save appointment to JSON file
    const appointmentId = saveAppointment(appointmentData);
    console.log(`[schedule] Appointment saved with ID: ${appointmentId}`);

    const response = {
      step1,
      step2: { entities, entities_confidence },
      step3: {
        normalized: normalization.normalized,
        normalization_confidence: normalization.normalization_confidence,
      },
      appointment: {
        id: appointmentId,
        department: appointmentData.department,
        date: appointmentData.date,
        time: appointmentData.time,
        tz: appointmentData.tz,
      },
      status: "ok",
    };

    // Add image quality warning if present
    if (imageQualityWarning) {
      response.image_quality_warning = imageQualityWarning;
      response.ocr_confidence = ocrResult?.confidence;
    }

    // Add image info if present
    if (savedImageInfo) {
      response.image_saved = savedImageInfo.filename;
    }

    return res.status(200).json(response);
  } catch (err) {
    console.error("Schedule error:", err);
    return res
      .status(500)
      .json({ status: "error", message: "Internal server error" });
  }
}

module.exports = { scheduleController };
