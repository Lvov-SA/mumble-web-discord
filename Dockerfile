FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN chown node:node /app
USER node
# Allow pinned Git dependencies to install without an SSH key.
RUN git config --global url."https://github.com/".insteadOf ssh://git@github.com/ \
    && git config --global --add url."https://github.com/".insteadOf git@github.com:
COPY --chown=node:node package.json package-lock.json webpack.config.js ./
COPY --chown=node:node patches ./patches
COPY --chown=node:node app ./app
COPY --chown=node:node loc ./loc
COPY --chown=node:node themes ./themes
# postinstall patches codec workers; prepare builds dist.
RUN npm ci --no-audit --no-fund

FROM debian:bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
      websockify ca-certificates tini \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --create-home mumble-web
WORKDIR /app
COPY --from=build --chown=mumble-web:mumble-web /app/dist ./dist
COPY docker/configure.py ./configure.py
COPY --chmod=755 docker/entrypoint.sh /usr/local/bin/mumble-web-entrypoint
USER mumble-web
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD python3 -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/', timeout=3)"
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/mumble-web-entrypoint"]
