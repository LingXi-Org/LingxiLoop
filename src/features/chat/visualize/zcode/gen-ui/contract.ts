import type { GenUiStateTarget, GenUiTweak, GenUiTweakValues } from "@/features/chat/visualize/zcode/shared/gen-ui";
export { collectGenUiSourcePaths, matchesGenUiSourcePath } from "@/features/chat/visualize/zcode/gen-ui/domain/sourceFiles.js";
export interface GenUiCardTarget extends GenUiStateTarget {
  remoteSessionId?: string;
  instanceKey: string;
  sourceMessageId?: string;
}
export interface GenUiPageSnapshot {
  tweakSubmission: { fingerprint: string; status: "sending" | "accepted" | "unconfirmed" } | null;
  phase: "loading" | "ready" | "error";
  height: number;
  error?: string;
  tweak: GenUiTweak | null;
  groups: GenUiTweak[];
  tweakValues: GenUiTweakValues;
  previewOriginal: boolean;
  hovered: boolean;
  escapeSequence: number;
}
export const EMPTY_GEN_UI_SNAPSHOT: GenUiPageSnapshot = {
  tweakSubmission: null,
  phase: "loading",
  height: 240,
  tweak: null,
  groups: [],
  tweakValues: {},
  previewOriginal: false,
  hovered: false,
  escapeSequence: 0,
};
export const tweakFingerprint = (values: GenUiTweakValues) => JSON.stringify(Object.entries(values).sort(([left], [right]) => left.localeCompare(right)));
export interface GenUiPage {
  subscribe(listener: () => void): () => void;
  getSnapshot(): GenUiPageSnapshot;
  bind(node: HTMLElement, expanded?: boolean): () => void;
  preview(node: HTMLElement | null): void;
  focus(): void;
  copyImage(): Promise<void>;
  sendFollowUp(prompt: string, title?: string): Promise<void>;
  setTweaks(values: GenUiTweakValues): void;
  previewTweaks(original: boolean): void;
  submitTweaks(values: GenUiTweakValues): Promise<void>;
  isBusy(): boolean;
  dispose(): Promise<void>;
}
