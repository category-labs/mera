# Writing the mera docs

Guidance for authoring content in this site (`src/content/docs/`). [site/WRITING.md](../site/WRITING.md) governs voice for everything published under the mera name; this file adds the structure and mechanics specific to the docs site.

## Audience

The reader is a strong software engineer who may know none of blockchain, cryptography, or WebAuthn. On the page that owns a concept, build the explanation bottom-up: start from concrete pieces the reader can hold ("32 random bytes", "a 12-word phrase"), then assemble them into the larger mechanism.

## Concept ownership

Each concept is taught on exactly one page. The foundations page (`concepts/entropy-keys-and-accounts`) owns the blockchain background, each concept page owns its title subject, and each reference page owns the exact behavior of its function.

Every other page uses the term plainly and does not define it. A definition repeated at each mention is noise for the reader who knows the term and a detour for the one who does not. When a sentence cannot stand without the meaning, add a gloss of a few words at most ("the rpId, the domain the passkey is bound to").

Link a term inline only when the reader needs the owning page to finish the current step. Otherwise the owning page belongs under "See also". Material that outgrows a gloss moves to the owning page.

## Information architecture

The site follows the Diátaxis split (<https://diataxis.fr/>): each page does one job.

- **Getting started** teaches one first success, end to end. Its lead states what the reader will do, not how the mechanism works. Each step states what to do and leaves the mechanism to the owning page; a detail the reader does not need for the next step is cut.
- **Concepts** explain how something works and why it is designed that way. No step-by-step instructions.
- **Recipes** solve one task each. A recipe assumes a competent reader with a goal, states its prerequisites, and gets to the point.
- **Reference** states facts about the public API, one exported function per page. Keep instructions, opinions, and long explanations out of it; link to them instead.

When content feels misplaced, move it and link to it: a reference page that starts teaching hands that material to a recipe; a recipe that pauses to explain links a concept page.

## Reference pages

One exported function per page. A new public export means a new page and a new sidebar entry in `astro.config.mjs`. A small export inseparable from a larger contract is documented on that contract's page instead.

Fixed section order:

1. Frontmatter: `title` is the exact exported name, `description` is one sentence.
2. A short lead with no heading: what the function does, plus only facts no later section carries. Visible side effects belong here; functions that run WebAuthn ceremonies say so, because a browser prompt is one. Anything stated in or inferable from Parameters, Returns, or Errors is not repeated in the lead.
3. `## Import`: a single import statement.
4. `## Usage`: one focused, compilable example.
5. `## Parameters`: an intro line naming the options type, then one `### options.field` subheading per field (dotted for nested fields). Under each: a `- Type:` line, a `- Required` or `- Optional` line (with the default or omission behavior), then prose. Functions without an options object use one `### name` subheading per positional parameter and omit the intro line.
6. `## Returns`: the named result type and what it contains. When the return value has members of its own, each member is documented here.
7. `## Errors`: one bullet per error code with its trigger condition, each code linked to its anchor on the errors page.
8. `## Notes`: copy and zeroing semantics, determinism statements, caveats. Omit the section when there is nothing to say.
9. `## See also`: related functions, the owning concept page, the recipe that uses it.

Parameters use subheadings and lists, never wide tables. The content column is narrow; a five-column table does not survive it. Tables are reserved for genuinely tabular data, like the authenticator matrix.

Source of truth is the JSDoc in `src/`. Write reference prose from it. When the JSDoc is silent, inspect the implementation and tests.

## Recipes

- Title with a verb: "Encrypt a recovery phrase" rather than "Recovery phrase encryption".
- One goal per page. Prerequisites in the first paragraph.
- Code blocks are complete and pasteable in order. A reader who pastes every block top to bottom ends with working code.
- Code adapted from `demo/src/` is an app-side pattern. Say so. Derivation schemes, storage, and transport belong to the app, and the recipe's framing must keep the library/app boundary visible.

## Voice

The bar is simple, concise, and detailed at once: detail survives the cut, filler does not. Every sentence must add information a reader can act on; delete sentences that only set up, restate, or editorialize ("that choice is what makes this repeatable", "what happens next is the app's decision").

`site/WRITING.md` applies in full. The rules that carry the most weight here:

- Say "account". "Wallet" is only for wallet apps: MetaMask, Phantom, the demo.
- Say "passkey account", never "derived account". "Derive" survives as the verb: derive a key, a derivation path, address derivation.
- Passkey accounts are the default path; secret vaults are the advanced option for secrets that predate the passkey. Never present the two as coequal alternatives.
- Word choice fits technical documentation. Plain nouns over narrative or dramatic ones: "trade-offs", never "stories"; "complication", never "trap". A word that belongs in a blog headline gets replaced.
- Plain verbs over idioms: "use a vault", never "reach for a vault". An idiom a non-native reader would pause on gets replaced with the literal verb.
- Calm explanation, no marketing. If a sentence would fit in a product brochure, rewrite it. An accurate behavior claim can still be marketing: if it exists to impress rather than to move the reader forward, cut it and let the owning page state the behavior.
- Named wallet apps are examples, never an exhaustive list.
- Prefer a concrete statement over an abstract one. "The salt is 32 bytes" beats "the salt has a fixed size".
- Neutral possessives: "the passkey", "the secret". Avoid "your passkey".

## Sentence mechanics

- No em dashes. Use a comma, a period, a colon, or parentheses.
- A sentence defines at most one term. A second definition moves to its own sentence or becomes a link to the owning page.
- Use a period between independent statements. Reserve the semicolon for two clauses that form one thought, such as a contrast pair ("derivation is app-owned; mera provides the ceremonies").
- No "not X, but Y" constructions, including "isn't just X" and "It's not about X". Rewrite the thought.
- Complete sentences, plainly shaped. Fragments for punch ("Same three, same 32 bytes.") and aphorisms ("whoever holds it holds ciphertext") get rewritten as plain statements.
- The library takes plain verbs: mera requires, returns, throws. "mera asks", "hands over", "stops there" are narration.
- A sentence never defers its point to a link. State the consequence in place and link for depth; "the security model explains the consequence" tells the reader nothing.
- Vary sentence length and openings. Three consecutive sentences with the same shape means one gets rewritten.
- Short paragraphs, but not a wall of one-liners.
- Banned vocabulary: seamless, robust, powerful, effortless, simply, leverage, unlock (as praise; unlocking a vault is fine), delve, game-changer.

## Diagrams

- A node carries the step name. An ownership row (mera, the app) is allowed when the library/app boundary matters.
- No subtitle text that restates the surrounding prose or a concept page; the diagram shows the shape, the text explains.
- The `<title>` element describes the whole diagram in sentences for screen readers.

## Accuracy

- Every claim must be checkable against the JSDoc, implementation, or tests.
- Implementation details live only on the page that owns them: error codes and library internals on the reference, demo internals (derivation schemes, storage, UI) in the recipes that adapt its code. Every other page links to the owning page instead of restating the detail, so a demo or library change touches one page.
- Examples import only the public API plus explicitly declared app-side dependencies.
- Examples define every identifier they use. Values the app supplies enter through a placeholder with realistic shape and provenance: `crypto.getRandomValues(new Uint8Array(32))` for key material, `new TextEncoder().encode(...)` for secret text, a literal for addresses and rpIds. Never use an all-zero buffer where the library validates the value; an all-zero secp256k1 key throws.
- A value carries its meaning in a descriptive variable name (`recipient`, `privateKey`), not in a comment and not in prose after the block. A literal worth explaining becomes a named variable. A comment that restates the variable name is deleted; provenance worth stating moves to prose.
- Security-sensitive behavior (key material lifetimes, zeroing, nonce handling, prompt counts, what the library cannot protect against) is stated plainly on the concept and reference pages that own it, and in a recipe at the step that acts on the risk. Getting started links to it instead of restating.
- Support claims are date-stamped. The authenticator matrix lives on the authenticator-support page and is maintained there only.

## Mechanics

- Frontmatter: every page has a `title` and a one-sentence `description`.
- Files are kebab-case; the file path is the slug.
- The sidebar in `astro.config.mjs` is hand-maintained. A sidebar slug without a page fails the build.
- Plain `.md` unless the page imports a component; then `.mdx`.
- Internal links are root-relative with a trailing slash: `/reference/errors/`. Link text is descriptive; no bare "here".
- Link the first mention of a spec'd name on each page to its spec (BIP-32/BIP-39/BIP-44 to the bips repo, SLIP-0010 to the slips repo, WebAuthn to the W3C spec, CTAP and `hmac-secret` to the FIDO spec); later mentions on the page stay plain.
- Never reference sections by number; name the thing and link it.
- `npm run build` must pass before a PR.

## Before opening a PR

1. `npm run build` passes.
2. New pages appear in the sidebar; no sidebar entry points at a missing page.
3. Examples compile against the current public API, with no undefined identifiers.
4. Every error code mentioned links to the errors page.
5. No em dash anywhere in the diff.
6. No banned vocabulary, no "not X, but Y".
7. "Wallet" appears only next to wallet apps.
8. No page defines a concept another page owns.
