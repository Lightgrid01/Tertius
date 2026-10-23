# Tertius

A pre-submission review for hackathon projects. Two independent judges read your public GitHub repo and your live page, a claim check compares what you say with what they found, and one ranked fix list quotes the exact line or screenshot region behind every finding.

## Requirements
- Node 20 or newer (20.6+ for `npm run measure`)
- A free Vercel account (`npm i -g vercel` or use `npx vercel`)
- Three free keys: Gemini (`GEMINI_API_KEY`), GitHub read-only token (`GITHUB_TOKEN`, no scopes needed for public repos), PageSpeed (`PSI_API_KEY`)

## Run locally
```bash
npm install
cp .env.example .env.local      # fill in the keys; set GEMINI_MODEL to a model your key can use
npm run measure                 # day-1 check: confirms the model name and finds your per-minute limit
npm run dev                     # page + review functions together, no Vercel CLI needed
```
Open http://localhost:5173 and check http://localhost:5173/api/health to see which keys were loaded. For design work without any services use `VITE_USE_FIXTURES=1 npm run dev` (see below). `npm start` runs the Vercel CLI (`vercel dev`) if you want it; it is optional.

## Environment variables
| Name | Purpose |
|---|---|
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Judge I, Judge II (vision) and the claim check. Run `npm run measure` first: it tests several models on your key and prints the `GEMINI_MODEL` line to use. Free quotas are per model and can be small. |
| `GEMINI_FALLBACK_MODEL` | Optional second model used automatically on a rate limit or overload. Measured on one free key: `gemini-2.5-flash` ~1 s per call and ~5 calls a minute; `gemini-3.8-flash` and `gemini-flash-latest` took 60-90 s per call, so avoid them. |
| `GITHUB_TOKEN` | Raises GitHub from ~60 to ~5,000 requests an hour. |
| `PSI_API_KEY` | PageSpeed quota. Works without one for light use. |
| `VITE_USE_FIXTURES` | UI development only. `1` shows a labelled sample review and calls nothing. Leave empty for real reviews and the demo. |

UI states while developing (with `VITE_USE_FIXTURES=1 npm run dev`): `#sample-running`, `#sample-partial`, `#sample-failed`, `#sample-claims`, `#sample-review` after the address, or press Begin review for a simulated run.

## Deploy (Vercel)
1. Push to a public GitHub repo.
2. In Vercel: Add New Project, import the repo (framework Vite is detected).
3. Add the four keys above under Settings, Environment Variables (not `VITE_USE_FIXTURES`).
4. Deploy. `vercel.json` sets each function's max duration (Hobby allows up to 300 s).

## How a review runs
`check-inputs` (repo exists and is public; optional Devpost text) → `judge-repo` and `judge-ui` in parallel → `claim-check` → the page computes all scores in `src/shared/score.ts` and ranks fixes in `src/shared/rank.ts`. The AI reads and quotes; it never does the arithmetic. Every quote is checked against the text the model was given, and every screenshot region against the image bounds, before it is shown. Nothing is stored.

## Tests
`npm test` runs 34 unit tests (score arithmetic, ranking, URL checks, quote verification, secret scan). `npm run typecheck` checks the page and the functions. `npm run smoke` runs the three functions against canned GitHub, PageSpeed and Gemini responses.

## Day-1 measurements (fill in)
- Working Gemini model name: 
- Measured per-minute ceiling (`npm run measure`): 
- One full review succeeded within it: 

## Choices that go beyond the spec (change any you disagree with)
- `Part` gets optional `advice` and `why`, and `Claim` an optional `note`, so each fix has a headline and a reason.
- Screenshot regions are stored as `[x, y, width, height]` fractions of the image; Gemini's `[ymin, xmin, ymax, xmax]` 0-1000 boxes are converted on the server.
- Gemini is asked for JSON (`responseMimeType`) and the shape is enforced by Zod with one automatic retry, instead of a Gemini response schema.
- Plain-code limits on Judge I: committed secrets cap Hygiene at 5/15; a single commit caps History at 2/10.
- Judge II metrics (PageSpeed scores, LCP) are copied from PageSpeed by code; the model can only cite them by id.
- Claim rules in code: "unsupported" needs a note, "contradicted" and "supported" need verified evidence, otherwise they downgrade.
- Devpost URLs are accepted only on devpost.com, with redirects re-checked.

## Later (in order, after the core)
1. Rewrite weak copy and rescore. 2. Fetch a judging rubric from a Devpost URL. 3. Calibration against reference entries.

## npm audit
`npm audit --omit=dev` reports 0 vulnerabilities: nothing shipped to users or run on the server is affected. `npm audit` still lists 3 in the test runner (vitest 3, dev only). Do not run `npm audit fix --force`; it jumps to a vitest major that may need a newer Node. Upgrade vitest on your own schedule.
