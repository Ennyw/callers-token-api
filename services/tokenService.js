const fs = require('fs');
const path = require('path');
const volumeService = require('./volumeService');

/**
 * Service to handle token operations
 */
class TokenService {
  constructor() {
    this.reportPath = path.join(process.cwd(), 'token_data/market_cap_report_refined.json');
    this.summariesDir = path.join(process.cwd(), 'token_data/summaries');
    this.advancedDir = path.join(process.cwd(), 'advanced_token_data/raw');
    
    // Log the paths being used
    console.log('📁 TokenService paths:', {
      reportPath: this.reportPath,
      summariesDir: this.summariesDir,
      advancedDir: this.advancedDir,
      cwd: process.cwd()
    });
    
    this.cachedTokens = null;
    this.lastCacheTime = null;
    this.cacheDuration = 60 * 1000; // 1 minute cache
    
    // Special handling for known wrapped tokens
    this.wrappedTokens = {
      'iBTC': { 
        baseAsset: 'BTC',
        tokenId: 'f66d78b4a3cb3d37afa0ec36461e51ecbde00f26c8f0a68f94b6988069425443',
        decimals: 8
      },
      'iETH': { 
        baseAsset: 'ETH',
        tokenId: '789ef8ae89617f34c07f7f6a12e4d65146f958c0bc15a97b4ff169f1',
        decimals: 18
      }
    };
  }

