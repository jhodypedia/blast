"use client";

import { useActionState, useEffect, useState } from "react";
import {
  Link2Off,
  QrCode,
  RefreshCw,
  Smartphone,
  Trash2,
} from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

import {
  deviceControlAction,
  pairDeviceAction,
  type DeviceActionState,
} from "@/app/actions/devices";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type DeviceCardData = {
  id: string;
  label: string;
  status: "CONNECTING" | "CONNECTED" | "DISCONNECTED" | "EXPIRED" | "ERROR";
  maskedNumber: string | null;
  lastConnectedAt: string | null;
};

const initialState: DeviceActionState = { status: "idle" };

const STATUS_VARIANT: Record<
  DeviceCardData["status"],
  "success" | "warning" | "danger" | "neutral"
> = {
  CONNECTED: "success",
  CONNECTING: "warning",
  DISCONNECTED: "neutral",
  EXPIRED: "warning",
  ERROR: "danger",
};

/**
 * One device row with its pairing and lifecycle controls.
 *
 * The QR image and pairing code are never rendered from props: they arrive over
 * the authenticated status channel only (RULES.md §8).
 */
export function DeviceCard({
  device,
  pairCodeEnabled,
}: {
  device: DeviceCardData;
  pairCodeEnabled: boolean;
}) {
  const [pairState, pairAction, pairPending] = useActionState(
    pairDeviceAction,
    initialState,
  );
  const [controlState, controlAction, controlPending] = useActionState(
    deviceControlAction,
    initialState,
  );
  const [method, setMethod] = useState<"QR" | "PAIR_CODE">("QR");
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    if (pairState.status === "success") {
      toast.success(pairState.message);
    }
    if (pairState.status === "error") {
      toast.error(pairState.message);
    }
  }, [pairState]);

  useEffect(() => {
    if (controlState.status === "success") {
      toast.success(controlState.message);
    }
    if (controlState.status === "error") {
      toast.error(controlState.message);
    }
  }, [controlState]);

  const busy = pairPending || controlPending;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <span className="shrink-0 rounded-lg bg-muted p-2">
                <Smartphone
                  className="size-5 text-primary"
                  aria-hidden="true"
                />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{device.label}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {device.maskedNumber ?? "Not paired yet"}
                </p>
              </div>
            </div>
            <Badge variant={STATUS_VARIANT[device.status]}>
              {device.status}
            </Badge>
          </div>

          {device.status !== "CONNECTED" ? (
            <form action={pairAction} className="space-y-3">
              <input type="hidden" name="deviceId" value={device.id} />
              <input type="hidden" name="method" value={method} />

              <fieldset className="space-y-2" disabled={busy}>
                <legend className="text-xs font-medium text-muted-foreground">
                  Pairing method
                </legend>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant={method === "QR" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setMethod("QR")}
                    aria-pressed={method === "QR"}
                  >
                    <QrCode aria-hidden="true" />
                    QR code
                  </Button>
                  {pairCodeEnabled ? (
                    <Button
                      type="button"
                      variant={method === "PAIR_CODE" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setMethod("PAIR_CODE")}
                      aria-pressed={method === "PAIR_CODE"}
                    >
                      Pair code
                    </Button>
                  ) : null}
                </div>
              </fieldset>

              {method === "PAIR_CODE" ? (
                <div className="space-y-2">
                  <Label htmlFor={`phone-${device.id}`}>WhatsApp number</Label>
                  <Input
                    id={`phone-${device.id}`}
                    name="phoneNumber"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="08123456789"
                    maxLength={24}
                    disabled={busy}
                  />
                </div>
              ) : null}

              <Button type="submit" size="sm" loading={pairPending}>
                Start pairing
              </Button>
            </form>
          ) : null}

          <DeviceControls
            deviceId={device.id}
            connected={device.status === "CONNECTED"}
            action={controlAction}
            pending={controlPending}
            busy={busy}
            confirmRemove={confirmRemove}
            setConfirmRemove={setConfirmRemove}
          />
        </CardContent>
      </Card>
    </motion.div>
  );
}

/** Disconnect / reconnect / remove controls with an inline remove confirmation. */
function DeviceControls({
  deviceId,
  connected,
  action,
  pending,
  busy,
  confirmRemove,
  setConfirmRemove,
}: {
  deviceId: string;
  connected: boolean;
  action: (formData: FormData) => void;
  pending: boolean;
  busy: boolean;
  confirmRemove: boolean;
  setConfirmRemove: (value: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 border-t border-border pt-3">
      <form action={action}>
        <input type="hidden" name="deviceId" value={deviceId} />
        <input
          type="hidden"
          name="action"
          value={connected ? "DISCONNECT" : "RECONNECT"}
        />
        <Button type="submit" variant="outline" size="sm" loading={pending}>
          {connected ? (
            <>
              <Link2Off aria-hidden="true" />
              Disconnect
            </>
          ) : (
            <>
              <RefreshCw aria-hidden="true" />
              Reconnect
            </>
          )}
        </Button>
      </form>

      {confirmRemove ? (
        <form
          action={action}
          onSubmit={() => setConfirmRemove(false)}
          className="flex items-center gap-2"
        >
          <input type="hidden" name="deviceId" value={deviceId} />
          <input type="hidden" name="action" value="REMOVE" />
          <span className="text-xs text-muted-foreground">
            Remove this device?
          </span>
          <Button
            type="submit"
            variant="destructive"
            size="sm"
            loading={pending}
          >
            Confirm
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setConfirmRemove(false)}
          >
            Cancel
          </Button>
        </form>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setConfirmRemove(true)}
          disabled={busy}
        >
          <Trash2 aria-hidden="true" />
          Remove
        </Button>
      )}
    </div>
  );
}

