const SCHEMA = `{
  "title": "Unknown",
  "issue": "Unknown",
  "publisher": "Unknown",
  "year": "Unknown",
  "variant": "",
  "isVariant": false,
  "variantDetails": "",
  "edition": "Unknown",
  "isSlabbed": false,
  "slabCompany": "",
  "slabGrade": "",
  "hasSig": false,
  "sigDetails": "",
  "keyInfo": "Unknown",
  "firstAppearance": "",
  "isKeyIssue": false,
  "lowPrintRun": false,
  "printRunNote": "",
  "importantCharacters": "Unknown",
  "confidence": "Low",
  "condition": "Unknown",
  "conditionGrade": "",
  "conditionReason": "Unknown",
  "searchQuery": "Unknown"
}`;

const BASE_RULES = `
You are an expert comic book grader and identifier with deep knowledge of Marvel, DC, and independent publishers.
Return ONLY valid JSON matching the schema below — no markdown, no backticks, no extra text.

${SCHEMA}

=== IDENTIFICATION ===
- Read all text on the cover: title, issue number, volume, publisher logo, cover date, price.
- Identify publisher from logo even if obscured.
- Year: use cover date if visible, otherwise estimate from art style and printing.
- confidence: "High" if title+issue clearly visible, "Medium" if partially visible or inferred, "Low" if guessing.

=== EDITION DETECTION ===
- edition: look at the bottom-left barcode area.
  - "Newsstand" = UPC barcode with small price box / Spider-Man head in a box (Marvel) / UPC lines visible.
  - "Direct Edition" = no UPC barcode; instead a diamond shape, Spider-Man head without box, or publisher symbol.
  - "Canadian Price Variant" = same as newsstand but shows Canadian price (e.g. 75¢ CAN).
  - "Unknown" if barcode area not visible.
- Newsstand editions are rarer for post-1979 Marvel/DC and command a premium.

=== SLAB DETECTION ===
- isSlabbed: true if the comic is visibly sealed inside a hard plastic CGC/CBCS/PGX holder.
- slabCompany: "CGC", "CBCS", "PGX", or "" if not slabbed.
- slabGrade: the numeric grade shown on the label (e.g. "9.8", "9.6") — read directly from the label if visible, else "".
- CGC labels: yellow=Universal, blue=Signature Series, green=Qualified, purple=Restored, red=Conserved.

=== SIGNATURE DETECTION ===
- hasSig: true if you can see handwritten signatures, autographs, or ink marks that appear to be signatures on the cover.
- sigDetails: describe whose signature it might be if identifiable, e.g. "Appears signed, possibly Stan Lee" or "Unidentified signature in black marker".

=== VARIANT COVER DETECTION ===
- isVariant: true if this is a non-standard cover printing.
- variantDetails: describe the variant — e.g. "1:25 retailer incentive variant", "B cover", "Foil cover", "Lenticular cover", "Convention exclusive", "Second print".
- Look for: variant text on cover, ratio notation (1:10, 1:25, 1:50, 1:100), letter suffixes (A/B/C cover), foil/holographic finish, sketch/virgin covers.

=== KEY ISSUE & FIRST APPEARANCE ===
- isKeyIssue: true if this is a notable key issue.
- firstAppearance: name the character/team/concept making their first appearance, e.g. "First full appearance of Venom (Eddie Brock)". Empty string if none.
- keyInfo: summarise ALL key issue significance — first appearances, first covers, origin stories, deaths, major story events, famous creators, high CGC census values.
- Known keys to always flag:
  Amazing Fantasy #15 (first Spider-Man), Amazing Spider-Man #300 (first Venom), #129 (first Punisher), #361 (first Carnage),
  Incredible Hulk #181 (first Wolverine), X-Men #1, Giant-Size X-Men #1 (new X-Men), New Mutants #98 (first Deadpool),
  Batman #1, Detective Comics #27 (first Batman), Action Comics #1 (first Superman), Teenage Mutant Ninja Turtles #1,
  Spawn #1, Walking Dead #1, #19 (first Michonne), #2 (first Glenn cover), Saga #1,
  Bone #1, Preacher #1, Watchmen #1–12, Dark Knight Returns #1–4,
  House of Secrets #92 (first Swamp Thing), Werewolf by Night #32 (first Moon Knight).

=== LOW PRINT RUN ===
- lowPrintRun: true if there is reason to believe this is a low-circulation copy.
- printRunNote: explain why — e.g. "Newsstand edition — typically 10-15% of print run", "Canadian price variant — very low distribution", "Late-period newsstand (post-1990) — extremely scarce", "Independent publisher with estimated <10k print run", "Convention exclusive variant".

=== GRADING ===
- condition: one of: Near Mint, Very Fine, Fine, Very Good, Good, Fair, Poor, Unknown.
- conditionGrade: numeric CGC-equivalent estimate e.g. "9.4", "8.5", "7.0" — omit if slabbed (use slabGrade instead).
- conditionReason: describe specific visible defects — spine stress, colour fading, corner blunting, creases, staple rust, soiling, spine splits, tape, writing. Be brief and specific.
- If the comic is slabbed, set condition and conditionGrade based on the label grade.

=== SEARCH QUERY ===
- searchQuery: optimised for eBay UK sold listings — "Title #Issue Publisher Year" e.g. "Amazing Spider-Man 300 Marvel 1988 comic"
- For newsstand: append "newsstand" to searchQuery.
- For variants: append variant descriptor.
- For slabs: append slabCompany + slabGrade e.g. "CGC 9.8".
`;

