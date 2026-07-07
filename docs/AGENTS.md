# Writing the mera docs

Guidance for authoring content in this site (`src/content/docs/`). It builds on [site/WRITING.md](../site/WRITING.md), which governs voice for everything published under the mera name. Read that first; this file adds the structure and mechanics specific to the docs site.

## Information architecture

The site follows the Diátaxis split (<https://diataxis.fr/>): each page does one job.

- **Getting started** teaches one first success, end to end. It may explain just enough to keep the reader moving, nothing more.
- **Concepts** explain how something works and why it is designed that way. No step-by-step instructions.
- **Recipes** solve one task each. A recipe assumes a competent reader with a goal, states its prerequisites, and gets to the point.
- **Reference** states facts about the public API, one exported function per page. Keep instructions, opinions, and long explanations out of it; link to them instead.

When content feels misplaced, move it and link to it. A reference page that starts teaching should hand that material to a recipe. A recipe that pauses to explain should link a concept page.

## Reference pages

One exported function per page. A new public export means a new page and a new sidebar entry in `astro.config.mjs`.

Fixed section order:

1. Frontmatter: `title` is the exact exported name, `description` is one sentence.
2. A short lead with no heading: what the function does and the one fact a caller must know. Functions that run WebAuthn ceremonies say so here, because a browser prompt is a visible side effect.
3. `## Import`: a single import statement.
4. `## Usage`: one focused, compilable example.
5. `## Parameters`: an intro line naming the options type, then one `### options.field` subheading per field (dotted for nested fields). Under each: a `- Type:` line, a `- Required` or `- Optional` line (with the default or omission behavior), then prose.
6. `## Returns`: the named result type and what it contains. Session constructors document the returned session's members here.
7. `## Errors`: one bullet per `MeraError` code with its trigger condition, each code linked to its anchor on the errors page.
8. `## Notes`: copy and zeroing semantics, determinism statements, caveats. Omit the section when there is nothing to say.
9. `## See also`: related functions, the owning concept page, the recipe that uses it.

Parameters use subheadings and lists, never wide tables. The content column is 46rem; a five-column table does not survive it. Tables are reserved for the error-code list and the authenticator matrix.

Source of truth is the JSDoc in `src/`. Write reference prose from it, and check the README when the JSDoc is silent. When the two disagree, the code wins; flag the README in the PR.

## Recipes

- Title with a verb: "Wrap a recovery phrase" rather than "Recovery phrase wrapping".
- One goal per page. Prerequisites in the first paragraph.
- Code blocks are complete and pasteable in order. A reader who pastes every block top to bottom ends with working code.
- Code adapted from `demo/src/` is an app-side pattern. Say so. mera produces entropy and signing sessions; derivation, storage, and transport belong to the app, and the recipe's framing must keep that boundary visible.

## Voice

The bar is simple, concise, and detailed at the same time, and that combination is the hard part: detail survives the cut, filler does not. Every sentence must add information a reader can act on. Delete sentences that only set up, restate, or editorialize on what the surrounding text already shows ("that choice is what makes this repeatable", "what happens next is the app's decision").

`site/WRITING.md` applies in full. The rules that carry the most weight here:

- Say "account". "Wallet" is only for wallet apps: MetaMask, Phantom, the demo.
- Calm explanation, no marketing. If a sentence would fit in a product brochure, rewrite it.
- Named wallet apps are examples, never an exhaustive list.
- Prefer a concrete statement over an abstract one. "The salt is 32 bytes" beats "the salt has a fixed size".
- Neutral possessives: "the passkey", "the secret". Avoid "your passkey".

## Sentence mechanics

- No em dashes. Use a comma, a period, a colon, or parentheses.
- No "not X, but Y" constructions, including "isn't just X" and "It's not about X". Rewrite the thought.
- Vary sentence length and openings. Three consecutive sentences with the same shape means one gets rewritten.
- Short paragraphs, but not a wall of one-liners.
- Banned vocabulary: seamless, robust, powerful, effortless, simply, leverage, unlock (as praise; unlocking a vault is fine), delve, game-changer.

## Accuracy

- Every claim must be checkable against the README or the JSDoc in `src/`.
- Examples import only the public API plus explicitly declared app-side dependencies.
- Security-sensitive behavior is stated plainly on the page where the risk is acted on: key material lifetimes, zeroing, nonce handling, prompt counts, and what the library cannot protect against.
- Support claims are date-stamped. The authenticator matrix lives in the README; this site mirrors it, and updates land in both places.

## Mechanics

- Frontmatter: every page has a `title` and a one-sentence `description`.
- Files are kebab-case; the file path is the slug.
- The sidebar in `astro.config.mjs` is hand-maintained. A sidebar slug without a page fails the build.
- Plain `.md` unless the page imports a component; then `.mdx`.
- Internal links are root-relative with a trailing slash: `/reference/errors/`.
- Never reference sections by number; name the thing and link it.
- `npm run build` must pass before a PR.

## Before opening a PR

1. `npm run build` passes.
2. New pages appear in the sidebar; no sidebar entry points at a missing page.
3. Examples compile against the current public API.
4. Every `MeraError` code mentioned links to the errors page.
5. No em dash anywhere in the diff.
6. No banned vocabulary, no "not X, but Y".
7. "Wallet" appears only next to wallet apps.
8. Claims trace to the README or JSDoc.
9. Security caveats sit on the page where the risk is acted on.
10. Links have descriptive text; no bare "here".
11. Every sentence adds information; no setup, restatement, or editorial sentences survive.
