import type { ServerResponse } from 'node:http'
import { dirname, join } from 'node:path'

/** HTML entrypoints must revalidate after releases replace their hashed chunks. */
export function setStaticCacheHeaders(res: ServerResponse, filePath: string, distDir: string) {
  if (filePath.endsWith('.html')) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
  } else if (dirname(filePath) === join(distDir, 'assets') && /-[\w-]{8,}\.[^.]+$/.test(filePath)) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
  }
}
