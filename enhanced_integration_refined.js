// Enhanced Integration Script with Price Outlier Protection and Liquidity Validation
// Uses local token supply data and DexHunter price data to calculate market caps
require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Configuration
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 2000; // 2 seconds between batches
const MAX_REASONABLE_PRICE = 1000; // Maximum reasonable price in ADA
const MIN_REASONABLE_PRICE = 0.000001; // Minimum reasonable price in ADA
const MIN_LIQUIDITY_THRESHOLD = 500; // Minimum ADA liquidity to consider valid
const MAX_MCAP_LIQUIDITY_RATIO = 10000; // Maximum market cap to liquidity ratio
const MIN_POOLS_REQUIRED = 3; // Minimum number of liquidity pools required to be considered legitimate
const HONEYPOT_BLACKLIST = ['f45b5a5a20bb18a37e6e18c4cfe17dbc9be5aa3d6fa0453c06ee8da5c77e80b346455448', 'addr1w9zru...lfqw']; // Known honeypot token IDs
const OUTPUT_DIR = './token_data';
const SUMMARIES_DIR = path.join(OUTPUT_DIR, 'summaries');
const MARKET_CAP_REPORT_FILE = path.join(OUTPUT_DIR, 'market_cap_report_refined.json');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// DexHunter API key
const DEXHUNTER_API_KEY = process.env.REACT_APP_DEXHUNTER_PARTNER_ID;

if (!DEXHUNTER_API_KEY) {
  console.error('ERROR: Missing DexHunter API key in environment variables');
  process.exit(1);
}

console.log('API Keys configured:');
console.log('- DexHunter: Found');

// Initialize API client for DexHunter
const dexhunterClient = axios.create({
  baseURL: 'https://api-us.dexhunterv3.app',
  headers: {
    'Content-Type': 'application/json',
    'X-Partner-Id': DEXHUNTER_API_KEY
  }
});

/**
 * Get all locally stored token data
 * @returns {Promise<Array>} Array of token objects with supply information
 */
async function loadLocalTokenData() {
  try {
    console.log('Loading local token data...');
    
    // Check if summaries directory exists
    if (!fs.existsSync(SUMMARIES_DIR)) {
      console.error(`Error: Summaries directory ${SUMMARIES_DIR} not found`);
      return [];
    }
    
    // Get all JSON files in the summaries directory
    const files = fs.readdirSync(SUMMARIES_DIR)
      .filter(file => file.endsWith('_summary.json'));
    
    console.log(`Found ${files.length} token summary files`);
    
    // Load each token's data
    const tokens = [];
    
    for (const file of files) {
      try {
        const filePath = path.join(SUMMARIES_DIR, file);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        
        // Add only if it has a token_id
        if (data.token_id) {
          tokens.push(data);
        }
      } catch (err) {
        console.error(`Error loading file ${file}:`, err.message);
      }
    }
    
    console.log(`Successfully loaded ${tokens.length} tokens from local storage`);
    return tokens;
  } catch (error) {
    console.error('Error loading local token data:', error.message);
    return [];
  }
}

/**
 * Get basic token information from DexHunter
 * @param {string} tokenId - The token ID
 * @returns {Promise<Object|null>} Token information or null
 */
async function getTokenInfo(tokenId) {
  try {
    const response = await dexhunterClient.get(`/swap/token/${tokenId}`);
    return response.data;
  } catch (error) {
    console.error(`Error getting token info for ${tokenId}:`, error.message);
    return null;
  }
}

/**
 * Calculate weighted average price from liquidity pools with outlier protection
 * @param {string} tokenId - The token ID
 * @returns {Promise<{weightedPrice: number, totalLiquidity: number, filteredOutliers: boolean}>}
 */
