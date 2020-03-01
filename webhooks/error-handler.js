const { WEBHOOKS } = require('./webhooks-base.js');
const { LOGGER } = require('../logger.js');
WEBHOOKS.on('error', error => {
  LOGGER.info(`Error occured in "${error.event.name} handler: ${error.stack}"`);
});
