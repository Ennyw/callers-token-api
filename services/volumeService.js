const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

/**
 * Service to handle token volume operations
 */
class VolumeService {
  constructor() {
    this.volumeDataPath = path.join(process.cwd(), 'fixed_token_volumes.json');
    this.cachedVolumeData = null;
    this.lastCacheTime = null;
    this.cacheDuration = 5 * 60 * 1000; // 5 minutes cache
    
    // DexHunter API client configuration
    this.dexhunterApiKey = process.env.REACT_APP_DEXHUNTER_PARTNER_ID;
    this.dexhunterClient = axios.create({
      baseURL: 'https://api-us.dexhunterv3.app',
      headers: {
        'Content-Type': 'application/json',
        'X-Partner-Id': this.dexhunterApiKey
      }
    });
    
    // Constants
    this.MAX_PAGES = 100; // Limit to 100 pages to avoid excessive API calls
    this.PER_PAGE = 50; // 50 orders per page
  }

  /**
   * Get all token volume data
   * @returns {Promise<Object>} Volume data
   */
  async getVolumeData() {
    // Use cache if available and not expired
    if (this.cachedVolumeData && this.lastCacheTime && 
        (Date.now() - this.lastCacheTime < this.cacheDuration)) {
      return this.cachedVolumeData;
    }

    try {
      // Read the volume data file
      let volumeData;
      try {
        if (fs.existsSync(this.volumeDataPath)) {
          const fileContent = fs.readFileSync(this.volumeDataPath, 'utf8');
          volumeData = JSON.parse(fileContent);
        } else {
          console.log(`Volume data file not found at ${this.volumeDataPath}, returning empty data`);
          // Return empty data structure instead of trying to refresh
          volumeData = {
            timestamp: new Date().toISOString(),
            time_window: {
              from: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
              to: new Date().toISOString()
            },
            total_tokens: 0,
            tokens: []
          };
        }
      } catch (error) {
        console.error(`Error reading volume data at ${this.volumeDataPath}:`, error.message);
        console.error('Working directory:', process.cwd());
        
        // Return empty data structure instead of trying to refresh
        volumeData = {
          timestamp: new Date().toISOString(),
          time_window: {
            from: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
            to: new Date().toISOString()
          },
          total_tokens: 0,
          tokens: []
        };
      }
      
      // Cache the result
      this.cachedVolumeData = volumeData;
      this.lastCacheTime = Date.now();
      
      return volumeData;
    } catch (error) {
      console.error('Error loading volume data:', error);
      return {
        timestamp: new Date().toISOString(),
        time_window: {
          from: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          to: new Date().toISOString()
        },
        total_tokens: 0,
        tokens: []
      };
    }
  }

  /**
   * Get volume data for a specific token
   * @param {string} tokenId - Token ID
   * @returns {Promise<Object|null>} Volume data or null if not found
   */
  async getTokenVolume(tokenId) {
    try {
      const volumeData = await this.getVolumeData();
      const tokenVolume = volumeData.tokens.find(t => t.tokenId === tokenId);
      
      return tokenVolume || {
        tokenId,
        volumeInAda: 0,
        volumeInToken: 0,
        orderCount: 0
      };
    } catch (error) {
      console.error(`Error getting volume for token ${tokenId}:`, error);
      return null;
    }
  }

  /**
   * Get top tokens by volume
   * @param {number} limit - Number of tokens to return
   * @returns {Promise<Array>} Top tokens by volume
   */
  async getTopTokensByVolume(limit = 50) {
    try {
      const volumeData = await this.getVolumeData();
      
      // Sort by volume in ADA (descending)
      const sortedTokens = [...volumeData.tokens]
        .sort((a, b) => b.volumeInAda - a.volumeInAda)
        .slice(0, limit);
      
      return sortedTokens;
    } catch (error) {
      console.error(`Error getting top ${limit} tokens by volume:`, error);
      return []; 
    }
  }

  /**
   * Refresh token volume data by fetching from DexHunter API
   * @param {boolean} [isVercel=false] - Whether this is running in Vercel environment
   * @returns {Promise<Object>} Updated volume data
   */
  async refreshVolumeData(isVercel = false) {
    try {
      console.log("Starting token volume calculation with 24-hour window...");
      
      // Create exact 24-hour time window
      const now = new Date();
      const twentyFourHoursAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));
      
