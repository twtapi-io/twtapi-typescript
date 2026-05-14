# Contributing

Thanks for taking the time to contribute. This is the official TypeScript
SDK for [twtapi.io](https://twtapi.io). Bug reports, fixes, and small
enhancements are very welcome.

## Local setup

```bash
git clone https://github.com/twtapi-io/twtapi-typescript.git
cd twtapi-typescript
npm install
npm run build
npm test
```

We support Node 18, 20, and 22, plus the latest Bun. CI runs the matrix
on Linux, macOS, and Windows.

## Code style

- TypeScript strict mode is non-negotiable. `npm run typecheck` must pass
  with zero errors.
- Biome handles linting and formatting. Run `npm run lint` and
  `npm run format` before opening a PR.
- No runtime dependencies. The SDK uses built-in `fetch` only.
- Numeric identifiers (`user_id`, `tweet_id`, `community_id`, `media_id`)
  are always strings — never `number`. JavaScript loses precision on 64-bit
  IDs.

## Tests

- We use Vitest + MSW. Tests live in `test/`.
- Never hit the real API in CI. Everything is mocked.
- Add a test for any new endpoint or behaviour change.

## Pull requests

- One concern per PR — easier to review, easier to revert.
- Include a CHANGELOG entry under `[Unreleased]`.
- The CI workflow must pass on every supported Node version + Bun before
  we merge.

## Releases

Maintainers tag `vX.Y.Z` on `main`. The publish workflow uses npm Trusted
Publishing (OIDC) so no long-lived tokens are needed.
