# VibeCheck Launch Readiness Action

Run 162 automated launch-readiness checks on your staging URL and gate every PR on a Vibe Score.

Checks auth, payments, database, API, frontend, mobile, performance, security, SEO, legal, and more — then posts a full report as a PR comment.

## Usage

```yaml
name: VibeCheck

on:
  pull_request:
    branches: [main]

jobs:
  vibecheck:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write

    steps:
      - uses: actions/checkout@v4

      - name: Run VibeCheck
        uses: Sathappan/vibecheck-action@v1
        with:
          url: https://your-staging-app.vercel.app
          fail_below: 60
          block_on: CRITICAL,HIGH
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `url` | Yes | — | Staging URL to audit (must be publicly reachable) |
| `api_url` | No | `https://vibecheck.builtthisweekend.com` | VibeCheck API URL |
| `fail_below` | No | `60` | Fail the step if Vibe Score is below this value |
| `block_on` | No | `CRITICAL,HIGH` | Severities that block the PR when a FAIL is found |
| `privacy` | No | `private` | Audit visibility: `private` or `public` |
| `comment_mode` | No | `update` | PR comment mode: `update`, `new`, or `off` |
| `auth_login_url` | No | — | Login URL for authenticated pass |
| `auth_username` | No | — | Test account email for authenticated pass |
| `auth_password` | No | — | Test account password for authenticated pass |

## Outputs

| Output | Description |
|--------|-------------|
| `score` | Vibe Score (0–100) |
| `band` | Score band (e.g. "Ship it", "Almost there") |
| `audit_id` | Audit ID |
| `audit_url` | Full URL to the audit report |
| `fail_count` | Number of failing checks |
| `warn_count` | Number of warnings |
| `blocker_count` | Number of blocking findings |

## What gets checked

162 automated checks across 16 categories:

- **Auth** — login flows, session handling, auth guards
- **Payments** — Stripe integration, webhook handling, receipt emails
- **Database** — connection errors, N+1 queries, missing indexes
- **API** — error handling, rate limits, CORS, response times
- **Frontend** — console errors, broken links, missing meta tags
- **Mobile** — viewport, tap targets, iOS zoom, horizontal scroll
- **Performance** — LCP, CLS, TTFB, bundle size
- **Security** — CSP headers, exposed keys, HTTPS, XSS vectors
- **SEO** — title, description, sitemap, robots.txt
- **Legal** — privacy policy, cookie consent, terms of service
- **Email** — transactional email, SPF/DKIM, reply-to
- **AI** — rate limiting on AI endpoints, key exposure
- **Content** — broken images, placeholder text, favicon
- **Observability** — error tracking, logging, request IDs
- **Launch** — social share, OG tags, trust signals

## Authenticated pass

To test behind a login, create a throwaway test account in your app and pass the credentials:

```yaml
- uses: Sathappan/vibecheck-action@v1
  with:
    url: https://your-staging-app.vercel.app
    auth_username: test@yourapp.com
    auth_password: ${{ secrets.TEST_ACCOUNT_PASSWORD }}
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Credentials are used once per audit run and never stored.