async function calculateWeightedPrice(tokenId) {
  try {
    // Get all pools for the token with ADA
    const poolsResponse = await dexhunterClient.get(`/stats/pools/ADA/${tokenId}`);
    const pools = poolsResponse.data;
    
    // NEW: Track if we attempted to use the averagePrice endpoint
    let attemptedAveragePrice = false;
    let averagePriceResult = null;
    
    if (!pools || !Array.isArray(pools) || pools.length === 0) {
      // If no pool data is available, try the averagePrice endpoint
      try {
        console.log(`No pool data for ${tokenId}, trying averagePrice endpoint...`);
        attemptedAveragePrice = true;
        
        const priceResponse = await dexhunterClient.get(`/swap/averagePrice/${tokenId}/ADA`);
        
        if (priceResponse.data && priceResponse.data.price_ba) {
          console.log(`Found price from averagePrice endpoint: ${priceResponse.data.price_ba}`);
          averagePriceResult = {
            weightedPrice: parseFloat(priceResponse.data.price_ba),
            totalLiquidity: 0, // We don't have liquidity information from this endpoint
            filteredOutliers: false,
            poolCount: 0,
            originalPoolCount: 0,
            priceFromAveragePrice: true,
            suspiciousLiquidity: true // Mark as suspicious since no pools were found
          };
        }
        
        // If that fails, try the reverse order (ADA/token)
        if (!averagePriceResult) {
          console.log(`No price_ba data, trying reverse direction...`);
          const reversePriceResponse = await dexhunterClient.get(`/swap/averagePrice/ADA/${tokenId}`);
          
          if (reversePriceResponse.data && reversePriceResponse.data.price_ab) {
            console.log(`Found price from reverse averagePrice endpoint: ${reversePriceResponse.data.price_ab}`);
            averagePriceResult = {
              weightedPrice: parseFloat(reversePriceResponse.data.price_ab),
              totalLiquidity: 0,
              filteredOutliers: false,
              poolCount: 0,
              originalPoolCount: 0,
              priceFromAveragePrice: true,
              suspiciousLiquidity: true // Mark as suspicious since no pools were found
            };
          }
        }
        
        if (averagePriceResult) {
          return averagePriceResult;
        }
      } catch (priceError) {
        console.error(`Error fetching price from averagePrice endpoint for ${tokenId}:`, priceError.message);
      }
      
      return {
        weightedPrice: 0,
        totalLiquidity: 0,
        filteredOutliers: false,
        poolCount: 0,
        originalPoolCount: 0,
        suspiciousLiquidity: true,
        noPoolsFound: true // NEW: Flag to indicate no pools were found
      };
    }
    
    // Step 1: Calculate all individual pool prices
    const poolsWithPrices = pools.map(pool => {
      const adaAmount = parseFloat(pool.token_1_amount || 0);
      const tokenAmount = parseFloat(pool.token_2_amount || 0);
      
      // Skip pools with zero liquidity
      if (adaAmount <= 0 || tokenAmount <= 0) {
        return {
          dex: pool.dex,
          adaAmount: 0,
          tokenAmount: 0,
          price: 0,
          valid: false
        };
      }
      
      // Price is ADA / token amount
      const price = adaAmount / tokenAmount;
      
      return {
        dex: pool.dex,
        adaAmount,
        tokenAmount,
        price,
        valid: true
      };
    }).filter(pool => pool.valid);
    
    // NEW: If pools exist but none have valid prices, this is suspicious
    if (pools.length > 0 && poolsWithPrices.length === 0) {
      // Try the averagePrice endpoint as a fallback
      if (!attemptedAveragePrice) {
        try {
          console.log(`Pools exist but none have valid prices for ${tokenId}, trying averagePrice endpoint...`);
          const priceResponse = await dexhunterClient.get(`/swap/averagePrice/${tokenId}/ADA`);
          
          if (priceResponse.data && priceResponse.data.price_ba) {
            console.log(`Found price from averagePrice endpoint: ${priceResponse.data.price_ba}`);
            return {
              weightedPrice: parseFloat(priceResponse.data.price_ba),
              totalLiquidity: 0,
              filteredOutliers: false,
              poolCount: 0,
              originalPoolCount: pools.length,
              medianUsed: false,
              suspiciousLiquidity: true,
              priceFromAveragePrice: true,
              emptySuspiciousPools: true // NEW: Flag to indicate suspicious empty pools
            };
          }
        } catch (priceError) {
          console.error(`Error fetching price from averagePrice endpoint for ${tokenId} after finding empty pools:`, priceError.message);
        }
      }
      
      return {
        weightedPrice: 0,
        totalLiquidity: 0,
        filteredOutliers: false,
        poolCount: 0,
        originalPoolCount: pools.length,
        suspiciousLiquidity: true,
        emptySuspiciousPools: true // NEW: Flag to indicate suspicious empty pools
      };
    }
    
    // Step 2: Check for and handle extreme price outliers
    const hasExtremeOutliers = poolsWithPrices.some(
      pool => pool.price > MAX_REASONABLE_PRICE || pool.price < MIN_REASONABLE_PRICE
    );
    
    // Filter out extreme prices
    const reasonablePools = hasExtremeOutliers 
      ? poolsWithPrices.filter(pool => 
          pool.price <= MAX_REASONABLE_PRICE && 
          pool.price >= MIN_REASONABLE_PRICE
        )
      : poolsWithPrices;
    
    // If no reasonable pools remain after filtering, use median price
    if (reasonablePools.length === 0) {
      // Sort by price and take the median value
      const sortedPrices = [...poolsWithPrices].sort((a, b) => a.price - b.price);
      const medianPrice = sortedPrices[Math.floor(sortedPrices.length / 2)].price;
      
      // Use the median price, but cap it at the maximum reasonable price
      const cappedPrice = Math.min(medianPrice, MAX_REASONABLE_PRICE);
      
      // Add up all ADA liquidity from original pools
      const totalLiquidity = poolsWithPrices.reduce(
        (sum, pool) => sum + pool.adaAmount, 0
      );
      
      return {
        weightedPrice: cappedPrice,
        totalLiquidity,
        filteredOutliers: true,
        medianUsed: true,
        poolCount: poolsWithPrices.length
      };
    }
    
    // Calculate total ADA liquidity across reasonable pools
    const totalLiquidity = reasonablePools.reduce(
      (sum, pool) => sum + pool.adaAmount, 0
    );
    
    if (totalLiquidity === 0) {
      return {
        weightedPrice: 0,
        totalLiquidity: 0,
        filteredOutliers: hasExtremeOutliers,
        poolCount: reasonablePools.length
      };
    }
    
    // Step 3: Check for suspicious liquidity distribution (honeypot detection)
    let suspiciousLiquidity = false;
    if (reasonablePools.length > 0) {
      // Sort pools by liquidity
      const sortedByLiquidity = [...reasonablePools].sort((a, b) => b.adaAmount - a.adaAmount);
      
      // If there's only one pool or the top pool has more than 95% of all liquidity, it's suspicious
      if (reasonablePools.length === 1 || 
          (sortedByLiquidity[0].adaAmount / totalLiquidity > 0.95)) {
        suspiciousLiquidity = true;
      }
    }
    
    // Calculate weighted average price using only reasonable pools
    const weightedPrice = reasonablePools.reduce((sum, pool) => {
      const weight = pool.adaAmount / totalLiquidity;
      return sum + (pool.price * weight);
    }, 0);
    
    return {
      weightedPrice,
      totalLiquidity,
      filteredOutliers: hasExtremeOutliers,
      poolCount: reasonablePools.length,
      originalPoolCount: pools.length,
      medianUsed: suspiciousLiquidity,
      suspiciousLiquidity,
      priceFromAveragePrice: false
    };
  } catch (error) {
    console.error(`Error calculating weighted price for ${tokenId}:`, error.message);
    return {
      weightedPrice: 0,
      totalLiquidity: 0,
      filteredOutliers: false,
      poolCount: 0,
      error: error.message
    };
  }
}

