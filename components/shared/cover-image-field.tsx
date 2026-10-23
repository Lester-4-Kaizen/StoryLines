'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'
import { ImagePlus, Upload, X } from 'lucide-react'
import { validateCreatorImage } from '@/lib/creator-image-upload'

export function CoverImageField({
  imageUrl,
  pendingFile,
  onFileChange,
  onRemove,
}: {
  imageUrl: string
  pendingFile: File | null
  onFileChange: (file: File | null) => void
  onRemove: () => void
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)

  useEffect(() => {
    if (!pendingFile) {
      setPreviewUrl(null)
      return
    }
    const objectUrl = URL.createObjectURL(pendingFile)
    setPreviewUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [pendingFile])

  const selectFile = (file: File | undefined) => {
    if (!file) return
    try {
      validateCreatorImage(file)
      setValidationError(null)
      onFileChange(file)
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : 'Hindi valid ang image.')
    }
  }

  const displayImageUrl = previewUrl ?? imageUrl

  return (
    <div>
      <p className="text-sm font-bold">
        Cover image <span className="font-normal text-muted-foreground">(optional)</span>
      </p>
      <div className="mt-2 flex flex-col gap-4 rounded-lg border border-dashed border-border bg-muted/30 p-4 sm:flex-row sm:items-center">
        <div className="relative aspect-[3/4] w-28 shrink-0 overflow-hidden rounded-lg bg-secondary">
          {displayImageUrl
            ? <Image src={displayImageUrl} alt="Cover image preview" fill sizes="112px" className="object-cover" unoptimized />
            : <div className="flex size-full items-center justify-center text-muted-foreground"><ImagePlus className="size-8" aria-hidden="true" /></div>}
        </div>
        <div className="min-w-0 flex-1">
          <label htmlFor="cover-image-file" className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-semibold hover:border-accent focus-within:ring-2 focus-within:ring-ring">
            <Upload className="size-4" aria-hidden="true" />
            {pendingFile ? 'Choose a different image' : 'Upload cover image'}
            <input
              id="cover-image-file"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-describedby={validationError ? 'cover-image-help cover-image-error' : 'cover-image-help'}
              onChange={(event) => {
                selectFile(event.currentTarget.files?.[0])
                event.currentTarget.value = ''
              }}
              className="sr-only"
            />
          </label>
          {(displayImageUrl || pendingFile) && (
            <button type="button" onClick={() => { onFileChange(null); onRemove(); setValidationError(null) }} className="ml-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-3 text-sm font-semibold text-muted-foreground hover:text-destructive">
              <X className="size-4" aria-hidden="true" /> Remove
            </button>
          )}
          <p id="cover-image-help" className="mt-2 text-xs leading-5 text-muted-foreground">
            Choose a PNG, JPG, or WEBP up to 20 MB. It stays local until you save. Cover art is optional.
          </p>
          {validationError && <p id="cover-image-error" role="alert" className="mt-1 text-xs text-destructive">{validationError}</p>}
          {pendingFile && <p className="mt-1 text-xs font-semibold text-accent">Ready to upload: {pendingFile.name}</p>}
        </div>
      </div>
    </div>
  )
}
