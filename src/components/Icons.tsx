// Small line icons drawn inline so they look the same on every phone (emoji do not).

interface IconProps {
  size?: number
}

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
})

export const FlameIcon = ({ size = 24 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5 1-8.5Z" />
  </svg>
)

export const BalanceIcon = ({ size = 24 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M12 4v16M7 20h10M5 8h14M5 8l-2.5 6a3 3 0 0 0 5 0L5 8Zm14 0-2.5 6a3 3 0 0 0 5 0L19 8Z" />
  </svg>
)

export const DumbbellIcon = ({ size = 24 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11" />
  </svg>
)

export const ArrowLeftIcon = ({ size = 20 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M15 18l-6-6 6-6" />
  </svg>
)

export const ArrowRightIcon = ({ size = 20 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M9 18l6-6-6-6" />
  </svg>
)

export const CheckIcon = ({ size = 20 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
)

export const AlertIcon = ({ size = 18 }: IconProps) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5.5M12 16.5v.01" />
  </svg>
)

export const TrashIcon = ({ size = 18 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13" />
  </svg>
)