/**
 * Calculate a trust score for token validation instead of binary filtering
 * @param {string} tokenId - The token ID
 * @param {number} poolCount - Number of liquidity pools
 * @param {boolean} suspiciousLiquidity - Whether liquidity distribution is suspicious
 * @param {number} totalLiquidity - Total ADA liquidity
 * @param {number} marketCap - Calculated market cap
 * @param {number} circulatingSupply - Circulating supply
 * @param {string} ticker - Token ticker
 * @param {number} tokenAge - Token age in days (if available)
 * @returns {Object} Trust score assessment with detailed breakdown
 */
function calculateTrustScore(tokenId, poolCount, suspiciousLiquidity, totalLiquidity, marketCap, circulatingSupply, ticker, tokenAge = 0, priceFromAveragePrice = false) {
  // Start with base score of 100
  let score = 100;
  const penalties = [];
  const bonuses = [];
  
  // Known legitimate tokens whitelist - explicitly trusted
  const TRUSTED_TOKENS = [
    "5b26e685cc5c9ad630bde3e3cd48c694436671f3d25df53777ca60ef4e564c", // NVL
  ];
  
  // Check if token is in whitelist
  if (TRUSTED_TOKENS.includes(tokenId)) {
    bonuses.push({
      reason: 'Token is in trusted whitelist',
      points: 50
    });
    score += 50;
  }
  
  // Check if token is in blacklist
  if (HONEYPOT_BLACKLIST.includes(tokenId)) {
    penalties.push({
      reason: 'Token is in honeypot blacklist',
      points: -100
    });
    score -= 100;
  }
  
  // NEW: Check for copycat token patterns
  if (ticker) {
    const COPYCAT_PATTERNS = [
      /^[Ii][A-Za-z]+$/, // Tokens starting with i like iBTC, iADA
      /^[A-Za-z]+[A-Z]{3,4}$/, // Tokens ending with an all-caps ticker like USDT, BTC
      /^[A-Za-z]+[A-Z]{2,3}[A-Za-z]+$/, // Tokens with embedded tickers like OADA, wBTC
    ];
    
    if (COPYCAT_PATTERNS.some(pattern => pattern.test(ticker)) && marketCap > 1000000) {
      penalties.push({
        reason: 'Possible copycat token with suspicious name pattern',
        points: -25
      });
      score -= 25;
    }
  }
  
  // NEW: Check for supply discrepancies
  if (marketCap > 1000000) {
    if (circulatingSupply === 0 && totalLiquidity > 100000) {
      penalties.push({
        reason: 'High liquidity but zero circulating supply reported',
        points: -50
      });
      score -= 50;
    }
  }
  
  // NEW: Check for price manipulation indicators
  if (totalLiquidity > 0 && marketCap > 0) {
    // Extremely high market cap to liquidity ratio is suspicious
    const ratio = marketCap / totalLiquidity;
    if (ratio > 50 && marketCap > 5000000) {
      penalties.push({
        reason: `Potential price manipulation (${ratio.toFixed(2)}:1 MCap/Liquidity ratio)`,
        points: -40
      });
      score -= 40;
    }
    
    // Low circulating supply with high market cap
    if (circulatingSupply < (totalLiquidity * 0.1) && marketCap > 1000000) {
      penalties.push({
        reason: 'Suspicious circulating supply vs. liquidity ratio',
        points: -30
      });
      score -= 30;
    }
  }
  
  // Special handling for tokens with price from averagePrice endpoint but no pool data
  if (priceFromAveragePrice) {
    // Less severe penalty for having no pools if we still have a price from averagePrice
    if (poolCount === 0) {
      penalties.push({
        reason: 'No liquidity pools found, using fallback price source',
        points: -40  // Reduced from -80
      });
      score -= 40;
      
      // For tokens with high market cap but no pools, still apply caution
      if (marketCap > 1000000) {
        penalties.push({
          reason: 'High market cap with no visible liquidity pools',
          points: -20
        });
        score -= 20;
      }
      
      // For tokens like wrapped BTC that might have legitimate prices from oracles
      // but no direct pools, we can add specific handling
      const WRAPPED_TOKEN_PATTERNS = [
        /^[iwb]btc$/i,  // iBTC, wBTC, WBTC
        /^[iwbe]th$/i,  // iETH, wETH, WETH, ETH
        /^[iw]usdc?$/i, // iUSDC, wUSDC, USDC
        /^[iw]usdt?$/i  // iUSDT, wUSDT, USDT
      ];
      
      if (ticker && WRAPPED_TOKEN_PATTERNS.some(pattern => pattern.test(ticker))) {
        bonuses.push({
          reason: 'Recognized wrapped token pattern',
          points: 30
        });
        score += 30;
      }
    }
  } else {
    // Original pool count assessment for tokens with regular pool data
    if (poolCount === 0) {
      penalties.push({
        reason: 'No liquidity pools found',
        points: -80
      });
      score -= 80;
    } else if (poolCount === 1) {
      penalties.push({
        reason: 'Single liquidity pool',
        points: -30
      });
      score -= 30;
      
      // Additional checks for single-pool tokens
      if (marketCap > 10000000 && circulatingSupply === 0) {
        penalties.push({
          reason: 'High market cap with single pool and no circulating supply data',
          points: -50
        });
        score -= 50;
      }
      
      // Check market cap to liquidity ratio for single pool tokens
      if (marketCap > 0 && totalLiquidity > 0) {
        const ratio = marketCap / totalLiquidity;
        if (ratio > 100) {
          penalties.push({
            reason: `Extremely high market cap to liquidity ratio (${ratio.toFixed(2)}:1)`,
            points: -40
          });
          score -= 40;
        } else if (ratio > 50) {
          penalties.push({
            reason: `High market cap to liquidity ratio (${ratio.toFixed(2)}:1)`,
            points: -20
          });
          score -= 20;
        }
      }
    } else if (poolCount >= 2 && poolCount < MIN_POOLS_REQUIRED) {
      penalties.push({
        reason: `Low number of liquidity pools (${poolCount})`,
        points: -10
      });
      score -= 10;
    } else if (poolCount >= MIN_POOLS_REQUIRED) {
      bonuses.push({
        reason: `Good number of liquidity pools (${poolCount})`,
        points: 10
      });
      score += 10;
    }
  }
  
  // Liquidity assessment
  if (totalLiquidity < 100) {
    penalties.push({
      reason: 'Extremely low liquidity',
      points: -70
    });
    score -= 70;
  } else if (totalLiquidity < 500) {
    penalties.push({
      reason: 'Very low liquidity',
      points: -50
    });
    score -= 50;
  } else if (totalLiquidity < MIN_LIQUIDITY_THRESHOLD) {
    penalties.push({
      reason: `Low liquidity (${totalLiquidity.toFixed(2)} ADA)`,
      points: -30
    });
    score -= 30;
  } else if (totalLiquidity > 100000) {
    bonuses.push({
      reason: 'Very high liquidity',
      points: 20
    });
    score += 20;
  } else if (totalLiquidity > 20000) {
    bonuses.push({
      reason: 'Good liquidity',
      points: 10
    });
    score += 10;
  }
  
  // Suspicious liquidity distribution assessment
  if (suspiciousLiquidity) {
    if (totalLiquidity < 20000) {
      penalties.push({
        reason: 'Suspicious liquidity distribution with low total liquidity',
        points: -30
      });
      score -= 30;
    } else if (totalLiquidity < 50000) {
      penalties.push({
        reason: 'Suspicious liquidity distribution with moderate liquidity',
        points: -15
      });
      score -= 15;
    } else {
      // For high liquidity tokens with suspicious distribution, apply smaller penalty
      penalties.push({
        reason: 'Suspicious liquidity distribution despite significant liquidity',
        points: -5
      });
      score -= 5;
    }
  }
  
  // Market cap to liquidity ratio assessment (for all tokens)
  if (marketCap > 0 && totalLiquidity > 0) {
    const ratio = marketCap / totalLiquidity;
    if (ratio > MAX_MCAP_LIQUIDITY_RATIO) {
      penalties.push({
        reason: `Extreme market cap to liquidity ratio (${ratio.toFixed(2)}:1)`,
        points: -40
      });
      score -= 40;
    }
  }
  
  // Age-based assessment (if available)
  if (tokenAge > 0) {
    if (tokenAge > 365) {
      bonuses.push({
        reason: 'Token has existed for more than a year',
        points: 15
      });
      score += 15;
    } else if (tokenAge > 180) {
      bonuses.push({
        reason: 'Token has existed for more than 6 months',
        points: 10
      });
      score += 10;
    } else if (tokenAge > 30) {
      bonuses.push({
        reason: 'Token has existed for more than a month',
        points: 5
      });
      score += 5;
    }
  }
  
  // Cap the minimum score at 0
  score = Math.max(0, score);
  
  // Determine trust level based on score
  let trustLevel;
  let isHoneypot = false;
  
  if (score < 20) {
    trustLevel = 'Very Low';
    isHoneypot = true;
  } else if (score < 40) {
    trustLevel = 'Low';
    isHoneypot = totalLiquidity < 5000; // Only mark as honeypot if liquidity is also low
  } else if (score < 60) {
    trustLevel = 'Moderate';
    isHoneypot = false;
  } else if (score < 80) {
    trustLevel = 'Good';
    isHoneypot = false;
  } else {
    trustLevel = 'High';
    isHoneypot = false;
  }
  
  return {
    score,
    trustLevel,
    isHoneypot,
    penalties,
    bonuses,
    priceFromAveragePrice
  };
}

