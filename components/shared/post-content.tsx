'use client'

import Link from 'next/link'

const URL_PATTERN = /(^|[\s([{])((?:https?:\/\/)[^\s<]+)/gi

function normalizeUrl(url: string) {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return parsed.href
  } catch {
    return null
  }
}

export function PostContent({ content, className = '' }: { content: string; className?: string }) {
  const nodes: React.ReactNode[] = []
  let cursor = 0
  for (const match of content.matchAll(URL_PATTERN)) {
    const matchIndex = match.index ?? 0
    const prefix = match[1]
    const rawUrl = match[2].replace(/[),.!?;:]+$/, '')
    const trailing = match[2].slice(rawUrl.length)
    const href = normalizeUrl(rawUrl)

    nodes.push(content.slice(cursor, matchIndex), prefix)
    if (href) {
      nodes.push(
        <Link
          key={`${matchIndex}-${rawUrl}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all font-semibold text-accent underline underline-offset-2"
          onClick={(event) => event.stopPropagation()}
        >
          {rawUrl}
        </Link>,
      )
    } else {
      nodes.push(rawUrl)
    }
    nodes.push(trailing)
    cursor = matchIndex + match[0].length
  }
  nodes.push(content.slice(cursor))

  return <p className={className}>{nodes}</p>
}
