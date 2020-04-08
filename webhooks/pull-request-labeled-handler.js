const SHUFFLE = require("shuffle-array");
const CONFIG = require('config');
const { LOGGER } = require('../logger.js');
const { AUTH, API_REQUEST, WEBHOOKS } = require('./webhooks-base.js');

const LABEL_CONFIG = CONFIG.get('labels');

WEBHOOKS.on('pull_request.labeled', async ({ id, name, payload }) => {
  const labelName = payload.label.name;
  if (!LABEL_CONFIG.has(labelName)) {
    LOGGER.debug('No action for label ' + labelName);
    return Promise.resolve();
  }

  const pullRequest = payload.pull_request;
  const installationId = payload.installation.id;
  const { token } = await AUTH({
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

  LOGGER.debug(`PR ${pullRequest.number}`);
  const { users : currentReviewedReviewers } = await requestWithAuthAndPrInfo("GET /repos/:owner/:repo/pulls/:pull_number/reviews");
  const currentReviewedReviewerLogins = currentReviewedReviewers != null ? currentReviewedReviewers.map(x => x.login) : [];
  LOGGER.debug(`Current reviewed reviewers: ${currentReviewedReviewerLogins}`);

  const { users : requestedReviewers } = await requestWithAuthAndPrInfo("GET /repos/:owner/:repo/pulls/:pull_number/requested_reviewers")
  const currentRequestedReviewerLogins = requestedReviewers != null ? requestedReviewers.map(x => x.login) : [];
  LOGGER.debug(`Current requested reviewers: ${currentRequestedReviewerLogins}`);

  const currentLabelConfig = LABEL_CONFIG.get(labelName);
  LOGGER.debug(`Load label config: ${JSON.stringify(currentLabelConfig)}`);
  const nonCandidates = currentReviewedReviewerLogins.concat(currentRequestedReviewerLogins);
  const reviewers = currentLabelConfig.reviewers;
  const reviewerCandidates = reviewers.filter(x => x != pullRequest.user.login && !nonCandidates.includes(x));
  const numOfReviewerToChoose = currentLabelConfig.has('number-of-reviewers') ? currentLabelConfig.get('number-of-reviewers') : reviewerCandidates.length;
  LOGGER.debug(`Choose ${numOfReviewerToChoose} reviewer(s)`);
  if (numOfReviewerToChoose > 0) {
    let reviewersChosen = SHUFFLE.pick(reviewerCandidates, { picks: numOfReviewerToChoose });
    if (numOfReviewerToChoose == 1) {
      reviewersChosen = [reviewersChosen];
    }
    LOGGER.debug(`Request review to ${reviewersChosen}`);
    requestWithAuthAndPrInfo("POST /repos/:owner/:repo/pulls/:pull_number/requested_reviewers", {reviewers: reviewersChosen});
  }
  requestWithAuthAndPrInfo("POST /repos/:owner/:repo/issues/:pull_number/assignees", {assignees: [pullRequest.user.login]});
  return Promise.resolve();
});