/**
 * Legacy honeypot detection for backward compatibility
 * Now uses the new scoring system internally
 */
function checkHoneypot(tokenId, poolCount, suspiciousLiquidity, totalLiquidity, marketCap, circulatingSupply, ticker = "") {
  // Use the new scoring system
  const trustAssessment = calculateTrustScore(
    tokenId, 
    poolCount, 
    suspiciousLiquidity, 
    totalLiquidity, 
    marketCap, 
    circulatingSupply,
    ticker
  );
  
  // For backward compatibility, convert score to honeypot assessment
  if (trustAssessment.isHoneypot) {
    let reason = `Low trust score (${trustAssessment.score}/100, ${trustAssessment.trustLevel} trust)`;
    
    // Add the most severe penalty as additional context
    if (trustAssessment.penalties.length > 0) {
      // Sort penalties by points (ascending, most negative first)
      const sortedPenalties = [...trustAssessment.penalties].sort((a, b) => a.points - b.points);
      reason += `: ${sortedPenalties[0].reason}`;
    }
    
    return {
      isHoneypot: true,
      reason,
      trustScore: trustAssessment.score
    };
  }
  
  return {
    isHoneypot: false,
    trustScore: trustAssessment.score
  };
}

/**
 * Enhanced market cap validation using trust scores
 * @param {number} marketCap - The calculated market cap
 * @param {number} totalLiquidity - The total ADA liquidity
 * @param {Object} trustAssessment - Trust score assessment results
 * @returns {Object} Validation result with validity flag and reasons
 */
