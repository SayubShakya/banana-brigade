// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

function publicCors(req, res, next) {
  res.set({ 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
}

module.exports = { publicCors };
