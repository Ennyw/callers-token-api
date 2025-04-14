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
 * @route   POST /api/tokens/refresh-volume
 * @desc    Manually refresh volume data
 * @access  Public
 */
router.post('/refresh-volume', async (req, res) => {
  try {
    await volumeService.refreshVolumeData();
    res.json({ success: true, message: 'Volume data refreshed successfully' });
  } catch (error) {
    console.error('Error refreshing volume data:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   POST /api/tokens/refresh
 * @desc    Manually refresh token data
 * @access  Public
 */
router.post('/refresh', async (req, res) => {
  try {
    // Import the refresh function from server.js
    const { refreshTokenData } = require('../server');
    
    // Trigger the refresh
    const result = await refreshTokenData();
    
    if (result) {
      res.json({ success: true, message: 'Token data refreshed successfully' });
    } else {
      res.status(500).json({ success: false, message: 'Token data refresh failed or already in progress' });
    }
  } catch (error) {
    console.error('Error refreshing token data:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route GET /api/tokens/top-tvl/:limit
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
 * @route   POST /api/tokens/refresh-volumes
 * @desc    Manually refresh volume data (endpoint for cron job)
 * @access  Public
 */
router.post('/refresh-volumes', async (req, res) => {
  try {
    console.log(`[${new Date().toISOString()}] Cron job or manual trigger for volume data refresh started`);
    
    // Explicitly log if this is a cron job request
    if (req.headers['x-vercel-cron'] === 'true' || req.isCronEndpoint) {
      console.log(`[${new Date().toISOString()}] This is a cron job request for volume refresh`);
    } else {
      console.log(`[${new Date().toISOString()}] This is a manual volume refresh request`);
    }
    
    await volumeService.refreshVolumeData();
    
    console.log(`[${new Date().toISOString()}] Volume data refreshed successfully`);
    res.json({ 
      success: true, 
      message: 'Volume data refreshed successfully', 
      timestamp: new Date().toISOString() 
    });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error refreshing volume data:`, error);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message, 
      timestamp: new Date().toISOString() 
    });
  }
});

/**
 * @route   POST /api/tokens/refresh-tvl
 * @desc    Manually refresh TVL (total value locked) data (endpoint for cron job)
 * @access  Public
 */
router.post('/refresh-tvl', async (req, res) => {
  try {
    console.log(`[${new Date().toISOString()}] Cron job or manual trigger for TVL data refresh started`);
    
    // Explicitly log if this is a cron job request
    if (req.headers['x-vercel-cron'] === 'true' || req.isCronEndpoint) {
      console.log(`[${new Date().toISOString()}] This is a cron job request for TVL refresh`);
    } else {
      console.log(`[${new Date().toISOString()}] This is a manual TVL refresh request`);
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

module.exports = router; 