function validateMarketCap(marketCap, totalLiquidity, trustAssessment) {
  const result = {
    valid: true,
    reasons: [],
    trustScore: trustAssessment.trustScore || 0
  };
  
  // Consider token valid unless there's a specific reason not to
  
  // NEW: Check for specific honeypot flags from trust assessment
  if (trustAssessment.emptySuspiciousPools) {
    result.valid = false;
    result.reasons.push('Suspicious token: Claims to have pools but no valid liquidity data available');
  }
  
  if (trustAssessment.noPoolsFound && marketCap > 1000000) {
    result.reasons.push('No liquidity pools found despite significant market cap - exercise extreme caution');
  }
  
  // NEW: Check for supply manipulation red flags
  if (trustAssessment.supplyDiscrepancy) {
    result.valid = false;
    result.reasons.push('Suspicious token: Significant discrepancy between reported supply and actual supply');
  }
  
  // Validation 1: Minimum liquidity threshold
  if (totalLiquidity < MIN_LIQUIDITY_THRESHOLD) {
    result.reasons.push(`Insufficient liquidity (${totalLiquidity.toFixed(2)} ADA) - minimum threshold is ${MIN_LIQUIDITY_THRESHOLD} ADA`);
    // Not automatically invalid, but marked as a concern
  }
  
  // Validation 2: Market cap to liquidity ratio
  if (totalLiquidity > 0 && marketCap > 0) {
    const mcapToLiquidityRatio = marketCap / totalLiquidity;
    
    if (mcapToLiquidityRatio > MAX_MCAP_LIQUIDITY_RATIO) {
      result.reasons.push(`Suspicious market cap to liquidity ratio (${mcapToLiquidityRatio.toFixed(2)}:1) - maximum allowed is ${MAX_MCAP_LIQUIDITY_RATIO}:1`);
      
      // NEW: Automatically mark as invalid if the ratio is extremely high
      if (mcapToLiquidityRatio > MAX_MCAP_LIQUIDITY_RATIO * 10) {
        result.valid = false;
        result.reasons.push('Extremely suspicious market cap to liquidity ratio - likely manipulated');
      }
    }
  }
  
  // Validation 3: Trust score assessment
  if (trustAssessment.isHoneypot) {
    result.valid = false;
    result.reasons.push(`Potential honeypot token: ${trustAssessment.reason || 'Low trust score'}`);
  } else if (trustAssessment.trustScore < 40) {
    result.reasons.push(`Low trust score (${trustAssessment.trustScore}/100) - exercise caution`);
    // Not automatically invalid, but marked as a concern
  }
  
  // NEW: Zero circulating supply but claims high market cap
  if (marketCap > 1000000 && (trustAssessment.circulatingSupply === 0 || !trustAssessment.circulatingSupply)) {
    result.reasons.push('High market cap with zero or unreported circulating supply - potential manipulation');
    
    if (marketCap > 5000000) {
      result.valid = false;
      result.reasons.push('Invalid market cap calculation: Cannot have high market cap with zero circulating supply');
    }
  }
  
  // Token is considered valid if it hasn't been marked invalid
  return result;
}

