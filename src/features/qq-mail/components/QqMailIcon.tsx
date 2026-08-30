import type { SVGProps } from 'react'

export function QqMailIcon({ width = 18, height = 18, ...props }: SVGProps<SVGSVGElement>) {
  return <svg width={width} height={height} viewBox="0 0 24 24" fill="none"
    data-provider-icon="qq-mail"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
    {...props}>
    <path d="M8.2 10.1c0-4.4 1.5-7.1 3.8-7.1s3.8 2.7 3.8 7.1c0 .9-.1 1.7-.3 2.5" />
    <path d="M8.5 8.8c-2 1.6-3.2 4.6-3.2 7.3 0 2.8 2.7 4.9 6.7 4.9s6.7-2.1 6.7-4.9c0-2.7-1.2-5.7-3.2-7.3" />
    <path d="M8.1 13.4c.9 1 2.2 1.6 3.9 1.6s3-.6 3.9-1.6M8.3 21l-1.8 1M15.7 21l1.8 1" />
    <circle cx="10.5" cy="8.5" r=".65" fill="currentColor" stroke="none" />
    <circle cx="13.5" cy="8.5" r=".65" fill="currentColor" stroke="none" />
    <path d="m11.1 10.6.9.6.9-.6" />
  </svg>
}
