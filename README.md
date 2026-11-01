# Simstart / SIP Lab

An Indian investment backtesting research beta, prepared for Cloudflare Workers Free + D1 Free. The public UI, browser simulation engine, API, scheduled NAV importer, SQL migrations and tests are included.

## Run and test

Requires Node.js 22.18 or later and npm.

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run db:local
npm.cmd run seed:prepare
node scripts/cloudflare.mjs d1 execute DB --local --file work/seed.sql
npm.cmd run dev
```

Tests are offline. Preparing actual seed data requires access to MFapi.in. The development server URL is printed by Wrangler. Source files are in public/, worker.mjs and data.mjs.

## Deploy to your own free Cloudflare account

1. Confirm the account remains on Workers Free. Do not purchase a domain, upgrade Workers, or enable paid storage.
2. `node scripts/cloudflare.mjs login --device --scopes account:read user:read workers:write workers_scripts:write d1:write`
3. `node scripts/cloudflare.mjs whoami`
4. `node scripts/cloudflare.mjs d1 create simstart-nav --binding DB --update-config --location apac`
5. `npm.cmd run db:remote`
6. `npm.cmd run seed:prepare`
7. `node scripts/cloudflare.mjs d1 execute DB --remote --file work/seed.sql`
8. `npm.cmd run deploy`

Record the returned workers.dev URL. Check /api/health, /api/catalogue and /api/fund/120716, then verify a browser backtest. Never report a dry run or local response as proof of a public deployment.

The deployment helper applies pending schema migrations and publishes. It never changes plans or purchases services. Cloudflare's free-plan quotas still limit availability: free does not mean unlimited. An existing paid Cloudflare account could incur costs, so verify the account plan first.

## Data design and free-tier boundaries

- Five starter growth funds, chosen to exercise broad-market and sector history; not recommendations.
- One JSON history snapshot per fund, served from D1. Each snapshot is capped at 1 MB. Schema constraints limit the catalogue to 20 funds through unique refresh slots 0–19.
- Hourly Cron Trigger selects the fund assigned to that UTC hour, so each stored fund refreshes once per day. Initial slots 0–4 correspond to 05:30–09:30 IST. Other hours do no import work. Propagation of a newly deployed Cron Trigger may take time.
- Public API requests do not write database rows. Arbitrary fund searches cannot fill storage. Unstored growth funds are fetched on demand, without being persisted.
- Failed, malformed, truncated or older upstream histories preserve the previous snapshot. Stale/failure state is returned to the UI. Sync event logs are retained for 30 days.
- Static assets use Cloudflare's asset binding, avoiding Worker execution for each stylesheet and script. Simulations execute in the browser.
- No R2, paid queues, paid AI, commercial data feed or domain subscription is configured.
- Credentials are stored only in ignored .cloudflare-auth/; never commit or export it. No user portfolios or CSV contents are uploaded.

Cloudflare Free limits checked 1 November 2026: 100,000 dynamic Worker requests/day; D1 5 million rows read/day, 100,000 writes/day, 500 MB per database. Recheck vendor documentation before scaling. Other projects in the same account may share allowances. https://developers.cloudflare.com/d1/platform/pricing/ and https://developers.cloudflare.com/workers/platform/limits/

## Data and calculation limitations

MFapi.in is a third-party source. Free API access is not proof of a commercial redistribution licence. Confirm provider and underlying data rights before expanding into a bulk public data product. This app does not redistribute a complete index dataset. Raw downloaded seed data are ignored by Git.

Snapshots store the current provider history and its provenance, not every historical revision. For larger coverage, migrate to partitioned daily-price tables or object storage and versioned data snapshots. No full-market coverage, survivorship correction, corporate-action adjustment or exchange execution model is claimed.

Backtests support schedules, step-ups, dip buys, rise-triggered sales, equal-budget comparisons, XIRR, costs and simplified equity-tax estimates. See the app's methodology for limitations. Tax estimates are not tax filing calculations.