  /**
   * Get all tokens sorted by market cap
   * @returns {Promise<Array>} Sorted tokens
   */
  async getAllTokens() {
    // Use cache if available and not expired
    if (this.cachedTokens && this.lastCacheTime && (Date.now() - this.lastCacheTime < this.cacheDuration)) {
      console.log('📦 Using cached tokens');
      return this.cachedTokens;
    }

    try {
      // Read the market cap report
      let report;
      try {
        console.log('📄 Reading market cap report from:', this.reportPath);
        report = JSON.parse(fs.readFileSync(this.reportPath, 'utf8'));
        console.log(`📊 Market cap report loaded with ${report.top_tokens_by_market_cap_valid?.length || 0} tokens`);
        
        // Log first few tokens to verify data
        if (report.top_tokens_by_market_cap_valid?.length > 0) {
          console.log('🔍 First 3 tokens in report:', 
            report.top_tokens_by_market_cap_valid.slice(0, 3).map(t => ({
              ticker: t.ticker,
              market_cap: t.market_cap,
              liquidity: t.liquidity
            }))
          );
        }
      } catch (error) {
        console.error(`❌ Error reading market cap report at ${this.reportPath}:`, error.message);
        console.error('Working directory:', process.cwd());
        report = { top_tokens_by_market_cap_valid: [] };
      }
      
      // Get all token summaries to include tokens without market cap
      let tokenFiles = [];
      try {
        tokenFiles = fs.readdirSync(this.summariesDir)
          .filter(file => file.includes('_enhanced_refined.json') || file.includes('_summary.json'));
      } catch (error) {
        console.error(`Error reading token summaries directory at ${this.summariesDir}:`, error.message);
        console.error('Working directory:', process.cwd());
      }
      
      // Get volume data for all tokens
      let volumeMap = {};
      try {
        const volumeData = await volumeService.getVolumeData();
        
        // Create a mapping of token ID to volume data for quick lookups
        if (volumeData && volumeData.tokens && Array.isArray(volumeData.tokens)) {
          volumeData.tokens.forEach(token => {
            if (token && token.tokenId) {
              volumeMap[token.tokenId] = {
                volumeInAda: token.volumeInAda || 0,
                volumeInToken: token.volumeInToken || 0,
                orderCount: token.orderCount || 0
              };
            }
          });
        }
      } catch (error) {
        console.error('Error getting volume data:', error.message);
        // Leave volumeMap as empty object if there's an error
      }
      
      // Create an array to hold all tokens
      let allTokens = [];
      
      // Process tokens from the market cap report
      if (report.top_tokens_by_market_cap_valid && Array.isArray(report.top_tokens_by_market_cap_valid)) {
        console.log(`🔄 Processing ${report.top_tokens_by_market_cap_valid.length} tokens from market cap report`);
        
        // Add tokens with market cap
        report.top_tokens_by_market_cap_valid.forEach(token => {
          // Debug logging for SNEK
          if (token.ticker === 'SNEK') {
            console.log('🔍 Processing SNEK token:', {
              token_id: token.token_id,
              market_cap: token.market_cap,
              liquidity: token.liquidity,
              price: token.price,
              has_market_cap: token.market_cap && token.market_cap > 0,
              has_liquidity: token.liquidity && token.liquidity >= 200,
              has_price: token.price && token.price > 0
            });
          }
          
          // Calculate two-sided liquidity (TVL) - SIMPLIFIED APPROACH
          // For a balanced pool, the TVL is approximately 2x the one-sided liquidity
          // This approach avoids issues with pool data and gives a good approximation
          let adaLiquidity = token.liquidity || 0;
          let tvl = adaLiquidity * 2; // Double the ADA side as an approximation of TVL
          
          console.log(`📊 [tokenService] Estimated two-sided TVL for ${token.ticker}: ${tvl.toFixed(2)} ADA (2x one-sided liquidity: ${adaLiquidity.toFixed(2)} ADA)`);
          
          // Only include tokens with at least 200 ADA in liquidity
          if (token.liquidity && token.liquidity >= 200) {
            // Get volume data if available
            const volume = volumeMap[token.token_id] || {
              volumeInAda: 0,
              volumeInToken: 0,
              orderCount: 0
            };
            
            allTokens.push({
              token_id: token.token_id,
              ticker: token.ticker || 'UNKNOWN',
              name: token.token_ascii || token.ticker || 'UNKNOWN',
              market_cap: token.market_cap || null,
              price: token.price || null,
              liquidity: token.liquidity || null, // Keep original liquidity for backwards compatibility
              tvl: tvl || null,    // Add new TVL (two-sided liquidity) field
              pool_count: token.pool_count || 0,
              trust_score: token.trust_assessment?.score || null,
              has_market_cap: true,
              volume: volume.volumeInAda,
              volume_in_token: volume.volumeInToken,
              order_count: volume.orderCount
            });
          }
        });
        
        console.log(`✅ Processed ${allTokens.length} tokens from market cap report`);
        
        // Log first few processed tokens
        if (allTokens.length > 0) {
          console.log('🔍 First 3 processed tokens:', 
            allTokens.slice(0, 3).map(t => ({
              ticker: t.ticker,
              market_cap: t.market_cap,
              liquidity: t.liquidity,
              has_market_cap: t.has_market_cap
            }))
          );
        }
      }
      
      // Process tokens without market cap from summary files
      const processedTokenIds = new Set(allTokens.map(t => t.token_id));
      
      tokenFiles.forEach(file => {
        try {
          const filePath = path.join(this.summariesDir, file);
          const tokenData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          
          // Skip if this token is already processed
          if (processedTokenIds.has(tokenData.token_id)) {
            return;
          }
          
          // Check if this is a known wrapped token
          const isWrappedToken = Object.values(this.wrappedTokens)
            .some(wt => wt.tokenId === tokenData.token_id);
          
          // If it's a wrapped token or has price data, include it
          if (isWrappedToken || (tokenData.ticker && (tokenData.price || tokenData.average_price))) {
            const price = tokenData.price || tokenData.average_price || null;
            const circSupply = tokenData.circulating_supply || tokenData.total_supply || 0;
            const liquidity = tokenData.liquidity || 0;
            
            // Calculate market cap if price is available and supply is valid
            let marketCap = null;
            if (price && circSupply && circSupply > 0) {
              marketCap = price * circSupply;
            }
            
            // Get volume data if available
            const volume = volumeMap[tokenData.token_id] || {
              volumeInAda: 0,
              volumeInToken: 0,
              orderCount: 0
            };
            
            // Only include tokens with at least 200 ADA in liquidity unless it's a wrapped token
            if (isWrappedToken || (liquidity >= 200)) {
              allTokens.push({
                token_id: tokenData.token_id,
                ticker: tokenData.ticker || 'UNKNOWN',
                name: tokenData.token_ascii || tokenData.ticker || 'UNKNOWN',
                market_cap: marketCap,
                price: price,
                liquidity: liquidity,
                pool_count: tokenData.pool_count || 0,
                trust_score: tokenData.trust_assessment?.score || null,
                has_market_cap: marketCap !== null,
                volume: volume.volumeInAda,
                volume_in_token: volume.volumeInToken,
                order_count: volume.orderCount
              });
              
              processedTokenIds.add(tokenData.token_id);
            }
          }
        } catch (error) {
          console.error(`Error reading token file ${file}:`, error.message);
        }
      });
      
      // Sort tokens: first by whether they have market cap, then by market cap value (descending)
      allTokens.sort((a, b) => {
        // First sort by whether they have market cap
        if (a.has_market_cap && !b.has_market_cap) return -1;
        if (!a.has_market_cap && b.has_market_cap) return 1;
        
        // If both have market cap, sort by market cap value
        if (a.has_market_cap && b.has_market_cap) {
          return b.market_cap - a.market_cap;
        }
        
        // If neither has market cap, sort alphabetically by ticker
        return a.ticker.localeCompare(b.ticker);
      });

      // Add rank to each token
      allTokens = allTokens.map((token, index) => ({
        ...token,
        rank: index + 1
      }));
      
      // Cache the result
      this.cachedTokens = allTokens;
      this.lastCacheTime = Date.now();
      
      return allTokens;
    } catch (error) {
      console.error('Error loading tokens:', error);
      return []; // Return empty array instead of throwing
    }
  }

