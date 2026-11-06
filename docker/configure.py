"""Generate public browser settings at startup; no Mumble credentials go here."""
import json
import os
from pathlib import Path


simple_value = os.environ.get("WEB_SIMPLE_LOGIN", "true").lower()
if simple_value not in ("true", "false"):
    raise SystemExit("WEB_SIMPLE_LOGIN must be true or false")
simple = simple_value == "true"
address = os.environ.get("WEB_ADDRESS", "").strip()
port = os.environ.get("WEB_PORT", "").strip()
if port and (not port.isascii() or not port.isdigit() or not 1 <= int(port) <= 65535):
    raise SystemExit("WEB_PORT must be empty or a port between 1 and 65535")

settings = {
    "simple": simple,
    "address": address,
    "port": port,
}
script = """// Generated from public WEB_* settings at container startup.
(() => {
  const settings = SETTINGS;
  const config = window.mumbleWebConfig;
  config.lockConnection = settings.simple;
  config.connectDialog.address = !settings.simple;
  config.connectDialog.port = !settings.simple;
  config.connectDialog.token = !settings.simple;
  config.connectDialog.channelName = false;
  config.connectDialog.username = true;
  config.connectDialog.password = true;
  config.defaults.address = settings.address || window.location.hostname;
  config.defaults.port = settings.port || window.location.port || '443';
  config.defaults.webrtc = 'false';
  config.defaults.joinDialog = false;
  config.defaults.matrix = false;
})();
""".replace("SETTINGS", json.dumps(settings, ensure_ascii=True))
Path("/run/mumble-web/config.local.js").write_text(script, encoding="utf-8")
