# GitHub Release Checklist

Use this checklist before making the repository public.

## Required

- [ ] Confirm no real secrets are committed.
- [ ] Confirm `.env` files are ignored.
- [ ] Confirm `README.md` describes local mode.
- [ ] Confirm `PRIVACY.md` explains what frame data is read.
- [ ] Confirm `LICENSE` is included.
- [ ] Confirm `manifest.json` imports successfully in Figma Desktop.
- [ ] Confirm plugin works without any companion service.
- [ ] Confirm generated notes and report frame work.
- [ ] Add screenshots to GitHub after taking fresh screenshots in Figma.

## Suggested Repository Settings

- Repository name: `meyar-clarity`
- Description: `Free Figma plugin for auditing SaaS UX clarity, complexity, missing states, and handoff risks.`
- Visibility: public when ready
- Topics:
  - `figma-plugin`
  - `ux`
  - `product-design`
  - `saas`
  - `accessibility`
  - `design-systems`

## First Git Commands

```bash
git init
git add .
git commit -m "Initial Meyar Clarity free plugin"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/meyar-clarity.git
git push -u origin main
```

## Before Sharing Publicly

- [ ] Rotate any secret that was previously pasted into chat or logs.
- [ ] Add 3-5 screenshots to the README.
- [ ] Add a short demo GIF or video if possible.
- [ ] Create GitHub issues for roadmap items.
- [ ] Add the GitHub URL to the future Figma Community listing.
