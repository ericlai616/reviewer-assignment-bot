# reviewer-assignment-bot

A Node.js server which automatically requests for reviews when a specific label is added to a pull request.
Currently only deal with users, but not teams.

## Configuration
Uses config module with default file `config/default.json`.

### Config values
`app`: Basic configuration of GitHub App

Config | Description
----- | -----
id | ID of GitHub App
private-key-path | The file containing the private key generated from GitHub App. Default: `private-key.pem`
secret | The secret of the GitHub App webhook
base-url | The base URL of GitHub REST API for GitHub Enterprise support. Default: `https://github.com/api/v3`

`log`: A configuration object for log4js. Default configuration will be the same as log4js.

`labels`: Key-value pairs for configuration of triggering auto review request(s)
The key name is the name of the trigger label to be configured.
The value has the following schema:

Config | Description
----- | -----
reviewers | An array of GitHub logins of the reviewers
number-of-reviewers | (Optional) An integer stating the number of review request to be sent. By default, all reviewers will be included

Example:
```json
{
  "app" : {
    "id": 0,
    "private-key-path": "private-key.pem",
    "secret": "foobar",
    "base-url": "https://github.com/api/v3"
  },
  "log": {
    "appenders": {
      "console": {
        "type": "console"
      }
    },
    "categories": {
      "default": {
        "appenders": [ "console" ],
        "level": "info"
      }
    }
  },
  "labels": {
    "Please REVIEW!!": {
      "reviewers": ["reviewer1", "reviewer2"]
    },
    "More REVIEW needed": {
      "reviewers": ["reviewer3", "reviewer4", "reviewer5"],
      "number-of-reviewers": 2
    }
  }
}
```

## Docker

1. Create `config/default.json` and configure values as described above
2. Build a docker image
```sh
docker build -t reviewer-assignment-bot .
```
3. Run the image in a detached container with a port binded to container port 3000
```sh
docker run -p ${port}:3000 -d reviewer-assignment-bot
```
4. If a console logger is configured, log can be viewed by using docker log
```sh
docker logs ${containerId}
```
