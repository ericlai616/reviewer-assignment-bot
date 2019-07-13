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
const GHE_URL = config.get('app')['base-url'];

const GIT_HUB_APP = new App({
  id: config.get('app')['id'],
  privateKey: fs.readFileSync(config.get('app')['private-key-path']),
  baseUrl: GHE_URL
});
const JWT = GIT_HUB_APP.getSignedJsonWebToken();

const EXPRESS_SERVER = express();
EXPRESS_SERVER.post('/event_handler', async function (req, res, next) {
  const event = req.header('X-GitHub-Event');
  switch(event) {
    case 'pull_request':
      const action = req.body.action;
      if (['opened', 'reopened', 'labeled', 'unlabeled'].includes(action)) {
        const pullRequest = req.body.pull_request;
        if (pullRequest.labels != null && pullRequest.labels.map(l => l.name).includes('wip')) {
          break;
        }
        const installationId = req.body.installation.id;
        const installationAccessToken = await GIT_HUB_APP.getInstallationAccessToken({installationId: installationId});

        log.debug(`PR ${pullRequest.number}`);
        const currentReviewedReviewersResponse = await request("GET /repos/:owner/:repo/pulls/:pull_number/reviews", {
          baseUrl: GHE_URL,
          headers: {
            authorization: `token ${installationAccessToken}`,
          },
          owner: pullRequest.head.repo.owner.login,
          repo: pullRequest.head.repo.name,
          pull_number: pullRequest.number
        });
        const currentReviewedReviewers = currentReviewedReviewersResponse.data;
        const currentReviewedReviewerLogins = currentReviewedReviewers.users != null ? currentReviewedReviewers.users.map(x => x.login) : [];
        log.debug(`Current reviewed reviewers: ${currentReviewedReviewerLogins}`);

        const currentRequestedReviewersResponse = await request("GET /repos/:owner/:repo/pulls/:pull_number/requested_reviewers", {
          baseUrl: GHE_URL,
          headers: {
            authorization: `token ${installationAccessToken}`,
          },
          owner: pullRequest.head.repo.owner.login,
          repo: pullRequest.head.repo.name,
          pull_number: pullRequest.number
        });
        const currentRequestedReviewers = currentRequestedReviewersResponse.data;
        const currentRequestedReviewerLogins = currentRequestedReviewers.users != null ? currentRequestedReviewers.users.map(x => x.login) : [];
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
          request("POST /repos/:owner/:repo/pulls/:pull_number/requested_reviewers", {
            baseUrl: GHE_URL,
            headers: {
              authorization: `token ${installationAccessToken}`,
            },
            owner: pullRequest.head.repo.owner.login,
            repo: pullRequest.head.repo.name,
            pull_number: pullRequest.number,
            reviewers: reviewersChosen
          });
        }
      }
      break;
    default:
  }
  res.end('OK');
})
.get('/reviewers', function (req, res, next) {
    res.end(JSON.stringify(reviewers));
})
.post('/reviewers', function (req, res, next) {
    reviewers = req.body.reviewers;
    res.end('OK');
});

EXPRESS_SERVER.use(express.json());
const PORT = 3000;
EXPRESS_SERVER.listen(PORT, () => log.info(`Listening on port ${PORT}!`));