/**
 * Enhance token data with weighted price and calculated market cap
 * @param {Object} token - Token object with supply information
 * @returns {Promise<Object>} Enhanced token data
 */
async function enhanceTokenData(token) {
  try {
    // Get the token info from DexHunter for additional information
    const tokenInfo = await getTokenInfo(token.token_id);
    
    // Calculate weighted price from DexHunter pools with outlier protection
    const { 
      weightedPrice, 
      totalLiquidity, 
      filteredOutliers,
      poolCount,
      originalPoolCount,
      medianUsed,
      suspiciousLiquidity,
      priceFromAveragePrice,
      noPoolsFound,
      emptySuspiciousPools
    } = await calculateWeightedPrice(token.token_id);
    
    // Use the circulating supply if available, otherwise use total supply
    const circulating = token.circulating_supply > 0 ? token.circulating_supply : 0;
    const supply = circulating || token.total_supply || 0;
    
    // Calculate market cap and fully diluted value
    const marketCap = weightedPrice * (circulating || supply);
    const fdv = weightedPrice * (token.total_supply || 0);
    
    // Calculate token age if creation_date is available
    let tokenAge = 0;
    if (tokenInfo && tokenInfo.creation_date) {
      const creationDate = new Date(tokenInfo.creation_date);
      const currentDate = new Date();
      tokenAge = Math.floor((currentDate - creationDate) / (1000 * 60 * 60 * 24)); // in days
    }
    
    // NEW: Check for similar tokens in the database that might be copycats
    let potentialCopycatDetected = false;
    let supplyDiscrepancy = false;
    
    // If this token is claiming to be a wrapped or similar token, check for naming patterns
    if (token.ticker) {
      // Get similar tokens from the cache if we have any
      try {
        const similarTokenFiles = fs.readdirSync(SUMMARIES_DIR)
          .filter(file => file.endsWith('_summary.json') && !file.startsWith(token.token_id));
          
        for (const file of similarTokenFiles) {
          try {
            const similarTokenData = JSON.parse(fs.readFileSync(path.join(SUMMARIES_DIR, file), 'utf8'));
            
            // Check for similar ticker
            if (similarTokenData.ticker && token.ticker && 
                (similarTokenData.ticker.includes(token.ticker) || 
                 token.ticker.includes(similarTokenData.ticker))) {
              
              // If there's a similarity in the ticker but big difference in supply/liquidity
              if (similarTokenData.circulating_supply > 0 && circulating === 0 && 
                  marketCap > 1000000 && totalLiquidity > 100000) {
                console.log(`⚠️ Potential copycat detected: ${token.ticker} might be copying ${similarTokenData.ticker}`);
                potentialCopycatDetected = true;
                supplyDiscrepancy = true;
                break;
              }
            }
          } catch (err) {
            // Skip this file if there's an error
            continue;
          }
        }
      } catch (err) {
        console.error('Error checking for similar tokens:', err.message);
      }
    }
    
    // Get trust assessment using the new scoring system
    const trustAssessment = calculateTrustScore(
      token.token_id,
      poolCount,
      suspiciousLiquidity,
      totalLiquidity,
      marketCap,
      circulating,
      token.ticker,
      tokenAge,
      priceFromAveragePrice
    );
    
    // Add additional detection flags
    trustAssessment.potentialCopycatDetected = potentialCopycatDetected;
    trustAssessment.supplyDiscrepancy = supplyDiscrepancy;
    trustAssessment.noPoolsFound = noPoolsFound;
    trustAssessment.emptySuspiciousPools = emptySuspiciousPools;
    trustAssessment.circulatingSupply = circulating;
    
    // For backward compatibility, convert to honeypot check format
    const honeypotCheck = {
      isHoneypot: trustAssessment.isHoneypot || potentialCopycatDetected,
      reason: trustAssessment.isHoneypot ? 
        `Low trust score (${trustAssessment.score}/100): ${trustAssessment.penalties[0]?.reason || 'Multiple issues detected'}` :
        (potentialCopycatDetected ? 'Potential copycat token detected' : undefined),
      trustScore: trustAssessment.score
    };
    
    // Validate market cap based on trust assessment
    const validation = validateMarketCap(marketCap, totalLiquidity, trustAssessment);
    
    // Calculate market cap to liquidity ratio
    const mcapLiquidityRatio = totalLiquidity > 0 ? (marketCap / totalLiquidity).toFixed(2) : "N/A";
    
    return {
      token_id: token.token_id,
      ticker: token.ticker,
      token_ascii: token.name,
      market_cap: marketCap,
      price: weightedPrice,
      liquidity: totalLiquidity,
      circulating_supply: circulating,
      outliers_filtered: filteredOutliers,
      pool_count: poolCount,
      original_pool_count: originalPoolCount,
      median_used: medianUsed,
      suspicious_liquidity: suspiciousLiquidity,
      price_from_average_price: priceFromAveragePrice,
      mcap_liquidity_ratio: mcapLiquidityRatio,
      token_age: tokenAge,
      trust_assessment: {
        score: trustAssessment.score,
        level: trustAssessment.trustLevel,
        penalties: trustAssessment.penalties,
        bonuses: trustAssessment.bonuses
      },
      honeypot_risk: honeypotCheck.isHoneypot,
      validation: validation,
      updated_at: new Date().toISOString()
    };
  } catch (error) {
    console.error(`Error enhancing token data for ${token.token_id}:`, error.message);
    return {
      token_id: token.token_id,
      error: error.message,
      updated_at: new Date().toISOString()
    };
  }
}

