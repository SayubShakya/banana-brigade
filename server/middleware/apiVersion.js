function apiVersion(req, res, next) {
  if (req.url === '/api/v1' || req.url.startsWith('/api/v1/')) req.url = `/api${req.url.slice(7)}`;
  next();
}

module.exports = { apiVersion };
