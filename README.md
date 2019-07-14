# reviewer-assignment-bot

A Node.js server which automatically requests for reviews when a specific label is added to a pull request.
Currently only deal with users, but not teams.

## Configuration
Uses config module with default file `config/default.json`.

Config | Value
----- | -----
reviewers | An array of GitHub logins
num-of-reviewers-required | Number of reviewers to request for. Default: 1
target-label | The target label. When this label is added to a pull request, the app will request for reviews.
app.id | ID of GitHub App
app.private-key-path | The file containing the private key generated from GitHub App. Default: `private-key.pem`
app.base-url | The base URL of GitHub REST API for GitHub Enterprise support. Default: `https://github.com/api/v3`

Example:
```
{
  "reviewers": [
    "ericlai616"
  ],
  "num-of-reviewers-required": 1,
  "target-label": "Please REVIEW!!",
  "app" : {
    "id": 0,
    "private-key-path": "private-key.pem",
    "base-url": "https://github.com/api/v3"
  }
}
```
