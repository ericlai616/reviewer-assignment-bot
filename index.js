const { App } = require("@octokit/app");
const { request } = require("@octokit/request");
const shuffle = require("shuffle-array");
const config = require('config');

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

        console.log(`PR ${pullRequest.number}`);
        const current_reviewers_resp = await request("GET /repos/:owner/:repo/pulls/:pull_number/requested_reviewers", {
          baseUrl: GHE_URL,
          headers: {
            authorization: `token ${installationAccessToken}`,
          },
          owner: pullRequest.head.repo.owner.login,
          repo: pullRequest.head.repo.name,
          pull_number: pullRequest.number
        });
        const current_reviewers = current_reviewers_resp.data;
        console.log(`GET reviewers: ${JSON.stringify(current_reviewers)}`);
        const current_reviewer_logins = current_reviewers.users != null ? current_reviewers.users.map(x => x.login) : [];
        console.log(`Current reviewers: ${current_reviewer_logins}`);
        const reviewer_candidates = reviewers.filter(x => x != pullRequest.user.login && !current_reviewer_logins.includes(x));
        const num_to_pick = NUM_OF_REVIEWERS_REQUIRED - current_reviewer_logins.length;
        console.log(`Pick ${num_to_pick}`);
        if (num_to_pick > 0) {
          let reviewers_chosen = shuffle.pick(reviewer_candidates, { picks: num_to_pick });
          if (num_to_pick == 1) {
            reviewers_chosen = [reviewers_chosen];
          }
          console.log(`Request review to ${reviewers_chosen}`);
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
EXPRESS_SERVER.listen(PORT, () => console.log(`Listening on port ${PORT}!`));
