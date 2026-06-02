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
  "conditionReason": "",
  "photoAdvice": "",
  "searchQuery": "Unknown"
}`;

const BASE_RULES = `
You are an expert comic book grader and identifier with 30 years of experience in Marvel, DC, and independent publishers.
Return ONLY valid JSON matching the schema below — no markdown, no backticks, no extra text.

${SCHEMA}

=== IDENTIFICATION ===
- Read ALL text on the cover: title, issue number, volume, publisher logo, cover date, price box.
- Identify publisher from logo even if partially obscured.
- Year: use cover date printed on comic. Do not adjust — collectors use the printed cover date.
- confidence: "High" if title+issue clearly visible, "Medium" if partially visible or inferred, "Low" if guessing.

=== EDITION DETECTION — CRITICAL, READ CAREFULLY ===
Look at the BOTTOM-LEFT corner box of the cover. This is the single most important area.

DIRECT EDITION (most comics sold in comic shops):
  - The bottom-left contains a LOGO or SYMBOL with NO vertical barcode stripes.
  - Marvel direct editions: Spider-Man face/head logo, OR circular Marvel bullseye, OR "MARVEL" in a box — clean graphic, no barcode lines.
  - DC direct editions: DC bullet logo (circle with DC), or diamond/square with publisher symbol.
  - Independent publishers: publisher logo or colophon symbol.
  - KEY RULE: If you see a clean logo/graphic with NO parallel vertical lines → "Direct Edition".

NEWSSTAND EDITION (sold in newsagents, supermarkets, convenience stores):
  - The bottom-left contains a UPC BARCODE: many thin parallel VERTICAL black-and-white stripes with numbers underneath.
  - Looks exactly like a retail product barcode you'd scan at a checkout.
  - Marvel newsstand: the barcode replaces the Spider-Man/bullseye logo.
  - KEY RULE: If you see thin parallel vertical lines (barcode stripes) → "Newsstand".

CANADIAN PRICE VARIANT (CPV):
  - Looks like a newsstand edition but the price box shows a CANADIAN price (e.g. "75¢ CAN", "$1.25 CAN").
  - The Canadian price may appear alongside OR instead of the US price.
  - CPVs are significantly rarer than US newsstand copies.
  - KEY RULE: Barcode present + Canadian price visible → "Canadian Price Variant".

UK PENCE PRICE VARIANT:
  - Some US comics from the 1960s–80s were distributed in the UK with a pence price stamped or printed over the US price (e.g. "10p", "12p", "15p", "25p").
  - The barcode area is unchanged; only the price differs.
  - These are called "Type 1A" (newsstand with pence stamp) or "UK Price Variants".
  - KEY RULE: Pence price visible in the price box → note in variantDetails as "UK Pence Price Variant (Xp)".

UNKNOWN: Only use if the bottom-left corner is completely obscured or cut off.

COMMON MISTAKE TO AVOID: A Spider-Man face/head logo in the bottom-left = DIRECT EDITION (not newsstand). The Spider-Man logo was used on Marvel direct editions from 1979. Do NOT confuse the logo with a barcode.

=== SLAB DETECTION ===
- isSlabbed: true only if the comic is visibly sealed inside a hard rigid plastic CGC/CBCS/PGX slab holder.
- slabCompany: "CGC", "CBCS", "PGX", or "" if raw.
- slabGrade: numeric grade from the label (e.g. "9.8", "9.6", "8.5") — read directly from the label text.
- CGC label colours: yellow=Universal grade, blue=Signature Series, green=Qualified, purple=Restored, red=Conserved.
- If slabbed: set condition to match the grade (9.8=Near Mint/Mint, 9.6=Near Mint+, 9.4=Near Mint, 8.0=Very Fine, etc.)

=== SIGNATURE DETECTION ===
- hasSig: true if you can see handwritten signatures, autographs, or ink marks that appear to be signatures.
- sigDetails: identify whose signature if possible, e.g. "Appears signed, possibly Stan Lee" or "Unidentified signature in black marker on cover".

=== VARIANT COVER DETECTION ===
- isVariant: true if non-standard cover printing.
- variantDetails: describe — e.g. "1:25 retailer incentive variant", "Cover B", "Foil cover", "Lenticular cover", "Second print", "Convention exclusive", "Sketch cover", "Virgin cover".
- Look for: variant text on cover, ratio notation (1:10, 1:25, 1:50), letter suffixes (A/B/C), foil/holographic finish.

