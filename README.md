# cgemini

**cgemini = Conductor + Gemini.**

A CLI and MCP server that puts Gemini inside any [Conductor.build](https://conductor.build) workspace as an independent code reviewer. Claude writes the code; Gemini reviews it — different model, no shared context, different blind spots caught.

```bash
npm install -g cgemini
cgemini login
cgemini review --staged          # Gemini reviews your staged changes
cgemini review --last --focus security
git diff main | cgemini review
```

## Why

Conductor runs many coding agents in parallel, each in its own workspace. `cgemini` gives every one of those agents access to Gemini — configured once in `~/.cgemini/config.json`, available everywhere — as a second opinion that didn't write the code it's reviewing.

## Install

```bash
npm install -g cgemini
```

Requires Node.js 18 or newer (uses the built-in `fetch`).

## Setup

Get an API key from [Google AI Studio](https://aistudio.google.com/apikey), then:

```bash
cgemini login                              # interactive, hidden input
# or
cgemini config set-key <your-key>          # non-interactive
```

Optional: pick a default model.

```bash
cgemini config set-model models/gemini-2.5-pro
```

Check what's active:

```bash
cgemini config show
```

## Usage

```bash
cgemini "Summarize git diff in one line"
git diff | cgemini "What changed?"
cgemini "Write a haiku about Friday"
```

Only the model's response text is written to **stdout**. Errors and status messages go to **stderr**. That makes it safe to pipe, capture, or use in Conductor's shell-command blocks.

### Code review

Ask Gemini to independently review your changes — useful because Gemini didn't write the code and has no context bias.

```bash
cgemini review --staged                   # review what's staged for commit
cgemini review --last                     # review the last commit
cgemini review --last --focus security    # security-only pass
cgemini review --last --focus logic       # logic/correctness only
git diff main | cgemini review            # review a branch diff
cgemini review src/auth.js                # review specific file (vs HEAD)
```

Focus options: `all` (default) · `security` · `logic` · `style`

The review ends with a clear one-line verdict: **LGTM** / **LGTM with minor notes** / **Needs changes**.

### Commands

| Command | Description |
| --- | --- |
| `cgemini "<prompt>"` | Send a prompt, print the response |
| `cgemini review` | Review a git diff with Gemini (independent code reviewer) |
| `cgemini login` | Interactively save your API key |
| `cgemini config set-key <key>` | Save an API key non-interactively |
| `cgemini config set-model <model>` | Save the default model |
| `cgemini config show` | Print effective config (key is masked) |
| `cgemini config remove-key` | Remove the stored API key |
| `cgemini install` | Register the MCP server and `/gemini` slash command with Claude Code |
| `cgemini --version` | Print the installed version |
| `cgemini --help` | Print usage |

### Environment overrides

All config values can be overridden per-invocation without touching the saved config:

| Variable | Purpose |
| --- | --- |
| `CGEMINI_API_KEY` | API key (takes priority over the stored key) |
| `GEMINI_API_KEY` | Alternate API key variable, also honored |
| `CGEMINI_MODEL` | Model name (e.g. `models/gemini-2.5-pro`) |
| `CGEMINI_CONFIG_DIR` | Override the config directory (default `~/.cgemini`) |

Resolution order: **env var → config file → built-in default**.

## Models

The default is `models/gemini-2.5-flash`. If the selected model returns a transient error (429/5xx) or is unavailable, `cgemini` retries briefly and then falls back through this list:

```
models/gemini-2.5-flash
models/gemini-2.5-flash-lite
models/gemini-2.0-flash-001
models/gemini-2.0-flash-lite-001
models/gemini-2.5-pro
models/gemini-pro-latest
```

Authentication errors (401/403) fail immediately rather than retrying.

## Using cgemini from Conductor

`cgemini` plugs into any [Conductor.build](https://conductor.build) workspace without per-project setup. One install registers two surfaces with Claude Code at the user scope (`~/.claude/...`), so every Conductor agent inherits both your Gemini key and the integration.

```bash
cgemini login       # one-time: store your key in ~/.cgemini/config.json
cgemini install     # one-time: register MCP server + /gemini slash command
```

That's it. Open any Conductor workspace and you have two ways to use Gemini:

### Gemini as independent code reviewer (primary use case)

The most valuable workflow in Conductor: Claude writes the code, Gemini reviews it. Different model, no shared context, catches different blind spots.

**Via MCP tool** — ask the agent:
> *"Use the review_code tool to review your changes before committing."*

The agent runs `git diff --cached`, passes it to Gemini, reads the review, and fixes any issues before they ship.

**Via slash command** — type directly in the Conductor prompt window:
```
/gemini review --staged
```

Or set it up as part of your agent's task instructions:
> *"After making changes, run `git diff --cached | cgemini review` and fix any issues Gemini flags before proceeding."*

### 1. `ask_gemini` MCP tool (agent-driven)

`cgemini install` runs `claude mcp add gemini -s user -- cgemini-mcp`, which gives the Claude Code agent inside every Conductor workspace a new tool. Ask the agent naturally:

> *"Get a second opinion from Gemini on this refactor."*
> *"Use ask_gemini to summarize the changes in this diff."*

The agent decides when to call it and weaves the response into its reasoning — same pattern as Context7 or Linear.

### 2. `/gemini` slash command (user-driven)

`cgemini install` also writes `~/.claude/commands/gemini.md`. Type this in any Conductor prompt window:

```
/gemini Explain blockchain in simple terms
```

Claude Code shells out to `cgemini` and injects the response inline. Good for quick direct questions without engaging the agent's reasoning loop.

### Can cgemini appear in Conductor's model-selection dropdown?

**No.** Conductor runs Codex + Claude Code agents; its model selector reflects what those two runtimes support (Anthropic + OpenAI models). There's no extension API to register a third agent in the dropdown. The MCP-tool-plus-slash-command approach above gives Gemini the same reach inside Conductor without needing that slot.

### Install flags

| Flag | Effect |
| --- | --- |
| `cgemini install` | Install both surfaces (default) |
| `cgemini install --mcp-only` | Register MCP server only |
| `cgemini install --slash-only` | Write slash command only (no `claude` CLI needed) |
| `cgemini install --force` | Overwrite an existing `~/.claude/commands/gemini.md` |

## Development

```bash
git clone https://github.com/wakqasahmed/cgemini
cd cgemini
node bin/cgemini.js --help
npm test
```

## Publishing

This repo auto-publishes to npm when you push a semver tag:

```bash
npm version patch          # or minor / major
git push && git push --tags
```

See `.github/workflows/publish.yml`. You'll need an `NPM_TOKEN` secret on the GitHub repo.

## License

MIT — see [LICENSE](./LICENSE).
