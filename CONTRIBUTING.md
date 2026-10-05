# Contributing

Thanks for considering contributing to Meyar Clarity.

Good first contributions:

- improve local audit rules
- add product type heuristics
- improve missing-state detection
- refine UI copy
- improve documentation
- test with real SaaS screens and report false positives

## Local Setup

1. Clone the repository.
2. Import `manifest.json` in Figma Desktop through `Plugins > Development > Import plugin from manifest...`.
3. Run the plugin against a selected frame.
4. Optional: run the local backend with `npm run start:backend`.

## Pull Request Guidelines

- Keep changes focused.
- Do not commit API keys or private design data.
- Add clear before/after notes for UI changes.
- Prefer small, understandable heuristic improvements.
- Keep privacy and cost control in mind.

## Security

If you find a privacy or security issue, do not open a public issue with sensitive details. Contact the maintainer privately first.
