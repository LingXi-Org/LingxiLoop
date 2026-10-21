import type { GenUiDocument, GenUiStateChange, GenUiStateTarget, GenUiWidgetState } from '../zcode/shared/gen-ui/index.js'
export type McpAppsStyleVariables = Record<string, string>
export type PluginSandboxTransportPort = MessagePort
export type SandboxPreparationProgress = { stage: 'page' } | { stage: 'resources'; pending: string[] }
export interface PluginSandboxHandle { sandboxId: string; initId: string; shellUrl: string; partition: string }
export interface PluginSandboxPlatformPort {
  getOwnerWebContentsId(): Promise<number>
  onPorts(listener: (event: { sandboxId: string; initId: string; port: MessagePort }) => void): () => void
  consumeUserGesture(sandboxId: string): Promise<boolean>
  consumeHostUserGesture(sandboxId: string): Promise<boolean>
  disposeSandbox(sandboxId: string, initId: string): Promise<void>
  copyImage(input: { sandboxId: string; initId: string; viewportSize: {width: number; height: number}; captureRect: {x: number; y: number; width: number; height: number} }): Promise<void>
}
export interface IGenUiService {
  readDocument(target: GenUiStateTarget, signal?: AbortSignal): Promise<GenUiDocument>
  prepareSandbox(input: GenUiStateTarget & { html: string; instanceKey: string; ownerWebContentsId: number }, signal?: AbortSignal, onProgress?: (progress: SandboxPreparationProgress) => void): Promise<PluginSandboxHandle>
  getState(target: GenUiStateTarget, signal?: AbortSignal): Promise<GenUiWidgetState | null>
  setState(input: {target: GenUiStateTarget; state: GenUiWidgetState}): Promise<void>
  onStateChanged(listener: (change: GenUiStateChange) => void): {dispose(): void}
  validate(): Promise<void>
}
