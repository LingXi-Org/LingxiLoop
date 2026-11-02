import type { DiagramPlugin } from '@streamdown/mermaid'

let plugin: Promise<DiagramPlugin> | undefined

export const mermaid: DiagramPlugin = {
  name: 'mermaid', type: 'diagram', language: 'mermaid',
  getMermaid(config) {
    return {
      initialize(next) { config = next },
      async render(id, source) {
        const requestedConfig = config
        // The installed plugin imports Mermaid eagerly; prose must not download it.
        plugin ??= import('@streamdown/mermaid')
          .then(({ createMermaidPlugin }) => createMermaidPlugin({ config: { securityLevel: 'strict', startOnLoad: false } }))
          .catch(error => { plugin = undefined; throw error })
        return (await plugin).getMermaid(requestedConfig).render(id, source)
      },
    }
  },
}
