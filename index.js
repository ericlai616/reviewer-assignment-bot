const { createAppAuth } = require("@octokit/auth-app");
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
    default: { appenders: [ 'out', 'app' ], level: 'info' }
  }
});
var log = log4js.getLogger();
log.level = 'debug';

const fs = require("fs");
const express = require('express');

const appConfig = config.get('app');
var labelConfig = config.get('labels');
const GHE_URL = appConfig.get('baseUrl');
const APP_PRIVATE_KEY = fs.readFileSync(appConfig.get('privateKeyPath'));
const API_REQUEST = request.defaults({baseUrl: GHE_URL});

const auth = createAppAuth({
  id: appConfig.get('id'),
  privateKey: APP_PRIVATE_KEY,
  request: API_REQUEST
});

const EXPRESS_SERVER = express();
EXPRESS_SERVER.use(express.json());
EXPRESS_SERVER.post('/event_handler', async (req, res, next) => {
  const event = req.header('X-GitHub-Event');
  switch(event) {
    case 'pull_request':
      if (req.body.action != 'labeled') {
        log.debug('Skip non labeled actions');
        break;
      }
      if (!labelConfig.has(req.body.label.name)) {
        log.debug('No action for label ' + req.body.label.name);
        break;
      }

      const pullRequest = req.body.pull_request;
      const installationId = req.body.installation.id;
      const { token } = await auth({
        type: "installation",
        installationId: installationId,
        permissions: {
          "members": "read",
          "pull_requests": "write"
        }});
      const requestWithAuthAndPrInfo = API_REQUEST.defaults({
        headers: {
          authorization: `token ${token}`
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

          const currentLabelConfig = labelConfig.get(req.body.label.name);
          log.debug(`Load label config: ${JSON.stringify(currentLabelConfig)}`);
          const nonCandidates = currentReviewedReviewerLogins.concat(currentRequestedReviewerLogins);
          const reviewers = currentLabelConfig.reviewers;
          const reviewerCandidates = reviewers.filter(x => x != pullRequest.user.login && !nonCandidates.includes(x));
          const numOfReviewerToChoose = currentLabelConfig.has('number-of-reviewers') ? currentLabelConfig.get('number-of-reviewers') : reviewerCandidates.length;
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
.get('/config', (req, res, next) => res.end(JSON.stringify(labelConfig)))
EXPRESS_SERVER.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }
  log.error(err);
  res.status(500).end(err.toString());
});

const PORT = 3000;
EXPRESS_SERVER.listen(PORT, () => log.info(`Listening on port ${PORT}!`));
