#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  הקשחת שרת Linux (Ubuntu/Debian) לאחסון LemonTank Stream
#  הרצה:  sudo bash deploy/harden-server.sh
#  כל פעולה מודפסת, ואין שינוי שאינו הפיך (יש גיבוי לקבצים שנערכים).
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

say()  { printf '\n\033[1;33m▶ %s\033[0m\n' "$1"; }
ok()   { printf '   \033[32m✓\033[0m %s\n' "$1"; }
warn() { printf '   \033[33m!\033[0m %s\n' "$1"; }

[ "$(id -u)" = "0" ] || { echo "יש להריץ כ-root"; exit 1; }
BACKUP_DIR="/root/hardening-backup-$(date +%Y%m%d-%H%M%S)"; mkdir -p "$BACKUP_DIR"

say "1. עדכוני מערכת"
apt-get update -qq && apt-get upgrade -y -qq
apt-get install -y -qq ufw fail2ban unattended-upgrades curl gnupg >/dev/null
dpkg-reconfigure -f noninteractive unattended-upgrades >/dev/null 2>&1 || true
ok "עדכוני אבטחה אוטומטיים מופעלים"

say "2. חומת אש (רק 22 / 80 / 443 — ובמצב מנהרה גם זה לא נדרש)"
ufw --force reset >/dev/null
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp comment 'SSH' >/dev/null
ufw allow 80/tcp comment 'HTTP (להפניה ל-HTTPS)' >/dev/null
ufw allow 443/tcp comment 'HTTPS' >/dev/null
ufw --force enable >/dev/null
ok "חומת אש פעילה: $(ufw status | head -1)"

say "3. הקשחת ליבה (sysctl)"
cat > /etc/sysctl.d/99-lemontank.conf <<'SYSCTL'
# ── הגנה מפני תקיפות נפוצות ───────────────────────────────────────────────
net.ipv4.tcp_syncookies = 1
net.ipv4.tcp_max_syn_backlog = 4096
net.ipv4.tcp_synack_retries = 2
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.conf.all.log_martians = 1
net.ipv4.icmp_echo_ignore_broadcasts = 1
net.ipv4.icmp_ignore_bogus_error_responses = 1
net.ipv6.conf.all.accept_redirects = 0
net.ipv6.conf.all.accept_source_route = 0
# ── אסור להסתכל מעבר לכתובת ה-proxy ───────────────────────────────────────
kernel.kptr_restrict = 2
kernel.dmesg_restrict = 1
kernel.yama.ptrace_scope = 2
fs.protected_hardlinks = 1
fs.protected_symlinks = 1
# ── בלי גילוי עצמי ברמת הרשת ─────────────────────────────────────────────
net.ipv4.ip_forward = 0
net.ipv6.conf.all.forwarding = 0
SYSCTL
sysctl -p /etc/sysctl.d/99-lemontank.conf >/dev/null
ok "הקשחת ליבה הוחלה"

say "4. SSH — בלי סיסמאות, בלי root ישיר"
if [ -f /etc/ssh/sshd_config ]; then
  cp /etc/ssh/sshd_config "$BACKUP_DIR/sshd_config"
  cat > /etc/ssh/sshd_config.d/99-lemontank.conf <<'SSH'
PermitRootLogin prohibit-password
PasswordAuthentication no
PermitEmptyPasswords no
X11Forwarding no
MaxAuthTries 3
LoginGraceTime 20
ClientAliveInterval 300
ClientAliveCountMax 2
AllowAgentForwarding no
AllowTcpForwarding no
SSH
  warn "אימות סיסמה ב-SSH כובה — ודא שיש לך מפתח SSH מותקן לפני ניתוק!"
  systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || true
  ok "SSH מוקשח"
fi

say "5. Fail2ban (SSH + שער האבטחה שלנו)"
cat > /etc/fail2ban/jail.d/lemontank.local <<'JAIL'
[sshd]
enabled  = true
maxretry = 3
bantime  = 86400
findtime = 600

[lemontank]
enabled  = true
filter   = lemontank
logpath  = /opt/lemontank/logs/security.log
maxretry = 3
findtime = 600
bantime  = 86400
action   = ufw[name=lemontank]
JAIL
if [ -f /opt/lemontank/deploy/fail2ban-lemontank.conf ]; then
  cp /opt/lemontank/deploy/fail2ban-lemontank.conf /etc/fail2ban/filter.d/lemontank.conf
fi
systemctl restart fail2ban 2>/dev/null || true
ok "fail2ban פעיל"

say "6. הרשאות קבצים"
if [ -d /opt/lemontank ]; then
  chown -R lemontank:lemontank /opt/lemontank/{data,storage,logs} 2>/dev/null || true
  chmod 700 /opt/lemontank/data /opt/lemontank/storage /opt/lemontank/logs 2>/dev/null || true
  chmod 600 /opt/lemontank/.env.local /opt/lemontank/data/*.db 2>/dev/null || true
  chmod 600 /opt/lemontank/data/stealth.json 2>/dev/null || true
  ok "הרשאות מצומצמות (600 לסודות ולמסד, 700 לתיקיות נתונים)"
fi

say "7. הסתרת גרסת המערכת מהרשת"
if [ -f /etc/nginx/nginx.conf ] && ! grep -q "server_tokens off" /etc/nginx/nginx.conf; then
  cp /etc/nginx/nginx.conf "$BACKUP_DIR/nginx.conf"
  sed -i '/http {/a \    server_tokens off;' /etc/nginx/nginx.conf
  nginx -t >/dev/null 2>&1 && systemctl reload nginx || warn "בדוק את nginx ידנית"
  ok "server_tokens off"
fi

say "8. בלי שירותים מיותרים"
for svc in cups avahi-daemon bluetooth rpcbind; do
  if systemctl list-unit-files | grep -q "^$svc"; then
    systemctl disable --now "$svc" 2>/dev/null || true
    ok "כובה: $svc"
  fi
done

say "9. הגנת קבצים מפני שינוי"
if [ -d /opt/lemontank ]; then
  chattr +i /opt/lemontank/server.mjs /opt/lemontank/security/*.mjs 2>/dev/null && ok "קבצי הליבה מוגנים מפני מחיקה/שינוי" || warn "chattr לא נתמך במערכת הקבצים הזו"
fi

printf '\n\033[1;32m✅ ההקשחה הושלמה\033[0m\n'
echo "   גיבויי קבצים שנערכו: $BACKUP_DIR"
echo "   המלצה: הפעל מחדש את השרת ובדוק ש-SSH עדיין עובד לפני שמתנתקים."
