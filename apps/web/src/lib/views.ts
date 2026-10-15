export const views = ['Chat', 'Incidents', 'Overview', 'Approvals', 'Eval'] as const
export type View = (typeof views)[number]

// One colour per demo person, so their avatar stays the same everywhere.
export const avatarTone = ['#5b57d6', '#17a673', '#e8960f', '#e5404f', '#7c4ff0']
