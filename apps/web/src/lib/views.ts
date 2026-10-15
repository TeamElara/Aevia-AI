export const views = ['Chat', 'Incidents', 'Overview', 'Approvals', 'Eval', 'Warnings'] as const
export type View = (typeof views)[number]

// One colour per demo person, so their avatar stays the same everywhere.
export const avatarTone = ['#4c5d68', '#5f686e', '#485c60', '#65717a', '#555e65']
