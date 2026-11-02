# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Product

An educational ETF portfolio simulator for UK investors. Users learn how ETF portfolios behave by experimenting with simulated portfolios; no real money or real trades are involved.

Keep these in mind when building features:

- **Educational, not advisory.** Present simulations as illustrations. Do not recommend specific investments or tell users what they should buy, and do not imply that simulated or past performance predicts future returns.
- **UK-first.** Default to GBP and UK terminology, formats and investor context.

## Stack status

| Layer | Status |
| --- | --- |
| Next.js 16 (App Router), React 19, TypeScript | In place |
| Tailwind CSS 4, shadcn/ui | In place |
| Supabase (data and auth) | Planned: not installed or configured |
| Vercel (hosting) | Planned: not linked or configured |

The app is still the default starter page. There are no tests or test runner yet.

## Commands

```bash
npm run dev      # Dev server at http://localhost:3000
npm run build    # Production build
npm run start    # Serve the production build
npm run lint     # ESLint
npx tsc --noEmit # Type-check
npx shadcn@latest add <component>  # Add a shadcn/ui component to components/ui/
```

## Project-specific notes

- **Next.js features:** `next.config.ts` enables `cacheComponents` and `partialPrefetching`, which change how data fetching and caching work. Check `node_modules/next/dist/docs/` before writing data-fetching code.
- **Tailwind runs through Turbopack:** CSS goes through the `@tailwindcss/turbopack` loader configured in `next.config.ts`. There is no PostCSS config or `tailwind.config` file; theme tokens live in `app/globals.css`.
- **Tailwind versions are pinned:** `tailwindcss` and `@tailwindcss/turbopack` are pinned to exactly the same version (4.3.3). Upgrade them together. 4.3.3 was chosen because the 4.3.4 release was incomplete on npm when the project was set up.
- **shadcn/ui:** Uses the `base-nova` style, built on `@base-ui/react` rather than Radix. Components in `components/ui/` are owned source code and can be edited directly.
- **`cn()` helper:** Comes from the `cn` npm package, shadcn's replacement for `clsx` + `tailwind-merge`. `lib/utils.ts` re-exports it, and generated components may import from `cn` directly.
- **Import alias:** `@/*` maps to the repo root. There is no `src/` directory.
- **`AGENTS.md`:** Its managed block is rewritten by `next dev`. Put project guidance in this file instead.
