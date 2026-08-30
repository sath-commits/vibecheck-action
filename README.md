# VibeCheck Launch Readiness Action

Run 212 automated launch-readiness checks on your staging URL and gate every PR on a Vibe Score.

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
        uses: sath-commits/vibecheck-action@v1
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

212 automated checks across 18 categories:

- **Authentication** (18) - login flows, session management, OAuth, magic links
- **Payments** (14) - Stripe integration, webhooks, subscription management
- **Database** (10) - RLS policies, pagination, error states, validation
- **API** (12) - endpoint security, CORS, rate limiting, error handling
- **Frontend** (16) - loading states, error boundaries, form UX, accessibility
- **Mobile** (10) - responsive layout, touch targets, viewport, iOS issues
- **Performance** (15) - bundle size, image optimization, TTFB, LCP, caching
- **Security** (18) - CSP, HTTPS, CSRF, mixed content, admin protection
- **Email** (9) - SPF, DKIM, unsubscribe, confirmation flows
- **AI Safety** (18) - key exposure, direct AI calls, rate limiting, prompt leakage
- **SEO Basics** (15) - title, meta description, OG tags, sitemap, canonical, alt text
- **Legal** (8) - privacy policy, ToS, cookie consent, contact info, copyright
- **Content** (11) - placeholder titles, broken images, favicon, 404 page, generic copy
- **Production Readiness** (8) - dev mode, sourcemaps, debug routes, localhost URLs, cache headers
- **Observability** (5) - error monitoring, analytics, health endpoint, feedback, tracing
- **Launch Readiness** (6) - CTA above fold, autoplay video, hero content, social proof, demo
- **Accessibility** (14) - keyboard access, focus, semantics, assistive technology, motion
- **Privacy** (5) - consent, tracking, browser storage, personal data exposure

## Authenticated pass

To test behind a login, create a throwaway test account in your app and pass the credentials:

```yaml
- uses: sath-commits/vibecheck-action@v1
  with:
    url: https://your-staging-app.vercel.app
    auth_username: test@yourapp.com
    auth_password: ${{ secrets.TEST_ACCOUNT_PASSWORD }}
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Credentials are used once per audit run and never stored.
