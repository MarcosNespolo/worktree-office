# worktree-office

A pixel-art office for your git worktrees and the Claude Code agents working in them.

worktree-office is a fork of [Pixel Agents](https://github.com/pixel-agents-hq/pixel-agents). It keeps everything Pixel Agents does, where every Claude Code session becomes an animated character, and adds what you need when you run several agents in parallel, one git worktree per task.

> Status: early development. Expect breaking changes.

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
- [ ] A task box that starts new tasks in free worktrees
- [x] Demo mode with a fictional project

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

## Credits

- [Pixel Agents](https://github.com/pixel-agents-hq/pixel-agents) by Pablo De Lucca and contributors, under the MIT License. The office, the characters and the Claude Code integration come from there. The [Pixel Agents README](https://github.com/pixel-agents-hq/pixel-agents#readme) covers everything about the office itself.
- Characters based on the [Metro City](https://jik-a-4.itch.io/metrocity-free-topdown-character-pack) pack by JIK-A-4 (CC0).

## License

[MIT](LICENSE)
