#!/usr/bin/env bash
set -euo pipefail

# Idempotent bootstrap for Ubuntu 24.04 VPS
# - Installs Docker, docker compose plugin, ufw, fail2ban, git
# - Creates system user `iacrm` and required directories
# - Configures UFW with 22/80/443 (optional SSH_ALLOW_IP)
# - Enables basic fail2ban sshd jail

SSH_ALLOW_IP="${SSH_ALLOW_IP:-}"
REPO_DIR="/opt/ia-crm"
DATA_DIR="/var/lib/ia-crm/data"
BACKUP_DIR="/var/backups/ia-crm"

echo "==> Updating apt index and installing base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl ufw fail2ban git

echo "==> Installing Docker & docker compose plugin"
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

echo "==> Ensuring system user 'iacrm' and docker group membership"
if ! id -u iacrm >/dev/null 2>&1; then
  useradd -m -s /bin/bash iacrm
fi
usermod -aG docker iacrm

echo "==> Creating application directories"
mkdir -p "$REPO_DIR" "$DATA_DIR" "$BACKUP_DIR"
chown -R iacrm:iacrm "$REPO_DIR" "$DATA_DIR" "$BACKUP_DIR"

echo "==> Configuring UFW"
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
if [[ -n "$SSH_ALLOW_IP" ]]; then
  ufw allow from "$SSH_ALLOW_IP" to any port 22 proto tcp
else
  ufw allow 22/tcp
fi
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "==> Enabling basic fail2ban sshd jail"
cat >/etc/fail2ban/jail.d/ia-crm-sshd.conf <<'EOF'
[sshd]
enabled = true
port    = ssh
logpath = %(sshd_log)s
maxretry = 5
bantime = 1h
EOF
systemctl enable fail2ban
systemctl restart fail2ban

echo "==> Summary"
echo "User: iacrm (member of docker)"
echo "Repo dir: $REPO_DIR"
echo "Data dir: $DATA_DIR"
echo "Backup dir: $BACKUP_DIR"
echo "Open ports (ufw):"
ufw status numbered || true
echo "Docker version:"
docker --version || true
echo "docker compose version:"
docker compose version || true
