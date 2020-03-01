const { createAppAuth } = require("@octokit/auth-app");
const { request } = require("@octokit/request");
const SHUFFLE = require("shuffle-array");
const CONFIG = require('config');
const { LOGGER } = require("./logger.js");
const express = require('express');
const { WEBHOOKS } = require("./webhooks");

const EXPRESS_SERVER = express();
EXPRESS_SERVER.use(express.json());
EXPRESS_SERVER.use('/event_handler', WEBHOOKS.middleware);
EXPRESS_SERVER.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }
  LOGGER.error(err);
  res.status(500).end(err.toString());
});

const PORT = 3000;
EXPRESS_SERVER.listen(PORT, () => LOGGER.info(`Listening on port ${PORT}!`));
