'use client'

import Image from 'next/image'
import { UserRound } from 'lucide-react'

export function ProfileAvatar({
  src,
  name,
  className = 'size-10',
  imageSizes = '40px',
}: {
  src?: string | null
  name: string
  className?: string
  imageSizes?: string
}) {
  return (
    <span className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary text-accent ${className}`}>
      {src ? (
        <Image src={src} alt={`${name}'s profile picture`} fill sizes={imageSizes} className="object-cover" unoptimized />
      ) : (
        <span aria-hidden="true" className="text-sm font-bold">{name.trim().slice(0, 1).toLocaleUpperCase() || <UserRound className="size-1/2" />}</span>
      )}
    </span>
  )
}
