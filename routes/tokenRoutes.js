const express = require('express');
const router = express.Router();
const tokenService = require('../services/tokenService');

/**
 * @route GET /api/tokens
 * @description Get all tokens sorted by market cap
 */
router.get('/', async (req, res) => {
  try {
    const tokens = await tokenService.getAllTokens();
    res.json({
      status: 'success',
      count: tokens.length,
      data: tokens
    });
  } catch (error) {
    console.error('Error in GET /tokens:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch token data'
    });
  }
});

/**
 * @route GET /api/tokens/top/:limit
 * @description Get top N tokens by market cap
 */
router.get('/top/:limit?', async (req, res) => {
  try {
    const limit = parseInt(req.params.limit) || 50;
    
    if (isNaN(limit) || limit < 1) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid limit parameter'
      });
    }
    
    const tokens = await tokenService.getTopTokens(limit);
    res.json({
      status: 'success',
      count: tokens.length,
      limit,
      data: tokens
    });
  } catch (error) {
    console.error(`Error in GET /tokens/top/${req.params.limit}:`, error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch top tokens'
    });
  }
});

/**
 * @route GET /api/tokens/stats
 * @description Get token statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await tokenService.getTokenStats();
    res.json({
      status: 'success',
      data: stats
    });
  } catch (error) {
    console.error('Error in GET /tokens/stats:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch token statistics'
    });
  }
});

/**
 * @route GET /api/tokens/search/:query
 * @description Search for tokens by name or ticker
 */
router.get('/search/:query?', async (req, res) => {
  try {
    const query = req.params.query || '';
    
    if (!query.trim()) {
      return res.status(400).json({
        status: 'error',
        message: 'Search query is required'
      });
    }
    
    const tokens = await tokenService.searchTokens(query);
    res.json({
      status: 'success',
      count: tokens.length,
      query,
      data: tokens
    });
  } catch (error) {
    console.error(`Error in GET /tokens/search/${req.params.query}:`, error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to search tokens'
    });
  }
});

/**
 * @route GET /api/tokens/:id
 * @description Get token by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const token = await tokenService.getTokenById(req.params.id);
    
    if (!token) {
      return res.status(404).json({
        status: 'error',
        message: 'Token not found'
      });
    }
    
    res.json({
      status: 'success',
      data: token
    });
  } catch (error) {
    console.error(`Error in GET /tokens/${req.params.id}:`, error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch token'
    });
  }
});

module.exports = router; 