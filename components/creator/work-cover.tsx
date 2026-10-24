import Image from 'next/image'
import { BookOpen } from 'lucide-react'

export function WorkCover({
  src,
  title,
  className = '',
}: {
  src?: string
  title: string
  className?: string
}) {
  return (
    <span className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-accent/15 text-accent ${className}`}>
      {src ? (
        <Image src={src} alt={`${title} cover`} fill sizes="(max-width: 640px) 25vw, 160px" className="object-cover" unoptimized />
      ) : (
        <BookOpen className="size-7" aria-hidden="true" />
      )}
    </span>
  )
}
