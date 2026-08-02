# Firefox reviewer build instructions

Agent Readiness Inspector is written in TypeScript and bundled by WXT/Vite.
The submitted extension contains generated JavaScript, so this source archive
is supplied for AMO review.

## Release build environment for version 0.1.0

- GitHub Actions `ubuntu-latest`
- Node.js 22
- npm bundled with Node.js 22

All build tools and dependencies are open source and are fetched from the npm
registry using the committed `package-lock.json`. No environment variables,
private packages, web-based build tools, or external services are required.

## Reproduce the Firefox package

From the directory containing this file:

```sh
npm ci
npm run zip:firefox
```

The extension package is written to:

```text
dist/agent-readiness-inspector-0.1.0-firefox.zip
```

The unpacked build is written to `dist/firefox-mv2/`. The second ZIP created by
WXT is the source archive and is not part of the extension package.

The build performs ordinary TypeScript transpilation and bundling. Source code
is not obfuscated and the extension downloads no remote code at runtime.
