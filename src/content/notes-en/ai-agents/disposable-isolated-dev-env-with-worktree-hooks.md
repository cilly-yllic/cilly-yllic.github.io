---
title: 'Disposable isolated dev environments with Claude Code worktree hooks'
description: "git worktree only isolates code. Spawn a dedicated DB, dynamic ports, and a dev server per worktree, and let WorktreeCreate / SessionStart / SessionEnd hooks manage the lifecycle automatically. Design principles that settled after running this on three projects."
category: 'ai-agents'
publishedAt: 2026-08-10
---

Once you start working with coding agents, the unit of work shifts from "one branch a day" to "three or four tasks at once." The agent moves on to the next task without waiting, so the bottleneck on the human side becomes **workspaces**. If everything fights over a single checkout, all that parallelism dies.

`git worktree` solves half of this problem. It grows multiple working trees from the same repository, so the **code** is isolated. But a dev environment doesn't run on code alone. The DB, ports, dev servers, containers — all of these stay shared no matter how many worktrees you create. Apply a migration in worktree A and the app in worktree B breaks. Start dev servers in both and they fight over the port. `git worktree` by itself does not give you parallel development.

So I built a mechanism that **spawns a dedicated environment (DB, ports, processes) per worktree and manages its lifecycle automatically through Claude Code hooks**. One command brings up the environment together with the worktree when a task starts; closing the session stops the environment; merging leaves no trace. Disposable, isolated environments.

I've been running this on three projects with different constraints:

- **Project A**: a monorepo — dedicated DB container + frontend dev server per worktree
- **Project B**: a monorepo — runs on a local emulator suite (with the constraint that its ports are fixed)
- **Project C**: multiple repositories (polyrepo) — isolation has to span repos

Despite the differing constraints, the architectures converged to the same shape. This article is that converged design — the division of roles between hooks, skills, and the CLI, plus the design decisions that solidified in operation.

## The big picture

![Architecture diagram: three entrances go through a single CLI to operate per-worktree environments, with hooks managing the lifecycle](/images/worktree-isolated-env-architecture-en.svg)

*Whatever the entrance, the substance is one CLI. Hooks connect lifecycle events to the CLI, and the dedicated environment never touches the main one.*

There are only three kinds of actors.

- **The CLI script** … a shell script holding all the real work — create, start, stop, destroy (deterministic, idempotent)
- **Hooks** … connect Claude Code lifecycle events (worktree creation, session start / end) to the CLI
- **A skill** … translates natural-language requests inside a session into CLI commands

The rest of this article walks through five design principles that settled in operation.

## Principle 1: put the real work in a deterministic CLI; the skill is only a translator

This is the most important decision. **Never let the LLM execute environment orchestration — creation, allocation, startup, teardown — as a "procedure."** Everything is materialized in one shell script (a few hundred lines), and the skill's job is narrowed to "translate the request into a command, run it once, report the result."

The skill definition (SKILL.md) is essentially this mapping table:

