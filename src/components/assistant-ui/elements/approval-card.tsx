"use client";
import { MessageFooterContents } from '../message-footer';

import { useRef, useState, type ComponentProps, type ReactNode } from "react";
import { userFacingError } from "@/lib/userFacingError";
import { cn } from "@/lib/utils";

/** The ticket's perforation: two notches and a dashed tear line between content and actions. */
export function TicketTear() {
  return <div aria-hidden="true" className="relative h-[22px] shrink-0">
    <span className="absolute -start-[11px] top-0 size-[22px] rounded-full bg-background shadow-[inset_-1px_0_0_var(--border)]" />
    <span className="absolute -end-[11px] top-0 size-[22px] rounded-full bg-background shadow-[inset_1px_0_0_var(--border)]" />
    <span className="absolute inset-x-[18px] top-[10.5px] border-t-[1.5px] border-dashed border-input" />
  </div>;
}

/** Shared shell for everything that needs the user's hand: approvals, forms, surveys, votes. */
export function ActionTicket({ kind, status, title, subtitle, children, footer, className, ...props }: Omit<ComponentProps<"div">, "title"> & {
  kind: ReactNode; status?: ReactNode; title: ReactNode; subtitle?: ReactNode; footer?: ReactNode;
}) {
  return <div data-slot="action-ticket" className={cn("action-ticket relative flex w-full max-w-[640px] flex-col overflow-hidden rounded-2xl bg-card text-foreground", className)} {...props}>
    <div className="flex flex-col gap-2.5 px-[18px] pb-1.5 pt-4">
      <div className="flex items-center gap-2">
        <span className="inline-flex flex-1 items-center gap-1.5 text-xs text-muted-foreground">{kind}</span>
        {status}
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-base font-semibold tracking-[-0.01em]">{title}</span>
        {subtitle && <span className="text-[13px] text-fg2 [overflow-wrap:anywhere]">{subtitle}</span>}
      </div>
      {children}
    </div>
    {footer && <><TicketTear /><div className="flex min-h-[34px] flex-wrap items-center gap-2 pb-3.5 pe-3.5 ps-[18px]">{footer}</div></>}
  </div>;
}

export function TicketFields({ fields }: { fields: { label: string; value: string }[] }) {
  if (!fields.length) return null;
  return <dl className="flex flex-wrap gap-y-2">
    {fields.map((field, index) => <div key={field.label} className={cn("flex min-w-0 flex-1 basis-32 flex-col gap-0.5 px-3.5", index === 0 ? "ps-0" : "border-s border-border")}>
      <dt className="text-[11.5px] text-muted-foreground">{field.label}</dt>
      <dd className="whitespace-pre-wrap text-[13px] [overflow-wrap:anywhere]">{field.value}</dd>
    </div>)}
  </dl>;
}

export const ticketPrimary = "inline-flex h-[34px] items-center justify-center gap-2 rounded-[10px] bg-brand px-3.5 text-[13.5px] font-medium text-brand-foreground shadow-[0_2px_6px_rgb(46_125_91/25%)] hover:bg-[color-mix(in_srgb,var(--brand)_90%,var(--foreground))] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40 max-md:min-h-11";
export const ticketGhost = "inline-flex h-[30px] items-center rounded-[9px] px-2.5 text-[13px] font-medium text-fg2 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40 max-md:min-h-11";

const shieldIcon = <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-3.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></svg>;

// Adapted from assistant-ui Elements ApprovalCard for product approvals.
export function ApprovalCard({
  approved, statusLabel, title, summary, context = [], busy = false, onApprove, onDeny, className, ...props
}: Omit<ComponentProps<"div">, "children"> & {
  approved?: boolean;
  statusLabel?: string;
  title: string;
  summary: string;
  context?: { label: string; value: string }[];
  busy?: boolean;
  onApprove?: () => unknown | Promise<unknown>;
  onDeny?: () => unknown | Promise<unknown>;
}) {
  const submitting = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const disabled = busy || pending;
  async function answer(action: () => unknown | Promise<unknown>) {
    if (submitting.current || busy) return;
    submitting.current = true;
    setPending(true);
    setError(null);
    try { await action(); }
    catch (cause) { setError(userFacingError(cause, "审批提交失败，请重试。")); }
    finally { submitting.current = false; setPending(false); }
  }
  const status = approved === undefined
    ? <span className="inline-flex items-center gap-1.5 text-xs text-warning"><span className="size-[7px] rounded-full bg-warning shadow-[0_0_0_3px_var(--warning-surface)]" />等待你批准</span>
    : <span className={cn("text-xs", approved ? "text-brand" : "text-muted-foreground")}>{statusLabel ?? (approved ? "已批准" : "已拒绝")}</span>;
  return <div data-slot="approval-card" aria-busy={disabled} className={cn("w-full max-w-[640px]", className)} {...props}>
    <MessageFooterContents>
      <ActionTicket kind={<>{shieldIcon}需要批准</>} status={status} title={title} subtitle={summary}
        footer={approved === undefined && (onApprove || onDeny) ? <>
          <span className="inline-flex flex-1 items-center gap-1.5 text-xs text-warning">{error ? <span role="alert" className="text-destructive">{error}</span> : "批准后智能助教会继续执行"}</span>
          {onDeny && <button type="button" className={ticketGhost} disabled={disabled} onClick={() => void answer(onDeny)}>拒绝</button>}
          {onApprove && <button type="button" className={ticketPrimary} disabled={disabled} onClick={() => void answer(onApprove)}>批准并继续</button>}
        </> : undefined}>
        <TicketFields fields={context} />
        {approved !== undefined && <p role="status" className="sr-only">{statusLabel ?? (approved ? "已批准" : "已拒绝")}</p>}
      </ActionTicket>
    </MessageFooterContents>
  </div>;
}
