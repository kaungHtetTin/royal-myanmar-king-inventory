import type { ReactNode, SVGProps } from 'react';

export type IconName =
    | 'adjustments'
    | 'bell'
    | 'box'
    | 'building'
    | 'cash'
    | 'chevronDown'
    | 'chevronLeft'
    | 'chevronRight'
    | 'customers'
    | 'dashboard'
    | 'density'
    | 'logout'
    | 'menu'
    | 'moon'
    | 'plus'
    | 'reports'
    | 'search'
    | 'sales'
    | 'settings'
    | 'sun'
    | 'transfer'
    | 'truck'
    | 'users'
    | 'warehouse'
    | 'warning'
    | 'x';

const iconContent: Record<IconName, ReactNode> = {
    adjustments: (
        <>
            <path d="M4 7h10" />
            <path d="M18 7h2" />
            <path d="M14 4v6" />
            <path d="M4 17h2" />
            <path d="M10 17h10" />
            <path d="M6 14v6" />
        </>
    ),
    bell: (
        <>
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
            <path d="M10 21h4" />
        </>
    ),
    box: (
        <>
            <path d="m21 8-9-5-9 5 9 5 9-5Z" />
            <path d="m3 8 9 5v9" />
            <path d="m21 8-9 5" />
            <path d="M7.5 5.5 16.5 10" />
        </>
    ),
    building: (
        <>
            <path d="M3 21h18" />
            <path d="M6 21V4h9v17" />
            <path d="M15 9h3v12" />
            <path d="M9 8h3" />
            <path d="M9 12h3" />
            <path d="M9 16h3" />
        </>
    ),
    cash: (
        <>
            <rect x="3" y="6" width="18" height="12" rx="2" />
            <path d="M7 10h.01" />
            <path d="M17 14h.01" />
            <circle cx="12" cy="12" r="2" />
        </>
    ),
    chevronDown: <path d="m6 9 6 6 6-6" />,
    chevronLeft: <path d="m15 18-6-6 6-6" />,
    chevronRight: <path d="m9 18 6-6-6-6" />,
    customers: (
        <>
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </>
    ),
    dashboard: (
        <>
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
        </>
    ),
    density: (
        <>
            <path d="M4 6h16" />
            <path d="M4 12h16" />
            <path d="M4 18h16" />
        </>
    ),
    logout: (
        <>
            <path d="M10 17l5-5-5-5" />
            <path d="M15 12H3" />
            <path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5" />
        </>
    ),
    menu: (
        <>
            <path d="M4 6h16" />
            <path d="M4 12h16" />
            <path d="M4 18h16" />
        </>
    ),
    moon: <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />,
    plus: (
        <>
            <path d="M12 5v14" />
            <path d="M5 12h14" />
        </>
    ),
    reports: (
        <>
            <path d="M4 19V9" />
            <path d="M10 19V5" />
            <path d="M16 19v-7" />
            <path d="M22 19H2" />
        </>
    ),
    search: (
        <>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-4-4" />
        </>
    ),
    sales: (
        <>
            <path d="M3 3v18h18" />
            <path d="m7 15 4-4 3 3 5-6" />
        </>
    ),
    settings: (
        <>
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21H9.6v-.1A1.7 1.7 0 0 0 8.5 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3V9.6h.1A1.7 1.7 0 0 0 4.6 8.5a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.1A1.7 1.7 0 0 0 15.5 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.36.27.58.68.6 1.1v.3h1v3.2h-1.1a1.7 1.7 0 0 0-.5 1.4Z" />
        </>
    ),
    sun: (
        <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2" />
            <path d="M12 20v2" />
            <path d="m4.93 4.93 1.42 1.42" />
            <path d="m17.66 17.66 1.41 1.41" />
            <path d="M2 12h2" />
            <path d="M20 12h2" />
            <path d="m6.34 17.66-1.41 1.41" />
            <path d="m19.07 4.93-1.41 1.41" />
        </>
    ),
    transfer: (
        <>
            <path d="M17 3l4 4-4 4" />
            <path d="M3 7h18" />
            <path d="m7 21-4-4 4-4" />
            <path d="M21 17H3" />
        </>
    ),
    truck: (
        <>
            <path d="M10 17h4V5H2v12h3" />
            <path d="M14 9h4l4 4v4h-3" />
            <circle cx="7.5" cy="17.5" r="2.5" />
            <circle cx="16.5" cy="17.5" r="2.5" />
        </>
    ),
    users: (
        <>
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="8.5" cy="7" r="4" />
            <path d="M20 8v6" />
            <path d="M23 11h-6" />
        </>
    ),
    warehouse: (
        <>
            <path d="m3 10 9-7 9 7" />
            <path d="M5 9v12h14V9" />
            <path d="M8 21v-7h8v7" />
            <path d="M8 10h8" />
        </>
    ),
    warning: (
        <>
            <path d="M10.3 3.6 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0Z" />
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
        </>
    ),
    x: (
        <>
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
        </>
    ),
};

type IconProps = SVGProps<SVGSVGElement> & {
    name: IconName;
    size?: number;
};

export function Icon({ name, size = 18, ...props }: IconProps) {
    return (
        <svg
            aria-hidden="true"
            fill="none"
            height={size}
            viewBox="0 0 24 24"
            width={size}
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
            {...props}
        >
            {iconContent[name]}
        </svg>
    );
}
