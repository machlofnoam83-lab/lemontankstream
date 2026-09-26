# 🚀 העלאה לאוויר — LemonTank Stream

צ'קליסט מלא מהרגע שיש לך שרת (VPS/Cloud) ועד שהאתר רץ מאחורי HTTPS, עם גיבויים
וניטור. כל שלב קצר — המערכת לא דורשת שירותים חיצוניים כדי לעבוד.

> 💡 **אין לך עדיין שרת?** ראה [`FREE-HOSTING.md`](FREE-HOSTING.md) — אחסון חינם
> לתמיד (Oracle Always Free), דומיין בזול, והתקנה בפקודה אחת:
> `sudo bash deploy/bootstrap-free-vm.sh`

---

## 1. דרישות מקדימות

| דרישה | מינימום | מומלץ |
|---|---|---|
| Node.js | 20.9 (יש `node:sqlite` יציב מ-22) | 22 LTS |
| CPU / RAM | 1 vCPU / 1GB | 2 vCPU / 4GB |
| דיסק | 10GB (תלוי בכמות הווידאו) | SSD/NVMe, או אחסון חיצוני לווידאו |
| מערכת | Linux x64 | Ubuntu 24.04 / Debian 12 |

> **וידאו כבד?** אל תשמור קבצי וידאו גדולים על אותו דיסק של המערכת.
> העלה לספק אובייקטים (Cloudflare R2 / Backblaze B2 — זול), ושמור במערכת את
> `stream_url` החיצוני. התמונות והכתוביות נשארות מקומיות.

---

## 2. התקנה בשרת

```bash
# משתמש ייעודי (לא root)
sudo adduser --system --group --home /srv/lemontank lemontank
sudo -u lemontank -i
cd ~ && git clone <repo> app && cd app/lemontank-stream

npm ci --omit=dev            # התקנה נקייה לפי package-lock
cp .env.example .env.local

# סודות חזקים + סיסמת מנהל ראשונית
node scripts/gen-secrets.mjs --write
node scripts/seed.mjs        # יוצר את המסד ומזריע (אפשר גם --reset בסביבת דמו)

npm run build
```

### משתני סביבה קריטיים בפרודקשן

```env
NODE_ENV=production
APP_URL=https://stream.example.com     # חייב להיות הדומיין האמיתי — משמש ל-Origin ולקישורים
COOKIE_SECURE=true                     # עוגיות Secure בלבד + HSTS פעיל
TRUST_PROXY=true                       # מאחורי nginx/Cloudflare — קורא X-Forwarded-For
DATABASE_FILE=/srv/lemontank/data/lemontank.db
STORAGE_ROOT=/srv/lemontank/storage
APP_SECRET=…  CSRF_SECRET=…  MEDIA_SECRET=…   # שונים זה מזה, 32+ תווים
```

`node scripts/gen-secrets.mjs` יוצר את השלושה. **אל תשנה אותם אחרי שיש משתמשים** —
החלפת `APP_SECRET`/`CSRF_SECRET` מנתקת סשנים, והחלפת `MEDIA_SECRET` מבטלת קישורי מדיה חתומים.

---

## 3. הרצה כשירות systemd

```ini
# /etc/systemd/system/lemontank.service
[Unit]
Description=LemonTank Stream
After=network.target

[Service]
Type=simple
User=lemontank
WorkingDirectory=/srv/lemontank/app/lemontank-stream
EnvironmentFile=/srv/lemontank/app/lemontank-stream/.env.local
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=3
# הגנות בסיסיות
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ReadWritePaths=/srv/lemontank/data /srv/lemontank/storage

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now lemontank
sudo systemctl status lemontank
journalctl -u lemontank -f          # לוגים חיים
```

---

## 4. nginx + HTTPS

```nginx
server {
  listen 443 ssl http2;
  server_name stream.example.com;

  ssl_certificate     /etc/letsencrypt/live/stream.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/stream.example.com/privkey.pem;
  ssl_protocols TLSv1.2 TLSv1.3;

  # העלאות וידאו גדולות (תואם MAX_VIDEO_UPLOAD_MB)
  client_max_body_size 2048m;
  client_body_timeout 600s;
  proxy_read_timeout 600s;
  proxy_send_timeout 600s;

  # דחיסה (הווידאו כבר דחוס — לא נוגעים בו)
  gzip on;
  gzip_types text/css application/javascript application/json image/svg+xml;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade           $http_upgrade;
    proxy_set_header Connection        "upgrade";
    # חיוני ל-Range Requests של הנגן
    proxy_buffering off;
    proxy_request_buffering off;
  }
}

server {
  listen 80;
  server_name stream.example.com;
  return 301 https://$host$request_uri;
}
```

```bash
sudo certbot --nginx -d stream.example.com     # תעודה חינם עם חידוש אוטומטי
```

