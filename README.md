# Meyar Clarity

Meyar Clarity is a free local Figma plugin for reviewing B2B SaaS screens, dashboards, landing pages, settings, forms, tables, and admin flows for clarity risks before critique or handoff.

It helps designers find:

- unclear primary actions
- dense or hard-to-scan screens
- missing empty, loading, error, permission, and destructive states
- confusing billing, role, permission, or destructive-action copy
- handoff risks such as weak layer naming or repeated ambiguous labels

The free version works locally with heuristic rules. Optional AI review is available through a local backend using your own OpenAI API key.

## Status

Early MVP. Use it for design review support, not as a replacement for user research, accessibility testing, or expert review.

## Features

- Figma side-panel UI
- selected-frame inspection
- pattern detection for tables, forms, dashboards, settings, billing, modals, and landing pages
- local heuristic audit with no external data transfer
- optional bring-your-own-key AI audit through a local backend
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

## Use Without AI

You can use Meyar Clarity without an API key. If the local backend is not running, the plugin automatically uses its local heuristic audit.

This mode does not send your selected frame data outside Figma.

## Optional AI Mode

AI mode is bring-your-own-key. Your API key stays in your local terminal environment and is not stored in the plugin files.

1. Open a terminal in the plugin folder.
2. Set your OpenAI API key.

PowerShell:

```powershell
$env:OPENAI_API_KEY="your_api_key_here"
```

macOS/Linux:

```bash
export OPENAI_API_KEY="your_api_key_here"
```

3. Optional: choose a low-cost model and token limits.

PowerShell:

```powershell
$env:OPENAI_MODEL="gpt-5-nano"
$env:MAX_OUTPUT_TOKENS="1200"
```

macOS/Linux:

```bash
export OPENAI_MODEL="gpt-5-nano"
export MAX_OUTPUT_TOKENS="1200"
```

4. Start the local backend.

```bash
npm run start:backend
```

5. Keep the terminal open while using the plugin.

Health check:

```text
http://localhost:8787/health
```

## Privacy

Local heuristic mode does not send frame data to any external service.

AI mode sends a compact summary of the selected frame to your local backend at `http://localhost:8787/audit`. The backend then sends that compact summary to the OpenAI API using your API key.

Meyar Clarity does not intentionally store design data, audit data, or API keys. See [PRIVACY.md](./PRIVACY.md) for details.

## Development Notes

Main files:

- `manifest.json` - Figma plugin manifest
- `code.js` - Figma plugin controller and local audit rules
- `ui.html` - plugin side-panel UI
- `server.js` - optional local AI backend
- `.env.example` - example backend environment variables

The manifest uses Figma's `devAllowedDomains` for localhost AI development.

## Cost Control

The backend is configured for low-cost audits by default:

- compact frame summary
- limited text and layer samples
- maximum 5 AI findings
- short evidence lists
- `MAX_OUTPUT_TOKENS=1200`
- default model: `gpt-5-nano`

For a public release, avoid using your own shared API key for all users unless you add accounts, rate limits, and billing.

## Roadmap

- user-controlled audit lenses
- deeper landing page conversion audit
- improved issue filtering and resolved state
- better report frame design
- optional hosted backend
- team rules and custom heuristics

## License

MIT. See [LICENSE](./LICENSE).
