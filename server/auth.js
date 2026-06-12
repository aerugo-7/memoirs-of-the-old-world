const {
  registerGitHubAuth,
  requireLogin,
  isGitHubOAuthConfigured,
  buildGitHubAuthorizeUrl,
  getLocalCallbackUrl,
  logGitHubOAuthStartup,
} = require("./auth-github");

function registerAuthRoutes(app) {
  registerGitHubAuth(app);
}

module.exports = {
  registerAuthRoutes,
  registerGitHubAuth,
  requireAuth: requireLogin,
  requireLogin,
  isGitHubOAuthConfigured,
  buildGitHubAuthorizeUrl,
  getLocalCallbackUrl,
  logGitHubOAuthStartup,
};
