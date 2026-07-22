---
title: "Provisioning GCP / Firebase environments from a single settings.yml"
published: false
description: "Config-driven, keyless provisioning: one settings.yml per service generates everything from the GCP project to Firebase resources."
tags: terraform, gcp, firebase, cicd
canonical_url: https://cilly-yllic.github.io/en/notes/firebase-gcp/config-driven-gcp-firebase-provisioning/
---

Every time you add a service on GCP and Firebase, the same manual work repeats. Create the project, attach billing, enable APIs, set up the Terraform service account and Workload Identity, configure Firestore / Auth / Storage / App Hosting. Multiply all of that by the number of environments (dev / stg / prd). No matter how carefully you write the runbook, as long as human hands are involved, environments drift.

So I built a platform where **dropping a single `settings.yml` per service provisions everything automatically**. The configuration is the source of truth; the infrastructure is nothing more than its projection.

## What gets built

Let's start with the "generated" side — the overall picture.

![Architecture diagram of the multi-environment GCP / Firebase platform](https://cilly-yllic.github.io/images/multi-environment-gcp-firebase-platform-architecture.png)
*A shared bootstrap project lends permissions, keyless, to per-environment service projects.*

The structure has three layers.

- **Identity & Trust** — Terraform Cloud and GitHub Actions operate GCP through Workload Identity Federation (OIDC). No service account key files are ever issued.
- **Shared bootstrap project** — the "platform for the platform": the WIF pool / provider, the Terraform service account, the Cloud Run router described below, and Secret Manager. Created once per organization.
- **Per-environment service projects** — independent GCP projects per environment, like `my-service-dev-001`. Inside each, Firebase resources (Auth / Firestore / Storage / App Hosting / Data Connect / Functions …) line up according to feature flags.

Holding no keys is what makes this work. Each environment's Terraform SA is **impersonated** from the bootstrap SA, and that permission only fires through an OIDC token exchange. There is no long-lived credential anywhere that could leak.

## How it gets generated

Now the "generating" side. From merging `settings.yml` to applying against GCP, everything is chained without polling.

![Architecture diagram of the infrastructure generation pipeline](https://cilly-yllic.github.io/images/gcp-firebase-platform-architecture.png)
*One settings file flows in a straight line: GitHub Actions → Terraform Cloud → GCP.*

The flow has two stages.

```yaml
# terraform/settings.yml in the service repo (excerpt)
service: my-service
environments:
  dev-001:
    labels: [tier:dev]
    firebase_platform:
      firebase: true
      firestore: true
      app_hosting:
        - { backend_id: web, location: asia-northeast1 }
      notifications:
        - url: https://hooks.slack.com/services/...  # notify apply results
```

1. **Action A (project-bootstrap)** reads `settings.yml`, filters target environments by `status` / `labels`, and creates GCP projects / SAs / WIF **in one batched run**.
2. The run's completion notification (HMAC-signed) is received by a **Cloud Run router**, which verifies it and fires GitHub's `repository_dispatch`.
3. That triggers **Action B (firebase-platform)**, which stands up a workspace per environment and applies the Firebase resources.

Instead of keeping a polling orchestrator running, I chained webhooks: Terraform Cloud notification → Cloud Run → GitHub. Only TFC knows the state, so the result notification to Slack is also sent by TFC — the one party that knows whether the apply succeeded.

## Design decisions that pay off

**Feature flags decide everything down to APIs and IAM.** Write `firestore: true` in `settings.yml` and the corresponding API enablement, resource creation, and role grants to the CI SA all cascade from it. Leave it unset and nothing is created (zero side effects). Users never need to memorize which GCP APIs a feature requires.

**Configuration ownership stays with the service team.** Which features to use is the application's concern, so `settings.yml` lives in the service repo and the platform side only reads it. The platform never becomes a central registry hoarding every service's configuration.

**Deletion has a separate safety net.** Removing an environment from the settings normally destroys it, but if its name is listed in `retained_envs`, it is only removed from state and the GCP resources stay. A config mistake cannot take production down with it.

## What I gave up

There are costs. The webhook chain adds one more operational component — the Cloud Run router. You have to think about HMAC secret rotation and a retry path for dropped notifications. Since it spans Terraform Cloud, GitHub Actions, and GCP, failure triage is harder than in a single repository.

Even so, the value of collapsing the cost of adding an environment to "add a few lines to `settings.yml` and run the Action" is significant. Manual drift disappears structurally, and anyone gets the same environment. When you push infrastructure all the way into "something you write and generate," the operational concern shifts from individual environments to the generating machinery itself.

## Where it's published

The platform is open source — a monorepo of Terraform modules and GitHub Actions, free for anyone to use.

- Repository — [github.com/cilly-yllic/terraform-google-platform](https://github.com/cilly-yllic/terraform-google-platform)
- Terraform Registry — [registry.terraform.io/modules/cilly-yllic/platform/google](https://registry.terraform.io/modules/cilly-yllic/platform/google/latest)

---

*Originally published at [cilly-yllic.github.io](https://cilly-yllic.github.io/en/notes/firebase-gcp/config-driven-gcp-firebase-provisioning/).*