> **Cloudflare?** הפעל "Full (strict)", השאר `TRUST_PROXY=true`, ואל תדליק
> "Rocket Loader" — הוא משבש סקריפטים עם `nonce` של CSP.

---

## 5. גיבויים (חשוב באמת)

המערכת היא קובץ אחד + תיקיית מדיה:

```bash
#!/usr/bin/env bash
# /srv/lemontank/backup.sh — הרץ מדי יום מ-cron
set -euo pipefail
STAMP=$(date +%F-%H%M)
DEST=/srv/lemontank/backups
mkdir -p "$DEST"

# גיבוי עקבי של SQLite (בטוח גם כשהאתר רץ, כולל WAL)
sqlite3 /srv/lemontank/data/lemontank.db ".backup '$DEST/lemontank-$STAMP.db'"
gzip -f "$DEST/lemontank-$STAMP.db"

# שמירת 14 יום אחרונים
find "$DEST" -name 'lemontank-*.db.gz' -mtime +14 -delete

# מדיה: החלף ב-rclone אם יש אחסון אובייקטים
tar -czf "$DEST/storage-$STAMP.tar.gz" -C /srv/lemontank storage
find "$DEST" -name 'storage-*.tar.gz' -mtime +7 -delete
```

```cron
# crontab -e  (משתמש lemontank)
17 3 * * *  /srv/lemontank/backup.sh >> /var/log/lemontank-backup.log 2>&1
```

בנוסף, מהפאנל: `/admin/health` → "הורד גיבוי JSON מלא" (`/api/export?type=backup`,
בעלים בלבד). שמור את הגיבוי **מחוץ לשרת** (S3/R2/דיסק חיצוני).

---

## 6. בדיקות אחרי העלייה

```bash
BASE=https://stream.example.com

# 1. האתר עולה וכותרת אבטחה קיימת
curl -sI $BASE | grep -iE "content-security-policy|strict-transport-security|x-content-type-options"

# 2. עוגיות מאובטחות
curl -sI $BASE/login | grep -i "set-cookie"        # אמור לכלול Secure

# 3. ניתוב מוגן מפנה להתחברות
curl -s -o /dev/null -w "%{http_code}\n" $BASE/admin         # 307

# 4. חוזה API
curl -s $BASE/api/plans | head -c 120                        # {"ok":true,...}

# 5. בדיקות אוטומטיות מלאות
TEST_BASE_URL=$BASE npm test
```

בפאנל: `/admin/health` — כל הבדיקות אמורות להיות ירוקות (`APP_SECRET`, `CSRF_SECRET`,
`MEDIA_SECRET`, `COOKIE_SECURE`, שלמות מסד, 2FA למנהלים).
`/admin/security` — נקי מאירועים קריטיים, ומומלץ שמספר "מנהלים ללא 2FA" יהיה **0**.

---

## 7. תפעול שוטף

| משימה | איפה |
|---|---|
| הוספת כותר חדש | `/admin/titles/new` (בחר חינם/פלוס!) |
| הוספת פרקים/וידאו | `/admin/titles/[id]` → "ניהול פרקים" |
| העלאת מדיה גדולה | ישירות בטופס הפרק (התקדמות העלאה מוצגת) |
| קופון/מבצע | `/admin/coupons`, `/admin/promos` |
| שינוי מחירים ומגבלות | `/admin/plans` |
| כיבוי פיצ'ר בעייתי | `/admin/features` (מתג + תפוצה) |
| תחזוקה ו-VACUUM | `/admin/health` ו-`/admin/security` |
| מצב תחזוקה להודעה למשתמשים | `/admin/settings` |

### עדכון גרסה

```bash
cd /srv/lemontank/app && git pull
cd lemontank-stream && npm ci --omit=dev && npm run build
sudo systemctl restart lemontank
```

---

## 8. מעבר ל-PostgreSQL (אופציונלי)

SQLite מספיק בהחלט לעשרות אלפי משתמשים. אם בכל זאת תרצה Postgres מנוהל:

