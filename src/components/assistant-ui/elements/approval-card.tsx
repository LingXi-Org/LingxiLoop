"use client";

import { CheckIcon, ShieldCheckIcon, XIcon } from "lucide-react";
import { useRef, useState, type ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { userFacingError } from "@/lib/userFacingError";
import { cn } from "@/lib/utils";
import { conversationCardSize, paper } from "./surfaces";

// Adapted from assistant-ui Elements ApprovalCard for product approvals.
export function ApprovalCard({
  approved, title, summary, context = [], busy = false, onApprove, onDeny, className, ...props
}: Omit<ComponentProps<"div">, "children"> & {
  approved?: boolean;
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
  return <div data-slot="approval-card" aria-busy={disabled}
    className={cn(paper, conversationCardSize.standard, "flex flex-col gap-3.5 rounded-[6px_18px_18px_6px] p-4 text-foreground", className)} {...props}>
    <div className="flex items-center gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-foreground/[0.05] text-muted-foreground">
        <ShieldCheckIcon aria-hidden="true" className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="break-words text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{approved === undefined ? "需要你的审批" : "审批已处理"}</p>
      </div>
    </div>
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs">
      <dt className="text-muted-foreground">操作</dt><dd className="whitespace-pre-wrap break-words">{summary}</dd>
      {context.map(item => <div key={item.label} className="contents"><dt className="text-muted-foreground">{item.label}</dt><dd className="whitespace-pre-wrap break-words">{item.value}</dd></div>)}
    </dl>
    {approved === undefined ? <div className="flex flex-wrap justify-end gap-2">
      {onDeny && <Button type="button" size="sm" variant="outline" disabled={disabled} className="motion-reduce:transition-none" onClick={() => void answer(onDeny)}>
        <XIcon aria-hidden="true" />拒绝
      </Button>}
      {onApprove && <Button type="button" size="sm" disabled={disabled} className="motion-reduce:transition-none" onClick={() => void answer(onApprove)}>
        <CheckIcon aria-hidden="true" />批准并继续
      </Button>}
    </div> : <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
      {approved ? <CheckIcon aria-hidden="true" className="size-3.5 text-primary" /> : <XIcon aria-hidden="true" className="size-3.5" />}
      {approved ? "已批准" : "已拒绝"}
    </p>}
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </div>;
}
