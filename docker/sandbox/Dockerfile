# The image sandboxed threads run their agent in (see apps/runner/src/sandbox/sandbox.ts).
# Grid starts the agent by name (`claude`, `codex`, `opencode`), so the image has each of them,
# and git and gh so the agent can commit and open pull requests. The thread's folder, the agent's
# sign-in and Bun (for Grid's own tools) come from the machine at run time; nothing else does.
#
#   docker build -t grid-sandbox docker/sandbox      (or: bun run sandbox:build)
FROM node:22-bookworm-slim

RUN apt-get update \
	&& apt-get install -y --no-install-recommends ca-certificates curl git gnupg openssh-client ripgrep \
	&& curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
		-o /usr/share/keyrings/githubcli-archive-keyring.gpg \
	&& echo "deb [signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
		> /etc/apt/sources.list.d/github-cli.list \
	&& apt-get update \
	&& apt-get install -y --no-install-recommends gh \
	&& rm -rf /var/lib/apt/lists/*

RUN npm install -g @anthropic-ai/claude-code @openai/codex opencode-ai \
	&& npm cache clean --force

# The agent runs as the machine's own user (`--user`), whose home may not exist here: git and the
# agents are told where it is with HOME, and need a writable temp folder.
ENV TMPDIR=/tmp
WORKDIR /tmp
