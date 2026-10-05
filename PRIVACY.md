# Privacy Policy

Meyar Clarity is designed to be transparent about what it reads and where data goes.

## Local Heuristic Mode

When the local AI backend is not running, Meyar Clarity uses local heuristic rules inside the Figma plugin.

In this mode:

- selected frame data is read by the plugin inside Figma
- no selected frame data is sent to an external server
- no API key is required
- no audit data is intentionally stored by the plugin

## Optional AI Mode

AI mode is optional and uses a local backend running on your machine at:

```text
http://localhost:8787
```

When AI mode is enabled, the plugin sends a compact summary of the selected frame to the local backend. This summary can include:

- frame name
- frame size
- layer names
- visible text snippets
- detected UI patterns
- rough layer counts and dimensions
- local heuristic findings

The local backend then sends that compact summary to the OpenAI API using the API key you provide in your terminal environment.

## API Keys

Do not put API keys in `manifest.json`, `code.js`, `ui.html`, GitHub, screenshots, or shared Figma files.

The recommended setup is to provide your key only through your local terminal environment:

```bash
OPENAI_API_KEY=your_api_key_here
```

## Data Storage

Meyar Clarity does not intentionally store:

- your Figma files
- selected frame data
- audit results
- API keys

The local backend processes each request in memory.

## Third-Party Processing

If you enable AI mode, compact frame data is processed by OpenAI according to your OpenAI account and API settings.

## Recommended Public Use

For public or team use, use one of these approaches:

- local heuristic mode
- bring-your-own-key local backend
- a hosted backend with authentication, rate limits, clear privacy terms, and billing controls
