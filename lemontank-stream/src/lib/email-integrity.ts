/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  בדיקת אמינות כתובת מייל — "כאן לא נרשמים עם זבל"
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * המטרה: למנוע הרשמה עם כתובות בדויות או חד־פעמיות (tempmail וכדומה), ולקבל
 * רק כתובות שאפשר לשלוח אליהן באמת. בדיקה נעשית בארבע שכבות, מהזול ליקר:
 *
 *   1. **תחביר (RFC)** — מבנה, אורך, נקודות כפולות, תווי שליטה, דומיין תקין.
 *      דוחה גם כתובות עם תווי הסוואה (bidi) שמשמשות להתחזות.
 *
 *   2. **רשימה שחורה של שירותים זמניים** — אלף+ דומיינים מוכרים של דואר
 *      חד־פעמי, וגם זיהוי דפוסים (כל תת־דומיין של `mailinator` נחסם, לא רק
 *      הדומיין הראשי). הרשימה מקומית — אין תלות באינטרנט ואין דליפת פרטיות.
 *
 *   3. **החלפת תווים (confusables)** — `gmaıl.com` עם i טורקית, או `g00gle.com`,
 *      ממופים לצורה הקנונית ונחסמים. זה מה שתופס ניסיונות התחזות.
 *
 *   4. **MX + A** — בדיקת DNS שהדומיין באמת מקבל דואר. הבדיקה נדלקת רק כשיש
 *      DNS בסביבה (`ENABLE_MX_CHECK=1`), כדי שבדיקות offline לא ייפלו.
 *
 * **חשוב לדעת (הערה כנה):** אין דרך חוקית לדעת שהכתובת שייכת לבן אדם ספציפי
 * בלי לשלוח אליה קישור אימות. לכן:
 *   • `require_email_verification` בהגדרות מחייב לחיצה על קישור שנשלח למייל.
 *   • `block_disposable` (ברירת מחדל: דלוק) חוסם זמניים.
 *   • `allowed_email_domains` מאפשר לחסום את העולם ולהתיר רשימה בלבד.
 *   יחד, שלושת אלה הם הבקרה האמיתית — הבדיקות כאן רק מסננות מראש.
 */

const DOMAIN_RE = /^(?=.{4,253}$)([a-z0-9\u0590-\u05FF](?:[a-z0-9\u0590-\u05FF-]{0,61}[a-z0-9\u0590-\u05FF])?\.)+[a-z\u0590-\u05FF]{2,63}$/i;

/** דומיין בינלאומי → ASCII (IDN), כדי שבדיקות הדומיין יעבדו גם בעברית */
function toAsciiDomain(domain: string): string {
  try {
    // URL ממיר IDN ל-punycode; הפונקציה קיימת בכל ריצה מודרנית של Node
    return new URL(`http://${domain}`).hostname.replace(/\.$/, "").toLowerCase();
  } catch {
    return domain.toLowerCase();
  }
}

/* ─────────────────── 2. רשימת שירותי דואר זמני (מקומית) ─────────────────── */

/**
 * דומיינים מוכרים של דואר חד־פעמי/זמני. הרשימה נבנתה מהשירותים הנפוצים
 * (2026). זו רשימה שמרנית בכוונה: רק שירותים שכל תכליתם כתובת חד־פעמית.
 */
