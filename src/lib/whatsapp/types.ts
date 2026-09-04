import "server-only";

/**
 * WhatsApp adapter contract.
 *
 * This is the *only* surface the rest of the application may use to talk to
 * WhatsApp (RULES.md §8). Baileys types never leak past this boundary, so the
 * library can be swapped or mocked in tests without touching services.
 */

export type SendOutcomeStatus =
  /** Provider confirmed the message was accepted for delivery. */
  | "SENT"
  /** Failed for a reason that is safe to retry (transient network/socket). */
  | "RETRYABLE_FAILED"
  /** Failed permanently (invalid recipient, not on WhatsApp, blocked). */
  | "FAILED"
  /** Ambiguous: the send may or may not have happened. Never auto-retried. */
  | "UNKNOWN";

export type SendResult = {
  status: SendOutcomeStatus;
  /** Provider message id when available. */
  providerMessageId?: string;
  /** Stable machine-readable category for logs and admin triage. */
  failureCategory?: string;
  /** Safe, non-sensitive reason string. */
  failureReason?: string;
};

export type OutgoingMessage = {
  /** Canonical E.164 without `+`. */
  normalizedNumber: string;
  text: string;
  cta?: { label: string; url: string };
  media?: {
    /** Absolute path inside the private storage root. */
    storagePath: string;
    mimeType: string;
    caption?: string;
  };
};

export type DeviceConnectionState =
  | "CONNECTING"
  | "CONNECTED"
  | "DISCONNECTED"
  | "EXPIRED"
  | "ERROR";

export type PairingRequest =
  | { method: "QR" }
  | { method: "PAIR_CODE"; normalizedNumber: string; customCode?: string };

export type PairingChallenge =
  /**
   * Short-lived QR payload. Returned to the owning USER over an authenticated
   * channel only; never logged or persisted (RULES.md §8).
   */
  | { method: "QR"; qr: string; expiresAt: Date }
  | { method: "PAIR_CODE"; pairCode: string; expiresAt: Date };

export type ConnectionUpdate = {
  deviceId: string;
  state: DeviceConnectionState;
  /** Present once the device is paired. */
  normalizedNumber?: string;
  /** Safe error code for diagnostics. */
  errorCode?: string;
  /**
   * True while the adapter is rebuilding the socket itself, which WhatsApp
   * demands right after a successful pairing (`restartRequired`, status 515).
   * Callers must keep any pairing challenge and pairing lock intact and must not
   * schedule their own reconnect for these updates.
   */
  restarting?: boolean;
  /** True when the session is unrecoverable and credentials must be cleared. */
  requiresReauth?: boolean;
};

export type WhatsAppAdapter = {
  /**
   * Starts or resumes a session. Emits pairing challenges through `onChallenge`
   * and lifecycle changes through `onUpdate`.
   *
   * Resolves once the socket has been handed to the library; the outcome arrives
   * through `onUpdate`, including the `restarting` updates the adapter emits
   * while it rebuilds the socket after a successful pairing.
   */
  connect(params: {
    deviceId: string;
    pairing?: PairingRequest;
    onChallenge?: (challenge: PairingChallenge) => void | Promise<void>;
    onUpdate?: (update: ConnectionUpdate) => void | Promise<void>;
  }): Promise<void>;

  /** Gracefully closes a session without clearing stored credentials. */
  disconnect(deviceId: string): Promise<void>;

  /** Closes a session and permanently clears its stored credentials. */
  logout(deviceId: string): Promise<void>;

  /** Current in-process connection state. */
  getState(deviceId: string): DeviceConnectionState;

  /**
   * Sends one message. Implementations must normalise every failure into a
   * `SendResult` and must never throw for provider-level errors, so callers can
   * always record a definite recipient state.
   */
  send(deviceId: string, message: OutgoingMessage): Promise<SendResult>;

  /** Checks whether a number is registered on WhatsApp, when supported. */
  isRegistered(deviceId: string, normalizedNumber: string): Promise<boolean | null>;
};
