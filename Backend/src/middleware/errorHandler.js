/**
 * 404 handler for unknown routes.
 */
function notFound(req, res) {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.originalUrl || req.url} does not exist.`,
    },
  });
}

/**
 * Central error handler — normalizes every failure into the same
 * { error: { code, message } } envelope the frontend expects.
 */
function errorHandler(err, req, res, next) {
  // Bad ObjectId (e.g. /api/products/not-an-id)
  if (err.name === 'CastError') {
    return res.status(400).json({
      error: { code: 'INVALID_ID', message: `"${err.value}" is not a valid id.` },
    });
  }

  // Duplicate unique key (email / phone / orderNumber)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return res.status(409).json({
      error: { code: 'DUPLICATE_VALUE', message: `${field} already exists.` },
    });
  }

  // Mongoose validation errors
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors)
      .map((e) => e.message)
      .join(' | ');
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: messages },
    });
  }

  console.error('[error]', err);
  res.status(500).json({
    error: { code: 'SERVER_ERROR', message: 'Something went wrong on the server.' },
  });
}

module.exports = { notFound, errorHandler };