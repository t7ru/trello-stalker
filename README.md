# Trello Stalker
This script monitors a public Trello board for changes and sends notifications to a Discord webhook.

## Setup
1.  **Create a Repository from Template**:
    Click the "Use this template" button on this repo to get your own version.

2.  **Configure GitHub Secrets**:
    In your new repository, go to `Settings` -> `Secrets and variables` -> `Actions` -> `New repository secret`.
    Add the following secrets:
    *   `TRELLO_JSON_URL`: The URL to your public Trello board's JSON data.
        Example: `https://trello.com/b/XnZ9XUoc/alter-ego-public-roadmap.json`
    *   `DISCORD_WEBHOOK_URL`: Your Discord webhook URL where notifications will be sent.

3.  **Configure GitHub Action**:
    The monitoring logic is defined in [.github/workflows/stalk.yaml](.github/workflows/stalk.yaml).

    This workflow is defaulted to run every 5 minutes (`cron: '*/5 * * * *'`) or on manual trigger (`workflow_dispatch`).

    The script will create and update a `board_state.json` file in your repository to store the board's previous state. This file is automatically committed back to the repository by Actions.

## Local Setup
If you wish to run the script locally, install Node.js and Dotenv, then create a `.env` file with `TRELLO_JSON_URL` and `DISCORD_WEBHOOK_URL`. Finally, run `node index.js`.