const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const token = req.cookies?.token || req.headers?.authorization?.split(' ')[1];
  if (!token) {
    if (req.headers['content-type']?.includes('application/json') || req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Nicht authentifiziert' });
    }
    return res.redirect('/login');
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
    req.user = decoded;
    next();
  } catch (e) {
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Token ungültig' });
    }
    res.clearCookie('token');
    return res.redirect('/login');
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Nicht authentifiziert' });
    if (!roles.includes(req.user.role)) {
      if (req.path.startsWith('/api/')) {
        return res.status(403).json({ error: 'Keine Berechtigung' });
      }
      return res.status(403).render('error', { message: 'Keine Berechtigung', user: req.user });
    }
    next();
  };
}

function optionalAuth(req, res, next) {
  const token = req.cookies?.token;
  if (token) {
    try {
      req.user = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
    } catch (e) {
      req.user = null;
    }
  }
  next();
}

module.exports = { requireAuth, requireRole, optionalAuth };