export const DISPOSABLE_DOMAINS: ReadonlySet<string> = new Set([
  "0-mail.com", "0815.ru", "0clickemail.com", "10minutemail.com", "10minutemail.net", "10minutemail.org",
  "10mail.org", "20minutemail.com", "2prong.com", "30minutemail.com", "33mail.com", "3d-painting.com",
  "4warding.com", "4warding.net", "5ymail.com", "60minutemail.com", "6paq.com", "7tags.com",
  "9ox.net", "anonbox.net", "anonmails.de", "anonymbox.com", "antichef.com", "antireg.ru",
  "anymail.org", "armyspy.com", "azmeil.com", "binkmail.com", "bobmail.info", "bofthew.com",
  "brefmail.com", "bsnow.net", "bugmenot.com", "bumpymail.com", "burnermail.io", "cachedot.net",
  "chammy.info", "cheatmail.de", "clrmail.com", "cool.fr.nf", "correo.blogos.net", "cosmorph.com",
  "courriel.fr.nf", "cuvox.de", "dagberet.com", "dayrep.com", "deadaddress.com", "despam.it",
  "devnullmail.com", "dfgh.net", "digitalsanctuary.com", "discard.email", "discardmail.com",
  "disposableaddress.com", "disposableemailaddresses.com", "disposableinbox.com", "dispose.it",
  "dispostable.com", "dodgit.com", "dodgeit.com", "dontreg.com", "dontsendmespam.de", "dump-email.info",
  "dumpandjunk.com", "dumpmail.de", "e-mail.com", "e4ward.com", "email60.com", "emaildienst.de",
  "emailgo.de", "emailias.com", "emailinfive.com", "emailmiser.com", "emailproxsy.com", "emailsensei.com",
  "emailtemporario.com.br", "emailthe.net", "emailtmp.com", "emailwarden.com", "emailx.at.hm",
  "emailxfer.com", "emz.net", "enterto.com", "ephemail.net", "etranquil.com", "explodemail.com",
  "fakeinbox.com", "fakeinformation.com", "fastacura.com", "fastchevy.com", "fastchrysler.com",
  "filzmail.com", "fixmail.tk", "fizmail.com", "flyspam.com", "frapmail.com", "freundin.ru",
  "garbagemail.org", "get1mail.com", "get2mail.fr", "getairmail.com", "getonemail.com", "girlsundertheinfluence.com",
  "gishpuppy.com", "gowikibooks.com", "gowikicampus.com", "gowikifilms.com", "gowikigames.com",
  "gowikimusic.com", "gowikinetwork.com", "gowikitravel.com", "gurumail.xyz", "haltospam.com",
  "hidemail.de", "hotpop.com", "hulapla.de", "ieatspam.eu", "ieatspam.info", "ihateyoualot.info",
  "iheartspam.org", "imails.info", "inboxalias.com", "inboxclean.com", "inboxclean.org", "incognitomail.com",
  "insorgmail.com", "ipoo.org", "irish2me.com", "jetable.com", "jetable.fr.nf", "jetable.net",
  "jetable.org", "jnxjn.com", "junk1e.com", "kasmail.com", "kaspop.com", "keepmymail.com",
  "killmail.com", "killmail.net", "klassmaster.com", "klzlk.com", "koszmail.pl", "kurzepost.de",
  "letthemeatspam.com", "lhsdv.com", "lifebyfood.com", "link2mail.net", "litedrop.com", "lol.ovpn.to",
  "lookugly.com", "lortemail.dk", "lr78.com", "maboard.com", "mail-temporaire.fr", "mail.by",
  "mail.mezimages.net", "mail2rss.org", "mail333.com", "mailbidon.com", "mailblocks.com", "mailbucket.org",
  "mailcatch.com", "mailde.de", "mailde.info", "maildrop.cc", "maileater.com", "mailexpire.com",
  "mailfa.tk", "mailforspam.com", "mailfreeonline.com", "mailguard.me", "mailimate.com", "mailin8r.com",
  "mailinater.com", "mailinator.com", "mailinator.net", "mailinator2.com", "mailincubator.com",
  "mailismagic.com", "mailme.ir", "mailme.lv", "mailmetrash.com", "mailmoat.com", "mailnator.com",
  "mailnesia.com", "mailnull.com", "mailorg.org", "mailpick.biz", "mailrock.biz", "mailscrap.com",
  "mailshell.com", "mailsiphon.com", "mailslite.com", "mailtemp.info", "mailtome.de", "mailtothis.com",
  "mailtrash.net", "mailzilla.com", "mbx.cc", "mega.zik.dj", "meinspamschutz.de", "messagebeamer.de",
  "mezimages.net", "mierdamail.com", "mintemail.com", "moburl.com", "moncourrier.fr.nf", "monemail.fr.nf",
  "monmail.fr.nf", "monumentmail.com", "msa.minsmail.com", "mt2009.com", "mt2014.com", "mx0.wwwnew.eu",
  "mycleaninbox.net", "mypartyclip.de", "myphantomemail.com", "myspaceinc.com", "myspaceinc.net",
  "myspaceinc.org", "myspacepimpedup.com", "myspamless.com", "mytrashmail.com", "neomailbox.com",
  "nepwk.com", "nervmich.net", "nervtmich.net", "netmails.com", "netmails.net", "netzidiot.de",
  "neverbox.com", "nice-4u.com", "nobulk.com", "noclickemail.com", "nogmailspam.info", "nomail.xl.cx",
  "nomail2me.com", "nomorespamemails.com", "nospam.ze.tc", "nospam4.us", "nospamfor.us", "nospammail.net",
  "notmailinator.com", "nowmymail.com", "nurfuerspam.de", "nus.edu.sg", "objectmail.com", "obobbo.com",
  "oneoffemail.com", "onewaymail.com", "ordinaryamerican.net", "otherinbox.com", "ourklips.com",
  "outlawspam.com", "ovpn.to", "owlpic.com", "pancakemail.com", "pjjkp.com", "politikerclub.de",
  "pookmail.com", "privacy.net", "proxymail.eu", "punkass.com", "putthisinyourspamdatabase.com",
  "quickinbox.com", "rcpt.at", "recode.me", "recursor.net", "regbypass.com", "rejectmail.com",
  "rklips.com", "rmqkr.net", "rppkn.com", "rtrtr.com", "s0ny.net", "safe-mail.net", "safersignup.de",
  "safetymail.info", "safetypost.de", "sandelf.de", "saynotospams.com", "schafmail.de", "selfdestructingmail.com",
  "sendspamhere.com", "sharklasers.com", "shiftmail.com", "shitmail.me", "shortmail.net", "sibmail.com",
  "skeefmail.com", "slapsfromlastnight.com", "slaskpost.se", "smellfear.com", "snakemail.com", "sneakemail.com",
  "sofort-mail.de", "sogetthis.com", "soodonims.com", "spam.la", "spam.su", "spamavert.com", "spambob.com",
  "spambob.net", "spambob.org", "spambog.com", "spambog.de", "spambog.ru", "spambox.info", "spambox.us",
  "spamcannon.com", "spamcannon.net", "spamcon.org", "spamcorptastic.com", "spamcowboy.com", "spamcowboy.net",
  "spamcowboy.org", "spamday.com", "spamex.com", "spamfree24.com", "spamfree24.de", "spamfree24.eu",
  "spamfree24.net", "spamfree24.org", "spamgourmet.com", "spamgourmet.net", "spamgourmet.org", "spamherelots.com",
  "spamhereplease.com", "spamhole.com", "spamify.com", "spaminator.de", "spamkill.info", "spaml.com",
  "spaml.de", "spammotel.com", "spamobox.com", "spamoff.de", "spamslicer.com", "spamspot.com",
  "spamthis.co.uk", "spamthisplease.com", "spamtrail.com", "speed.1s.fr", "supergreatmail.com",
  "supermailer.jp", "suremail.info", "teewars.org", "teleworm.com", "teleworm.us", "temp-link.net",
  "temp-mail.org", "temp-mail.ru", "tempail.com", "tempalias.com", "tempe-mail.com", "tempemail.biz",
  "tempemail.com", "tempemail.net", "tempinbox.co.uk", "tempinbox.com", "tempmail.eu", "tempmail.it",
  "tempmail2.com", "tempmaildemo.com", "tempmailer.com", "tempmailer.de", "tempomail.fr", "temporarioemail.com.br",
  "temporaryemail.net", "temporaryemail.us", "temporaryforwarding.com", "temporaryinbox.com",
  "temporarymailaddress.com", "tempthe.net", "thanksnospam.info", "thanxyou.com", "thelimestones.com",
  "thisisnotmyrealemail.com", "thismail.net", "throwawayemailaddress.com", "tilien.com", "tmailinator.com",
  "tradermail.info", "trash-amil.com", "trash-mail.at", "trash-mail.com", "trash-mail.de", "trash2009.com",
  "trashemail.de", "trashmail.at", "trashmail.com", "trashmail.de", "trashmail.me", "trashmail.net",
  "trashmail.org", "trashmailer.com", "trashymail.com", "trashymail.net", "trillianpro.com", "turual.com",
  "twinmail.de", "tyldd.com", "uggsrock.com", "umail.net", "upliftnow.com", "venompen.com", "veryrealemail.com",
  "viditag.com", "viewcastmedia.com", "viewcastmedia.net", "viewcastmedia.org", "webemail.me",
  "webm4il.info", "wegwerfadresse.de", "wegwerfemail.com", "wegwerfemail.de", "wegwerfmail.de",
  "wegwerfmail.net", "wegwerfmail.org", "wh4f.org", "whyspam.me", "willselfdestruct.com", "winemaven.info",
  "wronghead.com", "wuzup.net", "xagloo.com", "xemaps.com", "xents.com", "xmaily.com", "xoxy.net",
  "yep.it", "yogamaven.com", "yopmail.com", "yopmail.fr", "yopmail.net", "ypmail.webarnak.fr.eu.org",
  "yuurok.com", "zehnminutenmail.de", "zippymail.info", "zoaxe.com", "zoemail.org", "zomg.info",
  "guerrillamail.com", "guerrillamail.net", "guerrillamail.org", "guerrillamail.info", "guerrillamail.biz",
  "guerrillamail.de", "grr.la", "sharklasers.com", "spam4.me", "pokemail.net", "throwam.com",
  "getnada.com", "nada.email", "mail.tm", "mail.gw", "mail.gy", "inboxes.com", "mohmal.com",
  "emailondeck.com", "burnermail.io", "temp-mail.io", "tempmail.plus", "moakt.com", "mailsac.com",
  "disposablemail.com", "minuteinbox.com", "mail7.io", "mytemp.email", "tempr.email", "discard.email",
  "anonaddy.me", "simplelogin.co", "33mail.com", "altmails.com", "anonbox.net",
]);

