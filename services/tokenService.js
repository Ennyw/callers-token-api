const fs = require('fs');
const path = require('path');
const volumeService = require('./volumeService');

// Conditionally import Supabase client
let supabaseClient;
try {
  // Try CommonJS import first
  const { createClient } = require('@supabase/supabase-js');
  supabaseClient = createClient;
} catch (error) {
  console.error('Error importing Supabase client:', error);
}

/**
 * Service to handle token operations
 */
class TokenService {
  constructor() {
    this.reportPath = path.join(process.cwd(), 'token_data/market_cap_report_refined.json');
    this.summariesDir = path.join(process.cwd(), 'token_data/summaries');
    this.advancedDir = path.join(process.cwd(), 'advanced_token_data/raw');
    
    // Initialize Supabase client
    try {
      if (!process.env.REACT_APP_SUPABASE_URL || !process.env.REACT_APP_SUPABASE_ANON_KEY) {
        console.error('❌ Missing Supabase credentials in environment variables');
        console.error('SUPABASE_URL exists:', !!process.env.REACT_APP_SUPABASE_URL);
        console.error('SUPABASE_ANON_KEY exists:', !!process.env.REACT_APP_SUPABASE_ANON_KEY);
      } else if (supabaseClient) {
        console.log('✅ Supabase credentials found in environment variables');
        this.supabase = supabaseClient(
          process.env.REACT_APP_SUPABASE_URL,
          process.env.REACT_APP_SUPABASE_ANON_KEY
        );
        console.log('✅ Supabase client initialized');
      } else {
        console.error('❌ Supabase client import failed');
      }
    } catch (error) {
      console.error('❌ Error initializing Supabase client:', error);
    }
    
    // Log the paths being used
    console.log('📁 TokenService paths:', {
      reportPath: this.reportPath,
      summariesDir: this.summariesDir,
      advancedDir: this.advancedDir,
      cwd: process.cwd(),
      useSupabase: !!process.env.VERCEL
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
      // If running on Vercel, use Supabase
      if (process.env.VERCEL) {
        console.log('📊 Fetching tokens from Supabase');
        
        try {
          const { data, error } = await this.supabase
            .from('tokens')
            .select('*')
            .order('market_cap', { ascending: false });
            
          if (error) {
            throw error;
          }
          
          if (data && data.length > 0) {
            console.log(`📊 Retrieved ${data.length} tokens from Supabase`);
            console.log('🔍 First 3 tokens:', data.slice(0, 3).map(t => ({
              ticker: t.ticker,
              market_cap: t.market_cap,
              price: t.price
            })));
            
            // Add rank property based on market cap order
            const tokensWithRank = data.map((token, index) => ({
              ...token,
              rank: index + 1
            }));
            
            // Cache the results
            this.cachedTokens = tokensWithRank;
            this.lastCacheTime = Date.now();
            
            return tokensWithRank;
          } else {
            console.log('⚠️ No tokens found in Supabase, falling back to file-based data');
            // Fall back to file-based approach
          }
        } catch (supabaseError) {
          console.error('❌ Error fetching from Supabase:', supabaseError);
          console.log('⚠️ Falling back to file-based approach');
        }
      }
      
      // File-based approach (fallback or local dev)
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
      console.error('Error in getAllTokens:', error);
      return [];
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
   * Clear token cache to force fresh data on next request
   */
  clearCache() {
    console.log('🧹 Clearing token cache');
    this.cachedTokens = null;
    this.lastCacheTime = null;
  }

  /**
   * Lightweight token refresh method for Vercel
   * @returns {Promise<boolean>} Success status
   */
  async lightweightTokenRefresh() {
    try {
      console.log('[VERCEL] 🔄 Starting simplified lightweight token refresh');
      console.log('[VERCEL] Environment check: SUPABASE_URL exists:', !!process.env.REACT_APP_SUPABASE_URL);
      console.log('[VERCEL] Environment check: SUPABASE_ANON_KEY exists:', !!process.env.REACT_APP_SUPABASE_ANON_KEY);
      
      // Skip if no Supabase client
      if (!this.supabase) {
        console.error('[VERCEL] ❌ No Supabase client available - will try to create a new connection');
        
        // Try to initialize Supabase client if credentials are available
        if (process.env.REACT_APP_SUPABASE_URL && process.env.REACT_APP_SUPABASE_ANON_KEY && supabaseClient) {
          try {
            this.supabase = supabaseClient(
              process.env.REACT_APP_SUPABASE_URL,
              process.env.REACT_APP_SUPABASE_ANON_KEY
            );
            console.log('[VERCEL] ✅ Successfully created new Supabase client');
          } catch (supabaseError) {
            console.error('[VERCEL] ❌ Failed to create Supabase client:', supabaseError);
          }
        }
        
        // If still no Supabase client, log message but continue with other operations
        if (!this.supabase) {
          console.log('[VERCEL] ⚠️ Will continue without Supabase - token updates will not be persisted');
        }
      }
      
      // Simple test - just update SNEK token with current timestamp
      const snekTokenId = '279c909f348e533da5808898f87f9a14bb2c3dfbbacccd631d927a3f534e454b';
      
      // Import axios for DexHunter API
      const axios = require('axios');
      const DEXHUNTER_API_KEY = process.env.REACT_APP_DEXHUNTER_PARTNER_ID;
      
      if (!DEXHUNTER_API_KEY) {
        console.error('[VERCEL] ❌ Missing DexHunter API key');
        return false;
      }
      
      // DexHunter client for getting token data
      const dexhunterClient = axios.create({
        baseURL: 'https://api-us.dexhunterv3.app',
        headers: {
          'Content-Type': 'application/json',
          'X-Partner-Id': DEXHUNTER_API_KEY
        }
      });
      
      console.log('[VERCEL] 🔍 Fetching SNEK token data from DexHunter');
      const response = await dexhunterClient.get(`/swap/token/${snekTokenId}`);
      
      if (!response.data) {
        console.error('[VERCEL] ❌ No data returned from DexHunter');
        return false;
      }
      
      // Get price
      const priceResponse = await dexhunterClient.get(`/swap/tokenPrice/${snekTokenId}`);
      const price = priceResponse.data?.price || response.data.price || 0;
      
      console.log('[VERCEL] 🐍 Got SNEK price:', price);
      
      // Simple token entry with minimal data
      const tokenData = {
        token_id: snekTokenId,
        ticker: 'SNEK',
        name: 'Snek',
        price: price,
        market_cap: price * 74436003153, // Using known circulating supply
        updated_at: new Date().toISOString()
      };
      
      // Only try to update Supabase if we have a client
      if (this.supabase) {
        console.log('[VERCEL] 💾 Updating SNEK token in Supabase');
        
        // Simple upsert just one token
        const { error } = await this.supabase
          .from('tokens')
          .upsert([tokenData], { 
            onConflict: 'token_id',
            returning: 'minimal' 
          });
          
        if (error) {
          console.error('[VERCEL] ❌ Error upserting SNEK token to Supabase:', error);
          return false;
        }
        
        console.log('[VERCEL] ✅ Successfully updated SNEK token in Supabase');
      } else {
        console.log('[VERCEL] ⚠️ Skipping Supabase update since no client is available');
        console.log('[VERCEL] 📝 Token data that would have been updated:', tokenData);
      }
      
      // Clear cache 
      this.clearCache();
      
      return true;
    } catch (error) {
      console.error('[VERCEL] ❌ Error in simplified lightweightTokenRefresh:', error);
      console.error('[VERCEL] Stack trace:', error.stack);
      return false;
    }
  }

  /**
   * Reinitialize the Supabase client with current environment variables
   * Used when credentials are updated at runtime
   */
  reinitializeSupabase() {
    try {
      if (!process.env.REACT_APP_SUPABASE_URL || !process.env.REACT_APP_SUPABASE_ANON_KEY) {
        console.error('❌ Cannot reinitialize Supabase client - missing credentials');
        return false;
      }
      
      console.log('🔄 Reinitializing Supabase client with updated credentials');
      
      if (supabaseClient) {
        this.supabase = supabaseClient(
          process.env.REACT_APP_SUPABASE_URL,
          process.env.REACT_APP_SUPABASE_ANON_KEY
        );
        console.log('✅ Supabase client reinitialized successfully');
        
        // Clear cache to ensure fresh data on next request
        this.clearCache();
        return true;
      } else {
        console.error('❌ Supabase client function not available');
        return false;
      }
    } catch (error) {
      console.error('❌ Error reinitializing Supabase client:', error);
      return false;
    }
  }

  /**
   * Test Supabase connection by adding a record to a test table
   * @returns {Promise<boolean>} Success status
   */
  async testSupabaseConnection() {
    try {
      if (!this.supabase) {
        console.error('[TEST] ❌ No Supabase client available');
        return false;
      }
      
      console.log('[TEST] 🔍 Testing Supabase connection');
      
      // Try to create a test table first
      try {
        const { error: createError } = await this.supabase.rpc('create_test_table');
        
        if (createError) {
          // If RPC function doesn't exist, log it but continue
          console.warn('[TEST] ⚠️ Error creating test table (RPC may not exist):', createError);
        } else {
          console.log('[TEST] ✅ Test table created successfully');
        }
      } catch (rpcError) {
        console.warn('[TEST] ⚠️ RPC call failed, will try direct table access:', rpcError);
      }
      
      // Simple test record
      const testData = {
        id: Date.now().toString(),
        message: 'Test connection',
        timestamp: new Date().toISOString()
      };
      
      // Try to insert into a test table (assuming it exists)
      const { error: insertError } = await this.supabase
        .from('api_logs')
        .insert([testData]);
        
      if (insertError) {
        console.error('[TEST] ❌ Error inserting test record:', insertError);
        return false;
      }
      
      console.log('[TEST] ✅ Successfully inserted test record into Supabase');
      return true;
    } catch (error) {
      console.error('[TEST] ❌ Error testing Supabase connection:', error);
      return false;
    }
  }
}

module.exports = new TokenService(); 