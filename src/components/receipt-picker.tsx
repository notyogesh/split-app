"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Trash2 } from "lucide-react";
import { useSupabase } from "@/lib/supabase/client";

const MAX_SIDE = 1280;
const QUALITY = 0.7;

/** Shrinks a photo to ≤1280px WebP (usually 80–200 KB) before upload. */
async function compress(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", QUALITY));
  if (blob && blob.type === "image/webp") return blob;
  // Safari < 16 can't encode WebP; fall back to JPEG.
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not read image"))), "image/jpeg", QUALITY),
  );
}

export function ReceiptPicker({
  me,
  path,
  onChange,
  onUploading,
}: {
  me: string;
  path: string | null;
  onChange: (path: string | null) => void;
  onUploading: (v: boolean) => void;
}) {
  const supabase = useSupabase();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!path || preview) return;
    supabase.storage.from("receipts")
      .createSignedUrl(path, 600)
      .then(({ data }) => data && setPreview(data.signedUrl));
  }, [path, preview, supabase]);

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy(true);
    onUploading(true);
    try {
      const blob = await compress(file);
      const ext = blob.type === "image/webp" ? "webp" : "jpg";
      const newPath = `${me}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("receipts")
        .upload(newPath, blob, { contentType: blob.type, upsert: false });
      if (error) throw error;
      setPreview(URL.createObjectURL(blob));
      onChange(newPath);
    } catch {
      setError("Upload failed. Try a smaller photo.");
    } finally {
      setBusy(false);
      onUploading(false);
    }
  }

  return (
    <div>
      <span className="label">Receipt</span>
      {path && preview ? (
        <div className="relative inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Receipt" className="max-h-48 rounded-xl ring-1 ring-zinc-200 dark:ring-zinc-800" />
          <button
            type="button"
            onClick={() => {
              setPreview(null);
              onChange(null);
            }}
            className="absolute top-2 right-2 rounded-full bg-black/60 p-1.5 text-white"
            aria-label="Remove receipt"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => input.current?.click()} disabled={busy} className="btn-ghost">
          <Camera className="size-4" /> {busy ? "Uploading…" : "Add photo"}
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => pick(e.target.files?.[0])}
      />
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
