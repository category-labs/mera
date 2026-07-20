### Core Values

Simplicity, elegance, and correctness are the bar for everything here — code, documentation, tests, and examples alike.

- Correctness comes first: prefer the obviously correct implementation over a shorter or cleverer one.
- Write the simplest code that solves the problem; reach for a plainer construct over a clever one a reader has to decode.
- Treat elegance as what remains after removing the unnecessary — fewer moving parts and clearer names, not more abstraction.
- Write documentation in plain language: explain things directly, avoid jargon, and define a domain term only when the reader genuinely needs it.

### API Design Philosophy

This repository is a library. Its API is part of its documentation.

North star: by reading a function name and its parameters, a developer should be able to predict the implementation's behavior.

The library exposes unopinionated primitives ("Lego blocks") that consumers compose into their own flows. Sensible-default orchestrators may live alongside primitives only when the defaults are truly obvious and ecosystem-compatible; they sit beside the primitives rather than replacing or hiding them. If a default derivation path is not wallet-interoperable, keep it app-owned rather than baking it into core.

- Choose literal, self-descriptive names.
- Prefer explicit data structures over magic defaults.
- Keep return values predictable and stable.
- Make limits and failure behavior obvious in names, types, docs, or thrown errors.
- Do not add thin convenience layers that obscure ordering, length limits, revert behavior, or transport assumptions.
- Do not wrap dependency primitives unless the wrapper adds library-specific behavior, a stable package error boundary, or a meaningful format guarantee.
- Keep generic utilities out of the root SDK API unless callers need them to complete a documented library workflow. Wire-format helpers may remain internal when they provide a stable package error boundary or format guarantee.
- Prefer one canonical representation for raw bytes at public boundaries. Use `Uint8Array` unless a wire format or browser API boundary requires a different shape.
- Preserve runtime validation at cryptographic, string, wire, and untrusted JSON boundaries. Avoid "perfect validation" of typed internal invariants that TypeScript or a dependency already owns.
- Keep object-parameter APIs when the operation is likely to gain optional parameters or when named fields make security-sensitive inputs harder to mix up.

### Documentation and Examples

- Documentation prose is technical writing held to a hard bar: simple, concise, and detailed at once. Every sentence must add information; cut sentences that only set up, restate, or editorialize on what adjacent sentences already show.
- Public SDK functions should have complete, accurate JSDoc.
- Use appropriate JSDoc tags to describe the API contract, return behavior, input constraints, observable side effects, and failure modes.
- Document security-sensitive behavior explicitly, especially for key material, randomness, WebAuthn prompts, encryption nonces, storage formats, and mutation/zeroing behavior.
- Document thrown `MeraError` codes with the appropriate JSDoc tag.
- Examples should be runnable, concise, and focused on library behavior, not on provider boilerplate.
- In examples, a value's meaning lives in a descriptive variable name (`recipient`, `privateKey`), never in a comment. Extract inline literals to named variables, delete comments that restate a name, and move provenance worth keeping into surrounding prose.
- The root README is a nontechnical project overview. Installation, examples, compatibility, security details, API documentation, and the demo live on the documentation website.
- Keep documentation prose neutral: name keys, secrets, and passkeys plainly ("the passkey", "one encrypted secret") rather than attributing them to the reader ("your passkey", "a secret you provide" / "you own").
- Internal helpers with non-obvious invariants should have short `//` comments or full JSDoc.
- Document observable behavior, not caller instructions: state what a function does to its inputs and outputs (for example, "the input is copied before use; the original buffer is not modified") rather than what the caller may or should do with them. Callers derive correct usage from the stated facts.
- When a comment or doc gives a rationale, explain the mechanism, not just the claim: a reader should see *why* from the text (for example, "signing reads the buffer after an await, so copy it first") rather than having to reconstruct the cause.
- For section-style JSDoc/TSDoc block tags, use one tag per semantic section and continue with paragraphs until the next block tag. Put the tag on its own line when the content is multi-sentence. Repeat only naturally repeatable tags such as `@param`, `@throws`, `@example`, and `@see`; do not repeat section-style tags such as `@remarks` just to split paragraphs.

### TypeScript Conventions

- Use strict typing and avoid `any`.
- Prefer `type` aliases unless an `interface` is clearly better.
- Exported functions should have explicit return types.
- Keep central type files for durable shared/public data shapes. Define public single-function option bags near the implementation, export them as `Parameters<typeof functionName>[0]` aliases when a named caller type is useful, and avoid moving those aliases into the central type file.
- Keep exports grouped at the end of hand-written TypeScript files instead of scattering `export` keywords through declarations.
- Use runtime validation at string and wire boundaries, where TypeScript cannot protect callers.
- Do not add runtime checks for typed internal invariants that TypeScript already proves, such as required callbacks or disallowed fields within SDK-only control flow.
- Avoid unnecessary assertions and wrappers; use them only when narrowing external input or bridging third-party type limitations.

### Checks

Before pushing, run the checks documented in [CONTRIBUTING.md](./CONTRIBUTING.md).

### Pull Requests

- Write PR descriptions for reviewers who need to understand the reason for the change, not just the diff.
- Start with the problem or risk that motivated the change. If the PR replaces one path with another, explain why the replacement is equivalent or better, including what behavior still runs and what coverage is added or preserved.
- Add only context that is not visible in the diff or CI, such as a related discussion, a non-obvious constraint or trade-off, manual validation, requested review focus, or follow-up outside the diff.
- Do not restate the implementation or automated validation that reviewers can inspect directly.

## File Scope Guidelines

This file should stay stable and process-oriented.

### What to Include

- architectural decisions
- coding and API design principles
- safety and review expectations

Project commands and the testing workflow live in [CONTRIBUTING.md](./CONTRIBUTING.md).

### What Not to Include

- temporary TODOs
- volatile implementation details
- dependency-version churn
- issue-specific notes that belong in code or PR discussion
- library-specific preferences that do not matter to this repository

### Maintenance Principles

1. Prefer durable guidance over exhaustive detail.
2. Document how to work in the codebase, not every fact about it.
3. Favor principles over brittle instructions.
4. Keep the file aligned with the repository's actual structure and workflows.
