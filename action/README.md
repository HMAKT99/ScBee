# ScBee score (GitHub Action)

Reports a repository's **launch readiness** and **agent-ready** scores in the job summary, and optionally as **one** pull request comment that is updated in place (never a new comment per push). It reads public data from ScBee and uses your workflow's own token only for that comment. It runs inside your repository, not from anyone's personal account.

```yaml
name: ScBee
on: [pull_request]
permissions:
  contents: read
  pull-requests: write
jobs:
  score:
    runs-on: ubuntu-latest
    steps:
      - uses: HMAKT99/ScBee/action@main
        with:
          min_score: 60          # optional: fail below this readiness score
          comment: "true"        # optional: one PR comment, updated in place
          github_token: ${{ github.token }}
```

Inputs: `min_score`, `min_agent_ready`, `comment`, `github_token`, `repository`, `url`. Outputs: `readiness`, `agent_ready`. Private repositories cannot be scored. A score is about readiness, not a prediction.
