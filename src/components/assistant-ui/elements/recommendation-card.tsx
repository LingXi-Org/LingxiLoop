"use client";

import { CheckIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ActionTicket, ticketGhost, ticketPrimary } from "./approval-card";

export type RecommendationState = "idle" | "accepted";


export function RecommendationCard({
  state,
  question,
  children,
  confidenceLabel,
  acceptedLabel,
  onAccept,
  onAlternatives,
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  | "state"
  | "question"
  | "children"
  | "confidenceLabel"
  | "acceptedLabel"
  | "onAccept"
  | "onAlternatives"
> & {
  state: RecommendationState;
  question: string;
  children: ReactNode;
  confidenceLabel: string;
  acceptedLabel: string;
  onAccept?: () => void;
  onAlternatives?: () => void;
}) {
  const icon = <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-3.5"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" /></svg>;
  return (
    <div data-slot="recommendation-card" className={cn("w-full max-w-[640px]", className)} {...props}>
      <ActionTicket kind={<>{icon}下一步建议 · {confidenceLabel}</>} title={question} subtitle={children}
        footer={state === "idle" ? <>
          <span className="flex-1" />
          {onAlternatives && <button type="button" onClick={onAlternatives} className={ticketGhost}>换一个建议</button>}
          <button type="button" onClick={onAccept} className={ticketPrimary}>开始</button>
        </> : <div key="accepted" role="status" className="fade-in animate-in flex items-center gap-2 text-xs text-muted-foreground duration-300">
          <CheckIcon className="size-3.5 text-brand" />{acceptedLabel}
        </div>} />
    </div>
  );
}
