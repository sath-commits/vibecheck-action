#!/usr/bin/env node
'use strict'

const https = require('https')
const http = require('http')
const fs = require('fs')

const apiUrl = (process.env.INPUT_API_URL || '').replace(/\/$/, '')
const targetUrl = process.env.INPUT_URL || ''
const failBelow = parseInt(process.env.INPUT_FAIL_BELOW || '60', 10)
const blockOn = (process.env.INPUT_BLOCK_ON || 'CRITICAL,HIGH')
  .split(',')
  .map((s) => s.trim().toUpperCase())
  .filter(Boolean)
const privacy = (process.env.INPUT_PRIVACY || 'private').toLowerCase()
const commentMode = (process.env.INPUT_COMMENT_MODE || 'update').toLowerCase()
const authLoginUrl = process.env.INPUT_AUTH_LOGIN_URL || ''
const authUsername = process.env.INPUT_AUTH_USERNAME || ''
const authPassword = process.env.INPUT_AUTH_PASSWORD || ''
const githubToken = process.env.GITHUB_TOKEN
const githubRepo = process.env.GITHUB_REPOSITORY
const githubEventPath = process.env.GITHUB_EVENT_PATH
const githubOutput = process.env.GITHUB_OUTPUT
const githubStepSummary = process.env.GITHUB_STEP_SUMMARY
const COMMENT_MARKER = '<!-- vibecheck-report -->'

function setOutput(name, value) {
  if (githubOutput) {
    fs.appendFileSync(githubOutput, `${name}=${value}\n`)
  }
}

function log(msg) {
  process.stdout.write(msg + '\n')
}

function request(url, options = {}, bodyObj = null) {
  return new Promise((resolve, reject) => {
    let parsedUrl
    try {
      parsedUrl = new URL(url)
    } catch (e) {
      return reject(new Error(`Invalid URL: ${url}`))
    }
    const lib = parsedUrl.protocol === 'https:' ? https : http
    const bodyStr = bodyObj !== null ? JSON.stringify(bodyObj) : null
    const headers = { ...(options.headers || {}) }
    if (bodyStr) {
      headers['Content-Type'] = 'application/json'
      headers['Content-Length'] = Buffer.byteLength(bodyStr)
    }
    const req = lib.request(
      {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: options.method || 'GET',
        headers,
      },
      (res) => {
        let data = ''
        res.on('data', (chunk) => { data += chunk })
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) })
          } catch {
            resolve({ status: res.statusCode, body: data })
          }
        })
      }
    )
    req.setTimeout(options.timeout || 30000, () => {
      req.destroy(new Error(`Request timed out after ${options.timeout || 30000}ms`))
    })
    req.on('error', reject)
    if (bodyStr) req.write(bodyStr)
    req.end()
  })
}