1. פתח מסד חינם ב-[Neon](https://neon.tech) או [Supabase](https://supabase.com).
2. הרץ את הסכימה: `psql "$DATABASE_URL" -f sql/schema.postgres.sql`
3. הוסף מתאם ב-`src/lib/db.ts`: מייצאים את אותו ממשק (`get`/`all`/`run`/`count`/`tx`)
   מעל `pg.Pool`. שים לב שהשאילתות משתמשות ב-`?` — החלף ל-`$1,$2…` בשכבת המתאם,
   או המיר את השאילתות בהדרגה.
4. הגדר `DATABASE_FILE=""` ו-`DATABASE_URL=postgres://…` והרץ את מיגרציית הנתונים
   (`/api/export?type=backup` → ייבוא).

החיפוש המלא: ב-SQLite יש FTS5 מובנה; ב-Postgres השתמש ב-`pg_trgm` + `tsvector`
(דוגמה מלאה בסוף `sql/schema.postgres.sql`). `src/lib/db.ts` כבר נופל אוטומטית
ל-`LIKE` אם טבלת החיפוש חסרה — כך שהמעבר לא ישבור את החיפוש.

---

## 9. פתרון תקלות

| סימפטום | סיבה סבירה | פתרון |
|---|---|---|
| 500 בכל העמודים | `APP_SECRET` חסר/קצר | `/admin/health` יצביע; השלם סודות והרץ מחדש |
| "בקשת אשחק לא תקינה (CSRF)" | `APP_URL` לא תואם לדומיין | עדכן `APP_URL` והפעל מחדש |
| עוגייה לא נשמרת | `COOKIE_SECURE=true` בלי HTTPS | הגדר HTTPS או `false` לפיתוח |
| וידאו לא מתחיל | MIME/קודק לא נתמך, או דורש HLS | המר ל-H.264/AAC MP4, או נגן HLS בצד הלקוח |
| העלאה נכשלת ב-413 | מגבלת ה-reverse proxy | הגדל `client_max_body_size` ב-nginx |
| "נעול — נדרש פלוס" למנהל | התפקיד לא עודכן | התחבר כמנהל; צוות מקבל גישה מלאה אוטומטית |
| האתר איטי תחת עומס | WAL+דיסק איטי | SSD, `ANALYZE` מ-`/admin/health`, או שדרוג ל-Postgres |

### שחזור סביבה שנמחקה (reset / מכונה חדשה)

כל הקוד שמור ב-Git — אבל `node_modules`, `.next`, `data/` ו-`.env.local` **אינם**
(וזה נכון: המסד מכיל את התוכן שלך, ולכן הוא לא נכנס לריפו). לשחזור בפקודה אחת:

```bash
git clone <repo> && cd lemontank-stream
bash scripts/recover-dev.sh          # סנכרון מ-origin → תלויות → סודות → מסד → בנייה
npm run start                        # http://localhost:3000
```

`--no-build` לשחזור מהיר בלי בנייה, `--force` אם יש שינויים לא-מקומטים שצריך לזרוק.
הסקריפט **לא נוגע** במסד/בסודות קיימים — הוא משלים רק את מה שחסר. גיבוי אמיתי
לתוכן: `node scripts/backup-encrypted.mjs` (§5).


---

## 🛡️ אבטחת הפריסה (מעודכן)

### הרצה נכונה

```bash
npm run build
npm run start            # מריץ את שער האבטחה (server.mjs) — לא "next start" ישירות!
```

השער מאזין על הפורט הציבורי ו-Next.js רץ בתוך אותו תהליך — אין פורט פנימי חשוף.
שירות systemd מוכן: `deploy/lemontank.service` (כולל הקשחת systemd, מגבלות זיכרון ו-Restart).

### משתני סביבה לפרודקשן

```env
NODE_ENV="production"
COOKIE_SECURE="true"
APP_URL="https://your-domain.co.il"
ALLOWED_HOSTS="your-domain.co.il,www.your-domain.co.il"   # חוסם Host מזויף
TRUST_PROXY="strict"                                       # ניתוח XFF מדויק מול nginx
TRUSTED_PROXY_CIDRS="127.0.0.1/32"
REQUIRE_GATEWAY="1"                                        # דורש חתימת שער בכל בקשה
SECURITY_MODE="monitor"                                    # שבוע ראשון: לוגים בלבד
```

### nginx + fail2ban

* `deploy/nginx-security.conf` — HTTPS, HSTS, הגבלת קצב בשכבת ה-proxy, חסימת נתיבי סריקה.
* `deploy/nginx-lt-proxy.conf` — העברת כותרות נכונה (ו-`TRUST_PROXY="strict"`).
* `deploy/fail2ban-lemontank.conf` — חוסם ברמת חומת האש כתובות שנתפסו בשער האבטחה.
  השער כותב `logs/security.log` (JSON לכל שורה) — זהו הלוג ש-fail2ban קורא.

### מודיעין איומים יומי

```cron
30 4 * * * cd /opt/lemontank && node scripts/update-threat-intel.mjs >> logs/intel.log 2>&1
0  5 * * * cd /opt/lemontank && node scripts/security.mjs purge 90 >> logs/security.log 2>&1
```

### ניטור שבועי (5 דקות)

1. `/admin/security` — יש חסימות חדשות? התוקפנים הגיוניים?
2. `node scripts/security.mjs status` — מצב המנוע והמדיניות.
3. `journalctl -u lemontank -n 200 --no-pager | grep -i "security"` — חריגות.
4. `npm test` — 27 בדיקות, כולל 12 בדיקות אבטחה. אמורות לעבור תמיד.
