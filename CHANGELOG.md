# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial release of the official TypeScript / Node.js SDK for the
  [twtapi.io](https://twtapi.io) HTTP API.
- Full coverage of the public API surface: users, tweets, search, login,
  engagement (post / like / retweet / bookmark / follow), media upload,
  account password change, and communities.
- Async iterators for every paginated endpoint, with `maxPages` and
  `maxItems` caps.
- Typed exception hierarchy with status-aware subclasses (`RateLimitError`,
  `ValidationError`, `DuplicateTweetError`, ...).
- Automatic `ct0` rotation on engagement responses, exposed via
  `client.cookies.ct0` and the optional `onCt0Rotated` callback.
- `change_password` auto-rotates the held `auth_token` + `ct0` pair.
- Optional `X-Proxy` header per client, optional structured logger.
- Built-in `fetch` only — zero runtime dependencies. Ships ESM + CJS + d.ts.