=== KEY ISSUE & FIRST APPEARANCE ===
- isKeyIssue: true if notable key issue.
- firstAppearance: full description e.g. "First full appearance of Venom (Eddie Brock)". Empty string if none.
- keyInfo: ALL key significance — first appearances, deaths, origins, major events, creator milestones.
- Always flag these known keys (and any others you recognise):
  MARVEL: Amazing Fantasy #15 (1st Spider-Man), ASM #1, #50 (Spidey quits), #121 (death Gwen Stacy), #122, #129 (1st Punisher), #238 (1st Hobgoblin), #252 (black suit), #300 (1st Venom), #361 (1st Carnage),
  Hulk #181 (1st Wolverine full), #340 (McFarlane), X-Men #1 (1963), #94, #101 (1st Phoenix), Giant-Size X-Men #1 (new team),
  New Mutants #87 (1st Cable), #98 (1st Deadpool), X-Force #2 (1st Deadpool cover), Uncanny X-Men #266 (1st Gambit), #282 (1st Bishop),
  Iron Man #128 (Demon in a Bottle), Thor #337 (1st Beta Ray Bill), Captain America #117 (1st Falcon),
  Luke Cage #1, Ms Marvel #1 (1977 + 2014), Black Panther #1, Daredevil #1, #168 (1st Elektra), #181 (Elektra dies),
  DC: Action Comics #1 (1st Superman), Detective Comics #27 (1st Batman), Batman #1, #251 (Joker/O'Neil), #423 (McFarlane),
  Flash #123 (1st multiverse), Green Lantern #76 (O'Neil/Adams), Superman #75 (death), #233, Adventures of Superman #500,
  New Teen Titans #2 (1st Deathstroke), #44 (1st Nightwing), Crisis on Infinite Earths #7 (Supergirl dies),
  INDEPENDENT: Teenage Mutant Ninja Turtles #1, Spawn #1, Walking Dead #1/#19/#27, Saga #1, Bone #1,
  Preacher #1, Watchmen #1-12, Dark Knight Returns #1-4, Sin City #1, Sandman #1,
  House of Secrets #92 (1st Swamp Thing), Werewolf by Night #32 (1st Moon Knight), Hero for Hire #1 (1st Luke Cage).

=== IMPORTANT CHARACTERS ===
- importantCharacters: List the main characters who appear on the cover or in the issue title (e.g. "Spider-Man, Mary Jane Watson, Venom"). If unknown, write "Unknown".

=== LOW PRINT RUN ===
- lowPrintRun: true ONLY for low-circulation copies. Direct editions are NOT low print run (they were the majority of sales).
- Set lowPrintRun: true for: Newsstand edition (10–15% of print run), Canadian Price Variant (<1% of print run), Late newsstand post-1990 (extremely rare), independent publisher with <10k print run, convention exclusive.
- printRunNote: reason — e.g. "Newsstand edition — typically 10–15% of print run vs direct edition", "Canadian Price Variant — extremely scarce, <1% of print run", "Late newsstand (post-1990) — extremely rare, most copies sold as direct", "Independent publisher low print run", "Convention exclusive".

=== GRADING ===
CRITICAL: NEVER output condition "Unknown" unless cover is completely invisible. Always give best-effort estimate.

Grades and CGC equivalents:
  Near Mint/Mint = 9.8–9.9: Nearly perfect, minimal handling wear, flat corners, bright colours, white pages.
  Near Mint+ = 9.6: Tiny corner blunts or stress lines only, otherwise perfect.
  Near Mint = 9.4: Minor corner wear, 1-2 stress lines, still very sharp.
  Very Fine/Near Mint = 9.0: Light general wear, small corner blunts, minor spine stress.
  Very Fine = 8.0: Moderate corner blunting, some spine stress, slight colour fade, still a sharp copy.
  Fine/Very Fine = 7.0: Noticeable wear, small creases, moderate spine stress, still flat with no major defects.
  Fine = 6.0: Clearly read, moderate wear throughout, creases possible, no major tears.
  Very Good = 4.0: Heavy wear, multiple creases, rolled spine, some colour loss but still complete.
  Good = 2.0: Very worn, major defects, possibly loose pages, heavy creasing.
  Fair/Poor = 0.5–1.8: Severe defects, major damage, reading copy only.

