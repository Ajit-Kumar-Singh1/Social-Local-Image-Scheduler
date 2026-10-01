FROM node:24-bookworm-slim

ENV PNPM_HOME="/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"

RUN corepack enable && corepack prepare pnpm@10.26.1 --activate

WORKDIR /workspace

# Keep the full pnpm workspace available so workspace:* dependencies resolve.
COPY . .
RUN pnpm install --frozen-lockfile

EXPOSE 5173 8080

# docker-compose.yml overrides this for the API service.
CMD ["pnpm", "--filter", "@workspace/social-local", "run", "dev"]