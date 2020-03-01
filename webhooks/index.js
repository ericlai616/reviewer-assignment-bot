const { WEBHOOKS } = require('./webhooks-base.js');
require('./pull_request_labeled_handler.js');
exports.WEBHOOKS = WEBHOOKS;
