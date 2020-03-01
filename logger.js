const CONFIG = require('config');
const LOG4JS = require('log4js');

if (CONFIG.has('log')) {
  LOG4JS.configure(CONFIG.get('log'));
}
exports.LOGGER = LOG4JS.getLogger();