  /**
   * Get the top tokens by market cap
   * @param {number} limit - Number of tokens to return
   * @returns {Promise<Array>} Top tokens
   */
  async getTopTokens(limit = 50) {
    try {
      const allTokens = await this.getAllTokens();
      
      // Debug logging for SNEK
      const snekToken = allTokens.find(t => t.ticker === 'SNEK');
      if (snekToken) {
        console.log('🔍 SNEK in getTopTokens:', {
          token_id: snekToken.token_id,
          market_cap: snekToken.market_cap,
          has_market_cap: snekToken.has_market_cap,
          rank: allTokens.findIndex(t => t.ticker === 'SNEK') + 1
        });
      } else {
        console.log('❌ SNEK not found in allTokens array');
      }
      
      const filteredTokens = allTokens.filter(token => token.has_market_cap);
      console.log(`📊 Total tokens before filtering: ${allTokens.length}, after filtering: ${filteredTokens.length}`);
      
      return filteredTokens.slice(0, limit);
    } catch (error) {
      console.error(`Error getting top ${limit} tokens:`, error);
      return []; // Return empty array instead of throwing
    }
  }

  /**
   * Get the top tokens by volume
   * @param {number} limit - Number of tokens to return
   * @returns {Promise<Array>} Top tokens by volume
   */
  async getTopTokensByVolume(limit = 50) {
    try {
      const allTokens = await this.getAllTokens();
      
      // Sort by volume (descending)
      return [...allTokens]
        .sort((a, b) => b.volume - a.volume)
        .slice(0, limit);
    } catch (error) {
      console.error(`Error getting top ${limit} tokens by volume:`, error);
      return []; // Return empty array instead of throwing
    }
  }

