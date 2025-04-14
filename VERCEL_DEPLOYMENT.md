# Callers Token API Deployment Summary

## API URL

https://callers-token-api.vercel.app

## Cron Jobs

- Token data refresh: Every 2 hours - endpoint: /api/refresh-data
- Volume data refresh: Every 3 hours - endpoint: /api/tokens/refresh-volumes
- TVL data refresh: Every 4 hours - endpoint: /api/tokens/refresh-tvl

## Key Endpoints

- GET /api/tokens/top/10 - Top 10 tokens by market cap
- GET /api/tokens/top-tvl/10 - Top 10 tokens by TVL
- GET /api/tokens/top-volume/10 - Top 10 tokens by volume
- GET /api/tokens/:tokenId - Get token details
- GET /api/tokens/search/:query - Search tokens
- GET /api/health - Check API health

## Monitoring

You can monitor cron job performance in the Vercel dashboard under your project settings.

## Local Development

The original token API files remain in the /api directory for local development with full file system access. Run locally with:

```
npm run dev
```

