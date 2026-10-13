import { defineConfig, mergeConfig } from 'vite'
import compression from 'compression'
import config from '../../vite.config'

// Match the production Web server's compression, keeping the ordinary app entry.
export default mergeConfig(config, defineConfig({
  build: { manifest: true },
  plugins: [{
    name: 'perf-evidence',
    configurePreviewServer(server) { server.middlewares.use(compression()) },
    generateBundle(_, bundle) {
      this.emitFile({ type: 'asset', fileName: 'perf-blank.html', source: '<!doctype html><title>Performance instrumentation</title>' })
      const chunks = Object.values(bundle).filter(item => item.type === 'chunk').map(chunk => ({
        file: chunk.fileName, imports: chunk.imports, dynamicImports: chunk.dynamicImports,
        modules: Object.entries(chunk.modules).map(([id, module]) => ({ id: id.replaceAll('\\', '/').replace(`${process.cwd().replaceAll('\\', '/')}/`, ''), bytes: module.renderedLength })),
      }))
      this.emitFile({ type: 'asset', fileName: 'chunk-modules.json', source: JSON.stringify(chunks) })
    },
  }],
}))
