export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_KEY) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is missing in Vercel environment variables' });
  }

  const { base64, override } = req.body || {};
  if (!base64) return res.status(400).json({ error: 'No image provided' });

  const prompt = override
    ? `The user says this comic is: "${override}".
Use that as the main clue, then identify the comic from the cover image.

Return ONLY valid JSON, no markdown:
{
  "title":"Unknown",
  "issue":"Unknown",
  "publisher":"Unknown",
  "year":"Unknown",
  "variant":"",
  "keyInfo":"Unknown",
  "importantCharacters":"Unknown",
  "confidence":"Low",
  "condition":"Unknown",
  "conditionReason":"Unknown",
  "searchQuery":"Unknown"
}`
    : `Analyze this comic book cover.

Return ONLY valid JSON, no markdown, no backticks, no explanation:
{
  "title":"Unknown",
  "issue":"Unknown",
  "publisher":"Unknown",
  "year":"Unknown",
  "variant":"",
  "keyInfo":"Unknown",
  "importantCharacters":"Unknown",
  "confidence":"Low",
  "condition":"Unknown",
  "conditionReason":"Unknown",
  "searchQuery":"Unknown"
}

Rules:
- Identify comic title and issue number from cover text and cover art.
- Identify publisher and year.
- Include key issue info, first appearances, famous artists, major characters, or major story notes.
- Estimate condition from visible front cover only.
- Condition must be one of: Near Mint, Very Fine, Fine, Very Good, Good, Fair, Poor, Unknown.
- Explain visible condition defects briefly in conditionReason.
- Do not use cover price as market value.
- searchQuery should be title + issue + publisher + year + comic.
- If you see red/orange repeating 300 background with black costume Spider-Man, identify it as The Amazing Spider-Man #300, Marvel, 1988, first full appearance of Venom.`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_KEY}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: 'image/jpeg', data: base64 } }
          ]
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 700,
          responseMimeType: 'application/json'
        }
      })
    });

    const rawText = await response.text();

    if (!response.ok) {
      let message = rawText;
      try {
        const errData = JSON.parse(rawText);
        message = errData.error?.message || rawText;
      } catch {}

      if (response.status === 429 || message.includes('Too Many Requests') || message.includes('quota')) {
        return res.status(429).json({ error: 'AI quota reached. Please wait 1 minute and try again.' });
      }

      return res.status(502).json({ error: message.slice(0, 300) });
    }

    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      return res.status(502).json({ error: 'Gemini response was not valid JSON: ' + rawText.slice(0, 200) });
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!text) return res.status(502).json({ error: 'Gemini returned empty response' });

    const clean = text.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch {
      return res.status(502).json({ error: 'Could not parse comic data from AI response' });
    }

    return res.status(200).json({
      title: parsed.title || 'Unknown',
      issue: parsed.issue || 'Unknown',
      publisher: parsed.publisher || 'Unknown',
      year: parsed.year || 'Unknown',
      variant: parsed.variant || '',
      keyInfo: parsed.keyInfo || 'Unknown',
      importantCharacters: parsed.importantCharacters || 'Unknown',
      confidence: parsed.confidence || 'Low',
      condition: parsed.condition || 'Unknown',
      conditionReason: parsed.conditionReason || 'Unknown',
      searchQuery: parsed.searchQuery || `${parsed.title || ''} ${parsed.issue || ''} ${parsed.publisher || ''} ${parsed.year || ''} comic`.trim()
    });

  } catch (err) {
    return res.status(502).json({ error: 'AI request failed: ' + err.message });
  }
}
