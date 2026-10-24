# worktree-office

A pixel-art office for your git worktrees and the Claude Code agents working in them.

worktree-office is a fork of [Pixel Agents](https://github.com/pixel-agents-hq/pixel-agents). It keeps everything Pixel Agents does, where every Claude Code session becomes an animated character, and adds what you need when you run several agents in parallel, one git worktree per task.

> Status: early development. Expect breaking changes.

![The demo office: one room per worktree with door signs, agents at work, the task box and the "Needs you" panel](docs/images/office.jpg)

## Why

With five agents working in five worktrees, the hard questions are not about code:

- Which tasks are still running, and which ones are waiting for me?
- Which pull request is ready for my review?
- Which worktree can I clean up, and which one is still in use?

worktree-office answers them on one screen. Each worktree becomes a room, each session sits in the room of the worktree it works on, and each room shows the state of its branch and pull request.

## Roadmap

- [x] One room per git worktree, kept in sync as worktrees come and go
- [x] Sessions running inside a worktree sit in its room; everything else waits in the lobby
- [x] Launching Claude Code into a worktree from the browser, on Windows too
- [x] Sessions that work on a worktree from outside it, through `git -C` or file edits, move to its room
- [x] Door signs with branch, pull request status, checks and dev server port
- [x] A "needs you" panel: sessions waiting for input or permission, pull requests waiting on you, stale worktrees
- [x] One-click release of a worktree: stop its dev server, stash leftovers, then detach or remove it
- [x] A task box that starts new tasks in free worktrees, with a limit on how many run at once
- [x] Tokens used by each task
- [x] System notifications when something new needs you
- [x] Demo mode with a fictional project
- [ ] GitLab merge requests

## Getting started

worktree-office is not on npm yet. Run it from source with Node.js 20 or later and Claude Code installed:

```bash
git clone https://github.com/MarcosNespolo/worktree-office.git
cd worktree-office
npm install
npm run compile
node dist/cli.js --port 3100
```

Want to look around first? `node dist/cli.js --demo` opens a fictional project with six worktrees, simulated agents and fictional pull requests. It runs in a temporary folder and never touches your hooks, sessions or settings.

Open the URL printed in the terminal. It carries an access token, so treat it like a password.

On first run, the office asks for permission to add hooks to `~/.claude/settings.json`, so it can follow your sessions as they happen. You can remove them anytime from Settings.

The hooks run in the background, so they never slow Claude Code down, and they send only what the office needs: event names, tool names, paths and commands, never tool output. Set `PIXEL_AGENTS_DEBUG=1` to get verbose server logs.

worktree-office keeps its data in `~/.worktree-office/`, separate from Pixel Agents, so both can be installed side by side.

## Configuration

By default, worktree-office watches the git repository it was started in. To watch other repositories, or several at once, create `~/.worktree-office/projects.json`:

```json
{
  "projects": [
    {
      "name": "acme-web",
      "root": "~/code/acme-web",
      "include": ["~/code/acme-web-*"],
      "exclude": ["~/code/acme-web-scratch"]
    }
  ]
}
```

| Field             | Meaning                                                                |
| ----------------- | ---------------------------------------------------------------------- |
| `name`            | Project name used in logs. Defaults to the folder name.                |
| `root`            | Any checkout of the repository. Its worktrees become rooms.            |
| `include`         | Optional globs. When present, only matching worktrees become rooms.    |
| `exclude`         | Optional globs. Matching worktrees never become rooms.                 |
| `includeMain`     | Set to `true` to give the main checkout a room too.                    |
| `followToolPaths` | Set to `false` to stop moving sessions by the paths their tools touch. |

Room names come from the worktree folder without the repository prefix, so `acme-web-fix-login` becomes `fix-login`. The office holds up to 24 rooms. The layout is generated, so edits made in the layout editor are replaced when worktrees change.

### Door signs and the "needs you" panel

Each room shows a sign with its branch and the pull request of that branch: number, review state and checks. Pull requests come from the [GitHub CLI](https://cli.github.com/), so install it and run `gh auth login` once.

The "Needs you" panel lists what is waiting on you:

- sessions asking for approval or waiting for your input;
- pull requests with changes requested, failing checks, or approved and ready to merge;
- worktrees whose pull request was merged or closed, ready to be released;
- dev servers still running in a worktree that is free.

Click **alerts off** in the panel header to get a system notification whenever a new item shows up while the office tab is not focused. The browser asks for permission the first time.

These project fields tune the signs and the panel:

| Field       | Meaning                                                                                                                                                                                                               |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `github`    | `owner/repo` to read pull requests from, or `false` to skip them. Defaults to the `origin` remote.                                                                                                                    |
| `devServer` | Dev server of each room, for example `{ "portBase": 3000, "portStep": 100, "ports": { "main-app": 3001 }, "url": "http://localhost:{port}" }`. The port comes from the first number in the room name or from `ports`. |
| `fields`    | Extra values read from each pull request, for example `{ "name": "stage", "pattern": "^stage:(.+)$", "from": "labels" }`. `from` is `body` (default) or `labels`, and the first capture group is the value.           |
| `needsYou`  | Rules that turn a field into a panel item, for example `{ "field": "stage", "values": ["qa"], "title": "Ready for your QA" }`.                                                                                        |

### Releasing a worktree

Every door sign has a **release** button, and panel items for merged pull requests or forgotten dev servers have one too. One click:

1. asks first when the pull request is still open, when sessions started from the office are working there, or when files changed;
2. runs the cleanup commands of the project;
3. stashes changed files, so nothing is lost;
4. stops the dev server listening on the room port;
5. checks out the default branch detached, or removes the worktree.

Every release is logged in `~/.worktree-office/release.log`. The main checkout is never released.

| Field     | Meaning                                                                                                                                                                                                                           |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `release` | `{ "mode": "detach", "before": ["npm run clean"] }`. `mode` is `detach` (default: keep the folder, check out the default branch) or `remove` (delete the worktree). `before` commands run in the worktree, in the platform shell. |

### Starting tasks

Type one or more tasks in the box at the top and press **Start** (or Ctrl+Enter). Separate tasks with a blank line, or write them as a list. Each task:

1. waits until fewer than `maxActive` tasks are running;
2. takes a free worktree, meaning one with no branch checked out and nobody working in it, or creates one when `createWorktree` is set;
3. starts Claude Code in that worktree, inside the office terminal;
4. receives its prompt through the terminal, never on a command line, once Claude Code is ready.

When Claude Code asks whether to trust a new folder, or asks for approval, the task shows up in the "Needs you" panel. Sessions started from the office can be answered right there: type a reply, or 1, 2 or 3 to pick a menu option. A task waiting on the folder question never answers it by itself, and its prompt goes in only after you reply.

A task is done when its session closes.

Each task row shows the tokens its session has used so far: input, cache reads and writes, and output, sub-agents included. It is a measure of usage, not a price.

| Field               | Meaning                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tasks` (top level) | `{ "maxActive": 3, "split": "lines" }`. `split` is `lines` (paragraphs or list items) or `claude`, which asks Claude Code to split free text into tasks.                                                                                                                                                                                                                                                |
| `launch`            | `{ "prompt": "{text}", "skipPermissions": false, "rooms": ["~/code/acme-web-slot*"] }`. `prompt` is the text sent to the agent, with `{text}`, `{title}`, `{room}`, `{path}`, `{branch}` and `{port}` filled in. `skipPermissions` starts Claude Code with `--dangerously-skip-permissions`. `rooms` limits which worktrees take tasks, as path globs; by default any free worktree of the project can. |
| `createWorktree`    | `{ "path": "~/code/acme-web-{slug}", "branch": "task/{slug}", "copy": [".env.local"], "after": ["npm install"] }`. Creates a worktree when none is free. `path` takes `{slug}` or `{n}`, `copy` brings untracked files from the main checkout, and `after` runs setup commands.                                                                                                                         |

## Credits

- [Pixel Agents](https://github.com/pixel-agents-hq/pixel-agents) by Pablo De Lucca and contributors, under the MIT License. The office, the characters and the Claude Code integration come from there. The [Pixel Agents README](https://github.com/pixel-agents-hq/pixel-agents#readme) covers everything about the office itself.
- Characters based on the [Metro City](https://jik-a-4.itch.io/metrocity-free-topdown-character-pack) pack by JIK-A-4 (CC0).

## License

[MIT](LICENSE)