  /**
   * Get the top tokens sorted by TVL (two-sided liquidity)
   * @param {number} limit - Number of tokens to return
   * @returns {Promise<Array>} Top tokens
   */
  async getTopTokensByTVL(limit = 50) {
    try {
      const allTokens = await this.getAllTokens();
      
      // Sort by TVL (two-sided liquidity) descending
      return [...allTokens]
        .filter(token => token.tvl && token.tvl > 0)
        .sort((a, b) => b.tvl - a.tvl)
        .slice(0, limit);
    } catch (error) {
      console.error(`Error getting top ${limit} tokens by TVL:`, error);
      return []; // Return empty array instead of throwing
    }
  }

  /**
   * Get token by ID
   * @param {string} tokenId - Token ID
   * @returns {Promise<Object|null>} Token data or null if not found
   */
  async getTokenById(tokenId) {
    try {
      const allTokens = await this.getAllTokens();
      const token = allTokens.find(t => t.token_id === tokenId);
      
      if (!token) {
        return null;
      }
      
      // Add detailed information from the token file
      let detailedData = null;
      
      try {
        // First try to get enhanced data
        const tokenFiles = fs.readdirSync(this.summariesDir)
          .filter(file => file.includes(tokenId) && file.includes('_enhanced_refined.json'));
        
        if (tokenFiles.length > 0) {
          detailedData = JSON.parse(fs.readFileSync(path.join(this.summariesDir, tokenFiles[0]), 'utf8'));
        } else {
          // If enhanced data not found, try to get raw data
          const rawFiles = fs.readdirSync(this.advancedDir)
            .filter(file => file.includes(tokenId) && file.includes('_maestro_asset.json'));
            
          if (rawFiles.length > 0) {
            detailedData = JSON.parse(fs.readFileSync(path.join(this.advancedDir, rawFiles[0]), 'utf8'));
          }
        }
      } catch (error) {
        console.error(`Error reading detailed token data for ${tokenId}:`, error.message);
      }
      
      // Get detailed volume data
      let volumeData = null;
      try {
        volumeData = await volumeService.getTokenVolume(tokenId);
      } catch (error) {
        console.error(`Error getting volume data for ${tokenId}:`, error.message);
      }
      
      // Is this a wrapped token?
      const wrappedTokenInfo = Object.values(this.wrappedTokens)
        .find(wt => wt.tokenId === tokenId);
        
      return {
        ...token,
        is_wrapped_token: !!wrappedTokenInfo,
        base_asset: wrappedTokenInfo?.baseAsset || null,
        detailed: detailedData,
        volume_details: volumeData
      };
    } catch (error) {
      console.error(`Error getting token ${tokenId}:`, error);
      return null; // Return null instead of throwing
    }
  }

  /**
   * Search for tokens by ticker or name
   * @param {string} query - Search query
   * @returns {Promise<Array>} Matching tokens
   */
  async searchTokens(query) {
    if (!query || query.trim() === '') {
      return [];
    }
    
    try {
      const allTokens = await this.getAllTokens();
      query = query.toLowerCase();
      
      return allTokens.filter(token => 
        (token.ticker && token.ticker.toLowerCase().includes(query)) || 
        (token.name && token.name.toLowerCase().includes(query))
      );
    } catch (error) {
      console.error(`Error searching tokens with query "${query}":`, error);
      return []; // Return empty array instead of throwing
    }
  }

