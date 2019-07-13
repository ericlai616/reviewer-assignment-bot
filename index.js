const { App } = require("@octokit/app");
const { request } = require("@octokit/request");
const shuffle = require("shuffle-array");
const config = require('config');
const log4js = require('log4js');
log4js.configure({
  appenders: {
    out: { type: 'stdout' },
    app: { type: 'file', filename: 'application.log' }
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
        const current_reviewed_reviewers_resp = await request("GET /repos/:owner/:repo/pulls/:pull_number/reviews", {
          baseUrl: GHE_URL,
          headers: {
            authorization: `token ${installationAccessToken}`,
          },
          owner: pullRequest.head.repo.owner.login,
          repo: pullRequest.head.repo.name,
          pull_number: pullRequest.number
        });
        const current_reviewed_reviewers = current_reviewed_reviewers_resp.data;
        const current_reviewed_reviewer_logins = current_reviewed_reviewers.users != null ? current_reviewers.users.map(x => x.login) : [];
        log.debug(`Current reviewed reviewers: ${current_reviewed_reviewer_logins}`);

        const current_requested_reviewers_resp = await request("GET /repos/:owner/:repo/pulls/:pull_number/requested_reviewers", {
          baseUrl: GHE_URL,
          headers: {
            authorization: `token ${installationAccessToken}`,
          },
          owner: pullRequest.head.repo.owner.login,
          repo: pullRequest.head.repo.name,
          pull_number: pullRequest.number
        });
        const current_requested_reviewers = current_requested_reviewers_resp.data;
        const current_requested_reviewer_logins = current_requested_reviewers.users != null ? current_reviewers.users.map(x => x.login) : [];
        log.debug(`Current requested reviewers: ${current_requested_reviewer_logins}`);

        const non_candidates = current_reviewed_reviewer_logins.concat(current_requested_reviewer_logins);
        const reviewer_candidates = reviewers.filter(x => x != pullRequest.user.login && !non_candidates.includes(x));
        const num_to_pick = NUM_OF_REVIEWERS_REQUIRED - current_requested_reviewer_logins.length;
        log.debug(`Pick ${num_to_pick}`);
        if (num_to_pick > 0) {
          let reviewers_chosen = shuffle.pick(reviewer_candidates, { picks: num_to_pick });
          if (num_to_pick == 1) {
            reviewers_chosen = [reviewers_chosen];
          }
          log.debug(`Request review to ${reviewers_chosen}`);
          request("POST /repos/:owner/:repo/pulls/:pull_number/requested_reviewers", {
            baseUrl: GHE_URL,
            headers: {
              authorization: `token ${installationAccessToken}`,
            },
            owner: pullRequest.head.repo.owner.login,
            repo: pullRequest.head.repo.name,
            pull_number: pullRequest.number,
            reviewers: reviewers_chosen
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
