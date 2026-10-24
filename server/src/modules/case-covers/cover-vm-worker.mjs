// Fixed Worker bootstrap; no generated code is evaluated by Node/tsx.
import { register } from 'tsx/esm/api'
register({ tsconfig: false })
await import('./cover-vm-worker.ts')
