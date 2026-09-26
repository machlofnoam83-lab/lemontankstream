#!/usr/bin/env node
/**
 * בדיקת גיבוי מחוץ לשרת (S3 תואם) — מול שרת מדומה מקומי.
 *
 * למה שרת מדומה ולא "בדיקה שהסקריפט רץ": חתימת SigV4 היא הדבר היחיד
 * שקובע אם אחסון אמיתי יקבל את ההעלאה. השרת כאן **מאמת את החתימה מחדש**
 * בדיוק כמו S3 (מחשב canonical request, string-to-sign ו-HMAC), ולכן
 * הצלחה בבדיקה = הסיכוי שההעלאה תעבוד מול R2/B2/AWS גבוה מאוד.
 *
 * הבדיקה בודקת גם:
 *   · העלאה (PUT) של קובץ .ltbk — גוף הבקשה זהה לבייטים בדיסק.
 *   · סירוב להעלות קובץ שאינו גיבוי מוצפן (בלי חתימת LTBK1).
 *   · --list מפרסר תשובת XML אמיתית.
 *   · --prune מוחק את הישנים מעל המכסה.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const ROOT = path.resolve(import.meta.dirname, "..");
const run = promisify(execFile);
const ACCESS_KEY = "TESTACCESSKEY123";
const SECRET_KEY = "test-secret-key-for-signature-verification";
const REGION = "auto";
const BUCKET = "lemontank-backups";
const PREFIX = "lemontank";

const objects = new Map(); // key -> Buffer
const modifiedTimes = new Map(); // key -> ISO (מדמה את LastModified של S3)
let signatureFailures = [];

/* ────────────────────── שרת S3 מדומה שמאמת SigV4 ────────────────────── */

const sha256Hex = (data) => crypto.createHash("sha256").update(data).digest("hex");
const hmac = (key, data) => crypto.createHmac("sha256", key).update(data).digest();

