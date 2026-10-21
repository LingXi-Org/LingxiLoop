import { create } from 'zustand'

export const SETTINGS_DIALOG_TRIGGER_ID = 'lingxiloop-settings-trigger'

export type SettingsSectionId =
  | 'account'
  | 'appearance-sound'
  | 'notifications'
  | 'data-account'

interface SettingsDialogState {
  open: boolean
  activeSection: SettingsSectionId
  dataAccountEpoch: number
  openDialog: (section?: SettingsSectionId) => void
  setOpen: (open: boolean) => void
  setActiveSection: (section: SettingsSectionId) => void
}

function dataAccountTransition(state: SettingsDialogState, patch: Partial<Pick<SettingsDialogState, 'open' | 'activeSection'>>) {
  const next = { ...state, ...patch }
  const visible = (value: Pick<SettingsDialogState, 'open' | 'activeSection'>) => value.open && value.activeSection === 'data-account'
  return { ...patch, dataAccountEpoch: state.dataAccountEpoch + Number(visible(state) !== visible(next)) }
}

export const useSettingsDialog = create<SettingsDialogState>((set) => ({
  open: false,
  activeSection: 'account',
  dataAccountEpoch: 0,
  openDialog: (activeSection = 'account') => set(state => dataAccountTransition(state, { open: true, activeSection })),
  setOpen: (open) => set(state => dataAccountTransition(state, { open })),
  setActiveSection: (activeSection) => set(state => dataAccountTransition(state, { activeSection })),
}))

export function openSettingsDialog(section: SettingsSectionId = 'account'): void {
  useSettingsDialog.getState().openDialog(section)
}