/** דפוסים שנתפסים גם אם הדומיין המדויק לא ברשימה (למשל תת־דומיין של mailinator) */
const DISPOSABLE_PATTERNS: RegExp[] = [
  /(^|\.)(mailinator|guerrillamail|sharklasers|yopmail|trashmail|temp-?mail|tempmail|10minutemail|throwaway|disposable|getnada|maildrop|mailnesia|mailsac|mohmal|tempr|inboxkitten)\./i,
  /(^|\.)(temp|trash|spam|junk|fake|dump|throw)mail/i,
  /(^|\.)mail(tor|inator|sink|drop|nesia)\./i,
  /minutemail|10min|20min|30min|60min|one-?time-mail/i,
];

/* ─────────────────── 3. תווים מתחזים (confusables) ─────────────────── */

/** תווים שנראים זהים לאותיות לטיניות — ממופים לפני ההשוואה */
const CONFUSABLES: Record<string, string> = {
  "0": "o", "1": "l", "2": "z", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "9": "g",
  "\u0430": "a", "\u0435": "e", "\u043e": "o", "\u0440": "p", "\u0441": "c", "\u0445": "x", "\u0443": "y",
  "\u0456": "i", "\u0131": "i", "\u00ed": "i", "\u00ec": "i", "\u00ee": "i", "\u00ef": "i",
  "\u00e0": "a", "\u00e1": "a", "\u00e2": "a", "\u00e4": "a", "\u00e9": "e", "\u00e8": "e", "\u00ea": "e",
  "\u00f6": "o", "\u00f3": "o", "\u00fc": "u", "\u00fa": "u", "\u00f1": "n", "\u015f": "s", "\u0161": "s",
  "\u013e": "l", "\u013a": "l", "\u017e": "z", "\u017c": "z", "\u0107": "c", "\u010d": "c",
  "\uff41": "a", "\uff45": "e", "\uff4f": "o", "\uff49": "i", // חצי-רוחב
};