  /**
   * Get token summary statistics
   * @returns {Promise<Object>} Token statistics
   */
  async getTokenStats() {
    try {
      const allTokens = await this.getAllTokens();
      const volumeStats = await volumeService.getVolumeStats();
      
      // Calculate statistics
      const stats = {
        total: allTokens.length,
        with_market_cap: allTokens.filter(t => t.has_market_cap).length,
        without_market_cap: allTokens.filter(t => !t.has_market_cap).length,
        with_liquidity: allTokens.filter(t => t.liquidity && t.liquidity > 0).length,
        high_trust: allTokens.filter(t => t.trust_score && t.trust_score >= 80).length,
        timestamp: new Date().toISOString()
      };

      // Add market cap ranges
      const marketCaps = allTokens
        .filter(t => t.has_market_cap && t.market_cap)
        .map(t => t.market_cap);
      
      stats.market_cap_ranges = {
        under_1k: marketCaps.filter(mc => mc < 1000).length,
        under_10k: marketCaps.filter(mc => mc >= 1000 && mc < 10000).length,
        under_100k: marketCaps.filter(mc => mc >= 10000 && mc < 100000).length,
        under_1m: marketCaps.filter(mc => mc >= 100000 && mc < 1000000).length,
        over_1m: marketCaps.filter(mc => mc >= 1000000).length
      };

      // Add liquidity ranges
      const liquidities = allTokens
        .filter(t => t.liquidity && t.liquidity > 0)
        .map(t => t.liquidity);
      
      stats.liquidity_ranges = {
        under_1k: liquidities.filter(l => l < 1000).length,
        under_10k: liquidities.filter(l => l >= 1000 && l < 10000).length,
        under_100k: liquidities.filter(l => l >= 10000 && l < 100000).length,
        under_1m: liquidities.filter(l => l >= 100000 && l < 1000000).length,
        over_1m: liquidities.filter(l => l >= 1000000).length
      };
      
      // Add volume statistics
      stats.volume = {
        total_volume_in_ada: volumeStats.total_volume_in_ada,
        total_order_count: volumeStats.total_order_count,
        total_tokens_with_volume: volumeStats.total_tokens_with_volume,
        volume_ranges: volumeStats.volume_ranges,
        time_window: volumeStats.time_window
      };

      return stats;
    } catch (error) {
      console.error('Error getting token statistics:', error);
      return {
        total: 0,
        with_market_cap: 0,
        without_market_cap: 0,
        with_liquidity: 0,
        high_trust: 0,
        timestamp: new Date().toISOString(),
        market_cap_ranges: {
          under_1k: 0,
          under_10k: 0,
          under_100k: 0,
          under_1m: 0,
          over_1m: 0
        },
        liquidity_ranges: {
          under_1k: 0,
          under_10k: 0,
          under_100k: 0,
          under_1m: 0,
          over_1m: 0
        },
        volume: {
          total_volume_in_ada: 0,
          total_order_count: 0,
          total_tokens_with_volume: 0,
          volume_ranges: {
            under_1k: 0,
            under_10k: 0,
            under_100k: 0,
            under_1m: 0,
            over_1m: 0
          },
          time_window: {
            from: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
            to: new Date().toISOString()
          }
        }
      };
    }
  }

  /**
   * Refresh TVL (Total Value Locked) data for all tokens
   * This will recalculate the TVL values and update them
   * @returns {Promise<boolean>} True if successful
   */
  async refreshTvlData() {
    console.log("Starting TVL data refresh...");
    try {
      // Check current date to verify correct timestamp
      const currentDate = new Date();
      console.log(`Current timestamp: ${currentDate.toISOString()}`);
      
      // Force a refresh of the token data to get latest liquidity values
      this.lastCacheTime = 0; // Invalidate cache
      const allTokens = await this.getAllTokens();
      
      console.log(`Recalculating TVL for ${allTokens.length} tokens`);
      
      // Count tokens with valid TVL
      const tokensWithTvl = allTokens.filter(token => token.tvl && token.tvl > 0).length;
      
      console.log(`Refreshed TVL data for ${tokensWithTvl} tokens at ${currentDate.toISOString()}`);
      
      // No need to save anything as getAllTokens() already calculates TVL values
      // The next time tokens are fetched, they'll have the updated TVL values
      
      return true;
    } catch (error) {
      console.error("Error refreshing TVL data:", error);
      return false;
    }
  }

  /**
   * Clear all caches to force fresh data on next request
   */
  clearCache() {
    console.log('Clearing token service cache...');
    this.lastCacheTime = 0;
    this.cachedTokens = null;
    this.hasCachedData = false;
    this.allTokensSorted = null;
    return true;
  }