      console.log("Time window for volume calculation:");
      console.log(`From: ${twentyFourHoursAgo.toISOString()}`);
      console.log(`To:   ${now.toISOString()}`);

      // For Vercel, use a lighter-weight approach that won't time out
      if (isVercel || process.env.VERCEL) {
        console.log("Using lightweight volume refresh for Vercel environment");
        return await this.lightweightVolumeRefresh(twentyFourHoursAgo, now);
      }
      
      // Get all orders for the past 24 hours
      const allOrders = await this.getAllOrders(twentyFourHoursAgo, now);
      
      // Extract unique token IDs from orders
      const uniqueTokenIds = this.extractUniqueTokenIds(allOrders);
      
      // Get token information for all IDs
      const tokenInfo = await this.getTokenInfoBatch(uniqueTokenIds);
      
      // Calculate volumes for all tokens
      const volumeByToken = this.calculateAllVolumes(allOrders, tokenInfo);
      
      // Convert to array and sort by volume in ADA
      const sortedResults = Object.values(volumeByToken)
        .filter(token => token.orderCount > 0)
        .sort((a, b) => b.volumeInAda - a.volumeInAda);
      
      // Create the result object
      const result = {
        timestamp: new Date().toISOString(),
        time_window: {
          from: twentyFourHoursAgo.toISOString(),
          to: now.toISOString()
        },
        total_tokens: sortedResults.length,
        tokens: sortedResults
      };
      
      // Save to file
      fs.writeFileSync(this.volumeDataPath, JSON.stringify(result, null, 2));
      