/**
 * Process tokens in batches to avoid rate limits
 * @param {Array} tokens - Array of token objects
 * @returns {Promise<Array>} Enhanced token data
 */
async function batchProcessTokens(tokens) {
  const results = [];
  const totalBatches = Math.ceil(tokens.length / BATCH_SIZE);
  
  console.log(`Processing ${tokens.length} tokens in batches of ${BATCH_SIZE}...`);
  console.log(`Total batches: ${totalBatches}`);
  
  // Process in batches to avoid rate limits
  for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
    const batch = tokens.slice(i, i + BATCH_SIZE);
    console.log(`Processing batch ${batchNumber} of ${totalBatches} (${batch.length} tokens)`);
    
    const batchPromises = batch.map(token => enhanceTokenData(token));
    const batchResults = await Promise.allSettled(batchPromises);
    
    let batchSuccessCount = 0;
    let batchFailCount = 0;
    let outlierCount = 0;
    let invalidMcapCount = 0;
    let honeypotCount = 0;
    
    batchResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        results.push(result.value);
        batchSuccessCount++;
        
        // Count tokens with filtered outliers
        if (result.value.outliers_filtered) {
          outlierCount++;
        }
        
        // Count potential honeypots
        if (result.value.honeypot_risk) {
          honeypotCount++;
        }
        
        // Count tokens with invalid market caps
        if (result.value.validation && !result.value.validation.valid) {
          invalidMcapCount++;
        }
      } else {
        console.error(`Failed to process token ${batch[index].token_id}: ${result.reason}`);
        results.push(batch[index]); // Add original token data as fallback
        batchFailCount++;
      }
    });
    
    console.log(`Batch ${batchNumber} complete: ${batchSuccessCount} successful, ${batchFailCount} failed, ${outlierCount} with filtered outliers, ${honeypotCount} potential honeypots, ${invalidMcapCount} with invalid market caps`);
    
    // Only add delay if not the last batch
    if (i + BATCH_SIZE < tokens.length) {
      console.log(`Waiting ${BATCH_DELAY_MS}ms before next batch...`);
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }
  
  return results;
}

/**
 * Store enhanced token data back to local files
 * @param {Array} tokenData - Array of enhanced token data
 */
function storeEnhancedTokenData(tokenData) {
  console.log(`Storing enhanced data for ${tokenData.length} tokens...`);
  
  // Store individual token summary files
  tokenData.forEach(token => {
    if (token && token.token_id) {
      const filePath = path.join(SUMMARIES_DIR, `${token.token_id}_enhanced_refined.json`);
      fs.writeFileSync(filePath, JSON.stringify(token, null, 2));
    }
  });
  
  console.log(`Enhanced token data stored in ${SUMMARIES_DIR}`);
}

/**
 * Generate a market cap report with valid tokens based on trust score threshold
 * @param {Array} enhancedTokens - Array of enhanced token objects
 * @returns {Object} Market cap report with statistics and top tokens
 */