  /**
   * Lightweight method to refresh token data specifically for Vercel environment
   * This method fetches only critical tokens and updates their data to avoid timeout
   * @returns {Promise<boolean>} True if successful
   */
  async lightweightTokenRefresh() {
    console.log("Starting lightweight token refresh for Vercel environment...");
    try {
      // Clear cache to ensure we return fresh data
      this.clearCache();
      
      // Only process the top tokens by market cap to stay within timeout limits
      const topTokenIds = [
        // SNEK
        "279c909f348e533da5808898f87f9a14bb2c3dfbbacccd631d927a3f534e454b",
        // HOSKY
        "a0028f350aaabe0545fdcb56b039bfb08e4bb4d8c4d7c3c7d481c235484f534b59",
        // DJED
        "8db269c3ec630e06ae29f74bc39edd1f87c819f1056206e879a1cd61446a6564",
        // MELD
        "6ac8ef33b510ec004fe11585f7c5a9f0c07f0c23428ab4f29c1d7d104d454c44",
        // IBTC
        "f66d78b4a3cb3d37afa0ec36461e51ecbde00f26c8f0a68f94b6988069425443",
        // Add more top tokens as needed
      ];
      
      // Use axios for making API requests
      const axios = require('axios');
      
      // DexHunter API client configuration
      const dexhunterApiKey = process.env.REACT_APP_DEXHUNTER_PARTNER_ID;
      const dexhunterClient = axios.create({
        baseURL: 'https://api-us.dexhunterv3.app',
        headers: {
          'Content-Type': 'application/json',
          'X-Partner-Id': dexhunterApiKey
        }
      });
      
      // Process each token
      const updatedTokens = [];
      
      for (const tokenId of topTokenIds) {
        try {
          console.log(`Processing token ${tokenId}...`);
          
          // Get token metadata
          const tokenResponse = await dexhunterClient.get(`/swap/token/${tokenId}`);
          
          if (tokenResponse.data) {
            const tokenData = tokenResponse.data;
            
            // Get token price
            const priceResponse = await dexhunterClient.get(`/swap/tokenPrice/${tokenId}`);
            
            // Calculate two-sided liquidity (TVL)
            let adaLiquidity = parseFloat(tokenData.liquidity) || 0;
            let tvl = adaLiquidity * 2; // Double the ADA side as an approximation of TVL
            
            // Create token entry
            const token = {
              token_id: tokenId,
              ticker: tokenData.ticker || 'UNKNOWN',
              name: tokenData.name || tokenData.ticker || 'UNKNOWN',
              market_cap: parseFloat(tokenData.market_cap) || null,
              price: parseFloat(priceResponse.data?.price) || null,
              liquidity: adaLiquidity || null,
              tvl: tvl || null,
              pool_count: parseInt(tokenData.pool_count) || 0,
              trust_score: 100, // Default score
              has_market_cap: !!parseFloat(tokenData.market_cap),
            };
            
            // Add to updated tokens array
            updatedTokens.push(token);
            
            console.log(`Successfully updated token ${token.ticker}`);
          }
        } catch (tokenError) {
          console.error(`Error processing token ${tokenId}:`, tokenError.message);
        }
      }
      
      // Sort tokens by market cap (descending)
      updatedTokens.sort((a, b) => {
        if (a.market_cap && b.market_cap) {
          return b.market_cap - a.market_cap;
        }
        return a.market_cap ? -1 : 1;
      });
      
      // Update the in-memory cache
      // Note: In Vercel we can't write to the filesystem, so we just update the in-memory cache
      this.cachedTokens = updatedTokens;
      this.lastCacheTime = Date.now();
      
      console.log(`Lightweight token refresh completed with ${updatedTokens.length} tokens`);
      return true;
    } catch (error) {
      console.error("Error in lightweight token refresh:", error);
      return false;
    }
  }
}

module.exports = new TokenService(); 