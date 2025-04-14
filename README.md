# Callers Token API

API for Callers token and trading data, providing endpoints for token information, market cap, and price data.

## Local Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev
```

## API Endpoints

- `/api/tokens` - Get all tokens
- `/api/tokens/top/:limit` - Get top tokens by market cap
- `/api/tokens/top-volume/:limit` - Get top tokens by volume
- `/api/tokens/:tokenId` - Get details for a specific token
- `/api/tokens/:tokenId/volume` - Get volume data for a specific token
- `/api/tokens/search/:query` - Search tokens by name or ticker
- `/api/tokens/stats` - Get overall token stats
- `/api/tokens/volume-stats` - Get volume stats

## Deployment to Vercel

The API is deployed to Vercel. To deploy or update:

1. Make sure you have Vercel CLI installed:
   ```bash
   npm install -g vercel
   ```

2. Login to Vercel:
   ```bash
   vercel login
   ```

3. Deploy from the API directory:
   ```bash
   cd api
   vercel
   ```

4. For production deployment:
   ```bash
   vercel --prod
   ```

### Environment Variables

Make sure to set up the following environment variables in Vercel:

- `REACT_APP_DEXHUNTER_PARTNER_ID`: Your DexHunter API key

### Important Vercel Configuration

If you encounter authentication issues with the Vercel deployment:

1. Go to the Vercel dashboard for the project
2. Navigate to Settings → Deployment Protection
3. Disable Vercel Authentication or set up Protection Bypass for Automation
4. If using Protection Bypass, update the `x-vercel-protection-bypass` header in your frontend code with the generated secret

## Data Refresh

The API includes automatic data refresh for token and volume data. In development mode:

- Token data refreshes every 5 minutes
- Volume data refreshes every 60 minutes

In production, these are disabled by default. Use the manual refresh endpoints if needed.

## Setup

1. Install dependencies:
```
npm install
```

2. Start the API server:
```