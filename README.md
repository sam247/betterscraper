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
   - `TOMBA_API_KEY` and `TOMBA_API_SECRET` — from [Tomba](https://app.tomba.io/api) for domain email lookup (optional).
   - `LEADROCKS_API_TOKEN` — from [LeadRocks Realtime API](https://help.leadrocks.io/en/articles/8336859-email-verifier-realtime-api) for instant email verification (optional).
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

- Choose a **category** from the Google Maps types dropdown, or switch to **Custom search terms**.
- Set **country**, **state** (required), and optional **city**.
- Enable **Scrape emails from websites** to fetch contact emails from each business website (homepage + common contact pages).
- Click **Run extraction**, then **Export CSV** for the full dataset including emails.

## Email lookup

Emails are resolved per business website (choose **Tomba** or **Website scrape** in the sidebar):

1. **Tomba domain search** — ~1 Finder credit per domain
2. **Website scrape** — parses HTML, Cloudflare-protected emails, JSON-LD, contact pages

Optional **Verify emails with LeadRocks** (when `LEADROCKS_API_TOKEN` is set) checks each address via the [LeadRocks instant API](https://help.leadrocks.io/en/articles/8336859-email-verifier-realtime-api) (~1 credit per address) and keeps only **valid** emails.

Enable **Only keep leads with email** to drop rows with no email after lookup/verification.

Google Places cannot filter by email upfront — email lookup runs after Places returns businesses with websites.

## Stack

- Next.js 14 · React 18 · Tailwind CSS · Geist font
- Google Places API (New) text search
- Client-side CSV export (no server-side session state)
