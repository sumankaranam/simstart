# Cloudflare deployment

- URL: https://simstart.simstart.workers.dev
- Worker: simstart
- D1 database: simstart-nav, APAC region
- Initial import: 5 funds, 12,732 NAV observations, about 0.55 MB database storage
- Each fund's refresh runs once daily in its assigned UTC hour; the first five slots run from 05:30 through 09:30 IST.
- No paid plan upgrade, domain purchase, R2 bucket or other paid service was enabled by the deployment.
- Billing subscription read access was not granted by the limited deployment authorization. Account billing should remain on the new account's free plan.

Credentials, downloaded market data, dependency directories and local runtime files are excluded from the repository. GitHub contains the application, schema, importer and tests. Deployment is currently through the authorized local Wrangler CLI, not automatic on GitHub pushes.

To redeploy: `npm.cmd run deploy`. Seed import is a separate owner-only CLI action, not a public HTTP endpoint. Existing seeded rows are not overwritten by bootstrap imports. Use scheduled refresh to update existing data.

The existing Sites beta is separate: https://sip-lab-suman.sumankaranam27.chatgpt.site