function verifySignature(req, body) {
  const auth = req.headers.authorization ?? "";
  const match = auth.match(
    /^AWS4-HMAC-SHA256 Credential=([^/]+)\/(\d{8})\/([^/]+)\/s3\/aws4_request, SignedHeaders=([^,]+), Signature=([0-9a-f]+)$/,
  );
  if (!match) return `כותרת Authorization לא בפורמט SigV4: ${auth.slice(0, 60)}`;
  const [, accessKey, dateStamp, region, signedHeaders, signature] = match;
  if (accessKey !== ACCESS_KEY) return `AccessKey לא תואם: ${accessKey}`;

  const url = new URL(req.url, "http://localhost");
  const canonicalUri = url.pathname
    .split("/")
    .map((part) => (part ? encodeURIComponent(decodeURIComponent(part)) : part))
    .join("/");
  const canonicalQuery = [...url.searchParams.entries()]
    .map(([k, v]) => [k, v])
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const declared = signedHeaders.split(";");
  const canonicalHeaders = declared.map((name) => `${name}:${String(req.headers[name] ?? "").trim()}\n`).join("");
  const payloadHash = sha256Hex(body);
  if (req.headers["x-amz-content-sha256"] && req.headers["x-amz-content-sha256"] !== payloadHash) {
    return "x-amz-content-sha256 לא תואם לגוף הבקשה";
  }

  const canonicalRequest = [req.method, canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", req.headers["x-amz-date"], scope, sha256Hex(canonicalRequest)].join("\n");
  let key = hmac(`AWS4${SECRET_KEY}`, dateStamp);
  key = hmac(key, region);
  key = hmac(key, "s3");
  key = hmac(key, "aws4_request");
  const expected = crypto.createHmac("sha256", key).update(stringToSign).digest("hex");
  if (expected !== signature) return "חתימה לא תואמת";
  return null;
}

let server = null;
let port = 0;

before(async () => {
  server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      const problem = verifySignature(req, body);
      if (problem) {
        signatureFailures.push(`${req.method} ${req.url} → ${problem}`);
        res.writeHead(403, { "content-type": "application/xml" });
        res.end("<Error><Code>SignatureDoesNotMatch</Code></Error>");
        return;
      }

      const url = new URL(req.url, "http://localhost");
      const key = decodeURIComponent(url.pathname.replace(`/${BUCKET}`, "").replace(/^\//, ""));

      if (req.method === "PUT") {
        objects.set(key, body);
        res.writeHead(200, { etag: `"${sha256Hex(body).slice(0, 32)}"` });
        res.end();
        return;
      }
      if (req.method === "DELETE") {
        objects.delete(key);
        res.writeHead(204);
        res.end();
        return;
      }
      if (req.method === "GET" && url.searchParams.get("list-type") === "2") {
        const prefix = url.searchParams.get("prefix") ?? "";
        const contents = [...objects.entries()]
          .filter(([objectKey]) => objectKey.startsWith(prefix))
          .sort(([a], [b]) => (a < b ? -1 : 1))
          .map(
            ([objectKey, data]) =>
              `<Contents><Key>${objectKey}</Key><Size>${data.length}</Size><LastModified>${modifiedTimes.get(objectKey) ?? "2026-09-26T00:00:00.000Z"}</LastModified></Contents>`,
          )
          .join("");
        res.writeHead(200, { "content-type": "application/xml" });
        res.end(`<?xml version="1.0"?><ListBucketResult>${contents}</ListBucketResult>`);
        return;
      }
      res.writeHead(404);
      res.end();
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = server.address().port;
});

after(() => {
  server?.close();
});

/* ─────────────────────────── הבדיקות ─────────────────────────── */

/**
 * הרצה **אסינכרונית** בכוונה: שרת ה-S3 המדומה חי בתהליך הזה, ואם היינו
 * חוסמים את לולאת האירועים בקריאה סינכרונית — השרת לא היה עונה לתהליך
 * הבן, והבדיקה הייתה נתקעת עד סוף הזמן.
 */
async function runScript(args, extraEnv = {}) {
  return run(process.execPath, [path.join(ROOT, "scripts", "backup-offsite.mjs"), ...args], {
    cwd: ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      OFFSITE_S3_ENDPOINT: `http://127.0.0.1:${port}`,
      OFFSITE_S3_BUCKET: BUCKET,
      OFFSITE_S3_ACCESS_KEY: ACCESS_KEY,
      OFFSITE_S3_SECRET_KEY: SECRET_KEY,
      OFFSITE_S3_REGION: REGION,
      OFFSITE_S3_PREFIX: PREFIX,
      ...extraEnv,
    },
  });
}

describe("גיבוי מחוץ לשרת (S3 תואם)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lt-offsite-"));
  const backupFile = path.join(dir, "lemontank-test.ltbk");
  const payload = Buffer.concat([Buffer.from("LTBK1"), crypto.randomBytes(48 * 1024)]);
  fs.writeFileSync(backupFile, payload);

  test("העלאה נחתמת ב-SigV4 תקין ומגיעה כמו שהיא", async () => {
    signatureFailures = [];
    const { stdout: output } = await runScript(["--file", backupFile]);
    assert.match(output, /הועלה בהצלחה/);
    assert.deepEqual(signatureFailures, [], `השרת דחה את החתימה: ${signatureFailures.join(" · ")}`);

    const stored = objects.get(`${PREFIX}/lemontank-test.ltbk`);
    assert.ok(stored, "האובייקט נשמר בדלי");
    assert.equal(stored.length, payload.length, "הגוף שנשלח זהה בגודלו לקובץ המקורי");
    assert.equal(sha256Hex(stored), sha256Hex(payload), "הגוף שנשלח זהה בתוכנו לקובץ המקורי");
  });

  test("--dry-run לא שולח כלום", async () => {
    const { stdout: output } = await runScript(["--file", backupFile, "--dry-run"]);
    assert.match(output, /dry-run/);
  });

  test("קובץ שאינו גיבוי מוצפן נדחה", async () => {
    const plain = path.join(dir, "plain.db");
    fs.writeFileSync(plain, Buffer.from("SQLite format 3\0 not encrypted"));
    let failed = false;
    try {
      await runScript(["--file", plain]);
    } catch (error) {
      failed = true;
      assert.match(String(error.stdout ?? "") + String(error.stderr ?? ""), /LTBK1/);
    }
    assert.ok(failed, "העלאה של קובץ לא מוצפן חייבת להיכשל");
  });

  test("--list קורא את המלאי מהענן", async () => {
    const { stdout: output } = await runScript(["--list"]);
    assert.match(output, /lemontank\/lemontank-test\.ltbk/);
  });

  test("--prune מוחק רק מעל המכסה", async () => {
    // חמישה גיבויים "וותיקים" עם זמני שינוי שונים, ואחד חדש במיוחד
    objects.clear();
    modifiedTimes.clear();
    for (let index = 0; index < 5; index += 1) {
      const key = `${PREFIX}/lemontank-nightly-${index}.ltbk`;
      objects.set(key, Buffer.from("LTBK1x"));
      modifiedTimes.set(key, `2026-09-2${index}T03:00:00.000Z`);
    }
    const newest = `${PREFIX}/lemontank-nightly-9.ltbk`;
    objects.set(newest, Buffer.from("LTBK1x"));
    modifiedTimes.set(newest, "2026-09-26T23:00:00.000Z");

    const { stdout: output } = await runScript(["--prune"], { OFFSITE_KEEP: "3" });
    assert.match(output, /נמחק/);
    assert.equal(objects.size, 3, `צריכים להישאר 3 גיבויים, נשארו ${objects.size}`);
    assert.ok(objects.has(newest), "הגיבוי החדש ביותר חייב לשרוד");
    assert.ok(objects.has(`${PREFIX}/lemontank-nightly-4.ltbk`) && objects.has(`${PREFIX}/lemontank-nightly-3.ltbk`), "שרדו שני החדשים שאחריו");
    assert.ok(!objects.has(`${PREFIX}/lemontank-nightly-0.ltbk`), "הישן ביותר נמחק");
  });

  test("בלי פרטי אחסון — הודעה ברורה ולא קריסה", async () => {
    let failed = false;
    try {
      await runScript(["--list"], { OFFSITE_S3_BUCKET: "", OFFSITE_S3_ENDPOINT: "" });
    } catch (error) {
      failed = true;
      const output = String(error.stdout ?? "") + String(error.stderr ?? "");
      assert.match(output, /OFFSITE_S3_BUCKET/);
    }
    assert.ok(failed, "חייב להיכשל עם הסבר");
  });
});
