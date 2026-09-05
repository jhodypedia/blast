"use client";

import { ExternalLink, Copy, MessageSquareReply, Phone } from "lucide-react";

import type { ContentButtonValue } from "@/components/admin/campaign-form-shared";

/**
 * WhatsApp-like preview of the unified content block — ADMIN only.
 *
 * Renders exactly what the sender will build: one or two images, the message
 * text, then the buttons. Images are streamed through the admin-authenticated
 * media route because campaign uploads live in private storage and are never
 * served from `public/`.
 *
 * Two images preview side by side from `sm` up (they ship as a carousel) and stack
 * on mobile; a single image spans the full width.
 */
export function ContentBlockPreview({
  messageText,
  image1Key,
  image2Key,
  buttons,
}: {
  messageText: string;
  image1Key: string;
  image2Key: string;
  buttons: ContentButtonValue[];
}) {
  const images = [image1Key, image2Key].filter(
    (key): key is string => key.trim().length > 0,
  );
  const visibleButtons = buttons.filter(
    (button) => button.label.trim().length > 0,
  );

  return (
    <div className="border-4 border-black bg-surface p-3">
      <p className="text-[0.6875rem] font-black uppercase tracking-widest text-foreground">
        Pratinjau pesan
      </p>

      <div className="mt-2 space-y-2 border-4 border-black bg-background p-3">
        {images.length > 0 ? (
          <div
            className={
              images.length === 2
                ? "grid grid-cols-1 gap-2 sm:grid-cols-2"
                : "grid grid-cols-1"
            }
          >
            {images.map((key) => (
              // eslint-disable-next-line @next/next/no-img-element -- private media
              // is streamed through an authenticated route, so the Next.js image
              // optimiser cannot fetch it.
              <img
                key={key}
                src={`/api/admin/media/${key.split(/[\\/]/).map(encodeURIComponent).join("/")}`}
                alt=""
                className="aspect-video w-full border-4 border-black object-cover"
              />
            ))}
          </div>
        ) : null}

        {messageText.trim().length > 0 ? (
          <p className="whitespace-pre-wrap break-words font-mono text-sm">
            {messageText}
          </p>
        ) : (
          <p className="font-mono text-sm text-foreground/60">
            Isi pesan masih kosong.
          </p>
        )}

        {visibleButtons.length > 0 ? (
          <div className="flex flex-wrap gap-2 border-t-4 border-black pt-2">
            {visibleButtons.map((button, index) => (
              <span
                key={`${button.variant}-${index}`}
                className="flex min-h-11 items-center gap-1.5 border-4 border-black bg-primary px-3 text-xs font-black uppercase text-primary-foreground"
              >
                <ButtonIcon variant={button.variant} />
                {button.label}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <p className="mt-2 text-[0.6875rem] font-bold uppercase text-foreground">
        {images.length === 2
          ? "Dua gambar dikirim sebagai satu carousel."
          : images.length === 1
            ? "Satu gambar dengan teks sebagai caption."
            : "Pesan teks."}
      </p>
    </div>
  );
}

function ButtonIcon({ variant }: { variant: ContentButtonValue["variant"] }) {
  const className = "size-3.5";

  switch (variant) {
    case "URL":
      return <ExternalLink className={className} aria-hidden="true" />;
    case "REPLY":
      return <MessageSquareReply className={className} aria-hidden="true" />;
    case "COPY":
      return <Copy className={className} aria-hidden="true" />;
    case "CALL":
      return <Phone className={className} aria-hidden="true" />;
  }
}
