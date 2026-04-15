# Contributing

Thanks for your interest in contributing to Browser Volume Control.

## Before You Start

- Check existing issues before opening a new one.
- Keep changes focused and easy to review.
- Prefer small pull requests over large, unrelated changes.
- Do not commit generated output such as `dist/`, `.zip`, or `.crx` files.

## Local Setup

```bash
npm install
npm run build
```

To develop with watch mode:

```bash
npm run dev
```

Load `dist/` as an unpacked extension from `chrome://extensions`.

## Pull Request Checklist

- Run `npm run build`.
- Update documentation if behavior changes.
- Include screenshots or short videos for UI changes when useful.
- Explain what was tested.
- Keep pull requests scoped to one feature, fix, or cleanup.

## Issue Reports

Useful bug reports include:

- Browser and operating system.
- Website where the issue happened.
- Steps to reproduce.
- Expected behavior.
- Actual behavior.
- Console errors, if available.

## Product Direction

The project currently follows a two-phase direction:

- Phase 1: simple current-tab volume control.
- Phase 2: remembered website preferences and preset modes.

Please avoid large feature additions that conflict with this direction unless there is an issue discussing the change first.
