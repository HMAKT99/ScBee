# GitHub App setup (for ScBee's own GitHub reads)

Without this, ScBee reads GitHub anonymously, which GitHub limits to **60 requests per hour for everyone sharing an address**. A GitHub App gives ScBee its own identity with **5,000 requests per hour**, and keeps a person's account out of it.

The app is read-only and only touches public data. It asks for no repository permissions and has no webhook.

## Create it (about 5 minutes, done by you)

1. Open <https://github.com/settings/apps/new>.
2. **GitHub App name:** something unique, for example `scbee-registry`.
3. **Homepage URL:** your site, for example `https://scbee.vercel.app`.
4. **Webhook:** untick **Active**. Leave **Callback URL** empty and leave user authorization options as they are.
5. **Permissions:** leave every permission at **No access**. (GitHub always grants read-only Metadata, which is all we need for public repos.)
6. **Where can this GitHub App be installed?** Choose **Only on this account**.
7. Click **Create GitHub App**. Note the **App ID** at the top of the next page.
8. On the same page, under **Private keys**, click **Generate a private key**. A `.pem` file downloads. Keep it private.
9. In the sidebar choose **Install App**, install it on your account, and select **Only select repositories** with one harmless repo (for example this one).
10. After installing, the browser address is `https://github.com/settings/installations/<NUMBER>`. That number is the **Installation ID**.

## Give ScBee the three values

Add these as environment variables (on Vercel: Project, Settings, Environment Variables, tick Production and Preview, switch **Sensitive** on). Type or paste them yourself; never put them in chat, an issue or a commit.

| Variable | Value |
|---|---|
| `GITHUB_APP_ID` | the App ID |
| `GITHUB_APP_INSTALLATION_ID` | the Installation ID |
| `GITHUB_APP_PRIVATE_KEY` | the full contents of the `.pem` file (if your host cannot take line breaks, replace each with `\n`) |
| `GITHUB_HOURLY_BUDGET` | optional cap, for example `1500`, to stay well under 5,000 |

Redeploy, then score a repo you have not scored before. ScBee now mints a short-lived installation token, caches it for about an hour, and uses it only for `api.github.com`.

## What it does and does not do

- It reads public repository metadata and README files. It never writes to GitHub: no comments, issues, stars or pull requests.
- If the token cannot be created, ScBee falls back to anonymous reads and stops retrying for 5 minutes, so a bad key cannot cause a flood of calls.
- Every call still goes through ScBee's shared hourly budget and a circuit breaker that pauses all GitHub calls for 10 minutes after any 403 or 429.
- The private key, the app token and the signing JWT are never logged or returned by any endpoint.
- To revoke everything, delete the private key or uninstall the app in GitHub.
