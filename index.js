const { App } = require("@octokit/app");
const { request } = require("@octokit/request");
const shuffle = require("shuffle-array");
const config = require('config');
const log4js = require('log4js');
log4js.configure({
  appenders: {
    out: { type: 'stdout' },
    app: {
      type: 'file',
      filename: 'application.log',
      maxLogSize: 10485760,
      backups: 10,
      compress: true
    }
  },
  categories: {
    default: { appenders: [ 'out', 'app' ], level: 'debug' }
  }
});
var log = log4js.getLogger();
log.level = 'debug';

const fs = require("fs");
const express = require('express');

var reviewers = config.get('reviewers');
const NUM_OF_REVIEWERS_REQUIRED = config.get('num-of-reviewers-required');
const TARGET_LABEL = config.get('target-label');
const GHE_URL = config.get('app')['base-url'];

const GIT_HUB_APP = new App({
  id: config.get('app')['id'],
  privateKey: fs.readFileSync(config.get('app')['private-key-path']),
  baseUrl: GHE_URL
});
const JWT = GIT_HUB_APP.getSignedJsonWebToken();

const GIT_HUB_REQUEST_WITH_BASE_URL = request.defaults({baseUrl: GHE_URL});

const EXPRESS_SERVER = express();
EXPRESS_SERVER.use(express.json());
EXPRESS_SERVER.post('/event_handler', async (req, res, next) => {
  const event = req.header('X-GitHub-Event');
  switch(event) {
    case 'pull_request':
      if (req.body.action != 'labeled' || req.body.label.name != TARGET_LABEL) {
        log.debug("Not 'Please REVIEW!!'");
        break;
      }

      const pullRequest = req.body.pull_request;

      const installationId = req.body.installation.id;
      const installationAccessToken = await GIT_HUB_APP.getInstallationAccessToken({installationId: installationId});
      const requestWithAuthAndPrInfo = GIT_HUB_REQUEST_WITH_BASE_URL.defaults({
        headers: {
          authorization: `token ${installationAccessToken}`,
        },
        owner: pullRequest.head.repo.owner.login,
        repo: pullRequest.head.repo.name,
        pull_number: pullRequest.number
      });

      log.debug(`PR ${pullRequest.number}`);
      requestWithAuthAndPrInfo("GET /repos/:owner/:repo/pulls/:pull_number/reviews").then(result => {
        const currentReviewedReviewerLogins = result.data.users != null ? result.data.users.map(x => x.login) : [];
        log.debug(`Current reviewed reviewers: ${currentReviewedReviewerLogins}`);

        requestWithAuthAndPrInfo("GET /repos/:owner/:repo/pulls/:pull_number/requested_reviewers").then(result => {
          const currentRequestedReviewerLogins = result.data.users != null ? result.data.users.map(x => x.login) : [];
          log.debug(`Current requested reviewers: ${currentRequestedReviewerLogins}`);

          const nonCandidates = currentReviewedReviewerLogins.concat(currentRequestedReviewerLogins);
          const reviewerCandidates = reviewers.filter(x => x != pullRequest.user.login && !nonCandidates.includes(x));
          const numOfReviewerToChoose = NUM_OF_REVIEWERS_REQUIRED - currentRequestedReviewerLogins.length;
          log.debug(`Choose ${numOfReviewerToChoose} reviewer(s)`);
          if (numOfReviewerToChoose > 0) {
            let reviewersChosen = shuffle.pick(reviewerCandidates, { picks: numOfReviewerToChoose });
            if (numOfReviewerToChoose == 1) {
              reviewersChosen = [reviewersChosen];
            }
            log.debug(`Request review to ${reviewersChosen}`);
            requestWithAuthAndPrInfo("POST /repos/:owner/:repo/pulls/:pull_number/requested_reviewers", {reviewers: reviewersChosen}).catch(next);
          }
        })
        .catch(next);
      })
      .catch(next);
      break;
    default:
  }
  res.end('OK');
})
.get('/reviewers', (req, res, next) => res.end(JSON.stringify(reviewers)))
.post('/reviewers', (req, res, next) => {
  reviewers = req.body.reviewers;
  res.end('OK');
});
EXPRESS_SERVER.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }
  log.error(err);
  res.status(500).end(err.toString());
});

const PORT = 3000;
EXPRESS_SERVER.listen(PORT, () => log.info(`Listening on port ${PORT}!`));
