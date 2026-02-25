# Better Scraper

Internal tool to extract head lice clinic data from Google Places API by state and optional city. Private; deploy to Vercel with basic auth.

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
   Edit `.env`:
   - `GOOGLE_PLACES_API_KEY` – from [Google Cloud Console](https://console.cloud.google.com/) (Places API (New) enabled).
   - `BASIC_AUTH_USER` and `BASIC_AUTH_PASSWORD`, or `BASIC_AUTH_CREDENTIALS=user:password`.

3. Run locally:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) and sign in with the basic auth credentials.

## Deploy to Vercel

1. Push to GitHub and import the repo in Vercel.
2. Add environment variables in Vercel: `GOOGLE_PLACES_API_KEY`, and either `BASIC_AUTH_USER` + `BASIC_AUTH_PASSWORD` or `BASIC_AUTH_CREDENTIALS`.
3. Deploy. The app is protected by basic auth.

## Usage

- **Country**: Default “United States”.
- **State**: Required (e.g. Texas).
- **City**: Optional (e.g. Austin).
- **Search terms**: One per line; defaults include “head lice clinic”, “lice removal”, etc.
- **Max results per term**: Default 60 (capped by API).
- Click **Run Extraction**, then use **Export CSV** to download the last run.
