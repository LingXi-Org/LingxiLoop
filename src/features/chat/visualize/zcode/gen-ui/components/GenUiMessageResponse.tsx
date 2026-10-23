import { memo, useMemo } from "react";
import { MessageResponse, type MessageResponseProps } from "@/features/chat/visualize/zcode/components/ai-elements/message.js";
import { useZCodeIntl } from "@/features/chat/visualize/zcode/i18n/IntlProvider.js";
import { projectGenUiReferences } from "../domain/references.js";
import { GenUiCard } from "./GenUiCard.js";
export const GenUiMessageResponse = memo(function GenUiMessageResponse({
  completed,
  messageKey,
  awaitingDelivery = false,
  ...props
}: MessageResponseProps & { completed: boolean; messageKey: string; awaitingDelivery?: boolean }) {
  const { intl } = useZCodeIntl();
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
              instanceKey: `${messageKey}:${part.offset}`,
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
      <GenUiCard
        key={`${messageKey}:${part.offset}`}
        reference={part.reference}
        target={targets[index]!}
      />
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
