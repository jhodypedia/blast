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
  device: { label: string; status: string; errorCode?: string | null };
  challenge:
    | { method: "QR"; qr: string; expiresAt: string }
    | { method: "PAIR_CODE"; pairCode: string; expiresAt: string }
    | null;
};

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
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
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
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
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

  useEffect(() => {
    if (!open || payload?.challenge?.method !== "QR") {
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    void QRCode.toDataURL(payload.challenge.qr, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 240,
    }).then((dataUrl) => {
      if (!cancelled) setQrDataUrl(dataUrl);
    }).catch(() => {
      if (!cancelled) setQrDataUrl(null);
    });
    return () => { cancelled = true; };
  }, [open, payload?.challenge?.method, payload?.challenge?.qr]);

  if (!open) return null;

  const connected = payload?.device.status === "CONNECTED";
  const connectionError = payload?.device.status === "ERROR";
  const challenge = payload?.challenge;
  const methods: ("QR" | "PAIR_CODE")[] =
    pairCodeEnabled === false ? ["QR"] : ["QR", "PAIR_CODE"];
  const expired = challenge
    ? now > 0 && new Date(challenge.expiresAt).getTime() <= now
    : false;

  function validatePhone() {
    if (method !== "PAIR_CODE") return true;
    const parsed = parsePhoneNumberFromString(phoneNumber, countryCode as never);
    const valid = Boolean(parsed?.isValid());
    setValidationError(valid ? null : "Masukkan nomor WhatsApp yang valid.");
    return valid;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pairing-title"
      onKeyDown={(event) => event.key === "Escape" && onClose()}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-lift sm:p-6"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">Hubungkan perangkat</p>
            <h2 id="pairing-title" className="mt-1 text-xl font-bold">{deviceName}</h2>
          </div>
          <Button ref={closeButtonRef} type="button" variant="ghost" size="sm" onClick={onClose}>Tutup</Button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-1 rounded-xl border border-border bg-background p-1" role="tablist" aria-label="Metode koneksi">
          {methods.map((item) => (
            <button
              key={item}
              type="button"
              className={`min-h-11 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${method === item ? "bg-primary/12 text-primary shadow-sm ring-1 ring-primary/25" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
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
                className="h-10 rounded-md border border-input bg-background px-2 text-sm"
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
            {validationError ? <p className="text-xs text-destructive">{validationError}</p> : null}
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

        <div className="mt-5 min-h-48 rounded-2xl border border-border bg-background/70 p-4 text-center" aria-live="polite">
          {connected ? (
            <div className="flex min-h-40 flex-col items-center justify-center gap-2 text-success">
              <CheckCircle2 className="size-10" />
              <strong>Terhubung</strong>
              <span className="text-sm text-muted-foreground">Perangkat siap digunakan.</span>
            </div>
          ) : loadingStatus && !payload ? (
            <div className="flex min-h-40 items-center justify-center gap-2 text-muted-foreground"><Loader2 className="size-5 animate-spin" /> Mengambil status...</div>
          ) : challenge?.method === "QR" && !expired ? (
            <div className="flex flex-col items-center gap-2">{qrDataUrl ? <img src={qrDataUrl} alt="QR Code WhatsApp" width={240} height={240} className="rounded-lg bg-white p-2" /> : <Loader2 className="my-20 size-6 animate-spin text-primary" />}<span className="text-xs text-muted-foreground">Pindai QR Code ini dari WhatsApp.</span></div>
          ) : challenge?.method === "PAIR_CODE" && !expired ? (
            <div className="flex min-h-40 flex-col items-center justify-center gap-3"><p className="text-sm text-muted-foreground">Masukkan kode ini di WhatsApp:</p><div className="flex items-center gap-2"><strong className="font-mono text-2xl tracking-[0.2em] text-primary">{challenge.pairCode}</strong><Button type="button" variant="ghost" size="icon" aria-label="Salin kode pairing" onClick={() => { void navigator.clipboard.writeText(challenge.pairCode); toast.success("Kode pairing disalin."); }}><Copy /></Button></div></div>
          ) : (
            <div className="flex min-h-40 flex-col items-center justify-center gap-2 text-muted-foreground">
              <p>{connectionError || pairState.status === "error" ? "Koneksi gagal dimulai." : "Menunggu koneksi dari worker..."}</p>
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
