import type { SVGProps } from 'react'

export function NaverMailIcon({ width = 18, height = 18, ...props }: SVGProps<SVGSVGElement>) {
  return <svg width={width} height={height} viewBox="0 0 24 24" fill="none"
    data-provider-icon="naver-mail"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
    {...props}>
    <rect x="3" y="4" width="18" height="16" rx="3" />
    <path d="m7.5 16.5 4-9 5 9v-9" />
  </svg>
}
