---
title: "Syncing what comes after provisioning — Cloudflare DNS, Logto, cert-gated proxy, env bundles"
published: true
description: "Keeping Cloudflare DNS, Logto auth, cert-gated proxying, and encrypted env bundles in sync with the same source of truth as the infra."
tags: cloudflare, githubactions, devops, security
canonical_url: https://cilly-yllic.github.io/en/notes/firebase-gcp/platform-sync-dns-logto-proxy-env/
---

In [Provisioning GCP / Firebase environments from a single settings.yml](https://cilly-yllic.github.io/en/notes/firebase-gcp/config-driven-gcp-firebase-provisioning/), I covered getting GCP projects and the Firebase platform generated automatically from a settings file. But that's not the end. Add one environment and a chain of chores appears outside the foundation:

- Add **DNS records** in Cloudflare pointing at the Firebase custom domain
- Once delivery is stable, turn the **proxy on** to get CDN / WAF
- Set up **Logto** applications / API resources / roles for the operator console
- Collect each app's **env values**, encrypt them, and make them referenceable at deploy time

These live in a different layer from provisioning, but left alone they regress into "manual work per environment." So I built Platform Sync — a mechanism that keeps them **following the same source of truth** as the foundation.

## The big picture

![Architecture diagram of the Platform Sync pipeline](https://cilly-yllic.github.io/images/platform-sync-pipeline-architecture-en.png)
*Config (Git) as SoT, chaining Cloudflare DNS → Logto → proxy → env bundle through a series of dispatches.*

There are two SoT files. `terraform.yml` holds service / environments / hosting (i.e. where domains and DNS come from); `platform.yml` holds Logto's auth rules and the tenant ⇄ env-group mapping. Platform Sync itself fires manually via `workflow_dispatch`, defaulting to `plan` (diff display only). To prevent accidents, the writing mode `apply` only runs when explicitly selected.

```yaml
# platform.yml (excerpt, abstracted)
tenants:
  - key: my-service-non-production
    env_groups: [dev, stg]      # the group of envs this tenant is responsible for
    roles:
      - { name: admin, scopes: [secrets:read, secrets:write] }
      - { name: developer, scopes: [secrets:read] }
```

Processing runs `Cloudflare DNS → Logto`, in that order. Logto's `redirectUri` depends on the domain (= DNS / hosting), so `apply` runs Cloudflare first. And **only when `apply` succeeds** are the two follow-up workflows (Cloudflare Proxy / Env Bundle) `dispatch`ed. All authentication is keyless: each environment's read-only service account is impersonated through Workload Identity Federation (OIDC). No long-lived credentials anywhere.

## The default is "never delete"

`plan` and `apply` share the same diff computation, with the mode toggling display-only versus real writes. The decision that pays off here: **per-environment sync emits no deletions, ever**.

Cloudflare's desired state is derived from the DNS updates Firebase requests. But those requests empty out once the domain goes ACTIVE — they're satisfied. So naively deleting "records that exist but aren't in desired" risks **taking out records that are serving traffic**. Per-env sync therefore only creates what's missing; deletion is split into a separate `reconcile` job. Reconcile matches against the env naming convention (`<tier>-<number>`) and tier constraints, and only records not belonging to defined envs or `retained_envs` become deletion candidates — the line that avoids false positives on unrelated records like `www` or `api`.

Deletion is always dangerous, so it only activates with an explicit `allow_delete` flag; `plan` stops at previewing "what would be deleted."

## The hard part: don't turn the proxy on until the cert exists

The timing of the proxy switch is what this pipeline sweats over most.

![Flow of waiting for the certificate to go ACTIVE before enabling the proxy](https://cilly-yllic.github.io/images/cloudflare-cert-gated-proxy-en.png)
*Create DNS-only → let Firebase issue the cert → wait for ACTIVE → proxy only the serving records. The order carries meaning.*

DNS records are **always created with `proxied: false`** (DNS-only, grey cloud). In that state, Firebase can reach the origin directly for domain-ownership verification and certificate issuance. Turn the proxy on too early and the verification and ACME challenge traffic hides behind Cloudflare's proxy (different cert, different IPs) — **the certificate can't be issued and delivery breaks**.

So the Cloudflare Proxy workflow polls the Firebase custom domain's host / cert status at 15-second intervals. Once it reaches `HOST_ACTIVE && CERT_ACTIVE` (treating `CERT_PROPAGATING` during distribution as "issued = reachable"), it flips **only the serving records that point at the hostname itself** to `proxied: true`. Ownership TXT records and ACME-challenge CNAMEs stay DNS-only.

Certificate issuance takes time. That's why this stage isn't embedded in the main workflow but **split into an independent workflow that can be re-run later**. Timing out while pending isn't a failure; run it again and it resumes waiting for ACTIVE. Already-proxied records are skipped, so it's safe to run any number of times.

## Logto: auth config that depends on domains

The Logto side syncs per tenant. It obtains `client_credentials` for the Management API using an M2M app's credentials and reuses the token. Three kinds of things are synced:

- **API Resources** (+ scopes / permissions)
- **Roles** (+ scope assignments)
- **Applications** (the SPA for the operator console)

Writes have ordering constraints: assigning scopes to a role requires the resource-side scope ids, so it proceeds **API Resources → Roles → Applications**.

An application's `redirectUri` is assembled from the environment's domain (`https://<domain>/callback`, etc.). The point is that target domains are **derived from `terraform.yml`'s hosting definitions**, not listed in `platform.yml`. This is also why `apply` runs Cloudflare first — without the domain settled, you can't build the correct `redirectUri`. Deletion is conservative here too: only applications it manages — names starting with `<service>-` and ending with `-web-system-console` — can ever be treated as orphans.

## Env bundles and GPG: keep it off argv

Last is how env values are bundled. Per environment, a value source (JSON including the Firebase web app config and Logto app id) is generated, tarred, and encrypted with **GPG symmetric encryption** into a `.tar.gpg`. The encrypted bundle is committed; the decrypted plaintext JSON is gitignored. Only "the key itself" lives in CI secrets.

```bash
# The passphrase arrives via env var and flows only into fd 3 via process substitution
set -o pipefail
tar cf - "$src" | gpg -c --batch --yes --pinentry-mode loopback \
  --passphrase-fd 3 -o "$out" 3< <(printf %s "$PASSPHRASE")
```

Unglamorous but important: how the passphrase is passed. Put it on the command line and it's visible in `ps`, so instead it's **fed through process substitution into fd 3 and read with `--passphrase-fd 3`**. `printf` is a bash builtin, so it doesn't even become a separate process. A path where the passphrase appears neither in argv nor in any other process.

The other trick is the diff. GPG encryption **produces different bytes every run**, so diffing bundles directly yields changes even when the content is identical — mass-producing meaningless PRs. So the existing bundle is **decrypted once and the plaintexts compared**; re-encryption happens only when values actually changed (or no bundle exists). PRs force-push to a fixed branch: update the open PR if one exists, create one if not — never duplicating.

## Developers hold no secrets

The heart of this setup: **a developer can reach deployment without ever holding a dev environment's env values or the decryption key**. Generating the value sources, encrypting with GPG, decrypting at deploy — all of it completes inside CI. The passphrase is held only by CI as a CI secret; the only thing in Git is the encrypted `.tar.gpg`. The plaintext value source appears only on CI runners during generation and is gitignored, so it's never committed.

In other words, what developers touch day-to-day is the config (`terraform.yml` / `platform.yml`) and the finished encrypted bundles. "No dev secrets on anyone's laptop" is guaranteed **by the mechanism**, not by operating rules or review diligence. Since no distribution channel for secrets exists, the accidents themselves — leaks during distribution, stale `.env` files quietly diverging across machines — can't happen. It's the same idea as going keyless (WIF) for cloud credentials, extended to application env values.

## Decisions that pay off

**Keyless doubles as an existence check.** When cleaning up bundles for retired environments, "does that GCP project still exist?" is answered by attempting to impersonate the read-only SA with `access_token` and checking success. If the project / SA is gone, impersonation fails — that failure is the "doesn't exist" signal. (One caveat: without `token_format`, the auth step merely writes config and always succeeds, so it decides nothing.)

**Heavy stages are split into independent workflows.** The certificate wait is separated from the main body, and only environments with DNS changes are handed to the follow-ups. Zero changes means the proxy workflow isn't even started.

## What I gave up

The cost is the growing chain of workflow `dispatch`es. The `apply` → proxy / env-bundle branching trades clarity for the chore of tracking "where did it stop." With Cloudflare, Logto, Firebase, and GitHub Actions all involved, failure triage is harder than in a single system.

Even so, collapsing the cost of one more environment into "add a few lines of config and run `apply`" is worth a lot. [Last time](https://cilly-yllic.github.io/en/notes/firebase-gcp/config-driven-gcp-firebase-provisioning/), the foundation was generated from config. This time, everything outside it — DNS, auth, delivery, env — follows the same config. Push infrastructure all the way into "something you write and generate," and the operational concern shifts from individual environments to the machinery that generates and syncs them.

---

*Originally published at [cilly-yllic.github.io](https://cilly-yllic.github.io/en/notes/firebase-gcp/platform-sync-dns-logto-proxy-env/).*