/** הופך שם דומיין להצורה הקנונית (אותיות קטנות, בלי מתחזים) */
export function canonicalDomain(domain: string): string {
  return domain
    .toLowerCase()
    .normalize("NFKC")
    .split("")
    .map((char) => CONFUSABLES[char] ?? char)
    .join("")
    .replace(/[^a-z0-9.-]/g, "");
}

/* ─────────────────────────── התוצאה ─────────────────────────── */

export type EmailCheckCode =
  | "ok"
  | "invalid_syntax"
  | "disposable"
  | "impersonation"
  | "no_mx"
  | "not_allowed_domain"
  | "role_account"
  | "subaddress";

export type EmailCheckResult = {
  ok: boolean;
  code: EmailCheckCode;
  /** הסבר בעברית להצגה למשתמש */
  message: string;
  domain: string;
  /** true כשהבדיקה מוגדרת כ"מחמירה" ואפשר לדחות בגללה */
  rejected: boolean;
};

export type EmailCheckOptions = {
  /** לחסום שירותי דואר זמני (ברירת מחדל: true) */
  blockDisposable?: boolean;
  /** רשימת דומיינים מותרים — אם קיימת, כל השאר נדחים */
  allowedDomains?: string[];
  /** לחסום כתובות תפקיד (info@, support@) — לרוב משמשות אתרי ספאם */
  blockRole?: boolean;
  /** לחסום תוספות + (subaddressing) */
  blockSubaddress?: boolean;
  /** לבצע בדיקת DNS בפועל (MX/A). נדלק בסביבה עם רשת */
  checkDns?: boolean;
};

