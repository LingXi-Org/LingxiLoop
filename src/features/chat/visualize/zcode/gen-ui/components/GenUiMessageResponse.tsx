import { lazy, memo, Suspense, useEffect, useMemo } from "react";
import { MessageResponse, type MessageResponseProps } from "@/features/chat/visualize/zcode/components/ai-elements/message.js";
import { useZCodeIntl } from "@/features/chat/visualize/zcode/i18n/IntlProvider.js";
import { projectGenUiReferences } from "../domain/references.js";
import { GenUiLoadingSkeleton } from "./GenUiLoadingSkeleton.js";

// LingxiLoop: prose-only answers do not need the card, its MCP App bridge or page
// host on the thread's critical path. They load once a rendered thread is idle,
// or immediately when an answer references a view.
const loadGenUiCard = () => import("./GenUiCard.js");
const GenUiCard = lazy(() => loadGenUiCard().then((module) => ({ default: module.GenUiCard })));
let cardPrefetched = false;
function prefetchGenUiCard() {
  if (cardPrefetched) return;
  cardPrefetched = true;
  const prefetch = () => { void loadGenUiCard().catch(() => { cardPrefetched = false; }); };
  if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(prefetch, { timeout: 5000 });
  else setTimeout(prefetch, 2000);
}
export const GenUiMessageResponse = memo(function GenUiMessageResponse({
  completed,
  messageKey,
  awaitingDelivery = false,
  ...props
}: MessageResponseProps & { completed: boolean; messageKey: string; awaitingDelivery?: boolean }) {
  const { intl } = useZCodeIntl();
  useEffect(prefetchGenUiCard, []);
  const parts = useMemo(
    () =>
      projectGenUiReferences(typeof props.children === "string" ? props.children : "", completed),
    [props.children, completed],
  );
  const targets = useMemo(
    () =>
      parts.map((part) =>
        part.kind === "ui" && !awaitingDelivery && props.workspacePath && props.sessionId
          ? {
              workspacePath: props.workspacePath,
              workspaceIdentity: props.workspaceIdentity,
              remoteSessionId: props.workspaceRemoteSessionId,
              sessionId: props.sessionId,
              path: part.reference.path,
              instanceKey: `${messageKey}:${(props.textOffset ?? 0) + part.offset}`,
              sourceMessageId: props.sourceMessageId,
            }
          : null,
      ),
    [
      parts,
      awaitingDelivery,
      props.workspacePath,
      props.workspaceIdentity,
      props.workspaceRemoteSessionId,
      props.sessionId,
      messageKey,
      props.sourceMessageId,
      props.textOffset,
    ],
  );
  let cursor = 0;
  const offsets = parts.map(part => {
    if(part.kind !== "text") return 0;
    const offset = props.children.indexOf(part.text,cursor);
    cursor = offset + part.text.length;
    return (props.textOffset ?? 0) + offset;
  });
  return parts.map((part, index) =>
    part.kind === "text" ? (
      <MessageResponse {...props} textOffset={offsets[index]} key={`text:${index}`}>
        {part.text}
      </MessageResponse>
    ) : part.kind === "ui" && targets[index] ? (
      <Suspense key={`${messageKey}:${(props.textOffset ?? 0) + part.offset}`} fallback={<GenUiLoadingSkeleton label={intl.formatMessage({ id: "genUi.waiting" })} className="my-3" />}>
        <GenUiCard reference={part.reference} target={targets[index]!} />
      </Suspense>
    ) : (part.kind === "pending" && props.streaming && !completed)
      || (part.kind === "ui" && completed && awaitingDelivery) ? (
      <GenUiLoadingSkeleton key={`status:${index}`} label={intl.formatMessage({
        id: part.kind === "ui" ? "genUi.awaitingDelivery" : "genUi.waiting",
      })} className="my-3" />
    ) : (
      <div
        key={`status:${index}`}
        className="my-3 rounded-xl border border-panel-border p-3 text-ui-sm text-foreground-subtle"
      >
        {intl.formatMessage({
          id:
            part.kind === "ui" && awaitingDelivery ? "genUi.awaitingDelivery" : part.kind === "pending"
              ? props.streaming
                ? "genUi.waiting"
                : "genUi.incomplete"
              : "genUi.invalid",
        })}
      </div>
    ),
  );
});
