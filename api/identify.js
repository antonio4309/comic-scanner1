import { dHash } from '../lib/imageHash.js';
import { getSql } from '../lib/db.js';

const SCHEMA = `{
  "title": "Unknown",
  "issue": "Unknown",
  "publisher": "Unknown",
  "year": "Unknown",
  "variant": "",
  "isComic": true,
  "notComicReason": "",
  "confidenceScore": 0.0,
  "alternatives": [],
  "isVariant": false,
  "variantDetails": "",
  "coverArtist": "",
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
  "marketInsight": "",
  "searchQuery": "Unknown"
}`;

const BASE_RULES = `
You are an expert comic book grader and identifier with 30 years of experience in Marvel, DC, and independent publishers.
Return ONLY valid JSON matching the schema below — no markdown, no backticks, no extra text.

${SCHEMA}

=== IDENTIFICATION ===
- Read ALL text on the cover: title, issue number, volume, publisher logo, cover date, price box.
- ISSUE NUMBER — READ IT PRECISELY, digit by digit, from the number actually PRINTED on the cover (usually near the title, the top corner, or the price/indicia box). This is the most-misread field, so be careful:
   • Do NOT guess, round, or assume a sequential number. Report exactly what is printed.
   • Watch out for commonly-confused digits: 6 vs 8, 1 vs 7, 3 vs 8, 0 vs 6, 5 vs 6. Zoom in mentally and check each digit.
   • Each image is independent — never copy an issue number from a previous comic or infer it from the art/story.
   • If a digit is genuinely ambiguous, give your best read but set confidence to "Medium" or "Low" so the user can double-check.
- Identify publisher from logo even if partially obscured.
- Year: use cover date printed on comic. Do not adjust — collectors use the printed cover date.
- confidence: "High" if title+issue clearly visible, "Medium" if partially visible or inferred, "Low" if guessing.

=== IS THIS A COMIC? ===
- isComic: true if the image shows a comic book (single issue), graphic novel, or trade paperback cover — even if blurry, partial, bagged, slabbed, or a textless "virgin" art variant.
- Set isComic: false ONLY if the image is clearly NOT a comic cover at all — e.g. a person/selfie, a pet, a landscape, food, a screenshot, a random household object, a trading card, a magazine, or a blank/black frame.
- When isComic is false: write a short, friendly notComicReason (e.g. "That looks like a photo of a coffee mug, not a comic cover."), set confidenceScore to 0, and leave the other fields at their defaults. Do NOT invent a comic.
- When genuinely unsure whether it's a comic, prefer isComic: true and lower confidenceScore — a real comic wrongly rejected is worse than a borderline one let through.

=== CONFIDENCE SCORE (numeric 0..1) ===
confidenceScore: your numeric confidence in the TITLE + ISSUE identification.
  • 0.85–1.0: title and issue both clearly legible and unambiguous.
  • 0.6–0.85: mostly legible but one element inferred, slightly blurry, or a digit that could be misread.
  • 0.3–0.6: significant guessing — blurry, partial trade dress, or relying mainly on art recognition.
  • below 0.3: barely identifiable.
Keep confidenceScore consistent with the string "confidence" field (High ≈ 0.85+, Medium ≈ 0.6, Low ≈ 0.4 or less).

=== ALTERNATIVES ===
alternatives: up to 2 OTHER plausible identifications, most-likely first, for when you are not certain.
  • Each item: { "title": "...", "issue": "...", "publisher": "...", "year": "..." }.
  • Provide them whenever confidenceScore < 0.85 and a realistic different read exists (e.g. an ambiguous issue digit that could be 3 or 8, or a different series the art could belong to).
  • If you are certain, return an empty array [].

=== TEXTLESS / VIRGIN COVERS — IMPORTANT ===
Some modern variants have NO logo, NO title, NO issue number, NO price box and NO barcode — just full-bleed artwork. These are VIRGIN variants and you must NOT give up just because there is no text to read. Instead:
- Set isVariant: true and treat it as a virgin variant (see VARIANT section).
- Identify the book from the ARTWORK itself: recognise the CHARACTER(S) depicted and the ARTIST's style + signature.
- The cover ARTIST is the strongest clue on a virgin cover. Read any signature (often initials, e.g. "JSC" = J. Scott Campbell, "Artgerm", "InHyuk Lee", "Mayhew", "Parrillo", "Dell'Otto") and identify the artist. Put the artist in coverArtist.
- Recognise the character(s) (e.g. Black Cat, Spider-Gwen, Harley Quinn, Vampirella) and set importantCharacters.
- Infer the most likely title and issue from the character + artist + series context (e.g. a J. Scott Campbell Black Cat virgin → "Black Cat" #1). If you cannot be sure of the exact issue, give your best estimate and set confidence "Low" or "Medium" and explain in variantDetails.
- Modern variant-cover artists to recognise by style/signature: J. Scott Campbell (JSC), Stanley Lau (Artgerm), InHyuk Lee, Mike Mayhew, Lucio Parrillo, Gabriele Dell'Otto, Peach Momoko, Jeehyung Lee, Nathan Szerdy, Derrick Chew, Sabine Rich, Kael Ngu, Tyler Kirkham, Clayton Crain.
- Still attempt edition detection only if trade dress is present; a true virgin cover has none, so leave edition as "Unknown" and rely on variantDetails.

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
VIRGIN VARIANT (no trade dress at all): if the cover has NO logo, title, price box or barcode anywhere — just artwork — do NOT classify it as Direct or Newsstand. Leave edition "Unknown" and handle it as a virgin variant (set isVariant true, describe in variantDetails).

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

=== VARIANT COVER DETECTION — READ CAREFULLY ===
A "variant" is ANY cover other than the standard main "Cover A". Variants are often worth far more, so detect them carefully.

- isVariant: true if the cover is not the standard/main cover for that issue.
- variant: short label if known (e.g. "B", "1:25", "Virgin", "Foil"). variantDetails: full description.
- In variantDetails, capture as many of these as you can SEE:
  • Designation / ratio: "Cover B", "Cover C", "1:10", "1:25", "1:50", "1:100 incentive". Look near the logo, in the trade dress, or printed small in a corner.
  • COVER ARTIST — variants are catalogued by artist, so this is the single most useful clue. Read any signature on the artwork and name them, e.g. "Artgerm (Stanley Lau) variant", "InHyuk Lee variant", "Tedesco variant", "Skan variant". ALSO put just the artist's name in the separate "coverArtist" field (e.g. "Artgerm", "InHyuk Lee") whenever you can identify or read it.
  • Finish / material: "Foil", "Holo-foil / holographic", "Lenticular (3D motion)", "Chromium", "Metal", "Glow-in-the-dark", "Embossed".
  • Treatment: "Virgin (artwork only, no logo/trade dress)", "Sketch / line-art cover", "Blank sketch variant", "Black-and-white", "Negative space", "Connecting / interlocking cover".
  • Exclusive: "Convention exclusive (SDCC, NYCC, etc.)", "Store / retailer exclusive". Known modern exclusive lines incl. Golden Apple, Frankie's Comics, Comics Elite, ComicXposure, Unknown Comics, BTC (Big Time Collectibles), Scorpion, Mexican/foil exclusives. NOTE: the store name is often NOT printed on the cover — if you recognise the cover as an exclusive variant by its artist + art but cannot read the store, say e.g. "Store-exclusive virgin variant (J. Scott Campbell) — exact exclusive line unconfirmed".
  • Lettered editions: many exclusives ship as "Ed A / Ed B / Cover A / B" (e.g. trade dress vs virgin). If you can tell trade-dress from virgin, note which (e.g. "Ed B virgin").
  • Printing: "2nd printing", "3rd printing" — look for a "2nd print" note near the price box or altered cover colour/trade dress.
- HOW TO TELL a variant from the standard cover:
  • Standard covers carry full trade dress (logo + issue + price + direct logo/barcode). Virgin, sketch and art variants strip some of this away.
  • A ratio number, an artist callout, or a special finish (foil/lenticular/metal) almost always means variant → set isVariant true.
  • If the cover art clearly differs from the well-known main cover for that issue, it is a variant.
- If you can't pin down the exact catalogued variant, STILL set isVariant and describe the art + artist so it can be matched later, e.g. "Variant — woman in red against a city skyline, signed 'Artgerm'".
- Include the variant designation and/or artist in searchQuery so price lookups match the correct variant (a variant can be worth many times the standard cover).

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
VARIANT-SPECIFIC photo advice (use when it would change the appraisal):
  - If the cover looks like it MIGHT have a foil/metallic/holographic finish but you can't be sure from this image: "Possible foil/holo cover — tilt the comic under a light so the shine shows, then rescan to confirm the variant."
  - If there appears to be a small artist signature on the artwork that you cannot read clearly: "Looks like an artist-signed variant — get a close-up of the signature so the variant artist can be identified."
  - If a corner box / price box / ratio text appears present but is too small or blurry to read: "Get a sharper shot of the bottom corners and price box — that's where edition and variant markings live."

=== COLLECTOR / MARKET INSIGHT ===
marketInsight: One or two factual sentences a professional collector would note about THIS specific issue — its significance, what drives demand, grading/slabbing advice, or edition/variant nuances (e.g. newsstand scarcity, key first appearance, McFarlane-era demand).
- Base it on the book's known importance and the visible condition/edition.
- Do NOT invent specific prices, CGC population numbers, or dated sales — those come from live data, not you.
- Keep it concise, useful and confident. Empty string "" if there is genuinely nothing notable.

=== SEARCH QUERY ===
Build the most effective eBay UK sold-listing search query:
- Format: "Title Issue Publisher Year" — e.g. "Amazing Spider-Man 300 Marvel 1988"
- Use the title exactly as on cover, no "#" symbol, no "comic" suffix.
- Newsstand edition: append "newsstand"
- Canadian Price Variant: append "canadian price variant" OR "cpv"
- VARIANT COVERS — match the variant, not the common cover (variants sell for very different prices):
   • If you identified a cover artist, append the artist name + "variant" — e.g. "Amazing Spider-Man 1 Artgerm variant". This is how collectors search eBay, so it's the most important addition.
   • VIRGIN covers: append "virgin" too — e.g. "Black Cat 1 Campbell virgin variant". Artist + "virgin" is exactly how collectors search these.
   • If no artist but there is a ratio, append it — e.g. "1:25 variant", "1:50 variant".
   • Otherwise append the finish/treatment — e.g. "foil variant", "virgin variant", "lenticular variant", "sketch variant".
   • For a later printing append e.g. "2nd print".
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

// ── Single Gemini call for one model, with self-healing model fallback ────────
// Tries `primaryModel` first, then known-good ids if it's missing/invalid, and
// parses the JSON the model returns (stripping code fences, salvaging truncated
// output). Returns { ok, parsed, servedModel, quota, error }; parsed is null
// when no attempt produced parseable JSON.
async function callGemini(primaryModel, requestBody, key) {
  const candidates = [...new Set([
    primaryModel,
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
  ].filter(Boolean))];

  let lastErr = 'AI request failed';
  for (const model of candidates) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    let response, rawText;
    try {
      response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: requestBody });
      rawText = await response.text();
    } catch (e) {
      lastErr = e.message;
      continue;
    }

    if (!response.ok) {
      let message = rawText;
      try { message = JSON.parse(rawText).error?.message || rawText; } catch {}
      lastErr = message;
      // Quota → stop everything; a different model won't help.
      if (response.status === 429 || /quota|Too Many Requests/i.test(message)) {
        return { quota: true, error: 'AI quota reached. Please wait 1 minute and try again.' };
      }
      // Model not found / unsupported / other server error → try next candidate.
      continue;
    }

    let data;
    try { data = JSON.parse(rawText); } catch { lastErr = 'Gemini response was not valid JSON'; continue; }
    const textOut = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!textOut) { lastErr = 'Gemini returned empty response'; continue; }

    const cleaned = textOut.replace(/```json|```/g, '').trim();
    let parsed = null;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // Salvage: extract the outermost { ... } in case of stray prose/truncation.
      const s = cleaned.indexOf('{'), e = cleaned.lastIndexOf('}');
      if (s !== -1 && e > s) { try { parsed = JSON.parse(cleaned.slice(s, e + 1)); } catch {} }
    }
    return { ok: true, parsed, servedModel: model, error: parsed ? null : 'Could not parse comic data from AI response' };
  }
  return { ok: false, error: lastErr };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── Correction: a user fixed an identification → teach the scan cache ──
  // The corrected fields overlay the stored result for this cover's hash, so the
  // next scan of the same photo returns the corrected identity. Cheap DB write,
  // no AI call, so it runs before the rate limit / API-key checks.
  if (req.body && req.body.correction) {
    const { id, fields } = req.body.correction;
    const sql = getSql();
    if (sql && id != null && fields && typeof fields === 'object') {
      try {
        await sql`UPDATE scan_cache SET result = result || ${JSON.stringify(fields)}::jsonb WHERE id = ${id}`;
        console.log('[scan-cache] learned correction for id=' + id);
        return res.status(200).json({ ok: true });
      } catch (e) {
        console.warn('[scan-cache] correction failed:', e.message);
        return res.status(200).json({ ok: false, error: e.message });
      }
    }
    return res.status(200).json({ ok: false }); // no DB / bad input → harmless no-op
  }

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

  // ── Scan cache (perceptual hash) — skip Gemini on a near-identical cover ──
  // Best-effort: any failure (no DB, hash error, query error) falls through to
  // live identification. An explicit override means "re-identify", so skip cache.
  let phash = null;
  const cacheSql = getSql();
  // Match tolerance: dHash is image-based, so a different photo of the same
  // comic has a larger distance. Tunable via env; higher = more cross-photo
  // hits but more risk of matching a different look-alike cover.
  const MAX_DIST = Math.max(0, Math.min(20, Number(process.env.SCAN_CACHE_MAX_DISTANCE) || 10));
  if (!override && cacheSql) {
    try {
      phash = await dHash(Buffer.from(base64, 'base64'));
      const rows = await cacheSql`
        SELECT id, result, bit_count((phash # ${phash.toString()}::bigint)::bit(64)) AS distance
        FROM scan_cache ORDER BY distance ASC LIMIT 1`;
      if (rows.length && Number(rows[0].distance) <= MAX_DIST) {
        try { await cacheSql`UPDATE scan_cache SET hit_count = hit_count + 1 WHERE id = ${rows[0].id}`; } catch {}
        console.log(`[scan-cache] HIT id=${rows[0].id} distance=${rows[0].distance} (≤${MAX_DIST}) — skipping Gemini`);
        return res.status(200).json({ ...rows[0].result, scanCacheId: rows[0].id, cached: true });
      }
      console.log(`[scan-cache] MISS (nearest distance=${rows[0]?.distance ?? 'none'}, threshold=${MAX_DIST}) — calling Gemini`);
    } catch (e) {
      console.warn('[scan-cache] lookup skipped:', e.message);
    }
  }

  try {
    // Try the configured model first, then fall back to known-good models.
    // This self-heals if GEMINI_MODEL (env) or the default points at a model
    // id that doesn't exist on the account (e.g. a typo'd "gemini-3-flash").
    const requestBody = JSON.stringify({
      contents: [{
        parts: [
          { text: buildPrompt(override) },
          { inline_data: { mime_type: 'image/jpeg', data: base64 } }
        ]
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 8192,   // room for 2.5 Pro's thinking + the JSON
        responseMimeType: 'application/json'
      }
    });

    // ── Model routing: cheapest model first, escalate on low confidence ──
    // The cheap (Flash-Lite) tier handles the easy majority; anything it can't
    // parse or returns unsure about (confidenceScore < threshold) is retried once
    // on the stronger Flash tier. Both tiers are env-overridable.
    const CHEAP  = process.env.GEMINI_MODEL_CHEAP || 'gemini-2.5-flash-lite';
    const STRONG = process.env.GEMINI_MODEL       || 'gemini-2.5-flash';
    const ESCALATE_BELOW = Math.max(0, Math.min(1, Number(process.env.GEMINI_ESCALATE_CONFIDENCE) || 0.7));

    const scoreOf = (p) => {
      const n = Number(p?.confidenceScore);
      return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : null;
    };

    const cheap = await callGemini(CHEAP, requestBody, GEMINI_KEY);
    if (cheap.quota) return res.status(429).json({ error: cheap.error });

    let parsed    = cheap.parsed;
    let modelUsed = cheap.servedModel || CHEAP;
    let escalated = false;
    const cheapScore = scoreOf(parsed);

    // Escalate once if the cheap pass failed to parse or came back unsure.
    if ((!parsed || cheapScore === null || cheapScore < ESCALATE_BELOW) && STRONG !== modelUsed) {
      const strong = await callGemini(STRONG, requestBody, GEMINI_KEY);
      if (strong.quota) {
        if (!parsed) return res.status(429).json({ error: strong.error });
      } else if (strong.parsed) {
        const strongScore = scoreOf(strong.parsed);
        // Take the stronger result unless the cheap one was actually more confident.
        if (!parsed || strongScore === null || cheapScore === null || strongScore >= cheapScore) {
          parsed = strong.parsed;
          modelUsed = strong.servedModel || STRONG;
          escalated = true;
        }
      }
    }

    if (!parsed) {
      return res.status(502).json({ error: ('AI model error — ' + (cheap.error || 'no result')).slice(0, 300) });
    }

    const finalScore = scoreOf(parsed);
    console.log(`[identify] model=${modelUsed} escalated=${escalated} confidenceScore=${finalScore ?? 'n/a'} isComic=${parsed.isComic !== false}`);

    // ── Not a comic? Friendly rejection — never fabricate data or cache it. ──
    if (parsed.isComic === false) {
      console.log(`[identify] rejected as non-comic: ${parsed.notComicReason || ''}`);
      return res.status(200).json({
        notComic: true,
        reason: parsed.notComicReason || "That doesn't look like a comic cover.",
        modelUsed,
        cached: false,
      });
    }

    const title = parsed.title || 'Unknown';
    const issue = parsed.issue || 'Unknown';

    // Up to 2 sanitised alternative identifications for the confirm/correct UI.
    const alternatives = Array.isArray(parsed.alternatives)
      ? parsed.alternatives.slice(0, 2).map(a => ({
          title:     String(a?.title     || '').slice(0, 120),
          issue:     String(a?.issue     || '').slice(0, 40),
          publisher: String(a?.publisher || '').slice(0, 80),
          year:      String(a?.year      || '').slice(0, 12),
        })).filter(a => a.title)
      : [];

    const result = {
      title,
      issue,
      publisher:       parsed.publisher       || 'Unknown',
      year:            parsed.year            || 'Unknown',
      variant:         parsed.variant         || '',
      isVariant:       !!parsed.isVariant,
      variantDetails:  parsed.variantDetails  || '',
      coverArtist:     parsed.coverArtist     || '',
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
      marketInsight:   parsed.marketInsight   || '',
      searchQuery:     parsed.searchQuery     || `${title} ${issue}`.trim(),
      // ── Reliability fields (Brief 2) ──
      confidenceScore: finalScore == null ? 0.8 : finalScore,
      alternatives,
      isComic:         true,
      modelUsed,
    };

    // Store this identification keyed by the cover's perceptual hash, so a
    // repeat scan of the same cover hits the cache and skips Gemini. Awaited so
    // the write commits before the serverless fn returns. RETURNING id lets the
    // client tie a later correction back to this cache row.
    let scanCacheId = null;
    if (phash !== null && cacheSql) {
      try {
        const ins = await cacheSql`
          INSERT INTO scan_cache (phash, result)
          VALUES (${phash.toString()}::bigint, ${JSON.stringify(result)}::jsonb)
          RETURNING id`;
        scanCacheId = ins?.[0]?.id ?? null;
        console.log('[scan-cache] stored new identification id=' + scanCacheId);
      } catch (e) {
        console.warn('[scan-cache] insert failed:', e.message);
      }
    }

    return res.status(200).json({ ...result, scanCacheId, cached: false });

  } catch (err) {
    return res.status(502).json({ error: 'AI request failed: ' + err.message });
  }
}
