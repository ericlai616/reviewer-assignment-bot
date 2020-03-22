#!/usr/bin/env node

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

exports.server = EXPRESS_SERVER;
exports.log = LOGGER;
