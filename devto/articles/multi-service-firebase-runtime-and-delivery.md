---
title: "Runtime and delivery of a multi-service Firebase environment"
published: true
description: "Multiple services in one GCP project: read/write separation, two-layer DB, dual auth tracks, keyless fan-out deploys from an Nx monorepo."
tags: firebase, gcp, architecture, monorepo
canonical_url: https://cilly-yllic.github.io/en/notes/firebase-gcp/multi-service-firebase-runtime-and-delivery/
---

I designed a Firebase / GCP environment where multiple services live together in a single GCP project. Leaving out anything product-specific, this note presents the architecture itself through two cross-sections: "how it runs" (runtime) and "how it ships" (delivery).

## Runtime: separate writes from reads

![Runtime architecture and data flow](https://cilly-yllic.github.io/images/runtime-architecture-and-data-flow.png)
*Writes go to SQL (the SoT); reads come from Firestore (a rebuildable cache). The backend updates both at once, and reconciliation guarantees consistency.*

At the center of this environment is a design that **separates writes and reads into different datastores**. Writes are received by the backend (Next.js / Cloud Run), which updates both the SoT (Cloud SQL via Firebase Data Connect) and Firestore in the same operation. Cloud SQL is the source of truth; Firestore is a **read-only cache** that can be rebuilt from the SoT. Clients stream Firestore via `onSnapshot`, so their own writes reflect immediately. Divergence from the double write is repaired by a reconciliation job — enqueued before the DB updates — that treats the SoT as authoritative.

The benefits and costs of this "Firestore as cache, not SoT" decision are explored in a separate note, so I won't go deeper here:

[Treating Firestore as a public cache](https://cilly-yllic.github.io/en/notes/firebase-gcp/firestore-as-public-cache/)

What this note is really about is the two remaining structures that make this read/write separation work on **a single GCP project shared by multiple services**.

### Two-layer DB: Core and Service

The database is **two-layered**: a **Core DB** holding cross-cutting foundation entities — identity, organizations, membership — and a **Service DB** holding each service's own domain entities. This repeats in the same shape in both Cloud SQL and Firestore.

The Service DB only references Core's identifiers; it never duplicates shared data. Cramming multiple services into one project tends to scatter identity everywhere, but this boundary preserves the state where "from any service's viewpoint, users and organizations come from Core, and only Core." Adding a service means adding only a Service DB.

### Two authentication tracks

Authentication isn't singular either. **End-user apps authenticate with Firebase Authentication**; **the operator console authenticates with an external OIDC IdP**.

The latter can't use `onCall`, which assumes Firebase Auth — so Cloud Functions are exposed as `onRequest`, and the function itself does JWT verification against JWKS plus scope-based authorization. Two authentication domains coexist on physically separate paths. When you want end users and operators to have different roots of trust, splitting the path entirely turned out to be a much clearer boundary than straining Firebase Auth with custom claims.

## Delivery: fan out from a monorepo to each environment

![Multi-target deployment architecture from the monorepo](https://cilly-yllic.github.io/images/nx-monorepo-deployment-architecture.png)
*From one Nx monorepo, a keyless CI fans out to per-environment GCP projects.*

Behind how it runs is **a CI that fans out from a single Nx monorepo to multiple deploy targets**.

- The monorepo holds, per service, the API (Cloud Functions) / Web (SSR or SPA) / security rules / Data Connect schema. Nx builds only the affected apps.
- CI (GitHub Actions) **holds no keys**. It operates GCP through Workload Identity Federation (OIDC), impersonating the deploy service account. No SA key files sit in the pipeline.
- `firebase deploy` **fans out** to each target in the per-environment GCP project (Cloud Functions / App Hosting / Hosting / Firestore rules & indexes / Storage rules / Data Connect schema). Environments switch through templated config.
- Projects, IAM, WIF, API enablement, and Firebase Auth are **provisioned by Terraform** before any deploy. The "create the environment" layer and the "ship the code" layer are kept separate.

The "create the environment" side (provisioning GCP / Firebase with Terraform + GitHub Actions) is covered in a separate note:

[Provisioning GCP / Firebase environments from a single settings.yml](https://cilly-yllic.github.io/en/notes/firebase-gcp/config-driven-gcp-firebase-provisioning/)

## Decisions that pay off

**Read/write separation.** Consistent related updates and relational constraints go to SQL; realtime push goes to Firestore. Once you shrug Firestore off as "a cache that can break and be rebuilt," you gain full freedom in modeling the read side.

**One project, shared + two-layer DB.** Putting multiple services in one GCP project lets shared identity and runtime (Functions codebases) coexist naturally. The Core / Service two-layer structure is the boundary that keeps that cohabitation from collapsing.

**Keyless.** Issuing no SA key files removes long-lived secrets from the pipeline. CI and TFC alike borrow permissions through OIDC only for the moment they need them.

## Closing

I said "presents," but what these two cross-sections really show is a map of **where responsibilities live**. Writes in SQL, reads in Firestore, auth split between users and operators, provisioning in Terraform, deployment in the firebase CLI. Decide the boundaries first, and as services multiply, you keep adding onto the same map.

---

*Originally published at [cilly-yllic.github.io](https://cilly-yllic.github.io/en/notes/firebase-gcp/multi-service-firebase-runtime-and-delivery/).*
