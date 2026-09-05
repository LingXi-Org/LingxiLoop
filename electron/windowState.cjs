/* eslint-env node */

const DEFAULT_WINDOW_STATE = {
  width: 1480,
  height: 920,
  fullscreen: false,
  maximized: false,
}

function createWindowStateStore({ fs, filePath, displays, warn = console.warn }) {
  return {
    read() {
      try {
        const parsed = JSON.parse(fs.readFileSync(filePath(), 'utf8'))
        return typeof parsed === 'object' && parsed !== null ? parsed : null
      } catch {
        return null
      }
    },
    write(state) {
      try {
        fs.writeFileSync(filePath(), JSON.stringify(state))
      } catch (error) {
        warn('[window-state] save failed', error?.message || error)
      }
    },
    visibleRect(saved) {
      if (!saved || typeof saved.x !== 'number' || typeof saved.y !== 'number'
        || typeof saved.width !== 'number' || typeof saved.height !== 'number') return null
      const rect = { x: saved.x, y: saved.y, width: saved.width, height: saved.height }
      for (const display of displays()) {
        const workArea = display.workArea
        const intersectionWidth = Math.min(rect.x + rect.width, workArea.x + workArea.width)
          - Math.max(rect.x, workArea.x)
        const intersectionHeight = Math.min(rect.y + rect.height, workArea.y + workArea.height)
          - Math.max(rect.y, workArea.y)
        if (intersectionWidth >= 80 && intersectionHeight >= 80) return rect
      }
      return null
    },
  }
}

module.exports = { DEFAULT_WINDOW_STATE, createWindowStateStore }
