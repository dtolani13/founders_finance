# RCL edition design audit — 2026-10-22

## Direction

Calm, precise financial operations: charcoal surfaces, restrained copper actions, silver supporting text, and readable financial tables. Founders Finance remains the product; Recursive Chaos Labs is the studio signature. Preserve the original blue edition at `original-blue-2026-10-22` (88b2840), including original assets and CSS.

## Observed baseline

The original production build was rendered at 1266 × 711 before UI edits. The login has a dominant rectangular blue product-logo card, a large repeated headline, cyan accents, and vertical overflow at this height. The sidebar uses a separate hand-drawn shield/chart SVG. These are original product assets, not the approved RCL emblem. The original static comparison intentionally had no API attached; its service-unavailable message was not treated as a backend result.

## Decisions

- Use the verified copper/silver turbine emblem from the approved FoundersVaultOS edition, unchanged. Never substitute the rejected convergence mark or the full rectangular brand reference card.
- Make the product name live text with a compact studio signature. Use a 48 px sidebar emblem and 18 px product name; keep navigation dominant.
- Keep original `index.css` intact and add an explicit RCL override sheet. Use charcoal #181818, card #222222, sidebar #141414, copper #B87333, light copper #CD945F, silver #A7AAAF, warm white #F5F3EE, and input boundary #77716B. Preserve semantic error, warning, and success colors.
- Remove external font dependencies; use the system sans stack for reliable local operation. Restore browser zoom.
- Show all valid CSV rows with pagination, explicit date/sign conventions, USD totals, duplicate flags and a final review acknowledgment. Clear review whenever mapping changes.
- Capture final desktop/mobile screens against a separate synthetic workspace; no owner records or credentials in marketing captures.

## Verification required

Fresh browser inspection after build: desktop and narrow layouts, navigation, login, statements preview/import, errors, and no viewport-wide horizontal overflow. Verify correct emblem bytes and favicon, contrast for actions/input boundaries, local-only network configuration, backend tests, regenerated contract, typecheck, production build, and documented recovery checks. Record actual results separately; this audit is not a completion claim.
