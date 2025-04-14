/**
 * Global error handling middleware
 */
const errorHandler = (err, req, res, next) => {
  // Log the error for debugging
  console.error(`Error processing ${req.method} ${req.path}:`, err);
  
  // Determine the status code
  const statusCode = res.statusCode !== 200 ? res.statusCode : 500;
  
  // Create the error response
  const response = {
    status: 'error',
    message: err.message || 'An unexpected error occurred',
    path: req.path,
    timestamp: new Date().toISOString()
  };
  
  // Add stack trace in development environment
  if (process.env.NODE_ENV !== 'production') {
    response.stack = err.stack;
  }
  
  res.status(statusCode).json(response);
};

/**
 * Handle 404 errors
 */
const notFound = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

module.exports = {
  errorHandler,
  notFound
}; 