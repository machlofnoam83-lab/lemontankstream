# 🥷 מצב חמקן — שהאתר והשרת לא יימצאו בכלל

> המטרה: שסורק שיסרוק את כל האינטרנט לא ימצא אותך, ומי שיגיע במקרה —
> לא יבין שיש כאן אתר בכלל. **המסמך הזה הוא גם מה שעובד וגם מה שלא.**

---

## 1. שלוש שכבות ההיעלמות

```
                 האינטרנט
                     │
        ┌────────────▼─────────────┐
        │  ①  אין כתובת לחשוף       │   Cloudflare Tunnel — השרת יוזם
        │     (אין פורטים, אין IP)  │   חיבור יוצא. אין פורט פתוח, אין IP ב-DNS.
        └────────────┬─────────────┘
                     │  + כותרת סודית (Transform Rule)
        ┌────────────▼─────────────┐
        │  ②  נעילת מקור            │   בלי הסימן הסודי: התעלמות מוחלטת
        │     drop / decoy          │   (כמו פורט סגור) או עמוד nginx משעמם.
        └────────────┬─────────────┘
                     │
        ┌────────────▼─────────────┐
        │  ③  ניקוי טביעות אצבע     │   בלי /_next/ ב-HTML, בלי שמות עוגיות
        │     (האתר לא מסגיר טכנולוגיה) │ מזהים, בלי שמות פלטפורמה, בלי אינדוקס.
        └──────────────────────────┘
```

---

## 2. מה הופעל בפועל (קוד, לא תיאוריה)

| מנגנון | מה עושה | פקודה/קובץ |
|---|---|---|
| **נעילת מקור** | בלי הסימן הסודי — אין תשובה. שלוש דרגות: `drop` (התעלמות), `decoy` (עמוד nginx), `block` | `security/stealth.mjs`, `STEALTH_MODE` |
| **הסוואת נכסים** | `/_next/` מוחלף בתחילית אקראית (`/_a91f3c/`) בשני הכיוונים — לא רואים Next.js בכלל | `server.mjs` → `installHtmlMasking` |
| **מלכודות (canary)** | כתובת סודית שאסור לגעת בה. נגיעה = השרת נחשף → חסימה **קבועה** + התראה | `node scripts/stealth.mjs canary` |
| **היעלמות /admin** | במצב חמקן `/admin` מחזיר 404 רגיל, לא הפניה שמסגירה שמערכת ניהול קיימת | `src/middleware.ts` |
| **עוגיות אנונימיות** | `lt_session` → הקידומת שלך (`COOKIE_PREFIX`), כך שסורק לא מזהה את המערכת | `src/lib/cookies.ts` |
| **בלי אינדוקס** | `X-Robots-Tag: noindex` + robots.txt שחוסם הכל, ובאופציה גם מפליל סורקים | middleware + `stealthRobots` |
| **CSP מוצנע** | בלי שמות של פלטפורמות אירוח ב-`frame-ancestors` — רק `'self'` | middleware |
| **בלי כותרות מזהות** | ללא `Server`, ללא `X-Powered-By`, Vary מצומצם | middleware + `server.mjs` |

---

## 3. הדרך המלאה — 20 דקות ומצאת את עצמך בלתי ניתן לאיתור

### שלב א — Cloudflare Tunnel (החשוב מכולם: אין פורט פתוח ואין IP לחשוף)

```bash
# בשרת
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb
cloudflared tunnel login
cloudflared tunnel create lemontank
sudo cp deploy/cloudflared-config.yml /etc/cloudflared/config.yml   # החלף <TUNNEL-ID>
sudo cloudflared service install && sudo systemctl enable --now cloudflared

# DNS
cloudflared tunnel route dns lemontank lemontank.co.il
```

ואז **סוגרים הכל מבחוץ**:
```bash
sudo ufw default deny incoming && sudo ufw allow 22/tcp && sudo ufw enable
```
האתר עובד, ואין אף פורט פתוח לאינטרנט. סריקת פורטים לא מוצאת כלום.

### שלב ב — סימן סודי (כך שגם מי שמצא את השרת לא יקבל כלום)

