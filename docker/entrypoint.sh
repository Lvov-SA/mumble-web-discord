#!/bin/sh
set -eu
: "${MUMBLE_SERVER:?Set MUMBLE_SERVER to your Mumble host:port}"
python3 /app/configure.py
exec websockify --ssl-target --web=/app/dist 0.0.0.0:8080 "$MUMBLE_SERVER"
