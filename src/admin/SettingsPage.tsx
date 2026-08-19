/**
 * Global toggles. Each toggle is a single boolean call to /settings.
 * Renders pessimistically — disable the row while the request flies so
 * a fast double-click doesn't race the server.
 */
import { useEffect, useState } from 'react'
import { adminApi, type AdminSettings } from './api'

export function SettingsPage() {
  const [s, setS] = useState<AdminSettings | null>(null)
  const [busyKey, setBusyKey] = useState<keyof AdminSettings | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    adminApi.settings()
      .then(setS)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
  }, [])

  const flip = async (key: keyof AdminSettings) => {
    if (!s || busyKey) return
    setBusyKey(key); setErr(null)
    try {
      const next = await adminApi.setSettings({ [key]: !s[key] })
      setS(next)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally { setBusyKey(null) }
  }

  return (
    <div className="admin-page">
      <header className="admin-page-head">
        <div>
          <h1 className="admin-h1">设置</h1>
          <div className="admin-sub">全局切换。更改立即生效。</div>
        </div>
      </header>

      {err && <div className="admin-banner-err">{err}</div>}

      <div className="admin-settings">
        <SettingRow
          title="候补名单"
          desc="When ON, new OAuth signups land on the waitlist instead of creating an account. Existing users sign in normally. Bootstrap admins (env allow-list) bypass the gate."
          on={!!s?.waitlist_enabled}
          busy={busyKey === 'waitlist_enabled'}
          disabled={!s}
          onToggle={() => void flip('waitlist_enabled')}
        />
        <SettingRow
          title="注册已暂停"
          desc="When ON, the waitlist itself also stops accepting new entries — useful for emergencies (LLM bill spike, prod incident). Existing waitlist entries can still be approved."
          on={!!s?.signups_paused}
          busy={busyKey === 'signups_paused'}
          disabled={!s}
          onToggle={() => void flip('signups_paused')}
        />
      </div>
    </div>
  )
}

function SettingRow({ title, desc, on, busy, disabled, onToggle }: {
  title: string; desc: string; on: boolean; busy: boolean; disabled: boolean; onToggle: () => void
}) {
  return (
    <div className="admin-setting">
      <div>
        <div className="admin-setting-title">{title}</div>
        <div className="admin-setting-desc">{desc}</div>
      </div>
      <button
        className={`admin-switch${on ? ' is-on' : ''}`}
        onClick={onToggle}
        disabled={disabled || busy}
        aria-pressed={on}
      >
        <span className="admin-switch-thumb" />
      </button>
    </div>
  )
}
