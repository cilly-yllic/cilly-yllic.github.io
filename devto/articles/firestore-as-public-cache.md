---
title: "Treating Firestore as a public cache"
published: false
description: "Cloud SQL as the source of truth, Firestore as a rebuildable read projection — the design benefits and the costs."
tags: firebase, database, architecture, gcp
canonical_url: https://cilly-yllic.github.io/en/notes/firebase-gcp/firestore-as-public-cache/
---

Using Firestore as "the app's primary database" is easy at first. Writes and reads complete in one place, and `onSnapshot` gives you realtime push for free. But as a service grows, keeping Firestore as the SoT (source of truth) exposes some fatal constraints.

## Where SoT-Firestore hurts

Weak transaction boundaries, missing complex queries, the cost structure, the difficulty of migrating away. The harshest one: you cannot narrow related updates with a `WHERE`. For the use case "update a set of documents matching a condition, consistently, in one go," Firestore is structurally weak.

## Redefining it as a public cache

In one project, I made Cloud SQL the SoT and treated Firestore as a "read-optimized projection." Writes go through the backend (Next.js / Cloud Run), and **the SoT (Cloud SQL via Data Connect) and Firestore are both updated within the same write path**. Separately, a Cloud Run reconciliation job runs and **checks and repairs consistency** against the SoT as authoritative. This reconciliation job is enqueued at the start of the request, **before** the DB updates. Because it's queued first, even if the write dies halfway, the consistency check always runs afterward and repairs the state. From the client's perspective, Firestore is a **rebuildable cache** — in the worst case it can be rebuilt from the SoT.

```ts
// Writes go through the backend. The backend updates both the SoT
// (Data Connect → Cloud SQL) and Firestore. Clients never write Firestore directly.
await backend.updateEntity({ id, title });

// Changes are pushed back in realtime via Firestore's onSnapshot
unsubscribe = onSnapshot(entityRef, (snap) => render(snap.data()));
```

## Benefits and costs

The benefits are clear. The SoT side (SQL) brings transactional consistency and complex queries; the read side (Firestore) brings freedom in data modeling and realtime push; and consistent syncing with external systems (OpenSearch / BigQuery, etc.) coexists naturally. Since the backend updates Firestore at write time, the frontend gets **immediate reflection** through its `onSnapshot` stream. No optimistic-update tricks like "hold the value I just wrote in the UI for a while."

The cost is not latency — it moves to **double writes and consistency**. The backend writes two places, SoT and Firestore, so if one fails they can diverge (this is not a single distributed transaction). What closes that gap is the Cloud Run reconciliation, verifying and repairing Firestore with the SoT as truth. You can only shrug Firestore off as "a cache that can break and be rebuilt" because that consistency check stands behind it. The operational cost concentrates in this double-write path and the reconciliation route.

## Which to choose

The choice between "Firestore as SoT" and "Firestore as cache" comes down to the expected lifespan of the service. A short-lived prototype: the former. Something you intend to grow for years: the latter. And if you're in between — the cost of switching over later is far higher than the cost of treating it as a cache from day one.

---

*Originally published at [cilly-yllic.github.io](https://cilly-yllic.github.io/en/notes/firebase-gcp/firestore-as-public-cache/).*
