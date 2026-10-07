# Meyar Clarity

Meyar Clarity is a free local Figma plugin for reviewing B2B SaaS screens, dashboards, landing pages, settings, forms, tables, and admin flows for clarity risks before critique or handoff.

It helps designers find:

- unclear primary actions
- dense or hard-to-scan screens
- missing empty, loading, error, permission, and destructive states
- confusing billing, role, permission, or destructive-action copy
- handoff risks such as weak layer naming or repeated ambiguous labels

The plugin works locally with heuristic rules.

## Status

Early MVP. Use it for design review support, not as a replacement for user research, accessibility testing, or expert review.

## Features

- Figma side-panel UI
- selected-frame inspection
- pattern detection for tables, forms, dashboards, settings, billing, modals, and landing pages
- local heuristic audit with no external data transfer
- clarity score and complexity level
- prioritized findings
- missing states checklist
- jump to affected layer
- create canvas annotation notes
- generate an audit summary frame

## Install Locally

1. Download or clone this repository.
2. Open Figma Desktop.
3. Open any Figma design file.
4. Go to `Plugins > Development > Import plugin from manifest...`.
5. Select `manifest.json` from this folder.
6. Select a frame in Figma.
7. Run `Plugins > Development > Meyar Clarity`.

## Local Audit

Meyar Clarity runs its audit locally inside the Figma plugin. No external credentials, account, or companion service is required.

Selected frame data is not sent outside Figma.

## Privacy

Meyar Clarity does not intentionally store design data or audit data. See [PRIVACY.md](./PRIVACY.md) for details.

## Development Notes

Main files:

- `manifest.json` - Figma plugin manifest
- `code.js` - Figma plugin controller and local audit rules
- `ui.html` - plugin side-panel UI

## Roadmap

- user-controlled audit lenses
- deeper landing page conversion audit
- improved issue filtering and resolved state
- better report frame design
- team rules and custom heuristics

## License

MIT. See [LICENSE](./LICENSE).
