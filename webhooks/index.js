const { WEBHOOKS } = require('./webhooks-base.js');
require('./pull-request-labeled-handler.js');
require('./error-handler.js');
exports.WEBHOOKS = WEBHOOKS;
