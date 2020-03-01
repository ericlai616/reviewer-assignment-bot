const { WEBHOOKS } = require('./webhooks-base.js');
require('./pull_request_labeled_handler.js');
require('./error-handler.js');
exports.WEBHOOKS = WEBHOOKS;