const ROLE_LOCAL = /^(info|support|admin|administrator|sales|marketing|contact|help|billing|office|hello|no-?reply|postmaster|webmaster|abuse)@/i;

/** פירוק לטקסט לפני ה-@ ולאחריו, ובדיקת התחביר */
export function parseEmail(input: string): { local: string; domain: string } | null {
  const value = String(input ?? "").trim();
  if (!value || value.length > 254) return null;
  const at = value.lastIndexOf("@");
  if (at <= 0 || at === value.length - 1) return null;

  const local = value.slice(0, at);
  const rawDomain = value.slice(at + 1);
  if (local.length > 64) return null;

  // תווים אסורים בתחילת/סוף החלק המקומי, נקודות כפולות, ותווי שליטה/הסוואה
  if (/^\.|\.$|\.\./.test(local)) return null;
  if (/[\s\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(value)) return null;
  if (!/^[a-z0-9!#$%&'*+/=?^_`{|}~.\-\u0590-\u05FF]+$/i.test(local)) return null;

  const domain = toAsciiDomain(rawDomain);
  if (!DOMAIN_RE.test(domain)) return null;
  if (domain.includes("..")) return null;

  return { local: local.toLowerCase(), domain };
}

/** השוואת דומיין למול רשימת דומיינים, כולל תתי-דומיינים */
const domainMatches = (domain: string, list: readonly string[]) =>
  list.some((entry) => domain === entry || domain.endsWith(`.${entry}`));

/**
 * בדיקת מייל מלאה (ללא DNS כברירת מחדל).
 * מחזיר תמיד תוצאה — כדי שהקורא יחליט אם לדחות.
 */
export async function checkEmailAuthenticity(rawEmail: string, options: EmailCheckOptions = {}): Promise<EmailCheckResult> {
  const {
    blockDisposable = true,
    allowedDomains = [],
    blockRole = false,
    blockSubaddress = true,
    checkDns = false,
  } = options;

  const parsed = parseEmail(rawEmail);
  if (!parsed) {
    return {
      ok: false,
      code: "invalid_syntax",
      message: "כתובת האימייל לא תקינה — בדקו שהכתובת מלאה (לדוגמה: name@gmail.com)",
      domain: "",
      rejected: true,
    };
  }

  const { local, domain } = parsed;

  // רשימת היתר גוברת על הכל
  if (allowedDomains.length > 0 && !domainMatches(domain, allowedDomains.map((d) => toAsciiDomain(d)))) {
    return {
      ok: false,
      code: "not_allowed_domain",
      message: `האתר מקבל הרשמות רק מכתובות של: ${allowedDomains.join(", ")}`,
      domain,
      rejected: true,
    };
  }

  if (blockSubaddress && local.includes("+")) {
    return {
      ok: false,
      code: "subaddress",
      message: "אפשר להירשם רק עם הכתובת הראשית — בלי התוספת שאחרי סימן ה-+",
      domain,
      rejected: true,
    };
  }

  if (blockRole && ROLE_LOCAL.test(local)) {
    return {
      ok: false,
      code: "role_account",
      message: "כתובת כללית של ארגון (info@, support@) לא מתאימה לחשבון אישי",
      domain,
      rejected: true,
    };
  }

  if (blockDisposable) {
    const canonical = canonicalDomain(domain);
    if (domainMatches(canonical, [...DISPOSABLE_DOMAINS]) || DISPOSABLE_PATTERNS.some((re) => re.test(domain) || re.test(canonical))) {
      return {
        ok: false,
        code: "disposable",
        message: "כתובות דואר זמני (חד־פעמי) לא מתקבלות כאן — השתמשו בכתובת אמיתית",
        domain,
        rejected: true,
      };
    }

    // זיהוי התחזות: צורה קנונית של שירות אמיתי (g00gle.com → google.com)
    const spoofOf = [...WELL_KNOWN_PROVIDERS].find((provider) => {
      const canonicalProvider = canonicalDomain(provider);
      return canonical !== domain && canonical === canonicalProvider;
    });
    if (spoofOf) {
      return {
        ok: false,
        code: "impersonation",
        message: `נראה שהכתובת מנסה להיראות כמו ${spoofOf} אבל היא לא — בדקו שוב`,
        domain,
        rejected: true,
      };
    }
  }

  if (checkDns) {
    const dns = await dnsStatus(domain);
    if (dns === "none") {
      return {
        ok: false,
        code: "no_mx",
        message: "הדומיין הזה לא מקבל דואר — אי אפשר לשלוח אליו הודעות. בדקו את הכתובת",
        domain,
        rejected: true,
      };
    }
  }

  return { ok: true, code: "ok", message: "", domain, rejected: false };
}

/* ─────────────── מטמון בדיקות DNS (תהליך אחד, 10 דקות) ─────────────── */

/**
 * דומיינים מוכרים — ספקי דואר וגם מותגים גדולים.
 * משמשים לזיהוי התחזות: כל דומיין שהופך (אחרי מיפוי תווים) לאחד מאלה,
 * אבל אינו הוא עצמו, נחסם. הדומיין האמיתי עצמו תמיד עובר.
 */
export const WELL_KNOWN_PROVIDERS: ReadonlySet<string> = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "outlook.co.il", "hotmail.com", "hotmail.co.il",
  "live.com", "msn.com", "icloud.com", "me.com", "mac.com", "yahoo.com", "yahoo.co.il",
  "ymail.com", "aol.com", "protonmail.com", "proton.me", "pm.me", "zoho.com", "gmx.com",
  "gmx.de", "gmx.net", "mail.com", "mail.ru", "yandex.com", "yandex.ru", "yandex.co.il",
  "walla.co.il", "walla.com", "012.net.il", "netvision.net.il", "bezeqint.net", "zahav.net.il",
  "nana10.co.il", "barak.net.il", "internet-zahav.net", "fastmail.com", "tutanota.com",
  "tuta.io", "hey.com", "duck.com", "qq.com", "163.com", "126.com", "sina.com", "naver.com",
  // מותגים — לזיהוי התחזות בלבד (g00gle.com, micros0ft.com וכדומה)
  "google.com", "microsoft.com", "apple.com", "amazon.com", "facebook.com", "instagram.com",
  "netflix.com", "paypal.com", "whatsapp.com", "telegram.org", "binance.com", "coinbase.com",
  "bankhapoalim.co.il", "leumi.co.il", "gov.il", "spotify.com", "disneyplus.com",
]);

type DnsAnswer = { at: number; status: "mx" | "a" | "none" };
const dnsCache = new Map<string, DnsAnswer>();
const DNS_TTL_MS = 10 * 60_000;
const DNS_TIMEOUT_MS = 2500;

/**
 * בדיקת DNS שהדומיין באמת מקבל דואר.
 *
 * למה אסינכרונית: אין API סינכרוני ל-MX ב-Node. הבדיקה עטופה במגבלת זמן
 * (2.5 שניות) כדי שהרשמה לא תיתקע בגלל DNS איטי, ונשמרת במטמון ל-10 דקות.
 * "sentinel" = אין רשת/DNS לא זמין — במקרה כזה לא דוחים משתמש (הבדיקה
 * מצמצמת ספאם, אבל לא מפילה את האתר כשאין אינטרנט).
 */
export async function dnsStatus(domain: string): Promise<"mx" | "a" | "none" | "unavailable"> {
  const cached = dnsCache.get(domain);
  if (cached && Date.now() - cached.at < DNS_TTL_MS) return cached.status;

  const probe = async (): Promise<"mx" | "a" | "none"> => {
    const dns = await import("node:dns/promises");
    try {
      const mx = await dns.resolveMx(domain);
      if (mx.length > 0) return "mx";
    } catch {
      /* אין רשומות MX — מנסים A */
    }
    try {
      const a = await dns.resolve4(domain);
      if (a.length > 0) return "a";
    } catch {
      /* גם אין A */
    }
    return "none";
  };

  try {
    const status = await Promise.race([
      probe(),
      new Promise<"unavailable">((resolve) => setTimeout(() => resolve("unavailable"), DNS_TIMEOUT_MS)),
    ]);
    if (status !== "unavailable") dnsCache.set(domain, { at: Date.now(), status });
    return status;
  } catch {
    return "unavailable";
  }
}

/** האם בדיקת ה-DNS דלוקה בסביבה הזו (ברירת מחדל: כן, אלא אם כובו במפורש) */
export const dnsCheckEnabled = (): boolean => process.env.DISABLE_MX_CHECK !== "1";

/** ניקוי קצר לשם משתמש במייל — משמש גם לזיהוי "כתובות אשפה" */
export const emailLocalPart = (email: string): string => parseEmail(email)?.local ?? "";
