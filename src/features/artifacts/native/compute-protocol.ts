import type {PenGeometry} from '../../../../shared/artifact-pen'
export interface Point { x: number; y: number }
export interface Rect extends Point { width: number; height: number }
export interface Bounds extends Rect { id: string }
export interface MathResult { html: string; error?: string }
export interface BoundsIssue { id: string; code: 'non_finite' | 'negative_size' | 'duplicate_id' }
export type ThemeTokens = Record<string, string | number>
export interface ThemeResult {
  tokens: ThemeTokens
  issues: { key: string; code: 'missing_token' | 'cyclic_token' }[]
}

export type ComputeTask =
  | { kind: 'pages'; pages: Bounds[] }
  | { kind: 'update-pages'; upserts: Bounds[]; removed: string[] }
  | { kind: 'visible'; viewport: Rect }
  | { kind: 'snap'; point: Point; tolerance: number }
  | { kind: 'elements'; pageId: string; elements: Bounds[] }
  | { kind: 'update-elements'; pageId: string; upserts: Bounds[]; removed: string[] }
  | { kind: 'drop-elements'; pageId: string }
  | { kind: 'visible-elements'; pageId: string; viewport: Rect }
  | { kind: 'validate-bounds'; elements: Bounds[] }
  | { kind: 'resolve-theme'; tokens: ThemeTokens }
  | { kind: 'math'; source: string; display: boolean }
  | { kind: 'pen'; points:Point[]; tolerance:number }

export type ComputeRequest = { id: number; revision: number; task: ComputeTask }
export type ComputeMessage = ComputeRequest | { cancel: number }
export type ComputeValue = null | string[] | Point | MathResult | BoundsIssue[] | ThemeResult | PenGeometry
export type ComputeResponse = { id: number; revision: number; value?: ComputeValue; error?: string }
