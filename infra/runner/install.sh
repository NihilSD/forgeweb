#!/usr/bin/env bash
# Installs or upgrades the Forge runner on a dedicated Ubuntu 24.04 VM (docs/runbooks/runner-vm.md).
# Idempotent. Run as root:
#
#   ADMIN_CIDR=203.0.113.4/32 JOB_REDIS_IP=10.0.0.2 \
#   FORGE_REGISTRY=ghcr.io/<user>/forge FORGE_TAG=<tag> ./install.sh
#
# Before the first run, put the secrets in /etc/forge/runner.env (mode 600), see runner.env.example.
set -euo pipefail
log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }
[[ $EUID -eq 0 ]] || die "run as root"
: "${ADMIN_CIDR:?}" "${JOB_REDIS_IP:?}" "${FORGE_REGISTRY:?}" "${FORGE_TAG:?}"
JOB_REDIS_PORT="${JOB_REDIS_PORT:-6380}"
HERE="$(cd "$(dirname "$0")" && pwd)"
[[ -f /etc/forge/runner.env ]] || die "create /etc/forge/runner.env first (runner.env.example)"
chmod 600 /etc/forge/runner.env

log "1/7 base packages and unattended security upgrades"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q ca-certificates curl gnupg nftables unattended-upgrades
dpkg-reconfigure -f noninteractive unattended-upgrades

log "2/7 Docker Engine"
if ! command -v docker >/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    >/etc/apt/sources.list.d/docker.list
  apt-get update -q
  apt-get install -y -q docker-ce docker-ce-cli containerd.io
fi

log "3/7 gVisor (runsc)"
if ! command -v runsc >/dev/null; then
  curl -fsSL https://gvisor.dev/archive.key | gpg --dearmor -o /usr/share/keyrings/gvisor-archive-keyring.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/gvisor-archive-keyring.gpg] https://storage.googleapis.com/gvisor/releases release main" \
    >/etc/apt/sources.list.d/gvisor.list
  apt-get update -q
  apt-get install -y -q runsc
  runsc install
  systemctl restart docker
fi
docker run --rm --runtime=runsc --network none hello-world >/dev/null || die "gVisor check failed"
log "gVisor ok"

log "4/7 service user"
id forge-runner >/dev/null 2>&1 || useradd --system --home /var/lib/forge-runner --shell /usr/sbin/nologin forge-runner
install -d -o forge-runner -g forge-runner -m 0750 /var/lib/forge-runner /var/lib/forge-runner/work

log "5/7 runner bundle $FORGE_TAG"
docker pull -q "$FORGE_REGISTRY-runner:$FORGE_TAG"
REL="/opt/forge-runner/releases/$FORGE_TAG"
rm -rf "$REL" && mkdir -p "$REL"
CID="$(docker create "$FORGE_REGISTRY-runner:$FORGE_TAG")"
docker cp "$CID:/opt/forge-runner/." "$REL/"
docker rm "$CID" >/dev/null
chown -R root:root "$REL"
log "sandbox images"
"$REL/sandboxes/build.sh" >/dev/null
ln -sfn "$REL" /opt/forge-runner/current.new && mv -T /opt/forge-runner/current.new /opt/forge-runner/current

log "6/7 firewall"
sed -e "s#@ADMIN_CIDR@#$ADMIN_CIDR#" -e "s#@JOB_REDIS_IP@#$JOB_REDIS_IP#" -e "s#@JOB_REDIS_PORT@#$JOB_REDIS_PORT#" \
  "$HERE/nftables.conf" >/etc/nftables.conf
nft -c -f /etc/nftables.conf
systemctl enable --now nftables
nft -f /etc/nftables.conf

log "7/7 systemd"
install -m 0644 "$HERE/forge-runner.service" /etc/systemd/system/forge-runner.service
systemctl daemon-reload
systemctl enable forge-runner
systemctl restart forge-runner
sleep 5
systemctl is-active --quiet forge-runner || { journalctl -u forge-runner -n 50 --no-pager; die "runner failed to start"; }
# Keep the 3 newest releases.
ls -1dt /opt/forge-runner/releases/* | tail -n +4 | xargs -r rm -rf
log "runner $FORGE_TAG running. Next: the verification in docs/runbooks/runner-vm.md §7."
