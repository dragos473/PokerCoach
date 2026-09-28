import { BookIcon, FunctionIcon, GridIcon, HomeIcon, PercentIcon, SettingsIcon, TableIcon } from '../components/icons'

export const NAV = [
  { path: '/', label: 'Home', icon: HomeIcon, hotkey: 'nav.home', mobile: true },
  { path: '/ranges', label: 'Ranges', icon: GridIcon, hotkey: 'nav.ranges', mobile: true },
  { path: '/odds', label: 'Odds lab', icon: PercentIcon, hotkey: 'nav.odds', mobile: true },
  { path: '/lessons', label: 'Lessons', icon: BookIcon, hotkey: 'nav.lessons', mobile: true },
  { path: '/freeplay', label: 'Freeplay', icon: TableIcon, hotkey: 'nav.freeplay', mobile: true },
  { path: '/formulas', label: 'Formulas', icon: FunctionIcon, hotkey: undefined, mobile: false },
  { path: '/settings', label: 'Settings', icon: SettingsIcon, hotkey: 'nav.settings', mobile: false },
] as const
