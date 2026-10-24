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

- [ ] One room per git worktree, kept in sync as worktrees come and go
- [ ] Sessions seated in the room of the worktree they work on
- [ ] Launching Claude Code into a worktree from the browser, on Windows too
- [ ] Door signs with branch, pull request status, checks and dev server port
- [ ] A "needs you" panel: sessions waiting for input or permission, pull requests waiting on you, stale worktrees
- [ ] One-click release of a worktree: stop its dev server, stash leftovers, then detach or remove it
- [ ] A task box that starts new tasks in free worktrees
- [ ] Demo mode with a fictional project

## Getting started

worktree-office is not on npm yet. Run it from source with Node.js 20 or later and Claude Code installed:

```bash
git clone https://github.com/MarcosNespolo/worktree-office.git
cd worktree-office
npm install
npm run compile
node dist/cli.js --port 3100
```

Open the URL printed in the terminal. It carries an access token, so treat it like a password.

On first run, the office asks for permission to add hooks to `~/.claude/settings.json`, so it can follow your sessions as they happen. You can remove them anytime from Settings.

worktree-office keeps its data in `~/.worktree-office/`, separate from Pixel Agents, so both can be installed side by side.

## Credits

- [Pixel Agents](https://github.com/pixel-agents-hq/pixel-agents) by Pablo De Lucca and contributors, under the MIT License. The office, the characters and the Claude Code integration come from there. The [Pixel Agents README](https://github.com/pixel-agents-hq/pixel-agents#readme) covers everything about the office itself.
- Characters based on the [Metro City](https://jik-a-4.itch.io/metrocity-free-topdown-character-pack) pack by JIK-A-4 (CC0).

## License

[MIT](LICENSE)
