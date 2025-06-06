const express = require('express');
const router = express.Router();
const tokenService = require('../services/tokenService');
const volumeService = require('../services/volumeService');

/**
 * @route   GET /api/tokens
 * @desc    Get all tokens sorted by market cap
 * @access  Public
 */
router.get('/', async (req, res) => {
  try {
    const tokens = await tokenService.getAllTokens();
    res.json(tokens);
  } catch (error) {
    console.error('Error getting all tokens:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   GET /api/tokens/stats
 * @desc    Get token statistics
 * @access  Public
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await tokenService.getTokenStats();
    res.json(stats);
  } catch (error) {
    console.error('Error getting token statistics:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   GET /api/tokens/volume-stats
 * @desc    Get detailed token volume statistics
 * @access  Public
 */
router.get('/volume-stats', async (req, res) => {
  try {
    const stats = await volumeService.getVolumeStats();
    res.json(stats);
  } catch (error) {
    console.error('Error getting volume statistics:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   GET /api/tokens/top/:limit
 * @desc    Get top N tokens by market cap
 * @access  Public
 */
router.get('/top/:limit?', async (req, res) => {
  try {
    const limit = req.params.limit ? parseInt(req.params.limit) : 50;
    const tokens = await tokenService.getTopTokens(limit);
    res.json(tokens);
  } catch (error) {
    console.error(`Error getting top ${req.params.limit || 50} tokens:`, error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   GET /api/tokens/top-volume/:limit
 * @desc    Get top N tokens by trading volume
 * @access  Public
 */
router.get('/top-volume/:limit?', async (req, res) => {
  try {
    const limit = req.params.limit ? parseInt(req.params.limit) : 50;
    const tokens = await tokenService.getTopTokensByVolume(limit);
    res.json(tokens);
  } catch (error) {
    console.error(`Error getting top ${req.params.limit || 50} tokens by volume:`, error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   GET /api/tokens/search/:query
 * @desc    Search for tokens by ticker or name
 * @access  Public
 */
router.get('/search/:query', async (req, res) => {
  try {
    const tokens = await tokenService.searchTokens(req.params.query);
    res.json(tokens);
  } catch (error) {
    console.error(`Error searching tokens with query "${req.params.query}":`, error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   GET /api/tokens/:tokenId
 * @desc    Get detailed info about a specific token
 * @access  Public
 */
router.get('/:tokenId', async (req, res) => {
  try {
    const token = await tokenService.getTokenById(req.params.tokenId);
    if (!token) {
      return res.status(404).json({ message: 'Token not found' });
    }
    res.json(token);
  } catch (error) {
    console.error(`Error getting token ${req.params.tokenId}:`, error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   GET /api/tokens/:tokenId/volume
 * @desc    Get detailed volume data for a specific token
 * @access  Public
 */
router.get('/:tokenId/volume', async (req, res) => {
  try {
    const volume = await volumeService.getTokenVolume(req.params.tokenId);
    if (!volume) {
      return res.status(404).json({ message: 'Volume data not found for token' });
    }
    res.json(volume);
  } catch (error) {
    console.error(`Error getting volume data for token ${req.params.tokenId}:`, error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   GET/POST /api/tokens/refresh
 * @desc    Manually refresh token data
 * @access  Public
 */
router.all('/refresh', async (req, res) => {
  try {
    console.log(`[${new Date().toISOString()}] Token refresh requested via ${req.method}`);
    
    // Log if this is a cron job or manual request
    if (req.headers['x-vercel-cron'] === 'true' || req.isCronEndpoint) {
      console.log(`[${new Date().toISOString()}] This is a cron job request via ${req.method}`);
    } else {
      console.log(`[${new Date().toISOString()}] This is a manual refresh request via ${req.method}`);
    }
    
    // Check for bypass token in request
    const bypassToken = req.query.token || req.body?.token;
    const vercelBypassToken = process.env.REACT_APP_VERCEL_BYPASS_TOKEN;
    
    if (bypassToken && vercelBypassToken && bypassToken === vercelBypassToken) {
      console.log(`[${new Date().toISOString()}] ✅ Bypass token validated successfully`);
      
      try {
        console.log(`[${new Date().toISOString()}] Using bypass token to refresh SNEK token directly`);
        
        // Import axios for DexHunter API
        const axios = require('axios');
        const DEXHUNTER_API_KEY = process.env.REACT_APP_DEXHUNTER_PARTNER_ID;
        
        if (!DEXHUNTER_API_KEY) {
          console.error(`[${new Date().toISOString()}] Missing DexHunter API key`);
          return res.status(500).json({ 
            success: false, 
            message: 'Missing DexHunter API key',
            timestamp: new Date().toISOString()
          });
        }
        
        // DexHunter client for getting token data
        const dexhunterClient = axios.create({
          baseURL: 'https://api-us.dexhunterv3.app',
          headers: {
            'Content-Type': 'application/json',
            'X-Partner-Id': DEXHUNTER_API_KEY
          }
        });
        
        // SNEK token ID
        const snekTokenId = '279c909f348e533da5808898f87f9a14bb2c3dfbbacccd631d927a3f534e454b';
        
        console.log(`[${new Date().toISOString()}] Fetching SNEK token data from DexHunter`);
        const response = await dexhunterClient.get(`/swap/token/${snekTokenId}`);
        
        if (!response.data) {
          console.error(`[${new Date().toISOString()}] No data returned from DexHunter`);
          return res.status(500).json({ 
            success: false, 
            message: 'No data returned from DexHunter',
            timestamp: new Date().toISOString()
          });
        }
        
        // Get price
        const priceResponse = await dexhunterClient.get(`/swap/tokenPrice/${snekTokenId}`);
        const price = priceResponse.data?.price || response.data.price || 0;
        
        console.log(`[${new Date().toISOString()}] Got SNEK price:`, price);
        
        return res.json({ 
          success: true, 
          message: 'Token data refreshed successfully (bypass mode)',
          token: {
            id: snekTokenId,
            ticker: 'SNEK',
            price: price,
            updated_at: new Date().toISOString()
          },
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error(`[${new Date().toISOString()}] Error in bypass refresh:`, error);
        return res.status(500).json({ 
          success: false, 
          message: `Error in bypass refresh: ${error.message}`,
          timestamp: new Date().toISOString()
        });
      }
    } else {
      console.log(`[${new Date().toISOString()}] ℹ️ No valid bypass token provided, proceeding with standard refresh`);
    }
    
    // Log environment variables state for debugging
    console.log(`[${new Date().toISOString()}] Environment check: SUPABASE_URL exists:`, !!process.env.REACT_APP_SUPABASE_URL);
    console.log(`[${new Date().toISOString()}] Environment check: SUPABASE_ANON_KEY exists:`, !!process.env.REACT_APP_SUPABASE_ANON_KEY);
    console.log(`[${new Date().toISOString()}] Environment check: DEXHUNTER_API_KEY exists:`, !!process.env.REACT_APP_DEXHUNTER_PARTNER_ID);
    console.log(`[${new Date().toISOString()}] Environment check: VERCEL_BYPASS_TOKEN exists:`, !!process.env.REACT_APP_VERCEL_BYPASS_TOKEN);
    
    // Import the refresh function from server.js
    const { refreshTokenData } = require('../server');
    
    // Trigger the refresh
    const result = await refreshTokenData();
    
    if (result) {
      res.json({ success: true, message: 'Token data refreshed successfully', timestamp: new Date().toISOString() });
    } else {
      res.status(500).json({ success: false, message: 'Token data refresh failed or already in progress', timestamp: new Date().toISOString() });
    }
  } catch (error) {
    console.error('Error refreshing token data:', error);
    res.status(500).json({ message: 'Server error', error: error.message, timestamp: new Date().toISOString() });
  }
});

/**
 * @route   GET/POST /api/tokens/refresh-volumes
 * @desc    Manually refresh volume data (endpoint for cron job)
 * @access  Public
 */
router.all('/refresh-volumes', async (req, res) => {
  try {
    console.log(`[${new Date().toISOString()}] Volume refresh requested via ${req.method}`);
    
    // If this is a cron job, log it
    if (req.headers['x-vercel-cron'] === 'true' || req.isCronEndpoint) {
      console.log(`[${new Date().toISOString()}] This is a cron job request via ${req.method}`);
    } else {
      console.log(`[${new Date().toISOString()}] This is a manual refresh request via ${req.method}`);
    }
    
    // Log environment variables state for debugging
    console.log(`[${new Date().toISOString()}] Environment check: SUPABASE_URL exists:`, !!process.env.REACT_APP_SUPABASE_URL);
    console.log(`[${new Date().toISOString()}] Environment check: SUPABASE_ANON_KEY exists:`, !!process.env.REACT_APP_SUPABASE_ANON_KEY);
    
    // Refresh the volume data
    await volumeService.refreshVolumeData();
    
    // Return success
    res.json({ 
      success: true, 
      message: 'Volume data refreshed successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error(`Error refreshing volume data: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      message: `Error: ${error.message}`,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route   GET /api/tokens/top-tvl/:limit
 * @description Get top tokens sorted by TVL (two-sided liquidity)
 * @access Public
 */
router.get('/top-tvl/:limit', async (req, res) => {
  try {
    const limit = parseInt(req.params.limit) || 50;
    if (limit <= 0 || limit > 500) {
      return res.status(400).json({ message: 'Limit must be between 1 and 500' });
    }
    
    const tokens = await tokenService.getTopTokensByTVL(limit);
    res.json(tokens);
  } catch (error) {
    console.error('Error fetching top tokens by TVL:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   GET/POST /api/tokens/refresh-tvl
 * @desc    Manually refresh TVL (total value locked) data (endpoint for cron job)
 * @access  Public
 */
router.all('/refresh-tvl', async (req, res) => {
  try {
    console.log(`[${new Date().toISOString()}] Cron job or manual trigger for TVL data refresh started`);
    
    // Explicitly log if this is a cron job request
    if (req.headers['x-vercel-cron'] === 'true' || req.isCronEndpoint) {
      console.log(`[${new Date().toISOString()}] This is a cron job request for TVL refresh via ${req.method}`);
    } else {
      console.log(`[${new Date().toISOString()}] This is a manual TVL refresh request via ${req.method}`);
    }
    
    await tokenService.refreshTvlData();
    
    console.log(`[${new Date().toISOString()}] TVL data refreshed successfully`);
    res.json({ 
      success: true, 
      message: 'TVL data refreshed successfully', 
      timestamp: new Date().toISOString() 
    });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error refreshing TVL data:`, error);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message, 
      timestamp: new Date().toISOString() 
    });
  }
});

/**
 * @route   GET/POST /api/tokens/refresh-snek
 * @desc    Refresh just SNEK token data for testing
 * @access  Public
 */
router.all('/refresh-snek', async (req, res) => {
  try {
    console.log(`[${new Date().toISOString()}] SNEK refresh requested via ${req.method}`);
    
    // Use the tokenService to refresh just SNEK
    const result = await tokenService.lightweightTokenRefresh();
    
    if (result) {
      res.json({ 
        success: true, 
        message: 'SNEK token refreshed successfully', 
        timestamp: new Date().toISOString() 
      });
    } else {
      res.status(500).json({ 
        success: false, 
        message: 'SNEK token refresh failed', 
        timestamp: new Date().toISOString() 
      });
    }
  } catch (error) {
    console.error('Error refreshing SNEK token:', error);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message, 
      timestamp: new Date().toISOString() 
    });
  }
});

/**
 * @route   GET/POST /api/tokens/test-supabase
 * @desc    Test Supabase connection
 * @access  Public
 */
router.all('/test-supabase', async (req, res) => {
  try {
    console.log(`[${new Date().toISOString()}] Supabase connection test requested via ${req.method}`);
    
    const result = await tokenService.testSupabaseConnection();
    
    if (result) {
      res.json({ 
        success: true, 
        message: 'Supabase connection test successful', 
        timestamp: new Date().toISOString() 
      });
    } else {
      res.status(500).json({ 
        success: false, 
        message: 'Supabase connection test failed', 
        timestamp: new Date().toISOString() 
      });
    }
  } catch (error) {
    console.error('Error testing Supabase connection:', error);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message, 
      timestamp: new Date().toISOString() 
    });
  }
});

/**
 * @route   GET /api/tokens/check-tables
 * @desc    Check Supabase tables
 * @access  Public
 */
router.get('/check-tables', async (req, res) => {
  try {
    console.log(`[${new Date().toISOString()}] Checking Supabase tables`);
    
    // Initialize Supabase client if needed
    if (!tokenService.supabase && process.env.REACT_APP_SUPABASE_URL && process.env.REACT_APP_SUPABASE_ANON_KEY) {
      const { createClient } = require('@supabase/supabase-js');
      const supabase = createClient(
        process.env.REACT_APP_SUPABASE_URL,
        process.env.REACT_APP_SUPABASE_ANON_KEY
      );
      
      // Check available tables
      const { data, error } = await supabase
        .from('tokens')
        .select('token_id')
        .limit(1);
        
      if (error) {
        console.error('Error checking tokens table:', error);
        return res.status(500).json({ 
          success: false, 
          message: 'Error checking tokens table', 
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
      
      return res.json({
        success: true,
        tables: {
          tokens: {
            exists: true,
            sample: data
          }
        },
        supabase_url: process.env.REACT_APP_SUPABASE_URL,
        anon_key_exists: !!process.env.REACT_APP_SUPABASE_ANON_KEY,
        timestamp: new Date().toISOString()
      });
    } else {
      return res.status(500).json({
        success: false,
        message: 'Supabase client not available',
        supabase_url_exists: !!process.env.REACT_APP_SUPABASE_URL,
        anon_key_exists: !!process.env.REACT_APP_SUPABASE_ANON_KEY,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('Error checking Supabase tables:', error);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router; 