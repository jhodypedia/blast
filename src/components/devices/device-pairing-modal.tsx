"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Copy, Loader2, QrCode, RefreshCw } from "lucide-react";
import QRCode from "qrcode";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { parsePhoneNumberFromString } from "libphonenumber-js";

import {
  pairDeviceAction,
  type DeviceActionState,
} from "@/app/actions/devices";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: DeviceActionState = { status: "idle" };
const COUNTRIES = [
  ["ID", "Indonesia (+62)"],
  ["MY", "Malaysia (+60)"],
  ["SG", "Singapura (+65)"],
  ["US", "Amerika Serikat (+1)"],
  ["GB", "Britania Raya (+44)"],
  ["AU", "Australia (+61)"],
  ["IN", "India (+91)"],
  ["JP", "Jepang (+81)"],
] as const;

type StatusPayload = {
  device: {
    label: string;
    status: string;
    errorCode?: string | null;
    restarting?: boolean;
  };
  challenge:
    | { method: "QR"; qr: string; expiresAt: string }
    | { method: "PAIR_CODE"; pairCode: string; expiresAt: string }
    | null;
};

/** Remaining validity of a challenge, rendered as `m:ss`. */
function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function DevicePairingModal({
  deviceId,
  deviceName,
  pairCodeEnabled,
  open,
  onClose,
}: {
  deviceId: string;
  deviceName: string;
  pairCodeEnabled?: boolean;
  open: boolean;
  onClose: () => void;
}) {
  const [method, setMethod] = useState<"QR" | "PAIR_CODE">("QR");
  const [countryCode, setCountryCode] = useState("ID");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [payload, setPayload] = useState<StatusPayload | null>(null);
  const [now, setNow] = useState(0);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [qrImage, setQrImage] = useState<{ qr: string; dataUrl: string } | null>(
    null,
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const [pairState, pairAction, pairPending] = useActionState(
    pairDeviceAction,
    initialState,
  );
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    return () => previous?.focus();
  }, [open]);

  const refreshStatus = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoadingStatus(true);
    try {
      const response = await fetch(`/api/devices/${deviceId}/status`, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("status");
      setPayload((await response.json()) as StatusPayload);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setPayload(null);
    } finally {
      setLoadingStatus(false);
      setNow(Date.now());
      if (requestRef.current === controller) requestRef.current = null;
    }
  }, [deviceId]);

  useEffect(() => {
    if (!open) return;
    const initial = window.setTimeout(() => void refreshStatus(), 0);
    const interval = window.setInterval(() => void refreshStatus(), 2000);
    // Separate 1s tick so the expiry countdown moves smoothly between polls.
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
      window.clearInterval(tick);
      requestRef.current?.abort();
      requestRef.current = null;
    };
  }, [open, refreshStatus]);

  useEffect(() => {
    if (pairState.status === "success") {
      toast.success(pairState.message);
      window.setTimeout(() => void refreshStatus(), 0);
    }
    if (pairState.status === "error") toast.error(pairState.message);
  }, [pairState, refreshStatus]);

  // The rendered QR is keyed by its payload so a stale image is filtered out
  // during render instead of being cleared with a synchronous setState.
  useEffect(() => {
    const qrChallenge =
      payload?.challenge?.method === "QR" ? payload.challenge : null;
    if (!open || !qrChallenge) return;
    const qr = qrChallenge.qr;
    let cancelled = false;
    void QRCode.toDataURL(qr, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 240,
    }).then((dataUrl) => {
      if (!cancelled) setQrImage({ qr, dataUrl });
    }).catch(() => {
      if (!cancelled) setQrImage(null);
    });
    return () => { cancelled = true; };
  }, [open, payload?.challenge]);

  if (!open) return null;

  const connected = payload?.device.status === "CONNECTED";
  const connectionError = payload?.device.status === "ERROR";
  // WhatsApp closes the socket right after a successful link and requires a
  // rebuild (status 515). That is progress, not a failure, so it gets its own
  // state instead of falling through to the error copy.
  const restarting = payload?.device.restarting === true;
  const challenge = payload?.challenge;
  const qrChallenge = challenge?.method === "QR" ? challenge : null;
  const pairCodeChallenge = challenge?.method === "PAIR_CODE" ? challenge : null;
  const methods: ("QR" | "PAIR_CODE")[] =
    pairCodeEnabled === false ? ["QR"] : ["QR", "PAIR_CODE"];
  // `now` is refreshed by the status poll and by a 1s tick, so the clock is read
  // from state rather than during render. It stays 0 until the first poll lands.
  const remainingMs =
    challenge && now > 0
      ? new Date(challenge.expiresAt).getTime() - now
      : null;
  const expired = remainingMs !== null && remainingMs <= 0;
  const qrDataUrl =
    qrChallenge && qrImage?.qr === qrChallenge.qr ? qrImage.dataUrl : null;

  function validatePhone() {
    if (method !== "PAIR_CODE") return true;
    const parsed = parsePhoneNumberFromString(phoneNumber, countryCode as never);
    const valid = Boolean(parsed?.isValid());
    setValidationError(valid ? null : "Masukkan nomor WhatsApp yang valid.");
    return valid;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overlay-forest p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pairing-title"
      onKeyDown={(event) => event.key === "Escape" && onClose()}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: "linear" }}
        className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto border-4 border-black bg-card p-4 shadow-lift sm:p-6"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b-4 border-black pb-3">
          <div>
            <p className="border-2 border-black bg-primary px-2 py-0.5 text-xs font-black uppercase tracking-widest text-primary-foreground">
              Hubungkan perangkat
            </p>
            <h2 id="pairing-title" className="mt-2 text-xl">{deviceName}</h2>
          </div>
          <Button ref={closeButtonRef} type="button" variant="outline" size="sm" onClick={onClose}>Tutup</Button>
        </div>

        <div className="mt-5 grid grid-cols-2 border-4 border-black bg-background" role="tablist" aria-label="Metode koneksi">
          {methods.map((item) => (
            <button
              key={item}
              type="button"
              className={`min-h-11 border-black px-3 py-2 text-sm font-black uppercase tracking-wide transition-colors duration-100 [transition-timing-function:steps(2,end)] first:border-r-4 ${method === item ? "bg-primary text-primary-foreground" : "bg-background text-foreground hover:bg-accent"}`}
              onClick={() => setMethod(item)}
              aria-pressed={method === item}
            >
              {item === "QR" ? "QR Code" : "Kode Pairing"}
            </button>
          ))}
        </div>

        {method === "PAIR_CODE" ? (
          <form
            action={pairAction}
            className="mt-4 space-y-3"
            onSubmit={(event) => {
              if (!validatePhone()) event.preventDefault();
            }}
          >
            <input type="hidden" name="deviceId" value={deviceId} />
            <input type="hidden" name="method" value="PAIR_CODE" />
            <input type="hidden" name="countryCode" value={countryCode} />
            <Label htmlFor={`pair-phone-${deviceId}`}>Nomor WhatsApp</Label>
            <div className="grid grid-cols-[minmax(0,10rem)_1fr] gap-2">
              <select
                value={countryCode}
                onChange={(event) => setCountryCode(event.target.value)}
                aria-label="Kode negara"
                className="flex h-11 w-full border-4 border-black bg-background px-2 font-mono text-sm font-bold uppercase disabled:bg-surface-strong"
              >
                {COUNTRIES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
              </select>
              <Input
                id={`pair-phone-${deviceId}`}
                name="phoneNumber"
                value={phoneNumber}
                onChange={(event) => setPhoneNumber(event.target.value)}
                placeholder="81234567890"
                inputMode="tel"
                autoComplete="tel"
                aria-invalid={Boolean(validationError)}
              />
            </div>
            {validationError ? (
              <p className="border-2 border-black bg-destructive px-2 py-1 text-xs font-black uppercase text-destructive-foreground">
                {validationError}
              </p>
            ) : null}
            <Button type="submit" loading={pairPending} className="w-full">Minta kode pairing</Button>
          </form>
        ) : (
          <form action={pairAction} className="mt-4">
            <input type="hidden" name="deviceId" value={deviceId} />
            <input type="hidden" name="method" value="QR" />
            <Button type="submit" loading={pairPending} className="w-full">
              <QrCode aria-hidden="true" /> Minta QR Code
            </Button>
          </form>
        )}

        <div className="mt-5 min-h-48 border-4 border-black bg-surface p-4 text-center" aria-live="polite">
          {connected ? (
            <div className="flex min-h-40 flex-col items-center justify-center gap-2 border-4 border-black bg-success p-4 text-success-foreground">
              <CheckCircle2 className="size-10" />
              <strong className="font-black uppercase tracking-wide">Terhubung</strong>
              <span className="text-sm font-bold">Perangkat siap digunakan.</span>
            </div>
          ) : restarting ? (
            <div className="flex min-h-40 flex-col items-center justify-center gap-2 border-4 border-black bg-info p-4 text-info-foreground">
              <Loader2 className="size-8 animate-spin" />
              <strong className="font-black uppercase tracking-wide">Menyelesaikan koneksi</strong>
              <span className="text-sm font-bold">Perangkat berhasil ditautkan. WhatsApp meminta sesi dimulai ulang, mohon tunggu.</span>
            </div>
          ) : loadingStatus && !payload ? (
            <div className="flex min-h-40 items-center justify-center gap-2 text-sm font-black uppercase tracking-widest text-foreground"><Loader2 className="size-5 animate-spin" /> Mengambil status...</div>
          ) : qrChallenge && !expired ? (
            <div className="flex flex-col items-center gap-2">{qrDataUrl ? <img src={qrDataUrl} alt="QR Code WhatsApp" width={240} height={240} className="border-4 border-black bg-white p-2" /> : <Loader2 className="my-20 size-6 animate-spin text-primary" />}<span className="text-xs font-bold uppercase text-foreground">Pindai QR Code ini dari WhatsApp.</span>{remainingMs !== null ? <span className="border-2 border-black bg-warning px-2 py-0.5 text-xs font-black uppercase text-warning-foreground">Berlaku {formatCountdown(remainingMs)}</span> : null}</div>
          ) : pairCodeChallenge && !expired ? (
            <div className="flex min-h-40 flex-col items-center justify-center gap-3"><p className="text-sm font-bold uppercase text-foreground">Masukkan kode ini di WhatsApp:</p><div className="flex items-center gap-2"><strong className="border-4 border-black bg-primary px-3 py-1 font-mono text-2xl font-black tracking-[0.2em] text-primary-foreground">{pairCodeChallenge.pairCode}</strong><Button type="button" variant="outline" size="icon" aria-label="Salin kode pairing" onClick={() => { void navigator.clipboard.writeText(pairCodeChallenge.pairCode); toast.success("Kode pairing disalin."); }}><Copy /></Button></div>{remainingMs !== null ? <span className="border-2 border-black bg-warning px-2 py-0.5 text-xs font-black uppercase text-warning-foreground">Berlaku {formatCountdown(remainingMs)}</span> : null}</div>
          ) : (
            <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-sm font-bold uppercase text-foreground">
              <p>
                {connectionError && payload?.device.errorCode === "NUMBER_ALREADY_LINKED"
                  ? "Nomor ini sudah terhubung di perangkat lain. Putuskan perangkat itu lebih dahulu."
                  : connectionError || pairState.status === "error"
                    ? "Koneksi gagal dimulai."
                    : expired
                      ? "Kode kedaluwarsa. Minta yang baru."
                      : "Menunggu koneksi dari worker..."}
              </p>
              <form action={pairAction}>
                <input type="hidden" name="deviceId" value={deviceId} />
                <input type="hidden" name="method" value={method} />
                {method === "PAIR_CODE" ? (
                  <>
                    <input type="hidden" name="phoneNumber" value={phoneNumber} />
                    <input type="hidden" name="countryCode" value={countryCode} />
                  </>
                ) : null}
                <Button type="submit" variant="outline" size="sm" loading={pairPending}>
                  <RefreshCw /> Coba lagi
                </Button>
              </form>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