```bash
node scripts/stealth.mjs token
# → הדפסת הסימן + ההוראה המדויקת
```
ב-Cloudflare: **Rules → Transform Rules → Modify Request Header → Set static**
שם: `x-lt-origin` · ערך: הסימן · (Apply to: כל הדומיין שלך)

### שלב ג — הפעלה

```bash
node scripts/stealth.mjs on drop        # drop = התעלמות מוחלטת (מומלץ)
node scripts/stealth.mjs status         # בדיקה
```

מעכשיו:
* בקשה בלי הסימן → **אין תשובה בכלל**. סורק מסיק שהפורט סגור.
* `/admin`, `/.env`, `/wp-login.php` → לא מחזירים שום רמז.
* ה-HTML לא מכיל `/_next/`, העוגיות לא מכילות `lt_`.

### שלב ד — הכניסה שלך

```bash
node scripts/stealth.mjs entry https://lemontank.co.il
# → https://lemontank.co.il/?lt_entry=<סימן>
```
פותחים פעם אחת → העוגייה נשמרת חודש, ומכאן הדפדפן שלך מורשה. אחר כך הכתובת נקייה.

### שלב ה — הקשחת השרת

```bash
sudo bash deploy/harden-server.sh     # חומת אש, sysctl, SSH בלי סיסמאות, fail2ban, הרשאות 600
```

### שלב ו — מלכודות לאיתור דליפה

```bash
node scripts/stealth.mjs canary dns        # יוצר /.well-known/dns-a1b2c3
node scripts/stealth.mjs canary gmail      # שנייה, למקום אחר
node scripts/stealth.mjs canaries          # מי נגע — אם בכלל
```
שתול את הכתובות במקומות שאמורים להישאר פרטיים (רשומת DNS פנימית, הערת
קונפיגורציה, קובץ גיבוי). **כל נגיעה = מישהו מצא את השרת** — והתוקף נחסם
לצמיתות אוטומטית, עם רישום בלוג האבטחה ובפאנל.

---

## 4. ניהול שוטף

```bash
node scripts/stealth.mjs status              # מצב מלא
node scripts/stealth.mjs off                 # כיבוי (מצב פיתוח/חירום)
node scripts/stealth.mjs set mode decoy      # מעבר מעמוד "התעלמות" ל-"עמוד nginx"
node scripts/stealth.mjs set decoyTitle "It works!"
node scripts/stealth.mjs allow 203.0.113.7   # הוספת הכתובת שלך למורשות
node scripts/stealth.mjs fingerprint https://lemontank.co.il   # מה עוד מסגיר אותך
```

### מצבי תגובה — מה לבחור

| מצב | מה הסורק רואה | מתי להשתמש |
|---|---|---|
| `drop` | כלום — החיבור נסגר בלי תשובה | **ברירת המחדל המומלצת** — הכי חמקן |
| `decoy` | עמוד nginx טרי ומשעמם | כשאתה רוצה שהשרת ייראה "כלום מיוחד" |
| `block` | 403 | כשאתה רוצה לדעת מי ניסה (אבל מסגיר שיש מה להגן עליו) |

### `requireTokenAlways`

כברירת מחדל, בקשה שמגיעה מהמנהרה (cloudflared על אותה מכונה עם כותרות CDN)
מורשית גם בלי הסימן — כדי לא לשבור את המנהרה. הקפדה מלאה:
```bash
node scripts/stealth.mjs set requireTokenAlways on
```
(הפעל רק אחרי שה-Transform Rule מוגדר ועובד, אחרת האתר ייעלם — כולל ממך.)

---

## 5. מה עוד נדרש **מחוץ** לשרת (חשוב — אי אפשר בקוד)

