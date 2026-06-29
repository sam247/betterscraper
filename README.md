# Better Scraper

Internal tool to extract business leads from Google Places by region, with optional email scraping from business websites. Deploy to Vercel with basic auth.

## Setup

1. Clone and install:

   ```bash
   cd betterscraper
   npm install
   ```

2. Copy env and set variables:

   ```bash
   cp .env.example .env
   ```

   - `GOOGLE_PLACES_API_KEY` — from [Google Cloud Console](https://console.cloud.google.com/) (Places API (New) enabled).
   - `BASIC_AUTH_USER` and `BASIC_AUTH_PASSWORD`, or `BASIC_AUTH_CREDENTIALS=user:password`.

3. Run locally:

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Deploy to Vercel

1. Push to GitHub and import the repo in Vercel.
2. Add environment variables: `GOOGLE_PLACES_API_KEY`, and basic auth credentials.
3. Deploy. The app is protected by basic auth when credentials are set.

## Usage

- Choose a **preset** or enter custom **search terms** (one per line).
- Set **country**, **state** (required), and optional **city**.
- Enable **Scrape emails from websites** to fetch contact emails from each business website (homepage + common contact pages).
- Click **Run extraction**, then **Export CSV** for the full dataset including emails.

## Email scraping

Emails are extracted by fetching each business website and parsing HTML for `mailto:` links and email patterns. Common contact paths (`/contact`, `/about`, etc.) are checked. Junk addresses (noreply, example.com, etc.) are filtered out.

## Stack

- Next.js 14 · React 18 · Tailwind CSS · Geist font
- Google Places API (New) text search
- Client-side CSV export (no server-side session state)
