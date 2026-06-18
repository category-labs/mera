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

- Public SDK functions should have complete, accurate JSDoc.
- Use appropriate JSDoc tags to describe the API contract, return behavior, caller assumptions, observable side effects, and failure modes.
- Document security-sensitive behavior explicitly, especially for key material, randomness, WebAuthn prompts, encryption nonces, storage formats, and mutation/zeroing behavior.
- Document thrown `PasskeyAccountError` codes with the appropriate JSDoc tag.
- Examples should be runnable, concise, and focused on library behavior, not on provider boilerplate.
- README examples should reflect actual tested behavior.
- Keep documentation prose neutral: name keys, secrets, and passkeys plainly ("the passkey", "one encrypted secret") rather than attributing them to the reader ("your passkey", "a secret you provide" / "you own").
- Internal helpers with non-obvious invariants should have short comments or docstrings.

### TypeScript Conventions

- Use strict typing and avoid `any`.
- Prefer `type` aliases unless an `interface` is clearly better.
- Exported functions should have explicit return types.
- Keep central type files for durable shared/public data shapes. Define public single-function option bags near the implementation, export them as `Parameters<typeof functionName>[0]` aliases when a named caller type is useful, and avoid moving those aliases into the central type file.
- Keep exports grouped at the end of hand-written TypeScript files instead of scattering `export` keywords through declarations.
- Use runtime validation at string and wire boundaries, where TypeScript cannot protect callers.
- Do not add runtime checks for typed internal invariants that TypeScript already proves, such as required callbacks or disallowed fields within SDK-only control flow.
- Avoid unnecessary assertions and wrappers; use them only when narrowing external input or bridging third-party type limitations.

## File Scope Guidelines

This file should stay stable and process-oriented.

### What to Include

- architectural decisions
- coding and API design principles
- testing and verification workflow
- safety and review expectations
- essential project commands

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
