# Founders Finance — RCL edition

This fork starts at `88b28402ab1185e439b431b1f00423931908715a` on `brand/rcl-2026-10-22`. The complete original blue edition is preserved by tag `original-blue-2026-10-22`. The original checkout, owner configuration, owner database, and installed shortcuts were not changed.

## GitHub versus local

GitHub `dtolani13/founders_finance` main and the canonical local main both point to `88b2840` (checked again on 2026-10-22). The local tracked source differed only in its AGENTS.md addition adopting No-Proof-No-Run v2; that instruction was retained. The separate commercial and personal local variants also had that base commit; neither was used as the authoritative source. Work was performed in an isolated checkout copied from the canonical source without private environment files, financial data, evidence, or backups.

## Approved identity

The two assets below are unchanged byte copies from the corrected FoundersVaultOS RCL edition, whose approved source is the owner's RCL email signature. The isolated six-blade copper/silver turbine is the active emblem. The full rectangular reference card is retained only for provenance and is never rendered by the app.

| Asset | SHA-256 |
|---|---|
| `artifacts/founders-finance/public/brand/rcl-emblem.png` | `d64bb22605defd49536a6dac51b2d7d2695793c6e4418709cb802a8dba940f15` |
| `artifacts/founders-finance/public/brand/rcl-logo-approved.png` | `60190a861d3c9ccdf1e1a0d92209a9483c840d60534599d621b6d233c4f8e010` |

Active placements: 48 px sidebar/studio signature, compact phone header, navigation drawer, and favicon. Product text remains **Founders Finance**; studio credit is **Recursive Chaos Labs**; tagline is **Refining Chaos Into Clarity**. The original product slogan remains live text.

| Role | Color |
|---|---|
| Copper button / readable copper text | `#B87333` / `#CD945F` |
| Silver / warm white | `#A7AAAF` / `#F5F3EE` |
| Background / card / sidebar | `#181818` / `#222222` / `#141414` |
| Input boundary | `#77716B` |

The original `src/index.css` is unchanged. RCL overrides are in `src/brand-rcl.css` and enabled by `data-brand="rcl"`. Success, warning, error, and entity-specific colors remain separate from the brand. New company defaults use the RCL palette. Fonts load locally through the system stack; browser zoom is enabled.

## Review and use

The isolated review frontend is `http://127.0.0.1:18186/`; its API is on loopback port 18184 and its synthetic database on 55442. This is a review workspace, not the installed owner application. The retained `release/` EXE and PDF/DOCX owner guides are historical blue-edition artifacts; this work does not claim a rebuilt native installer or an installed upgrade. Use the RCL source build and the instructions below for this edition.

For a new controlled local installation, use a separate database and storage directories, configure `.env` from `.env.example`, run `pnpm install --frozen-lockfile`, `pnpm db:migrate`, `pnpm build`, then `pnpm app:start`. Keep API_PORT, WEB_PORT and APP_ALLOWED_ORIGINS aligned. Back up and reconcile opening balances before pointing the fork at existing books. Current balance reads now derive from opening balances plus posted journal lines; the old stored current_balance field is not authoritative. Drafts and voids do not affect cash.

The source review fixture at `artifacts/api-server/src/fixtures/seed-rcl-review.ts` refuses every database except the empty, isolated `finance_rcl_review` database on 127.0.0.1:55442. It never clears existing data. It is not part of application startup.

See [Statement ingestion](STATEMENT_INGESTION.md), [Design audit](DESIGN-AUDIT.md), and [Verification](VERIFICATION_2026-10-22.md). Website screenshots use synthetic companies and are supplied separately with captions and alt text. No website was published.