      console.log(`Volume data updated with ${sortedResults.length} tokens`);
      return result;
    } catch (error) {
      console.error("Error refreshing volume data:", error);
      throw error;
    }
  }

  /**
   * Lightweight volume refresh that only processes top tokens
   * Designed to complete within Vercel function timeout limits
   * @param {Date} fromTime - Start time
   * @param {Date} toTime - End time
   * @returns {Promise<Object>} Updated volume data
   */
  async lightweightVolumeRefresh(fromTime, toTime) {
    try {
      console.log("Starting lightweight volume refresh...");
      
      // Only process the top 20 tokens by market cap to stay within timeout limits
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
      
      // Store volume results
      const volumeResults = [];
      
      // Process each token
      for (const tokenId of topTokenIds) {
        try {
          // Get volume directly using DexHunter API for this token
          const response = await this.dexhunterClient.get(`/swap/tokenVolume/${tokenId}`);
          
          if (response.data && response.data.volume_in_lovelace) {
            const volumeInAda = parseInt(response.data.volume_in_lovelace) / 1000000;
            const volumeInToken = parseInt(response.data.volume_in_token) || 0;
            const orderCount = parseInt(response.data.order_count) || 0;
            
            volumeResults.push({
              tokenId,
              volumeInAda,
              volumeInToken,
              orderCount
            });
            
            console.log(`Processed volume for token ${tokenId}: ₳${volumeInAda.toFixed(2)}`);
          }
        } catch (tokenError) {
          console.error(`Error processing volume for token ${tokenId}:`, tokenError.message);
        }
      }
      
      // Create the result object
      const result = {
        timestamp: new Date().toISOString(),
        time_window: {
          from: fromTime.toISOString(),
          to: toTime.toISOString()
        },
        total_tokens: volumeResults.length,
        tokens: volumeResults
      };
      
      // In Vercel we can't write to filesystem, so we just return the result
      if (process.env.VERCEL) {
        console.log(`Lightweight volume refresh completed with ${volumeResults.length} tokens`);
        // Update cache
        this.cachedVolumeData = result;
        this.lastCacheTime = Date.now();
        return result;
      }
      
      // Save to file when running locally
      fs.writeFileSync(this.volumeDataPath, JSON.stringify(result, null, 2));
      
      console.log(`Lightweight volume refresh completed with ${volumeResults.length} tokens`);
      return result;
    } catch (error) {
      console.error("Error in lightweight volume refresh:", error);
      throw error;
    }
  }

  /**
   * Get all orders for the past 24 hours with pagination
   * @param {Date} fromTime - Start time
   * @param {Date} toTime - End time
   * @returns {Promise<Array>} All orders
   */
  async getAllOrders(fromTime, toTime) {
    let allOrders = [];
    let hasMoreOrders = true;
    let currentPage = 0;
    
    console.log(`Fetching orders from the past 24 hours...`);
    
    while (hasMoreOrders && currentPage < this.MAX_PAGES) {
      try {
        console.log(`Fetching page ${currentPage}...`);
        
        const response = await this.dexhunterClient.post("/swap/globalOrders", {
          page: currentPage,
          perPage: this.PER_PAGE,
          filters: [
            {
              filterType: "STATUS",
              values: ["COMPLETE"] // Only consider completed orders
            }
          ],
          orderSorts: "STARTTIME",
          sortDirection: "DESC"
        });
        
        const orders = response.data.orders || [];
        
        // Filter orders from past 24 hours using ISO string comparison
        const recentOrders = orders.filter(order => {
          const orderTime = new Date(order.submission_time);
          return orderTime >= fromTime && orderTime <= toTime;
        });
        
        allOrders = [...allOrders, ...recentOrders];
        
        // Check if we should continue pagination
        if (orders.length < this.PER_PAGE || 
            (orders.length > 0 && new Date(orders[orders.length - 1].submission_time) < fromTime)) {
          hasMoreOrders = false;
        }
        
        currentPage++;
        
        // Wait to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.error(`Error fetching orders page ${currentPage}:`, error.message);
        hasMoreOrders = false;
      }
    }
    
    console.log(`Total orders fetched: ${allOrders.length}`);
    return allOrders;
  }

  /**
   * Extract unique token IDs from orders
   * @param {Array} orders - Orders to process
   * @returns {Array} Unique token IDs
   */
  extractUniqueTokenIds(orders) {
    const uniqueTokenIds = new Set();
    const lovelaceId = "000000000000000000000000000000000000000000000000000000006c6f76656c616365"; // ADA token ID
    
    // Add Lovelace/ADA explicitly
    uniqueTokenIds.add(lovelaceId);
    
    // Extract all token IDs from orders
    orders.forEach(order => {
      if (order.token_id_in) uniqueTokenIds.add(order.token_id_in);
      if (order.token_id_out) uniqueTokenIds.add(order.token_id_out);
    });
    
    console.log(`Found ${uniqueTokenIds.size} unique token IDs in orders`);
    return Array.from(uniqueTokenIds);
  }

  /**
   * Get token information for a token ID
   * @param {string} tokenId - Token ID
   * @returns {Promise<Object>} Token info
   */
  async getTokenInfo(tokenId) {
    try {
      // Handle Lovelace (ADA) specially
      if (tokenId === "000000000000000000000000000000000000000000000000000000006c6f76656c616365") {
        return {
          token_id: tokenId,
          token_ascii: "Cardano",
          ticker: "ADA",
          is_verified: true
        };
      }
      
      const response = await this.dexhunterClient.get(`/swap/token/${tokenId}`);
      return response.data;
    } catch (error) {
      console.error(`Error getting token info for ${tokenId}:`, error.message);
      return {
        token_id: tokenId,
        token_ascii: "Unknown",
        ticker: "Unknown",
        is_verified: false
      };
    }
  }

  /**
   * Get token information for all IDs in batches
   * @param {Array} tokenIds - Token IDs
   * @returns {Promise<Object>} Token info
   */
  async getTokenInfoBatch(tokenIds) {
    const tokenInfo = {};
    const batchSize = 5; // Process 5 tokens at a time to avoid rate limiting
    
    console.log("Fetching token information...");
    
    // Process in batches
    for (let i = 0; i < tokenIds.length; i += batchSize) {
      const batch = tokenIds.slice(i, i + batchSize);
      console.log(`Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(tokenIds.length/batchSize)}`);
      
      // Process each token in the batch
      await Promise.all(batch.map(async (tokenId) => {
        try {
          const info = await this.getTokenInfo(tokenId);
          if (info) {
            tokenInfo[tokenId] = info;
          }
        } catch (err) {
          console.error(`Error in batch processing for ${tokenId}:`, err.message);
        }
      }));
      
      // Delay between batches to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log(`Retrieved information for ${Object.keys(tokenInfo).length} tokens`);
    return tokenInfo;
  }

  /**
   * Calculate trading volume for all tokens
   * @param {Array} orders - Orders to process
   * @param {Object} tokenInfo - Token info
   * @returns {Object} Volume by token
   */
  calculateAllVolumes(orders, tokenInfo) {
    const volumeByToken = {};
    const lovelaceId = "000000000000000000000000000000000000000000000000000000006c6f76656c616365";
    
    console.log("Calculating volumes for all tokens...");
    
    // Initialize volume tracking for all tokens found in orders
    Object.keys(tokenInfo).forEach(tokenId => {
      const info = tokenInfo[tokenId];
      volumeByToken[tokenId] = {
        tokenId: tokenId,
        name: info.ticker || info.token_ascii || tokenId.substring(0, 10),
        volumeInAda: 0,
        volumeInToken: 0,
        orderCount: 0,
        tokenInfo: info
      };
    });
    
    // Process each order
    orders.forEach(order => {
      const tokenIdIn = order.token_id_in;
      const tokenIdOut = order.token_id_out;
      
      // Skip invalid orders
      if (!tokenIdIn || !tokenIdOut) return;
      
      // Handle token being sold (in)
      if (volumeByToken[tokenIdIn]) {
        volumeByToken[tokenIdIn].volumeInToken += parseFloat(order.amount_in || 0);
        volumeByToken[tokenIdIn].orderCount++;
        
        // If sold for ADA, add to ADA volume
        if (tokenIdOut === lovelaceId) {
          volumeByToken[tokenIdIn].volumeInAda += parseFloat(order.actual_out_amount || 0);
        }
      }
      
      // Handle token being bought (out)
      if (volumeByToken[tokenIdOut]) {
        volumeByToken[tokenIdOut].orderCount++;
        
        // If bought with ADA, add to ADA volume and token volume
        if (tokenIdIn === lovelaceId) {
          volumeByToken[tokenIdOut].volumeInAda += parseFloat(order.amount_in || 0);
          if (order.actual_out_amount) {
            volumeByToken[tokenIdOut].volumeInToken += parseFloat(order.actual_out_amount || 0);
          }
        }
      }
    });
    
    return volumeByToken;
  }

  /**
   * Get volume statistics
   * @returns {Promise<Object>} Volume statistics
   */
  async getVolumeStats() {
    try {
      const volumeData = await this.getVolumeData();
      
      // Calculate total volume
      const totalVolumeInAda = volumeData.tokens.reduce((sum, token) => sum + token.volumeInAda, 0);
      const totalOrderCount = volumeData.tokens.reduce((sum, token) => sum + token.orderCount, 0);
      
      // Calculate volume ranges
      const volumes = volumeData.tokens.map(t => t.volumeInAda);
      
      // Return statistics
      return {
        timestamp: volumeData.timestamp,
        time_window: volumeData.time_window,
        total_tokens_with_volume: volumeData.total_tokens,
        total_volume_in_ada: totalVolumeInAda,
        total_order_count: totalOrderCount,
        volume_ranges: {
          under_1k: volumes.filter(v => v < 1000).length,
          under_10k: volumes.filter(v => v >= 1000 && v < 10000).length,
          under_100k: volumes.filter(v => v >= 10000 && v < 100000).length,
          under_1m: volumes.filter(v => v >= 100000 && v < 1000000).length,
          over_1m: volumes.filter(v => v >= 1000000).length
        }
      };
    } catch (error) {
      console.error('Error getting volume statistics:', error);
      return {
        timestamp: new Date().toISOString(),
        time_window: {
          from: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          to: new Date().toISOString()
        },
        total_tokens_with_volume: 0,
        total_volume_in_ada: 0,
        total_order_count: 0,
        volume_ranges: {
          under_1k: 0,
          under_10k: 0,
          under_100k: 0,
          under_1m: 0,
          over_1m: 0
        }
      };
    }
  }

  /**
   * Clear all caches to force fresh data on next request
   */
  clearCache() {
    console.log('Clearing volume service cache...');
    this.lastCacheTime = 0;
    this.cachedVolumeData = null;
    return true;
  }
}

module.exports = new VolumeService(); 