function oneLine(value) {
  return String(value || '').replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim()
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getScoreBand(score) {
  if (score >= 85) return 'Ship it'
  if (score >= 70) return 'Almost there'
  if (score >= 50) return 'Fix before launch'
  return 'Needs attention'
}

function getBandEmoji(score) {
  if (score >= 85) return '[pass]'
  if (score >= 70) return '[warn]'
  if (score >= 50) return '[warn]'
  return '[fail]'
}

function calcCategoryScore(catResults) {
  const weights = { CRITICAL: 15, HIGH: 8, MEDIUM: 4, LOW: 1 }
  const active = catResults.filter((r) => r.status !== 'SKIP')
  if (active.length === 0) return 100
  const maxPoints = active.reduce((s, r) => s + (weights[r.severity] || 1), 0)
  const deductions = active
    .filter((r) => r.status === 'FAIL')
    .reduce((s, r) => s + (weights[r.severity] || 1), 0)
  return Math.max(0, Math.round(((maxPoints - deductions) / maxPoints) * 100))
}

function issuePriority(a, b) {
  const statusPriority = { FAIL: 0, ERROR: 0, WARN: 1, PASS: 2, SKIP: 3 }
  const severityPriority = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
  return (
    (statusPriority[a.status] ?? 9) - (statusPriority[b.status] ?? 9) ||
    (severityPriority[a.severity] ?? 9) - (severityPriority[b.severity] ?? 9) ||
    (a.category || '').localeCompare(b.category || '') ||
    (a.name || a.checkId || '').localeCompare(b.name || b.checkId || '')
  )
}

function getIssues(results) {
  return results
    .filter((r) => r.status === 'FAIL' || r.status === 'WARN' || r.status === 'ERROR')
    .sort(issuePriority)
}

function getBlockers(results) {
  return results
    .filter((r) => (r.status === 'FAIL' || r.status === 'ERROR') && blockOn.includes(String(r.severity || '').toUpperCase()))
    .sort(issuePriority)
}

function buildComment(audit, apiUrlBase, gate) {
  const { score, url, results = [], id } = audit
  const band = getScoreBand(score)
  const emoji = getBandEmoji(score)
  const reportUrl = `${apiUrlBase}/audit/${id}`

  // Category breakdown
  const catMap = {}
  for (const r of results) {
    if (!catMap[r.category]) catMap[r.category] = []
    catMap[r.category].push(r)
  }

  const categoryRows = Object.entries(catMap)
    .map(([cat, catResults]) => {
      const catScore = calcCategoryScore(catResults)
      const pass = catResults.filter((r) => r.status === 'PASS').length
      const fail = catResults.filter((r) => r.status === 'FAIL').length
      const warn = catResults.filter((r) => r.status === 'WARN').length
      return `| ${oneLine(cat)} | ${catScore}/100 | ${pass} | ${fail} | ${warn} |`
    })
    .join('\n')

  // Issues
  const issues = getIssues(results)
  const failCount = issues.filter((r) => r.status === 'FAIL').length
  const warnCount = issues.filter((r) => r.status === 'WARN').length

  const issueLines = issues
    .slice(0, 8)
    .map((r) => {
      const icon = r.status === 'FAIL' || r.status === 'ERROR' ? '[fail]' : '[warn]'
      const sev = r.severity ? ` \`${r.severity}\`` : ''
      const msg = r.message ? `: ${oneLine(r.message)}` : ''
      const fix = r.fixSuggestion ? `\n  > **Fix:** ${oneLine(r.fixSuggestion)}` : ''
      const pass = r.passType ? ` _${r.passType}_` : ''
      return `- ${icon} **${oneLine(r.name || r.checkId)}**${sev}${pass}${msg}${fix}`
    })
    .join('\n')

  const issuesSection =
    issues.length > 0
      ? `### Fix These First (${failCount} fail, ${warnCount} warn)\n\n${issueLines}`
      : '### Fix These First\n\nNo blocking failures or warnings found.'

  return `${COMMENT_MARKER}
## ${emoji} VibeCheck - ${score}/100 - ${band}

**URL:** \`${oneLine(url)}\`
**Gate:** ${gate.passed ? 'Passed' : 'Failed'} (${gate.reason})
**Privacy:** ${audit.isPublic ? 'public report' : 'private report'}

### Category Breakdown

| Category | Score | Pass | Fail | Warn |
|----------|-------|------|------|------|
${categoryRows}

${issuesSection}

[View full report](${reportUrl})

---
*VibeCheck - automated launch-readiness checks for modern web apps*`
}

async function postPrComment(comment) {
  if (commentMode === 'off') {
    log('comment_mode=off - skipping PR comment')
    return
  }
  if (!githubToken || !githubRepo || !githubEventPath) {
    log('No GITHUB_TOKEN or event context - skipping PR comment')
    return
  }
  let prNumber
  try {
    const event = JSON.parse(fs.readFileSync(githubEventPath, 'utf8'))
    prNumber = event.pull_request?.number
  } catch (e) {
    log(`Could not read event file: ${e.message}`)
    return
  }
  if (!prNumber) {
    log('Not a pull_request event - skipping PR comment')
    return
  }
  const [owner, repo] = githubRepo.split('/')
  try {
    const headers = {
      Authorization: `token ${githubToken}`,
      'User-Agent': 'VibeCheck-Action/1.0',
      Accept: 'application/vnd.github.v3+json',
    }
    const commentsUrl = `https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/comments`
    let existing = null
    if (commentMode === 'update') {
      const list = await request(commentsUrl, { headers })
      if (list.status === 200 && Array.isArray(list.body)) {
        existing = list.body.find((item) => typeof item.body === 'string' && item.body.includes(COMMENT_MARKER))
      }
    }

    const res = existing
      ? await request(existing.url, { method: 'PATCH', headers }, { body: comment })
      : await request(commentsUrl, { method: 'POST', headers }, { body: comment })

    if ((existing && res.status === 200) || (!existing && res.status === 201)) {
      log(existing ? 'PR comment updated successfully' : 'PR comment posted successfully')
    } else {
      log(`PR comment failed with status ${res.status}`)
    }
  } catch (e) {
    log(`Could not post PR comment: ${e.message}`)
  }
}

function writeSummary(audit, gate, auditUrl) {
  if (!githubStepSummary) return
  const results = audit.results || []
  const issues = getIssues(results).slice(0, 8)
  const rows = issues.length
    ? issues.map((r) => `| ${oneLine(r.status)} | ${oneLine(r.severity)} | ${oneLine(r.category)} | ${oneLine(r.name || r.checkId)} |`).join('\n')
    : '| - | - | - | No blocking failures or warnings found |'

  fs.appendFileSync(
    githubStepSummary,
    `# VibeCheck\n\n` +
      `Score: **${audit.score ?? 0}/100** (${getScoreBand(audit.score ?? 0)})\n\n` +
      `Gate: **${gate.passed ? 'Passed' : 'Failed'}** - ${gate.reason}\n\n` +
      `[Full report](${auditUrl})\n\n` +
      `| Status | Severity | Category | Finding |\n` +
      `|---|---:|---|---|\n` +
      `${rows}\n`
  )
}

function emitAnnotations(blockers) {
  for (const blocker of blockers.slice(0, 10)) {
    const title = `${oneLine(blocker.severity || 'BLOCKER')} ${oneLine(blocker.category || 'VibeCheck')}`
    const message = `${oneLine(blocker.name || blocker.checkId || 'Finding')}${blocker.message ? `: ${oneLine(blocker.message)}` : ''}`
    log(`::error title=${title}::${message}`)
  }
}

async function run() {
  if (!apiUrl) {
    log('::error::api_url input is required')
    process.exit(1)
  }
  if (!targetUrl) {
    log('::error::url input is required')
    process.exit(1)
  }
  if (!Number.isInteger(failBelow) || failBelow < 0 || failBelow > 100) {
    log('::error::fail_below must be an integer from 0 to 100')
    process.exit(1)
  }
  if (!['private', 'public'].includes(privacy)) {
    log('::error::privacy must be "private" or "public"')
    process.exit(1)
  }
  if (!['update', 'new', 'off'].includes(commentMode)) {
    log('::error::comment_mode must be "update", "new", or "off"')
    process.exit(1)
  }
  if ((authLoginUrl || authUsername || authPassword) && (!authUsername || !authPassword)) {
    log('::error::auth_username and auth_password are both required for authenticated audits')
    process.exit(1)
  }

  log(`VibeCheck: auditing ${targetUrl}`)
  log(`API: ${apiUrl}`)
  log(`Fail threshold: ${failBelow}`)
  log(`Block on: ${blockOn.join(', ') || 'none'}`)
  log(`Privacy: ${privacy}`)

  // Create audit
  let auditId
  try {
    const res = await request(`${apiUrl}/api/audit`, { method: 'POST' }, {
      url: targetUrl,
      privacy,
      auth: authUsername && authPassword ? {
        loginUrl: authLoginUrl || undefined,
        username: authUsername,
        password: authPassword,
      } : undefined,
    })
    if (res.status !== 201 || !res.body?.id) {
      log(`::error::Failed to create audit (HTTP ${res.status}): ${JSON.stringify(res.body)}`)
      process.exit(1)
    }
    auditId = res.body.id
    log(`Audit created: ${auditId}`)
  } catch (e) {
    log(`::error::Failed to reach VibeCheck API: ${e.message}`)
    process.exit(1)
  }

  // Poll until complete (max 10 minutes = 60 x 10s)
  const MAX_ATTEMPTS = 60
  let audit = null

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    await sleep(10000)
    try {
      const res = await request(`${apiUrl}/api/audit/${auditId}`)
      if (res.status !== 200) {
        log(`Poll attempt ${attempt}: HTTP ${res.status}`)
        continue
      }
      const data = res.body
      log(`[${attempt}/${MAX_ATTEMPTS}] status=${data.status}`)
      if (data.status === 'COMPLETE') {
        audit = data
        break
      }
      if (data.status === 'FAILED') {
        log('::error::Audit worker reported FAILED status')
        process.exit(1)
      }
    } catch (e) {
      log(`Poll attempt ${attempt} error: ${e.message}`)
    }
  }

  if (!audit) {
    log('::error::Audit timed out after 10 minutes')
    process.exit(1)
  }

  const score = audit.score ?? 0
  const band = getScoreBand(score)
  const results = audit.results || []
  const blockers = getBlockers(results)
  const failCount = results.filter((r) => r.status === 'FAIL' || r.status === 'ERROR').length
  const warnCount = results.filter((r) => r.status === 'WARN').length
  const blockerCount = blockers.length
  const auditUrl = `${apiUrl}/audit/${auditId}`
  const gate = {
    passed: score >= failBelow && blockerCount === 0,
    reason: score < failBelow
      ? `score ${score} is below fail_below ${failBelow}`
      : blockerCount > 0
        ? `${blockerCount} ${blockOn.join('/')} blocker(s) found`
        : 'score and blocker policy passed',
    blockerCount,
  }

  log(`\nVibe Score: ${score}/100 - ${band}`)
  log(`Findings: ${failCount} fail/error, ${warnCount} warn, ${blockerCount} blocker(s)`)

  // Set outputs
  setOutput('score', score)
  setOutput('band', band)
  setOutput('audit_id', auditId)
  setOutput('audit_url', auditUrl)
  setOutput('fail_count', failCount)
  setOutput('warn_count', warnCount)
  setOutput('blocker_count', blockerCount)

  // Post PR comment
  const comment = buildComment(audit, apiUrl, gate)
  await postPrComment(comment)
  writeSummary(audit, gate, auditUrl)
  emitAnnotations(blockers)

  // Gate on threshold
  if (!gate.passed) {
    log(`\n::error::VibeCheck gate failed: ${gate.reason}`)
    process.exit(1)
  }

  log(`\nVibeCheck gate passed: ${gate.reason}`)
}

run().catch((e) => {
  log(`::error::${e.message}`)
  process.exit(1)
})