- conditionGrade: best numeric CGC estimate (e.g. "9.4", "8.5", "7.0"). Skip if slabbed.
- conditionReason: 1–2 sentences. Name SPECIFIC visible defects: spine stress lines, corner blunting, creases, staple rust, tanning/browning, soiling, spine roll, moisture damage, writing, tape.
  Through bag/sleeve: "Graded through bag — [describe visible corners, spine, colour brightness]. Estimated [grade]."
  Photo quality poor: "Photo quality limits accuracy — [describe what IS visible]. Best estimate [grade]."
  If slabbed: base condition on label grade, note label colour.

=== PHOTO QUALITY ===
photoAdvice: One short sentence if any issue applies. Empty string "" if photo is clear.
  - Bag/sleeve: "Remove the comic from its bag or sleeve for an accurate condition grade."
  - Blurry: "Hold steady and move closer — the cover is out of focus."
  - Dark/underexposed: "Improve the lighting — use natural light or a bright lamp."
  - Tilted/angled: "Lay flat and photograph straight down from above."
  - Cropped: "Step back — part of the cover is cut off."
  - Cluttered background: "Place on a plain dark or white surface."
  - Multiple comics: "Scan one comic at a time."
  - Glare: "Move the light source to the side to reduce reflections."

=== SEARCH QUERY ===
Build the most effective eBay UK sold-listing search query:
- Format: "Title Issue Publisher Year" — e.g. "Amazing Spider-Man 300 Marvel 1988"
- Use the title exactly as on cover, no "#" symbol, no "comic" suffix.
- Newsstand edition: append "newsstand"
- Canadian Price Variant: append "canadian price variant" OR "cpv"
- Variant cover: append the key variant descriptor (e.g. "foil cover", "1:25 variant")
- Slabbed: append slabCompany and slabGrade (e.g. "CGC 9.8")
- Do NOT append "Direct Edition" — it adds noise to searches.
`;

function buildPrompt(override) {
  if (override) {
    return `The user says this comic is: "${override}". Use that as the primary identification clue, then verify and expand using the cover image.\n\n${BASE_RULES}`;
  }
  return BASE_RULES;
}

// ── Rate limiting (10 scans / minute per IP, 100/day per IP) ─────────────────
import { Redis } from '@upstash/redis';

async function checkRateLimit(ip) {
  // Skip rate limiting if Redis is not configured
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null;
  try {
    const redis = Redis.fromEnv();
    const minuteKey = `rl:identify:min:${ip}:${Math.floor(Date.now() / 60000)}`;
    const dayKey    = `rl:identify:day:${ip}:${new Date().toISOString().slice(0, 10)}`;

    const [minCount, dayCount] = await Promise.all([
      redis.incr(minuteKey),
      redis.incr(dayKey),
    ]);
    // Set TTL on first hit only (incr returns 1)
    if (minCount === 1) await redis.expire(minuteKey, 90);   // 90s safety margin
    if (dayCount === 1) await redis.expire(dayKey, 90000);   // 25h safety margin

    if (minCount > 10)  return { error: 'Too many scans — wait a moment and try again.', retry: 60 };
    if (dayCount > 100) return { error: 'Daily scan limit reached. Try again tomorrow.', retry: 3600 };
    return null;
  } catch {
    return null; // Redis down → fail open, don't block the user
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Rate limit check
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
  const limited = await checkRateLimit(ip);
  if (limited) {
    res.setHeader('Retry-After', String(limited.retry));
    return res.status(429).json({ error: limited.error });
  }

  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_KEY) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is missing in Vercel environment variables' });
  }

  const { base64, override } = req.body || {};
  if (!base64) return res.status(400).json({ error: 'No image provided' });

  try {
    // Model can be overridden in Vercel env (GEMINI_MODEL) without a code change.
    const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;

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
          maxOutputTokens: 2000,
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
      photoAdvice:     parsed.photoAdvice     || '',
      searchQuery:     parsed.searchQuery     || `${title} ${issue}`.trim()
    });

  } catch (err) {
    return res.status(502).json({ error: 'AI request failed: ' + err.message });
  }
}
