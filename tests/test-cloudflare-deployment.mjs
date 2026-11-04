import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/deploy-cloudflare-worker.yml', import.meta.url), 'utf8');
const config = JSON.parse(readFileSync(new URL('../workers/receipt/wrangler.jsonc', import.meta.url), 'utf8'));
const guide = readFileSync(new URL('../workers/receipt/README.md', import.meta.url), 'utf8');

assert.match(workflow, /workflow_run:[\s\S]*workflows: \['CI'\]/, 'Deploy must depend on successful CI');
assert.match(workflow, /workflow_dispatch:/, 'Allow authorised manual redeployment');
assert.match(workflow, /github\.ref == 'refs\/heads\/main'/, 'Manual deployments must run from main');
assert.match(workflow, /workflow_run\.conclusion == 'success'/, 'Do not deploy on failed CI');
assert.match(workflow, /workflow_run\.head_branch == 'main'/, 'Deploy only main commits');
assert.match(workflow, /head_repository\.full_name == github\.repository/, 'Reject forked workflow runs');
assert.match(workflow, /git rev-parse origin\/main/, 'Protect against stale CI runs');
assert.match(workflow, /git diff --quiet HEAD\^ HEAD -- workers\/receipt\//, 'Skip unchanged Worker code');
assert.match(workflow, /environment: production/, 'Restrict deployment to production environment');
assert.match(workflow, /secrets\.CLOUDFLARE_API_TOKEN/);
assert.match(workflow, /secrets\.CLOUDFLARE_ACCOUNT_ID/);
assert.match(workflow, /cloudflare\/wrangler-action@v4/);
assert.match(workflow, /workingDirectory: workers\/receipt/);
assert.match(workflow, /spv-receipt-service\.keyurgohil-uk\.workers\.dev\/health/, 'Verify Worker after deployment');
assert.match(workflow, /npm test/, 'Manual deployments need test gate');
assert.equal(config.keep_vars, true, 'Preserve dashboard-managed Cloudflare variables');
assert.equal(config.r2_buckets[0].bucket_name, 'spv-property-receipts', 'Keep existing R2 bucket');
assert.match(guide, /GitHub Actions deployment/);
console.log('Cloudflare Worker deployment workflow checks passed.');
