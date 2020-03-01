const { createAppAuth } = require("@octokit/auth-app");
const { request } = require("@octokit/request");
const WebhooksApi = require("@octokit/webhooks");
const FS = require("fs");
const CONFIG = require('config');
const { LOGGER } = require('../logger.js');

const APP_CONFIG = CONFIG.get('app');
const GHE_URL = APP_CONFIG.has('base-url') ? APP_CONFIG.get('base-url') : 'https://github.com/api/v3';
LOGGER.debug('Setting GitHub REST API endpoint:', GHE_URL);
const PRIVATE_KEY_PATH = APP_CONFIG.has('private-key-path') ? APP_CONFIG.get('private-key-path') : 'private-key.pem';
LOGGER.debug('Loading private key:', PRIVATE_KEY_PATH);
const APP_PRIVATE_KEY = FS.readFileSync(PRIVATE_KEY_PATH);

const API_REQUEST = request.defaults({baseUrl: GHE_URL});

exports.AUTH = createAppAuth({
  id: APP_CONFIG.get('id'),
  privateKey: APP_PRIVATE_KEY,
  request: API_REQUEST
});

exports.API_REQUEST = API_REQUEST;

exports.WEBHOOKS = new WebhooksApi({
  secret: APP_CONFIG.get('secret')
});
