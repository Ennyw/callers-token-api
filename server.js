const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');

// Routes
const tokenRoutes = require('./routes/tokens');

// Services
const volumeService = require('./services/volumeService');

// Create Express server
const app = express();

// Set port
const PORT = process.env.PORT || 3001;

// Script paths
const ENHANCED_INTEGRATION_SCRIPT = path.join(process.cwd(), 'enhanced_integration_refined.js');

// Data refresh scheduler
let refreshInterval = null;
let isRefreshing = false;
let volumeRefreshInterval = null;
let isVolumeRefreshing = false;

/**
 * Run the data refresh script
 */
async function refreshTokenData() {
  if (isRefreshing) {
    console.log('Data refresh already in progress, skipping...');
    return false;
  }

  console.log('Starting token data refresh...');
  isRefreshing = true;

  try {
    // In serverless environment, we need a lightweight approach
    if (process.env.VERCEL) {
      console.log('Running in Vercel serverless environment - using lightweight API refresh');
      
      try {
        // Import services
        const tokenService = require('./services/tokenService');
        const volumeService = require('./services/volumeService');
        
        // Clear caches
        tokenService.clearCache();
        volumeService.clearCache();
        
        // Run lightweight refresh methods
        console.log('Running lightweight refresh methods for Vercel...');
        
        // Run both refreshes in parallel
        const [tokenResult, volumeResult] = await Promise.all([
          tokenService.lightweightTokenRefresh(),
          volumeService.refreshVolumeData(true) // passing true to indicate Vercel environment
        ]);
        
        console.log('Lightweight refresh completed with results:', { tokenResult, volumeResult });
        
        // Force another cache invalidation to ensure fresh data on next request
        tokenService.clearCache();
        volumeService.clearCache();
        
        isRefreshing = false;
        return tokenResult && volumeResult;
      } catch (error) {
        console.error(`Error in Vercel lightweight refresh: ${error.message}`);
        console.error(error.stack);
        isRefreshing = false;
        return false;
      }
    } else {
      // Local development - use the full script via exec
      return new Promise((resolve) => {
        // Check if the script exists
        if (!fs.existsSync(ENHANCED_INTEGRATION_SCRIPT)) {
          console.error(`Enhanced integration script not found at ${ENHANCED_INTEGRATION_SCRIPT}`);
          isRefreshing = false;
          return resolve(false);
        }

        // Run the enhanced integration script
        const process = exec(`node ${ENHANCED_INTEGRATION_SCRIPT}`, (error, stdout, stderr) => {
          isRefreshing = false;
          
          if (error) {
            console.error(`Error refreshing token data: ${error.message}`);
            return resolve(false);
          }
          
          if (stderr) {
            console.error(`Token data refresh stderr: ${stderr}`);
          }
          
          console.log('Token data refresh completed successfully');
          console.log(stdout);
          return resolve(true);
        });
      });
    }
  } catch (error) {
    console.error(`Error in refreshTokenData: ${error.message}`);
    isRefreshing = false;
    return false;
  }
}

/**
 * Run the volume data refresh
 */
async function refreshVolumeData() {
  if (isVolumeRefreshing) {
    console.log('Volume refresh already in progress, skipping...');
    return;
  }

  console.log('Starting token volume data refresh...');
  isVolumeRefreshing = true;

  try {
    await volumeService.refreshVolumeData();
    console.log('Token volume data refresh completed successfully');
    isVolumeRefreshing = false;
    return true;
  } catch (error) {
    console.error(`Error refreshing token volume data: ${error.message}`);
    isVolumeRefreshing = false;
    return false;
  }
}

/**
 * Start the data refresh scheduler
 * @param {number} intervalMinutes - How often to refresh the data (in minutes)
 */
function startRefreshScheduler(intervalMinutes = 5) {
  // Clear any existing interval
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }
  
  // Convert minutes to milliseconds
  const intervalMs = intervalMinutes * 60 * 1000;
  
  console.log(`Starting token data refresh scheduler (every ${intervalMinutes} minutes)`);
  
  // Schedule the refresh task
  refreshInterval = setInterval(async () => {
    await refreshTokenData();
  }, intervalMs);
  
  // Run the first refresh immediately
  refreshTokenData();
}

/**
 * Start the volume data refresh scheduler
 * @param {number} intervalMinutes - How often to refresh volume data (in minutes)
 */
function startVolumeRefreshScheduler(intervalMinutes = 60) {
  // Clear any existing interval
  if (volumeRefreshInterval) {
    clearInterval(volumeRefreshInterval);
  }
  
  // Convert minutes to milliseconds
  const intervalMs = intervalMinutes * 60 * 1000;
  
  console.log(`Starting token volume data refresh scheduler (every ${intervalMinutes} minutes)`);
  
  // Schedule the refresh task
  volumeRefreshInterval = setInterval(async () => {
    await refreshVolumeData();
  }, intervalMs);
  
  // Run the first refresh immediately
  refreshVolumeData();
}

// Middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP for simplicity in testing
}));
app.use(morgan('dev')); // Request logging
app.use(cors()); // Cross-origin resource sharing
app.use(express.json()); // Parse JSON request body

// Add special handler for cron job endpoints to bypass auth
app.use((req, res, next) => {
  // List of cron job endpoints that should be allowed without auth
  const cronEndpoints = [
    '/api/refresh-data',
    '/api/tokens/refresh-volumes',
    '/api/tokens/refresh-tvl'
  ];
  
  // If this is a cron job endpoint, mark it to bypass auth
  if (cronEndpoints.includes(req.path)) {
    req.isCronEndpoint = true;
    console.log(`Cron job endpoint accessed: ${req.path}`);
  }
  
  next();
});

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api/tokens', tokenRoutes);

// Endpoint to check API status
app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    refreshScheduler: {
      active: refreshInterval !== null,
      isRefreshing
    },
    volumeScheduler: {
      active: volumeRefreshInterval !== null,
      isRefreshing: isVolumeRefreshing
    }
  });
});

// Endpoint to manually trigger a data refresh
app.post('/api/refresh-data', async (req, res) => {
  try {
    console.log(`[${new Date().toISOString()}] Cron job or manual trigger for token data refresh started`);
    
    // Explicitly log if this is a cron job request
    if (req.headers['x-vercel-cron'] === 'true' || req.isCronEndpoint) {
      console.log(`[${new Date().toISOString()}] This is a cron job request`);
    } else {
      console.log(`[${new Date().toISOString()}] This is a manual refresh request`);
    }
    
    const result = await refreshTokenData();
    
    if (result) {
      console.log(`[${new Date().toISOString()}] Token data refresh completed successfully`);
      res.json({ 
        success: true, 
        message: 'Token data refresh completed successfully',
        timestamp: new Date().toISOString()
      });
    } else {
      console.log(`[${new Date().toISOString()}] Failed to refresh token data`);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to refresh token data',
        timestamp: new Date().toISOString() 
      });
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error in refresh-data endpoint:`, error);
    res.status(500).json({ 
      success: false, 
      message: `Error refreshing token data: ${error.message}`,
      timestamp: new Date().toISOString()
    });
  }
});

// Endpoint to manually trigger a volume data refresh
app.post('/api/refresh-volume-data', async (req, res) => {
  try {
    const result = await refreshVolumeData();
    if (result) {
      res.json({ success: true, message: 'Token volume data refresh completed successfully' });
    } else {
      res.status(500).json({ success: false, message: 'Failed to refresh token volume data' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: `Error refreshing token volume data: ${error.message}` });
  }
});

// Endpoint to update the refresh interval
app.post('/api/refresh-interval', (req, res) => {
  const { intervalMinutes } = req.body;
  
  if (!intervalMinutes || typeof intervalMinutes !== 'number' || intervalMinutes < 1) {
    return res.status(400).json({ 
      success: false, 
      message: 'Invalid interval. Please provide a positive number of minutes.' 
    });
  }
  
  startRefreshScheduler(intervalMinutes);
  res.json({ 
    success: true, 
    message: `Refresh interval updated to ${intervalMinutes} minutes` 
  });
});

// Endpoint to update the volume refresh interval
app.post('/api/volume-refresh-interval', (req, res) => {
  const { intervalMinutes } = req.body;
  
  if (!intervalMinutes || typeof intervalMinutes !== 'number' || intervalMinutes < 1) {
    return res.status(400).json({ 
      success: false, 
      message: 'Invalid interval. Please provide a positive number of minutes.' 
    });
  }
  
  startVolumeRefreshScheduler(intervalMinutes);
  res.json({ 
    success: true, 
    message: `Volume refresh interval updated to ${intervalMinutes} minutes` 
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.VERCEL ? 'vercel' : 'local'
  });
});

// Basic route for testing
app.get('/api', (req, res) => {
  res.json({
    message: 'Callers Token API Server is running',
    version: '1.0.0',
    endpoints: [
      '/api/tokens/top/:limit - Get top tokens by market cap',
      '/api/tokens/top-tvl/:limit - Get top tokens by TVL (total value locked)',
      '/api/tokens/top-volume/:limit - Get top tokens by volume',
      '/api/tokens/:tokenId - Get token details by ID',
      '/api/tokens/search/:query - Search tokens by ticker or name',
      '/api/tokens/stats - Get token statistics'
    ]
  });
});

// Serve the React app for any other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Handle 404s
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `The requested resource at ${req.originalUrl} was not found.`
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Server Error',
    message: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : err.message
  });
});

// Start the server only in local environment
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    
    // Start the refresh schedulers if we're in a local environment
    startRefreshScheduler(30); // Refresh token data every 30 minutes
    startVolumeRefreshScheduler(60); // Refresh volume data every 60 minutes
  });
}

// For Vercel serverless environment, export the app
module.exports = app;

// Export the refresh functions for use in routes
module.exports.refreshTokenData = refreshTokenData;
module.exports.refreshVolumeData = refreshVolumeData; 