function buildPrompt(override) {
  if (override) {
    return `The user says this comic is: "${override}". Use that as the primary identification clue, then verify and expand using the cover image.\n\n${BASE_RULES}`;
  }
  return BASE_RULES;
}

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

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_KEY}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: buildPrompt(override) },
            { inline_data: { mime_type: 'image/jpeg', data: base64 } }
          ]
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 1400,
          responseMimeType: 'application/json'
        }
      })
    });

    const rawText = await response.text();

    if (!response.ok) {
      let message = rawText;
      try { message = JSON.parse(rawText).error?.message || rawText; } catch {}
      if (response.status === 429 || message.includes('quota') || message.includes('Too Many Requests')) {
        return res.status(429).json({ error: 'AI quota reached. Please wait 1 minute and try again.' });
      }
      return res.status(502).json({ error: message.slice(0, 300) });
    }

    let data;
    try { data = JSON.parse(rawText); } catch {
      return res.status(502).json({ error: 'Gemini response was not valid JSON: ' + rawText.slice(0, 200) });
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!text) return res.status(502).json({ error: 'Gemini returned empty response' });

    let parsed;
    try { parsed = JSON.parse(text.replace(/```json|```/g, '').trim()); } catch {
      return res.status(502).json({ error: 'Could not parse comic data from AI response' });
    }

    const title = parsed.title || 'Unknown';
    const issue = parsed.issue || 'Unknown';

    return res.status(200).json({
      title,
      issue,
      publisher:       parsed.publisher       || 'Unknown',
      year:            parsed.year            || 'Unknown',
      variant:         parsed.variant         || '',
      isVariant:       !!parsed.isVariant,
      variantDetails:  parsed.variantDetails  || '',
      edition:         parsed.edition         || 'Unknown',
      isSlabbed:       !!parsed.isSlabbed,
      slabCompany:     parsed.slabCompany     || '',
      slabGrade:       parsed.slabGrade       || '',
      hasSig:          !!parsed.hasSig,
      sigDetails:      parsed.sigDetails      || '',
      keyInfo:         parsed.keyInfo         || '',
      firstAppearance: parsed.firstAppearance || '',
      isKeyIssue:      !!parsed.isKeyIssue,
      lowPrintRun:     !!parsed.lowPrintRun,
      printRunNote:    parsed.printRunNote    || '',
      importantCharacters: parsed.importantCharacters || '',
      confidence:      parsed.confidence      || 'Low',
      condition:       parsed.condition       || 'Unknown',
      conditionGrade:  parsed.conditionGrade  || '',
      conditionReason: parsed.conditionReason || '',
      searchQuery:     parsed.searchQuery     || `${title} ${issue} comic`.trim()
    });

  } catch (err) {
    return res.status(502).json({ error: 'AI request failed: ' + err.message });
  }
}
