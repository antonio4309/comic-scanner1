# ComicScan — Whatnot Price Tool

Scan comic book covers with your camera, get live eBay UK sold prices, and export a Whatnot-ready CSV in one click.

## How it works

1. **Camera** — uses your device rear camera to capture the comic cover
2. **AI Vision** — Claude identifies the title, issue number, publisher, and year
3. **eBay UK pricing** — server fetches recent UK sold listings and returns the median price in GBP
4. **Export** — downloads a CSV matching Whatnot's bulk import template

The eBay API key lives **only on the server** as an environment variable — it is never sent to the browser.

---

## Deploy to Vercel (5 minutes)

### 1. Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit"
gh repo create comic-scanner --public --push
```

### 2. Import to Vercel
- Go to https://vercel.com/new
- Select your `comic-scanner` repository
- Click **Deploy** (no build settings needed — Vercel auto-detects)

### 3. Add your eBay App ID as an environment variable
- In your Vercel project → **Settings** → **Environment Variables**
- Add:
  ```
  Name:  EBAY_APP_ID
  Value: YOUR-EBAY-APP-ID-HERE
  ```
- Redeploy (Settings → Deployments → Redeploy)

That's it. Your eBay key is secured server-side — no user ever sees it.

---

## Local development

```bash
npm install -g vercel
vercel dev
```

Add a `.env.local` file:
```
EBAY_APP_ID=your-key-here
```

---

## eBay API setup

1. Go to https://developer.ebay.com/
2. Create an app → get your **App ID (Client ID)**
3. Make sure the app has access to the **Finding API**
4. Use the **Production** keys (not Sandbox)

The app calls `svcs.ebay.co.uk` with `GLOBAL-ID=EBAY-GB` and `siteid=3` (eBay UK), querying **completed sold listings** in the Comics category (ID 259104).

---

## Whatnot CSV format

The exported CSV includes these columns required by Whatnot's bulk importer:

| Column | Description |
|--------|-------------|
| Title | Comic title + issue number |
| Description | Auto-generated with condition + eBay data |
| Quantity | Stock quantity |
| Type | Auction / Buy It Now / Giveaway |
| Price | Median eBay UK price (or % thereof) |
| Category | Comics / Collectibles / Books |
| Sub Category | Single Issue |
| Condition | Mapped to Whatnot's accepted values |

Import at: Whatnot Seller Hub → Inventory → Bulk Import

---

## Project structure

```
comic-scanner/
├── api/
│   └── ebay-search.js     # Serverless function — eBay key lives here
├── public/
│   └── index.html         # Full frontend app
├── vercel.json            # Routing config
└── package.json
```