| What the user says | Command |
| --- | --- |
| "Set up the environment for TASK-1234" | `up 1234` |
| "I want to verify with the backend too" | `up 1234 --with-backend --clone-db` |
| "Pause it for now" (don't delete) | `stop 1234` |
| "Resume the one from earlier" | `start 1234` |
| "Tear down this worktree" | `remove 1234` (destructive — confirm first) |
| "List them" / "What's the status?" | `list` / `status` |

If you let an agent improvise git and npm commands, the procedure differs subtly every time, and so does the state after a failure. Pushing everything into a script buys you:

- **Idempotency and reproducibility** … same input, same result; safe to re-run after a mid-way failure
- **Agent independence** … run it straight from a terminal with no LLM and no tokens; usable from CI or other agents
- **Token savings** … even via the skill, the model only reasons about "which command"
- **Testability** … if `source`-ing the script loads only function definitions, allocation logic can be verified in isolation

The skill explicitly states: "do not re-type individual git commands by hand (the script is the single source of truth)." LLMs are clever; left alone they invent workaround procedures that bypass the script. That one line is the brake.

The three entrances are a corollary of this design. Because the substance is a CLI, calling it (1) from a launcher, (2) from a terminal, or (3) via natural language in a session all produce identical behavior.

## Principle 2: session = the environment's lifetime (SessionStart / SessionEnd)

When humans manage environment lifecycles, leftover running environments always pile up. So I tilted it to "**the environment lives exactly as long as the Claude Code session**."

- **SessionStart hook** … if cwd is a managed worktree, auto-`start` the environment if stopped
- **SessionEnd hook** … likewise, auto-`stop` (data persists in volumes; the next start resumes with no diff)

So `cd worktree && claude` wakes the environment, and `/exit` cleans up after itself. "Forgot to stop it" and "forgot to start it" disappear structurally.

### SessionStart's stdout is injected into context

SessionStart has a crucial property: **its stdout (or `additionalContext`) is injected into the session's context.** I use it to push connection info in right at startup.

```json
{
  "systemMessage": "[wt] environment resumed",
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "FE: http://localhost:60398 / DB: localhost:55231 (user/pass...)"
  }
}
```

Both Claude and the human start the session **already knowing** the URLs and DB connection info. No more re-discovering "where is the dev server running?" every time. With dynamic port allocation (below), URLs change every run, so this injection matters even more.

### Trap: SessionEnd fires on `/clear` too

One trap from operation: `/clear` (clearing context) also fires SessionEnd, immediately followed by SessionStart. If you naively stop there, **the environment goes down mid-work** and has to boot again. The hook's input JSON carries a `reason`, so branch on it:

```bash
REASON=$(echo "$INPUT" | jq -r '.reason // empty')
[ "$REASON" = "clear" ] && exit 0   # do not stop on clear; the session continues
```

## Principle 3: take over creation itself with the WorktreeCreate hook

Claude Code can be launched as `claude --worktree <name>`, and defining a **WorktreeCreate hook** lets the hook own the creation of the worktree. The contract is simple:

- **stdout must contain only the worktree's directory path** (all other logs go to stderr)
- non-zero exit blocks the creation

If the hook does `git worktree add` plus the full environment build (DB container, env, dependencies, dev server), then `claude --worktree fix-login` brings up the *environment*, not just the worktree. Three refinements proved necessary in practice.

### Mirror progress to /dev/tty

Hook stderr is only visible in Claude Code's debug mode. Environment builds take minutes, so silence looks like a hang. When a terminal can be opened, mirror progress to `/dev/tty`:

```bash
# test by actually opening it (-w can pass while opening still fails)
if (exec 4> /dev/tty) 2>/dev/null; then
  exec 3>&2 2> >(tee /dev/tty >&3)
fi
```

### Leftover branches: present options and abort

Teardown keeps branches (for history), so re-creating under the same name hits "the branch already exists." Reusing silently is risky; deleting silently is worse. And **hooks cannot ask questions**. So the policy is passed via an environment variable, and with none set, the hook prints the options and exits non-zero:

- `reuse` … reuse the existing branch (carrying over previous commits)
- `new` … create a suffixed new branch (`-2`, `-3`…) from base
- `delete` … delete and recreate from base (aborts if commits not on base exist; `delete-force` overrides)
- unset … show the choices above and abort

"Hooks can't interact, so convert judgment calls into **abort + how to re-run**" is a pattern that generalizes to other hooks.

### Self-replicate the tooling into the worktree

A worktree checks out the base branch's content. Until the hooks and skills are merged into base, sessions opened in the worktree get neither auto start/stop nor the skill. So at the end of creation, the hook **copies settings / hooks / skills from the main side into the worktree**.

That copy needs mis-commit protection: a worktree-local `.claude/.gitignore` listing exactly what was copied. Two subtleties:

- **don't use `git`'s `info/exclude`** … it's a **shared** file even across linked worktrees, so it would leak to the main side
- **do not ignore skills** … gitignored files can be missed by skill discovery scans; ignoring them breaks the skill itself

## Principle 4: an "environment-variable protocol" for entrances that take no flags

`claude --worktree <name>` accepts no arbitrary flags, and the JSON a hook receives has no argv. Yet real options exist: clone the DB with data or schema-only? which base branch?

The answer is environment variables. Options live in a `WORKTREE_*` namespace, used by the flagless entrances:

```bash
WORKTREE_TITLE="rework login screen" WORKTREE_DB=schema claude --worktree fix-login
```

Direct CLI calls can use flags, so the rule became "**everything is settable via env var or flag, and flags win**." Interpretation is centralized in one function, and a `__setup-opts` subcommand prints how the current env vars will be interpreted. Paths with no flags are also hard to debug — that inspection port quietly earns its keep.

The same trick powers a custom launcher. Project C ships a wrapper that shadows `claude` as a shell function, intercepts its own flag, converts it to an env var, and launches plain `claude`. SessionStart hooks **inherit env vars set before launch** (verified empirically), so the hook detects the variable and routes to environment creation:

```text
claude -we 1234
  └ wrapper: intercepts -we → sets WORKTREE_ENV_REF=1234 → launches plain claude
      └ SessionStart hook: detects WORKTREE_ENV_REF
           on startup → runs the CLI's create
           on resume  → shows status + DB connection info
```

One operational caution: keep SessionStart's automatic work light (worktree creation + record only), and defer heavy work (dev-server boot, first container build) to after the session opens. Hooks block session startup; a ten-minute build there ruins the experience.

## Principle 5: "collision-free" is earned by abandoning fixed values

The nastiest problem with concurrent environments is collisions — ports and resource names. This went through three generations.

**Generation 1: fixed ports + mutual exclusion.** Project B's emulator suite has fixed ports, so it runs one environment at a time. SessionStart checks port occupancy with `lsof`; if another environment holds it, it doesn't start and injects that fact into context, returning the decision to the human. A fair second-best under the constraint.

**Generation 2: sequential IDs from a shared registry.** Allocate an ID per environment and offset ports as `port = base + ID * 100`. It broke down for two reasons. The registry JSON's read-modify-write has **no lock** — two simultaneous creates both take ID 1 and everything collides. And fixed ports collide with **unrelated existing processes** (like the main dev server) no matter how correct the allocation is.

**Generation 3: content-derived IDs + dynamic allocation.** The current shape.

- The **environment ID** is derived **from content**: `<task key, lowercased>-<short hash of the worktree path>`. It namespaces docker compose project names, containers, volumes, networks. Because the ID is determined by content, allocation races are impossible by construction (and no shared registry is needed)
- **No fixed ports.** The dev server gets a free port from the OS (`socket.bind(("", 0))`); containers let docker assign and are read back afterwards. Infra containers (DB etc.) aren't host-published at all — apps resolve service names inside the docker network; only a GUI-client port is published dynamically
- **No fixed subnets** (docker auto-assigns)

With no fixed values anywhere, any number of environments coexist. The price is **predictability**: URLs change every run, so completion output always prints them, and Principle 2's SessionStart injection keeps feeding them into the session.

### Make runtime.json the single source of truth

The dynamically resolved ports, URLs, PIDs, and state are recorded in a per-worktree `runtime.json` (gitignored). This file is the environment's **single source of truth**:

```json
{
  "env_id": "task-1234-cc92ae",
  "title": "rework login screen",
  "state": "running",
  "fe": { "port": 60398, "url": "http://localhost:60398", "pid": 12345 },
  "backend": {
    "compose_project": "task-1234-cc92ae",
    "db": { "port": 55231 }
  }
}
```

Crucially, **teardown is driven by this record**. `remove` reads PIDs, the compose project, and the worktree path from runtime.json and reliably cleans up: kill processes → `docker compose down -v` → delete artifacts → `git worktree remove`. "Record what you create; delete from the record" eliminates cleanup leaks.

## Invariants — guaranteed by the script, never to be broken

On top of the design decisions sit invariants shared by all projects. They're also written into the skill definition ("the script guarantees these; do not make changes that break them") to guard against agent edits.

1. **Never write to the main environment** … don't touch normal checkouts, their ports, containers, DBs, or config. Even backend compose definitions stay unmodified — only an external override file swaps values (repositories unmodified)
2. **Teardown removes everything — except the branch** … clean up all dedicated resources including `down -v`, but keep the branch so pushed PRs are unaffected
3. **Never copy plaintext secrets into worktrees** … env files with credentials are excluded from copying
4. **Destructive operations require confirmation** … `remove` and DB `restore` present the target and impact (e.g. uncommitted changes will be lost) before running

## Daily flow, and the quietly useful commands

The daily rhythm looks like this:

```bash
create 1234 --desc "rework login screen"   # build the environment (worktree + deps)
up 1234 --with-backend --clone-db          # start (DB cloned from main)
stop 1234                                  # pause before going home (nothing deleted)
start 1234                                 # resume next day (same DB)
pr 1234                                    # push + create PR
remove 1234                                # full teardown after merge
```

Operation forced a set of "boring but effective" commands into existence:

- **`list`** … all environments, keeping the creation-time `--title` / `--desc` visible. Past four parallel tasks, "what was this one again?" genuinely happens
- **`doctor`** … diagnostics: required tools, docker state, **mismatches between the record (runtime.json) and reality**, orphaned compose-project candidates
- **`clean`** … leftover detection. Report-only by default; `--force` after review. A marker file protects environments you keep on purpose
- **`snapshot` / `restore`** … DB rollback to any point. Invaluable for migration work
- **`logs`** … aggregates dev-server and container logs. Never `tail -f` — it blocks the agent

`doctor` and `clean` are the safety net for the premise that **automated management will eventually drift from reality**. Machines die before auto-stop runs; humans touch docker directly. Having "reconcile record vs. reality" as a command spares you manual forensics when it drifts.

## Summary

- `git worktree` isolates only code. **Environment isolation and lifetime management (DB, ports, processes)** are built from hooks and a CLI
- Put the real work in a deterministic CLI; keep the skill a translator. However many entrances (launcher / terminal / natural language), the substance is one
- Make session = environment lifetime with SessionStart / SessionEnd; share connection info from second zero via stdout injection
- Hooks can't interact and get no argv. Convert judgments into "abort + how to re-run," and options into an "environment-variable protocol"
- Collision-freedom comes from abandoning fixed values: content-derived IDs + dynamic allocation + runtime.json as the single source of truth

Parallel development with agents is limited less by "how fast the agent is" than by "how many workspaces you can line up." Per-worktree disposable environments are the infrastructure for the lining-up side. The complementary question — "which repos may this session touch, and how far" — is covered in [Enforce with config, not attention — scope and permission guardrails for coding agents](/en/notes/ai-agents/scope-and-permission-guardrails-for-coding-agents).
