const { getModel } = require("./gemini");

async function extractEntities(rawText) {
  // Use env-configured model or default inside getModel (pins to -001)
  const model = getModel();
  const prompt = `Extract entities from the following appointment request text. Return JSON only with keys: 
entities: { date_phrase: string|null, time_phrase: string|null, department: string|null }, 
entities_confidence: number 0-1. 

Entity Extraction Guidelines:
- date_phrase: Extract any date references (e.g., "next Friday", "tomorrow", "Monday", "6 november", "15 december", "2024-12-25")
- time_phrase: Extract specific time mentions (e.g., "3pm", "2:30 PM", "morning", "afternoon")
 - department: Extract medical/dental departments (e.g., "dentist", "dental", "cardiology", "dermatology", "skin doctor", "eye doctor", "bone doctor", "family doctor", "primary care", "internal medicine")

Confidence Guidelines:
- 0.9-1.0: All entities clearly identified and unambiguous
- 0.7-0.9: Most entities clear, minor ambiguity
- 0.5-0.7: Some entities unclear or missing
- 0.3-0.5: Significant ambiguity or missing key entities
- 0.0-0.3: Very unclear or missing most entities

Text: "${rawText}"`;
  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    try {
      const parsed = JSON.parse(text);
      // Merge heuristic for any missing fields to improve robustness
      const entities = parsed.entities || {};
      const entities_confidence =
        typeof parsed.entities_confidence === "number"
          ? parsed.entities_confidence
          : 0.6;

      const lower = (typeof rawText === "string" ? rawText : "").toLowerCase();
      const deptHeur = lower.match(
        /(skin\s+doctor|dermatology|cardiology|heart\s+doctor|ophthalmology|eye\s+doctor|vision|eye|orthopedics?|bone\s+doctor|orthopedic|general|family\s+doctor|primary\s+care|internal\s+medicine|pediatrics?|child\s+doctor|gynecology|women'?s?\s+health|neurology|brain\s+doctor|psychiatry|mental\s+health|psychology|therapy|dentist|dental|dentistry|oral\s+surgery|root\s+canal|tooth)/
      );
      const timeHeur = lower.match(/\b(\d{1,2})(?:[:\.](\d{2}))?\s*(am|pm)\b/i);
      const dateHeur = lower.match(
        /today|tomorrow|next\s+\w+day|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b|\b\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/
      );

      const merged = {
        date_phrase:
          entities.date_phrase != null ? entities.date_phrase : dateHeur ? dateHeur[0] : null,
        time_phrase:
          entities.time_phrase != null ? entities.time_phrase : timeHeur ? timeHeur[0] : null,
        department:
          entities.department != null ? entities.department : deptHeur ? deptHeur[0] : null,
      };

      return {
        entities: merged,
        entities_confidence: entities_confidence,
      };
    } catch (_) {
      // fall through to heuristic
    }
  } catch (err) {
    // swallow model errors and use heuristic fallback
  }

  // Heuristic fallback if model fails or returns non-JSON
  const lower = rawText.toLowerCase();
  const deptMatch = lower.match(
    /(skin\s+doctor|dermatology|cardiology|heart\s+doctor|ophthalmology|eye\s+doctor|vision|eye|orthopedics?|bone\s+doctor|orthopedic|general|family\s+doctor|primary\s+care|internal\s+medicine|pediatrics?|child\s+doctor|gynecology|women'?s?\s+health|neurology|brain\s+doctor|psychiatry|mental\s+health|psychology|therapy|dentist|dental|dentistry|oral\s+surgery|root\s+canal|tooth)/
  );
  const timeMatch = lower.match(/\b(\d{1,2})(?:[:\.](\d{2}))?\s*(am|pm)\b/i);
  const dateMatch = lower.match(
    /today|tomorrow|next\s+\w+day|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b|\b\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/
  );
  return {
    entities: {
      date_phrase: dateMatch ? dateMatch[0] : null,
      time_phrase: timeMatch ? timeMatch[0] : null,
      department: deptMatch ? deptMatch[0] : null,
    },
    entities_confidence: 0.5,
  };
}

module.exports = { extractEntities };
