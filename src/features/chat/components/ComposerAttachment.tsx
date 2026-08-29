import type { ApiAttachment } from '@/api/contracts'
import { IClip } from '@/components/icons'
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from '@/components/ui/attachment'

export function ComposerAttachment({
  attachment,
  uploading,
  error,
  onRemove,
}: {
  attachment: ApiAttachment | null
  uploading: boolean
  error: string | null
  onRemove: () => void
}) {
  return <>
    {attachment && (
      <Attachment size="sm" className="mb-2">
        {attachment.kind === 'img' ? (
          <AttachmentMedia variant="image"><img src={attachment.url} alt={attachment.name} /></AttachmentMedia>
        ) : (
          <AttachmentMedia><IClip strokeWidth={1.8} /></AttachmentMedia>
        )}
        <AttachmentContent>
          <AttachmentTitle>{attachment.name}</AttachmentTitle>
          <AttachmentDescription>
            {attachment.mime ?? attachment.kind}{attachment.size ? ` · ${Math.round(attachment.size / 1024)}KB` : ''}
          </AttachmentDescription>
        </AttachmentContent>
        <AttachmentActions>
          <AttachmentAction onClick={onRemove} aria-label={`移除 ${attachment.name}`}>×</AttachmentAction>
        </AttachmentActions>
      </Attachment>
    )}
    {uploading && <div className="mb-2 text-[11.5px] text-ink-500">正在上传…</div>}
    {error && (
      <div className="mb-2 inline-block max-w-full truncate rounded-md bg-coral-soft px-2 py-1 text-[11.5px] text-coral-deep">
        {error}
      </div>
    )}
  </>
}
