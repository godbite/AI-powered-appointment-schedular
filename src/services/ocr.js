const { generateWithFallback } = require("./gemini");

function bufferToBase64WebSafe(buffer) {
  return Buffer.from(buffer).toString("base64");
}

async function geminiOcr(imageBuffer, mimeType) {
  // Try multiple models to avoid version availability issues
  const candidates = [
    process.env.GEMINI_MODEL, // prefer env if valid
  ];

  const prompt = `You are an OCR and image quality assistant for appointment requests. 
Return strict JSON only with keys: raw_text (string), confidence (0-1 float), blur_detected (boolean), suggestion (string, optional). 

Image Quality Assessment:
- If the image is blurry, low-resolution, too dark, too bright, or has poor contrast, set blur_detected=true
- If text is unclear, distorted, or partially obscured, set blur_detected=true
- If the image is clear and readable, set blur_detected=false

Confidence Guidelines:
- 0.9-1.0: Very clear, high-quality image with excellent text legibility
- 0.7-0.9: Good quality, minor issues but text is readable
- 0.5-0.7: Fair quality, some text may be unclear
- 0.3-0.5: Poor quality, significant readability issues
- 0.0-0.3: Very poor quality, mostly unreadable

Suggestions for blur_detected=true:
- "Image appears blurry. Please retake the photo with better lighting and hold the camera steady."
- "Text is unclear. Please ensure good lighting and avoid shadows or glare."
- "Image quality is poor. Please upload a clearer, higher resolution image."
- "Text is partially obscured. Please retake the photo ensuring all text is visible."

Extract all visible text accurately, even if blur_detected=true.`;

  const parts = [
    { text: prompt },
    {
      inlineData: {
        mimeType: mimeType || "image/png",
        data: bufferToBase64WebSafe(imageBuffer),
      },
    },
  ];

  const { response } = await generateWithFallback(candidates, {
    contents: [{ role: "user", parts }],
  });
  const text = response.text();
  try {
    // Extract JSON from markdown code blocks if present
    let jsonText = text;
    const codeBlockMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (codeBlockMatch) {
      jsonText = codeBlockMatch[1];
    }

    const parsed = JSON.parse(jsonText);
    return {
      raw_text: parsed.raw_text || "",
      confidence:
        typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
      blur_detected: !!parsed.blur_detected,
      suggestion: parsed.suggestion || null,
    };
  } catch (_) {
    return { raw_text: text, confidence: 0.5, blur_detected: false };
  }
}

module.exports = { geminiOcr };
