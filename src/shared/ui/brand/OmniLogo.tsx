import type { SVGProps } from 'react'

type OmniLogoProps = SVGProps<SVGSVGElement> & {
  size?: number
}

export function OmniLogo({ size = 24, ...props }: OmniLogoProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        d="M17 15.5h30A7.5 7.5 0 0 1 54.5 23v18A7.5 7.5 0 0 1 47 48.5H17A7.5 7.5 0 0 1 9.5 41V23a7.5 7.5 0 0 1 7.5-7.5Z"
        stroke="currentColor"
        strokeWidth="4.5"
      />
      <path
        d="m13 21 15.1 11.9a6.3 6.3 0 0 0 7.8 0L51 21"
        stroke="currentColor"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M21.5 9.5h21"
        stroke="currentColor"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
    </svg>
  )
}
