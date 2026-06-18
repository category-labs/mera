# Writing notes for the site

Editorial guidance for the content in `index.html` (the "A passkey is enough" article) and any future blog-style writing on the site. Keep these in mind when editing the copy. This file is not referenced by the page and is not part of the published article.

## Writing rules

- Simple, clear language.
- Wordiness is a smell: don't take twenty-five words to say what five can.
- Say "account", not "wallet". "Wallet" only for wallet apps (MetaMask, Phantom, the demo).
- No marketing tone.
- No punchline-style sentences like "It's not about X. It's about Y."
- No forced drama, hype, or motivational language.
- No corporate phrases like "unlock," "leverage," "game-changer," "seamless," "robust," or "delve."
- Avoid overusing short one-line paragraphs.
- Avoid generic introductions like "In today's fast-paced world."
- Prefer concrete examples over abstract claims.
- Don't assume user behavior (paper backups, screenshots, drop-off): state what the scheme requires, not how people allegedly handle it.
- Don't present the typical stack as the required one: state what a design requires, then what is merely common on top (ERC-4337, bundlers, paymasters are options, not requirements).
- Named wallet apps (MetaMask, Phantom) are examples, not an exhaustive list — phrase so others clearly exist.
- Prefer calm, thoughtful writing over persuasive copywriting.
- The writing should feel like a smart person explaining something clearly, not like a content marketer.

## Scope decisions

- Audience: crypto/wallet developers. ERC-4337, EOAs, bundlers need no introduction; WebAuthn internals do.
- The library is an experimental reference implementation: no network-support claims ("EVM and Solana today"). The entropy is chain-agnostic — any KDF, any chain. Chains appear only as examples.
- Keep the library/app boundary honest: mera produces entropy and signing sessions; derivation belongs to the app. Don't credit mera with what the demo does.
- Wrapped mode stays conceptual — what it enables, not how it's implemented.
- Derived and wrapped are parallel options with different trade-offs; don't frame one as fixing a constraint of the other.
- Every technical claim should be checkable against the README or the code.
- Don't reference sections by number ("as section 2 showed"); name the thing in place — headings will move.
- The post is about the idea, not the repository: no code-location or housekeeping sections.
- Link the first body mention of each spec'd name to the same URL as its References entry; later mentions stay plain.