| נושא | מה לעשות |
|---|---|
| **פרטיות דומיין** | הפעל WHOIS Privacy/REDACTED ברגיסטרר, אחרת שמך ומספר הטלפון גלויים |
| **היסטוריית DNS** | בדוק ב-`securitytrails.com` / `crt.sh` שלא נחשפו רשומות ישנות (A ישיר ל-IP). אם כן — החלף IP |
| **תעודות SSL** | עם Tunnel אין CT שמסגיר את ה-origin. אם השתמשת ב-Let's Encrypt ישירות — הרשומה ב-crt.sh חושפת סאבדומיינים; מחיקה אפשרית רק בבקשה לספק |
| **מייל נפרד** | אסור שכתובת הרישום של הדומיין תהיה אותה כתובת שמופיעה באתר/בגיטהאב |
| **בלי טביעות בגיטהאב** | אם הקוד ציבורי, אין לכתוב את הדומיין ב-README; אין לפרסם screenshots עם הכתובת |
| **משתמש נפרד לשרת** | לא root, בלי מפתחות SSH משותפים, עם `authorized_keys` מוגבל |
| **VPN/משרד** | הוסף את הכתובת הקבועה שלך ל-allowCidrs כדי שלא תיחסם |

---

## 6. מגבלות — ביושר מלא

| תרחיש | מה קורה | לכן |
|---|---|---|
| סריקת כל האינטרנט (Shodan/Censys) | **לא ימצא כלום** — אין פורט פתוח ואין IP | Cloudflare Tunnel |
| סורק שכתב את הדומיין שלך | **לא יקבל תשובה** | נעילת מקור |
| מישהו גילה את ה-IP הישן (היסטוריית DNS) | יקבל `drop` — גם הוא לא רואה כלום | נעילת מקור |
| **DDoS נפח** | Cloudflare בולע, אבל ה-Free plan מוגבל | שדרוג תוכנית / "Under Attack Mode" |
| **BGP hijack / MITM ברמת ספק האינטרנט** | לא נפתר בשרת | DNSSEC + CAA + ניטור |
| **הנדסה חברתית / עובד פנימי** | אין הגנת קוד | הרשאות מינימליות (RBAC), 2FA, יומן ביקורת |
| **מזהה TLS (JA3) של cloudflared** | חושף שימוש ב-Cloudflare, לא את השרת | מטופל ע"י Cloudflare |
| **מישהו בתוך השרת** | אין הגנה — הוא כבר בפנים | `harden-server.sh`, הרשאות 600, ניטור |

**שורה תחתונה מדויקת:** סריקה אוטומטית **לא תמצא את האתר כלל** — לא את
הפורט, לא את הכתובת, ולא את הטכנולוגיה. תוקף אנושי ממוקד עם מודיעין
(למשל מי ששולט בספק ה-DNS שלך) — תמיד ימצא *משהו*. לכן יש עומק: גם אם
ימצא, הוא ייתקל בשער שחוסם, בלוג שמתעד, ובמערכת שמגיבה אוטומטית.

---

## 7. מה נשבר אם עושים משהו לא נכון

| טעות | התוצאה | התיקון |
|---|---|---|
| `stealth on` בלי מנהרה/CDN | השרת מעלים את עצמו מכולם | `node scripts/stealth.mjs off` (גישה מקומית נדרשת) |
| `requireTokenAlways on` בלי Transform Rule | האתר נעלם, גם ממך | `node scripts/stealth.mjs set requireTokenAlways off` |
| שינוי `COOKIE_PREFIX` | כל המשתמשים מתנתקים | זה מכוון — הודעה מראש |
| `STEALTH_MODE="on"` ב-`.env.local` בלי קובץ תצורה | נעילת מקור בלי סימן | הסר את השורה, או צור סימן |

**מנעול חירום** (אם נעלת את עצמך בחוץ): ב-`.env.local` הוסף
`SECURITY_MODE="monitor"` ו-`STEALTH_MODE="off"`, ואז `systemctl restart lemontank`.
אם גם לגישה אין — הוסף את כתובת ה-IP שלך: `node scripts/stealth.mjs allow <ip>`.

---

## 8. בדיקה שהכל עובד

```bash
node scripts/stealth.mjs fingerprint https://lemontank.co.il   # מה מסגיר אותך
npm test                                                        # 44 בדיקות, כולל 17 חמקן
node scripts/security.mjs status                                # מצב האבטחה
```

מהשרת עצמו, בדיקת "האם אני בלתי נראה מבחוץ":
```bash
# אמור להיכשל / לחזור בלי תשובה — סימן טוב!
curl -s -o /dev/null -w "%{http_code}\n" --max-time 5 http://$(hostname -I | awk '{print $1}'):3000/
```
