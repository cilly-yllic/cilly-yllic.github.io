---
title: "Generating every Firebase layer’s types from a single contract.yml"
published: true
description: "One YAML contract as the source of truth — generating TypeScript, Zod, GraphQL, Firestore projections and API DTOs, drift caught in CI."
tags: typescript, firebase, graphql, codegen
canonical_url: https://cilly-yllic.github.io/en/notes/firebase-gcp/contract-driven-firebase-codegen/
---

Sharing types between frontend and backend is an old problem. A while back it was common to keep the two in separate repositories, so you had no choice but to hand-write the same type definitions in each — that is, duplicate them.

The next stage was private packages. Extracting shared types into a package removes the duplication, but now you have one more repository, and during development you bounce between the frontend, backend, and package repos and editors. Worse, every time you fix a type, nothing reaches the frontend or backend until the package goes through commit → push → version bump → publish. That cycle sits in the middle of every verification loop. Private packages also need separate authentication for CI and deploy pipelines to install them — registry tokens and permissions turn into a surprisingly annoying mechanism. Embedding a shared repo as a git submodule instead just changes the flavor of the chore: every consumer has to advance the referenced commit, and checkout skew happens easily.

What solved this was the monorepo. Shared libraries can be referenced directly within one repository, and frontend and backend can be developed in parallel. If the problem were just "frontend and backend use the same types," the story would end here.

