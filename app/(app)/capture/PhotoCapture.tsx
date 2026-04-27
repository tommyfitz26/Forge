'use client';

import { useRef, useState, useTransition } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { createPhotoCapture } from './actions';

const ACCEPTED_MIMES = 'image/jpeg,image/png,image/webp,image/heic,image/heif';

export function PhotoCapture() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewMime, setPreviewMime] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const file = event.target.files?.[0];
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (!file) {
      setPreviewUrl(null);
      setPreviewMime(null);
      return;
    }
    setPreviewUrl(URL.createObjectURL(file));
    setPreviewMime(file.type);
  }

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createPhotoCapture(formData);
      if (!result.ok) {
        setError(result.error);
      }
      // On success the server action redirects.
    });
  }

  // HEIC/HEIF can't be rendered by browsers as <img> previews — show a
  // filename placeholder instead so the user knows the file is selected.
  const canPreview = previewUrl !== null && previewMime !== null
    && !['image/heic', 'image/heif'].includes(previewMime);

  return (
    <form action={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <label
          htmlFor="photo"
          className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"
        >
          Photo
        </label>
        <input
          ref={inputRef}
          id="photo"
          name="photo"
          type="file"
          required
          accept={ACCEPTED_MIMES}
          onChange={onFileChange}
          className="block w-full text-sm text-neutral-600 file:mr-3 file:rounded-md file:border-0 file:bg-neutral-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-neutral-800 dark:text-neutral-400 dark:file:bg-neutral-100 dark:file:text-neutral-900 dark:hover:file:bg-neutral-200"
        />
        <p className="text-xs text-neutral-500">JPEG, PNG, WebP, HEIC, or HEIF. Max 15MB.</p>
      </div>

      {canPreview && previewUrl && (
        <div className="overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-800">
          <Image
            src={previewUrl}
            alt="Preview"
            width={800}
            height={600}
            unoptimized
            className="h-auto max-h-96 w-full object-contain"
          />
        </div>
      )}

      {previewUrl && !canPreview && (
        <p className="text-xs text-neutral-500">
          Preview not available for HEIC/HEIF — file will upload as-is.
        </p>
      )}

      <div className="space-y-2">
        <label
          htmlFor="caption"
          className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"
        >
          Caption <span className="font-normal text-neutral-500">(optional)</span>
        </label>
        <Textarea
          id="caption"
          name="caption"
          rows={4}
          placeholder={'Optional. Start with "idea:", "problem:", "observation:", or "research:" to skip classification.'}
        />
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex items-center justify-end gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Uploading…' : 'Save photo'}
        </Button>
      </div>
    </form>
  );
}
