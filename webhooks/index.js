const FS = require('fs');
const { WEBHOOKS } = require('./webhooks-base.js');
const { LOGGER } = require('../logger.js');

FS.readdirSync(__dirname).forEach(file => {
  if (!['index.js', 'webhooks-base.js'].includes(file)) {
    LOGGER.debug('Loading webhook:', file);
    require('./' + file);
  }
});
exports.WEBHOOKS = WEBHOOKS;
