import { create } from 'zustand'

export const SETTINGS_DIALOG_TRIGGER_ID = 'lingxiloop-settings-trigger'

export type SettingsSectionId =
  | 'account'
  | 'appearance-sound'
  | 'notifications'
  | 'updates'
  | 'data-account'

interface SettingsDialogState {
  open: boolean
  activeSection: SettingsSectionId
  openDialog: (section?: SettingsSectionId) => void
  setOpen: (open: boolean) => void
  setActiveSection: (section: SettingsSectionId) => void
}

export const useSettingsDialog = create<SettingsDialogState>((set) => ({
  open: false,
  activeSection: 'account',
  openDialog: (activeSection = 'account') => set({ open: true, activeSection }),
  setOpen: (open) => set({ open }),
  setActiveSection: (activeSection) => set({ activeSection }),
}))

export function openSettingsDialog(section: SettingsSectionId = 'account'): void {
  useSettingsDialog.getState().openDialog(section)
}
