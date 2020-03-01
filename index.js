const { createAppAuth } = require("@octokit/auth-app");
const { request } = require("@octokit/request");
const SHUFFLE = require("shuffle-array");
const CONFIG = require('config');
const LOG4JS = require('log4js');
const FS = require("fs");
const express = require('express');
const WebhooksApi = require("@octokit/webhooks");

if (CONFIG.has('log')) {
  LOG4JS.configure(CONFIG.get('log'));
}
var log = LOG4JS.getLogger();

const APP_CONFIG = CONFIG.get('app');
const LABEL_CONFIG = CONFIG.get('labels');
const GHE_URL = APP_CONFIG.has('base-url') ? APP_CONFIG.get('base-url') : 'https://github.com/api/v3';
log.debug('Setting GitHub REST API endpoint:', GHE_URL);
const PRIVATE_KEY_PATH = APP_CONFIG.has('private-key-path') ? APP_CONFIG.get('private-key-path') : 'private-key.pem';
log.debug('Loading private key:', PRIVATE_KEY_PATH);
const APP_PRIVATE_KEY = FS.readFileSync(PRIVATE_KEY_PATH);
const API_REQUEST = request.defaults({baseUrl: GHE_URL});

const auth = createAppAuth({
  id: APP_CONFIG.get('id'),
  privateKey: APP_PRIVATE_KEY,
  request: API_REQUEST
});

const webhooks = new WebhooksApi({
  secret: APP_CONFIG.get('secret')
});

webhooks.on('pull_request.labeled', async ({ id, name, payload }) => {
  const labelName = payload.label.name;
  if (!LABEL_CONFIG.has(labelName)) {
    log.debug('No action for label ' + labelName);
    return Promise.resolve();
  }

  const pullRequest = payload.pull_request;
  const installationId = payload.installation.id;
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
  const { users : currentReviewedReviewers } = await requestWithAuthAndPrInfo("GET /repos/:owner/:repo/pulls/:pull_number/reviews");
  const currentReviewedReviewerLogins = currentReviewedReviewers != null ? currentReviewedReviewers.map(x => x.login) : [];
  log.debug(`Current reviewed reviewers: ${currentReviewedReviewerLogins}`);

  const { users : requestedReviewers } = await requestWithAuthAndPrInfo("GET /repos/:owner/:repo/pulls/:pull_number/requested_reviewers")
  const currentRequestedReviewerLogins = requestedReviewers != null ? requestedReviewers.map(x => x.login) : [];
  log.debug(`Current requested reviewers: ${currentRequestedReviewerLogins}`);

  const currentLabelConfig = LABEL_CONFIG.get(labelName);
  log.debug(`Load label config: ${JSON.stringify(currentLabelConfig)}`);
  const nonCandidates = currentReviewedReviewerLogins.concat(currentRequestedReviewerLogins);
  const reviewers = currentLabelConfig.reviewers;
  const reviewerCandidates = reviewers.filter(x => x != pullRequest.user.login && !nonCandidates.includes(x));
  const numOfReviewerToChoose = currentLabelConfig.has('number-of-reviewers') ? currentLabelConfig.get('number-of-reviewers') : reviewerCandidates.length;
  log.debug(`Choose ${numOfReviewerToChoose} reviewer(s)`);
  if (numOfReviewerToChoose > 0) {
    let reviewersChosen = SHUFFLE.pick(reviewerCandidates, { picks: numOfReviewerToChoose });
    if (numOfReviewerToChoose == 1) {
      reviewersChosen = [reviewersChosen];
    }
    log.debug(`Request review to ${reviewersChosen}`);
    requestWithAuthAndPrInfo("POST /repos/:owner/:repo/pulls/:pull_number/requested_reviewers", {reviewers: reviewersChosen});
  }
  return Promise.resolve();
})
const EXPRESS_SERVER = express();
EXPRESS_SERVER.use(express.json());
EXPRESS_SERVER.use('/event_handler', webhooks.middleware);
EXPRESS_SERVER.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }
  log.error(err);
  res.status(500).end(err.toString());
});

const PORT = 3000;
EXPRESS_SERVER.listen(PORT, () => log.info(`Listening on port ${PORT}!`));
