# Deployment

CVL is a static artifact. There is no server runtime: every scene, operator and metric runs in
the browser against a locally generated answer key.

## GitHub Actions

`.github/workflows/deploy-swa-cvl-aserdargun-com.yml` runs on `main` and on manual dispatch:

1. checkout, Node 22, `npm ci`
2. `npm run validate` with `CVL_PREVIEW=1`
3. upload the prebuilt `dist/` with `skip_app_build: true`
4. `node scripts/verify-live.mjs` against the generated address, expecting this commit
5. run the browser suite against the production address

The deployment token is read only from `AZURE_STATIC_WEB_APPS_API_TOKEN_SWA_CVL_ASERDARGUN_COM`
and is never printed or stored. Production deployments serialise through a `concurrency` group
with `cancel-in-progress: false`, so a running upload is never cancelled.

## Completion contract

Report complete only with same-run evidence for every surface: local validation, the remote
commit, one successful workflow run, the Azure resource names and West Europe Free SKU, an
environment update timestamp no older than the deploy step, the generated
`*.azurestaticapps.net` address answering 200, and the browser suite passing against production.

A submitted operation, a queued run, a successful build without upload, or an unexecuted test is
not completion.

## Domain

Custom domains are configured separately, after the generated hostname is verified. DNS is not
touched by this repository: no CNAME, TXT, A or AAAA record belongs in a deploy workflow.
