"use client";

import { useEffect, useState } from "react";
import { Button, Card, Spinner } from "@/components/ui/primitives";
import { apiCall } from "@/lib/client/api";
import { deviceFingerprint } from "@/lib/client/device";

export type DownloadRow = {
  id: number;
  title_id: number;
  quality: string;
  status: string;
  expires_at: string | null;
  created_at: string;
  title_name: string;
  slug: string;
  poster_url: string | null;
  episode_label: string | null;
  device_label: string | null;
  expired: number;
};

export type DeviceRow = {
  id: number;
  label: string | null;
  platform: string | null;
  trusted: number;
  first_seen: string;
  last_seen: string;
};

export function DownloadsManager({ initial, planLabel }: { initial: DownloadRow[]; planLabel: string }) {
  const [downloads, setDownloads] = useState(initial);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deviceName, setDeviceName] = useState("");

  useEffect(() => {
    const name = navigator.userAgent.includes("Mobile") ? "טלפון" : "מחשב";
    setDeviceName(name);
    void (async () => {
      const res = await apiCall<{ devices: DeviceRow[] }>("/api/devices");
      if (res.ok) setDevices(res.data.devices);
    })();
  }, []);

  const refresh = async () => {
    const res = await apiCall<{ downloads: DownloadRow[] }>("/api/downloads");
    if (res.ok) setDownloads(res.data.downloads);
  };

  const remove = async (row: DownloadRow) => {
    setBusy(true);
    const res = await apiCall(`/api/downloads`, { method: "DELETE", body: { id: row.id } });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    await refresh();
  };

  const toggleTrust = async (device: DeviceRow) => {
    const res = await apiCall(`/api/devices/${device.id}`, { method: "PATCH", body: { trusted: !device.trusted } });
    if (res.ok) setDevices((prev) => prev.map((d) => (d.id === device.id ? { ...d, trusted: d.trusted ? 0 : 1 } : d)));
  };

  const removeDevice = async (device: DeviceRow) => {
    if (!window.confirm("להתנתק מהמכשיר? ההורדות שלו יימחקו.")) return;
    const res = await apiCall(`/api/devices/${device.id}`, { method: "DELETE" });
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setDevices((prev) => prev.filter((d) => d.id !== device.id));
    await refresh();
  };

  const register = async () => {
    setBusy(true);
    setError("");
    const res = await apiCall<{ device_id: number; devices: DeviceRow[] }>("/api/devices", {
      method: "POST",
      body: { fingerprint: deviceFingerprint(), label: deviceName, platform: navigator.platform },
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setDevices(res.data.devices);
  };

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">המכשיר הזה</h2>
            <p className="text-[0.9rem] text-ink-400">
              {planLabel} · מכשיר מזוהה בדפדפן בלבד (בלי פרטים אישיים). הסרה תמחק גם את ההורדות שלו.
            </p>
          </div>
          <Button onClick={register} disabled={busy}>
            {busy ? <Spinner /> : "רישום המכשיר"}
          </Button>
        </div>
        {error && <p className="mt-2 text-[0.9rem] text-red-300">{error}</p>}
      </Card>

      <section>
        <h2 className="mb-2 text-xl font-black">המכשירים שלי ({devices.length})</h2>
        {devices.length === 0 ? (
          <p className="text-ink-400">עוד לא נרשמו מכשירים.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {devices.map((device) => (
              <li key={device.id} className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.05] p-3">
                <div>
                  <div className="font-bold">
                    {device.label ?? "מכשיר"} {device.trusted ? <span className="text-emerald-300">✓ מהימן</span> : null}
                  </div>
                  <div className="text-[0.82rem] text-ink-400">
                    {device.platform ?? "web"} · נראה לאחרונה {device.last_seen.slice(0, 16).replace("T", " ")}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => toggleTrust(device)} className="rounded-lg bg-white/[0.08] px-3 py-1.5 text-[0.85rem] hover:bg-white/[0.14]">
                    {device.trusted ? "בטל אמון" : "סמן מהימן"}
                  </button>
                  <button type="button" onClick={() => removeDevice(device)} className="rounded-lg px-3 py-1.5 text-[0.85rem] text-red-300 hover:bg-red-500/10">
                    הסר
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-xl font-black">ההורדות שלי ({downloads.filter((d) => !d.expired).length} פעילות)</h2>
        {downloads.length === 0 ? (
          <Card className="p-6 text-center text-ink-300">
            אין הורדות. הורדות זמינות למנוי פלוס — לחצו &quot;הורדה&quot; בדף הכותר.
          </Card>
        ) : (
          <ul className="grid gap-2">
            {downloads.map((row) => (
              <li key={row.id} className="flex items-center gap-3 rounded-xl bg-white/[0.05] p-3">
                {row.poster_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={row.poster_url} alt="" className="h-16 w-11 rounded-lg object-cover" />
                ) : (
                  <span className="flex h-16 w-11 items-center justify-center rounded-lg bg-white/10">🎬</span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold">{row.title_name}</div>
                  <div className="text-[0.82rem] text-ink-400">
                    {row.episode_label ? `${row.episode_label} · ` : ""}
                    {row.quality}
                    {row.device_label ? ` · ${row.device_label}` : ""}
                  </div>
                  <div className={`text-[0.8rem] ${row.expired ? "text-red-300" : "text-ink-500"}`}>
                    {row.expired ? "פג תוקף" : `בתוקף עד ${String(row.expires_at ?? "").slice(0, 16).replace("T", " ")}`}
                  </div>
                </div>
                <button type="button" onClick={() => remove(row)} disabled={busy} className="rounded-lg px-3 py-1.5 text-[0.85rem] text-red-300 hover:bg-red-500/10">
                  מחק
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