function generateMarketCapReport(enhancedTokens) {
  // Trust score thresholds for different validation levels
  const HIGH_TRUST_THRESHOLD = 80;
  const MODERATE_TRUST_THRESHOLD = 40;
  
  // Count statistics
  const tokensWithMarketCap = enhancedTokens.filter(token => token.market_cap > 0);
  const tokensWithPrice = enhancedTokens.filter(token => token.price > 0);
  const tokensWithTotalSupply = enhancedTokens.filter(token => token.total_supply > 0);
  const tokensWithCirculatingSupply = enhancedTokens.filter(token => token.circulating_supply > 0);
  const tokensWithLiquidity = enhancedTokens.filter(token => token.liquidity > 0);
  const tokensWithFilteredOutliers = enhancedTokens.filter(token => token.outliers_filtered);
  const potentialHoneypotTokens = enhancedTokens.filter(token => token.honeypot_risk);
  
  // Filter tokens by trust level
  const highTrustTokens = enhancedTokens.filter(token => 
    token.trust_assessment && token.trust_assessment.score >= HIGH_TRUST_THRESHOLD
  );
  
  const moderateTrustTokens = enhancedTokens.filter(token => 
    token.trust_assessment && 
    token.trust_assessment.score >= MODERATE_TRUST_THRESHOLD && 
    token.trust_assessment.score < HIGH_TRUST_THRESHOLD
  );
  
  // Tokens with valid market caps (either high or moderate trust)
  const validMarketCapTokens = enhancedTokens.filter(token => 
    token.market_cap > 0 && 
    token.trust_assessment && 
    token.trust_assessment.score >= MODERATE_TRUST_THRESHOLD
  );
  
  // Tokens with invalid market caps
  const invalidMarketCapTokens = enhancedTokens.filter(token => 
    token.market_cap > 0 && 
    (!token.trust_assessment || token.trust_assessment.score < MODERATE_TRUST_THRESHOLD)
  );
  
  // Sort tokens by market cap
  const sortedByMarketCap = [...validMarketCapTokens].sort((a, b) => b.market_cap - a.market_cap);
  
  // Generate report
  const report = {
    total_tokens: enhancedTokens.length,
    tokens_with_market_cap: tokensWithMarketCap.length,
    tokens_with_price: tokensWithPrice.length,
    tokens_with_total_supply: tokensWithTotalSupply.length,
    tokens_with_circulating_supply: tokensWithCirculatingSupply.length,
    tokens_with_liquidity: tokensWithLiquidity.length,
    tokens_with_filtered_outliers: tokensWithFilteredOutliers.length,
    potential_honeypot_tokens: potentialHoneypotTokens.length,
    tokens_with_invalid_market_caps: invalidMarketCapTokens.length,
    tokens_with_valid_market_caps: validMarketCapTokens.length,
    validation_parameters: {
      min_liquidity_threshold: MIN_LIQUIDITY_THRESHOLD,
      max_mcap_liquidity_ratio: MAX_MCAP_LIQUIDITY_RATIO,
      min_pools_required: MIN_POOLS_REQUIRED
    },
    generated_at: new Date().toISOString(),
    top_tokens_by_market_cap_valid: sortedByMarketCap
  };
  
  return report;
}

/**
 * Main function to run the enhanced integration
 */
async function main() {
  console.log('Starting Enhanced Integration Script with Liquidity Validation and Honeypot Detection...');
  console.log('This script uses local token supply data and DexHunter price data with advanced validation');
  console.log(`Maximum reasonable price: ${MAX_REASONABLE_PRICE} ADA`);
  console.log(`Minimum reasonable price: ${MIN_REASONABLE_PRICE} ADA`);
  console.log(`Minimum liquidity threshold: ${MIN_LIQUIDITY_THRESHOLD} ADA`);
  console.log(`Maximum market cap to liquidity ratio: ${MAX_MCAP_LIQUIDITY_RATIO}:1`);
  console.log(`Minimum pool count required: ${MIN_POOLS_REQUIRED}`);
  
  try {
    // Load tokens from local storage
    const tokens = await loadLocalTokenData();
    
    if (tokens.length === 0) {
      console.error('No token data found in local storage. Please run the original integration script first.');
      process.exit(1);
    }
    
    // Process the tokens in batches
    const enhancedTokens = await batchProcessTokens(tokens);
    
    // Store the enhanced token data
    storeEnhancedTokenData(enhancedTokens);
    
    // Generate market cap report
    const report = generateMarketCapReport(enhancedTokens);
    
    // Write the updated report to disk
    fs.writeFileSync('token_data/market_cap_report_refined.json', JSON.stringify(report, null, 2));
    
    console.log('Enhanced integration script completed successfully!');
  } catch (error) {
    console.error('Error running enhanced integration:', error);
    process.exit(1);
  }
}

// Run the script
main();

// Export the main function for use in server.js
module.exports = {
  runFullIntegration: main
}; 