But once you adopt an architecture where Cloud SQL (Data Connect) is the source of truth and Firestore is a read projection (cache) — see [Treating Firestore as a public cache](https://cilly-yllic.github.io/notes/firebase-gcp/firestore-as-public-cache) (Japanese) — the axis of type sharing changes. It's no longer "one type referenced from both sides"; **the same model gets written over and over in different representations, one per layer**. A monorepo lets you reference the same type from anywhere, but it does nothing to keep definitions that have split into different representations consistent with each other.

## The same model, written six times

Add a single `Product` model and these are the files you hand-write:

- The Data Connect GraphQL schema (`type Product @table(...)`)
- The shared TypeScript type (`interface Product`)
- The Zod schema (`ProductSchema`)
- The Firestore projection schema (relations resolved to ids, `timestamp` becomes `Date`)
- The API request / response types and their validation Zod
- The NestJS class-validator DTOs

Each is a different representation of "the same thing," but nothing verifies them against each other. Every added field means walking through all of these files, and if you forget one, the breakage shows up much later — at runtime. This is not a problem you prevent by being careful; the multi-maintenance structure itself is the cause.

## Write the contract, generate everything else

So I built a tool that **unifies model definitions into a YAML contract file and generates every representation from it**: [firebase-contract](https://github.com/cilly-yllic/my-packages/blob/main/packages/firebase-contract/README.md).

![Architecture diagram: contract.yml as the single source of truth, compiled through an IR into per-layer code](https://cilly-yllic.github.io/images/contract-driven-firebase-codegen-architecture.png)
*One direction: contract → compiler (IR) → generated artifacts. Drift between artifacts and contract is caught by `--check` in CI.*

```yaml
# contract.yml (excerpt)
models:
  Product:
    key: [catalog, productNo]
    fields:
      catalog: { type: Catalog, relation: true }
      productNo: int
      title: { type: string, nonempty: true, maxLength: 200 }
      status: ProductStatus
      metadata: { type: ProductMetadata, optional: true }
      createdAt: timestamp

generators:
  - { generator: typescript, out: '#contracts', split: true }
  - { generator: zod, out: '#contracts', split: true }
  - { generator: data-connect-graphql, out: src, split: true }
  - { generator: firestore, out: '#contracts', split: true }
```

A single `fbc generate` emits the TS types, Zod schemas, GraphQL schema, and Firestore projection all at once. Constraints like `title`'s `nonempty: true, maxLength: 200` flow identically into Zod — and, if you declare the API generators (api-validation / api-dto), into request validation and class-validator DTOs as well. "Only the validation is stale" stops happening.

Contracts can be split with `imports`, so in a multi-app monorepo the yml files can follow the repository layout. In the project where I introduced this, the root contract splits into 9 yml files across 2 apps, generating over 30 files.

## Firestore is a projection, not "another schema"

This is where the tool earns its keep. When Firestore is a read projection, its schema stands in an odd position relative to Data Connect: **not the same, but not unrelated either**. Relations become resolved string ids, `timestamp` becomes `Date`, denormalized fields get added. Hand-written, you end up transcribing this "regular transformation plus a few additions" wholesale.

In the contract, a projection is declared as a **derivation** from a Data Connect model.

```yaml
firestore:
  Product:
    from: Product
    collection: shops/{ws}/.../products/{productNo}
    omit: [catalog, log]
    fields:
      linkedCatalogTitle: { type: string, optional: true }
```

The projection rules — relation → id, timestamp → `z.date()` — are applied uniformly by the generator; humans only write `pick` / `omit` and the extra `fields`. Project-wide fields shared across projections can be declared once as `fragments:` and inserted into each projection with `extends:`. The generated Zod schema reuses fields whose chains are identical to the Data Connect side via `.pick()`, so only the parts where the representation actually changes appear in the file. The diff reads as design intent.

## Data Connect's Any boundary

Data Connect stores embedded objects and JSON as an `Any` scalar, erasing the logical type. With hand-written schemas, what `metadata` "really is" lives in comments and memory. Generating from the contract, the GraphQL side keeps the logical type as a comment (`metadata: Any # logical: ProductMetadata`), and typed adapters that convert between the `Any` row and the logical type are generated alongside. This is possible because the contract knows where the type-erasing boundaries are.

## Design decisions that pay off

**Generators never see YAML.** Their only input is an IR (intermediate representation), normalized after parsing and import resolution. Validation is an independent set of rule functions over the IR. Adding a generator requires no changes to existing code, and extensions like OpenAPI output are just a registry entry.

**I invested in byte-for-byte reproduction of the hand-written files.** The adoption target was a product already in production; if generated output differed from the existing hand-written files by even one byte, the verification would drown in diffs. The style options that absorb formatting variance and the `raw` escape hatch exist for this incremental migration — "reproduce the existing file exactly, then switch it over." Migration became a per-file loop of "lean on generation, confirm the diff is zero" instead of a big-bang rewrite.

**Regeneration is idempotent.** As long as the content doesn't change, files stay byte-for-byte identical, generation timestamp included (`generatedAt` carries over from the first generation; only `updatedAt` moves when content changes). CI's `--check` can mechanically detect contract-code drift precisely because of this idempotency.

## The costs

The DSL is itself added complexity. Field options and operations have a ceiling of expressiveness, and every time you hit it you choose between growing the generator and escaping through `raw`. Debugging generated code is one level more indirect.

Normally "the team has to learn a new YAML DSL" would count as a cost too, but AI has offset it. Load a coding agent with the DSL rules and the product spec, and an instruction like "add an inventory-count field to Product" gets turned into the contract yml edit by the AI. A declarative contract concentrates model definitions in one place with small diffs, which makes it a friendly target for AI as well. If the output is wrong, it shows up in the `fbc generate` diff, so verification is mechanical. What humans need to master is no longer the DSL grammar but "reading the contract and confirming the intent."

What remains is the expressiveness ceiling and the indirection in debugging — but even minus that, collapsing "add one field" into "add one line to the contract and run `fbc generate`" is worth a lot. Multi-maintenance drift moved from "something to be careful about" to "something CI detects." When type consistency shifts from human attention to machinery, review attention also shifts — from transcription-checking individual type definitions to the design of the contract itself.

## Why not let AI write the type definitions directly?

If AI can write the contract, a further thought suggests itself: hand the LLM the rules and the product spec, let it edit each layer's type definitions directly, and you need neither contract nor generator. If humans never touch the type definitions, doesn't the multi-maintenance chore disappear entirely?

I think this gets the division of labor backwards. LLM output is probabilistic, so direct edits to six representations carry the risk that something is misaligned every single time. More fundamentally, without a contract **the mechanical definition of "aligned" ceases to exist**. To verify that six representations express the same model, you need their common origin — something equivalent to the contract. `--check` can detect drift because a deterministic generator can state uniquely what the correct output is; AI's direct edits have no such verifiability.

Review cost changes too. If AI edits six files directly, humans read six files of diffs with suspicion, every time. With the contract approach, humans read only the yml diff, and the rest is derived deterministically. Turning fuzzy specs into a contract is the AI's job; expanding the contract into each representation is the generator's job. It's precisely because the probabilistic layer and the deterministic layer are separated that you can let AI write with confidence.

## Where it's published

Published as an npm package. Through the RC series I tightened "the contract is authoritative" (unknown keys and out-of-vocabulary values become errors), verified every feature drift-free in a real project, and released v0.1.0 as the first stable version. The DSL's expressiveness and generator details keep improving with feedback from operation.

- npm — [npmjs.com/package/firebase-contract](https://www.npmjs.com/package/firebase-contract)
- README — [github.com/cilly-yllic/my-packages](https://github.com/cilly-yllic/my-packages/blob/main/packages/firebase-contract/README.md)

---

*Originally published at [cilly-yllic.github.io](https://cilly-yllic.github.io/en/notes/firebase-gcp/contract-driven-firebase-codegen/).*
