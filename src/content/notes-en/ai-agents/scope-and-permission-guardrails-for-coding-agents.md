---
title: 'Enforce with config, not attention — scope and permission guardrails for coding agents'
description: 'Enforcing multi-repository AI agent work through declared scopes and permissions: per-session guardrail design, a self-restraint that keeps the agent away from its own permission definitions, and a double lock on push.'
category: 'ai-agents'
publishedAt: 2026-06-30
---

When you put a coding agent (like Claude Code) to work, where it really pays off is **work that spans multiple repositories**. Writing into one repository **while referencing** another's implementation. Fixing a shared library while verifying behavior in the repository that consumes it. Updating a generated-artifacts repository while reading the config repository. The agent's speed shines in this kind of "straddling" work far more than in single-feature fixes.

But cross-repository work widens the blast radius just as much. Accidentally editing a repository you only meant to reference. Pushing straight to another repository's `main`. Touching files unrelated to the goal. The more repositories are involved, the blurrier the boundary of "which ones may I touch right now, and how far am I allowed to go" becomes — and the agent re-reads that boundary from scratch every time, so there is structurally nothing equivalent to human attentiveness. That's why "asking nicely in the prompt to be careful" can't fundamentally prevent accidents.

So I built a mechanism that **enforces guardrails through config files instead of attention**. The idea is simple: before starting work, declare "the repositories that may be straddled" and "the permission for each," and make everything else technically impossible. The span of the cross-repository work itself gets frozen as configuration up front.

## A session = a declaration of scope + permissions

![Architecture diagram: a session declares scope and permissions, handling multiple repositories with distinct read / write-local / write-push permissions](/images/agent-session-scope-permission-architecture-en.svg)
*The parent declares scope and permissions and spawns the session. Each straddled repository is handled per its permission — a "read-only repository" structurally cannot be modified.*

I call the smallest unit a "session". One session = one unit of work, and at launch two things are fixed:

- **Scope** … which repositories / directories may be touched
- **Permissions** … per target, how far is allowed

Permissions have three levels:

- `read` … reference only
- `write-local` … edit + local commits. **No push**
- `write-push` … push allowed (including PR creation)

The point is that permissions are held **per target**. In cross-repository work, repositories of differing trust naturally mix within one session. "Reference the config repo read-only, write-push to the artifacts repo." "Fix the shared library write-local but don't push; use the consumer repo read-only for verification." A session handles combinations like these as one unit of work — so it carries a single declaration (manifest) listing target-level pairs, and scope, permissions, and identity checks all concentrate there.

In fact, this very article was written in such a cross-repository session: referencing the repository the mechanism comes from as **read**, while writing the text into the article repository as **write-push**. The guarantee that the read side can never be modified is enforced by config, so there's no fear of breaking the source being referenced.

## Build scope as "what isn't opened doesn't exist"

Scope is an allowlist. The list of directories the agent can access enumerates **only the allowed targets**. Repositories not listed cannot even be referenced. I deliberately avoided symlink tricks so that scope is complete in the config file alone.

The direction matters: you **add** what can be touched, never subtract from everything. Because the default is closed, any target you forget to configure fails safe (= invisible).

## Hard part 1: keep the agent away from its own permission definitions

This is the single most effective design decision. **From inside a session, the files defining scope and permissions themselves cannot be modified.**

The logic goes like this. When you give an agent read permission, the config file describing "what counts as read" is also just a file. If the agent could edit it, it could notice "removing this deny lets me write" — room to loosen its own guardrails. An entity holding permissions must not be able to rewrite its own permission definition. So permission changes can only happen **one level up** (the parent that spawns sessions).

There's an implementation trap here, though. What you want to protect is "the permission and scope definition files themselves." If you conclude "just ban `Edit` / `Write` entirely," you fail: the agent can no longer write even its own **work log**. What's needed is not a per-tool ban but a **per-path ban**. Deny exactly the definition files by name, and keep the session's working area writable.

```jsonc
// What we protect is the session's own permission/scope definitions. Deny exactly those by name.
"deny": [
  "Write(.claude/**)",   // permission definitions (settings)
  "Write(/CLAUDE.md)"    // scope declaration
  // Working areas like session logs stay writable
]
```

Conversely, `read`-permission repositories get banned **wholesale** — since they're read-only, excluding the entire tree from `Write` / `Edit` is the straightforward, safe move. The problem appeared where "ban wholesale" collided with "keep my own logs writable."

I actually messed this up once. The session's own working directory was **nested under** a read-target repository. Banning the read target's whole tree took the session's logs down with it — the agent could no longer write its own log.

What fixed it was not narrowing the deny but **physically separating the working area from the scoped targets**. Move the session's working directory (logs, scratch notes) **outside** the protected tree entirely. Then read targets can be banned wholesale with confidence, and the session writes its logs freely. Not shaving down the protected area to make things fit — **splitting the ground so that what you protect and where you write never overlap**.

## Hard part 2: double-lock push

Push is the scariest. Pushing to a `read` repository; pushing straight to `main`. Both are hard to undo.

Naively, narrowing the **allowlist** of push commands stops it. That works well against the agent's **careless accidents**. But as hardness goes, it's insufficient: an allowlist only checks "is this command shaped like `git push`", so it can't judge variants that switch the working directory like `git -C <other-repo> push`, nor which repository or branch the push is aimed at. Matching on command shape cannot protect the destination's permission.

So I made it two layers:

1. **Narrow "what can push" with the allowlist** … only sessions holding `write-push` get a push command at all. Sessions with only `read` or `write-local` are never given one.
2. **A pre-execution hook** … inspects the command string, derives the push destination's repository path, looks up its permission, and decides.

The hard layer is the second. It looks at the command string about to run, works out the push destination from `git -C <path>` or the working directory, and checks it against the manifest (path → permission). Pushes to `read` / `write-local` paths are all blocked; even on `write-push` paths, direct pushes to `main` / `master` are blocked. If the destination can't be determined, it fails safe and rejects, prompting "specify the target explicitly with `git -C <absolute path>`". The hook physically enforces the per-destination permission that command-shape allowlists can't reach.

## Make sessions resumable

Agent sessions die. If the context vanishes with them, you're back to square one every time, so work logs are kept in two layers:

- **Snapshot** (always current, overwritten) … the one page that says "read this and you can resume": current task, target repositories and working branches, touched files, next move, unresolved decisions
- **Task log** (chronological, append-only) … the history of events and decision rationale

On resume, a launch hook automatically injects the snapshot into context. The agent picks up "from where it left off" without being told anything. If guardrails are the mechanism that prevents accidents, this is the mechanism that prevents losing work.

## Where this stands, and what's next

Honestly: this is still **personal tooling**. It's something I built to put guardrails on my own agent, on my own machine — not a production system.

But the shape itself — "a session = a declaration of scope + permissions" — has no reason to stay personal. I'm considering **publishing it as a repository**, installable globally, so anyone's machine can cut sessions the same way. As more people use coding agents daily, the need to **fix "what the agent may and may not touch" as an external declaration** will only grow, and I'd like this to become a shared foundation for it.

When you try to control an agent cleverly, you're tempted to write clever prompts. But what actually stops accidents is usually not cleverness — it's the config that makes them **impossible in the first place**.
