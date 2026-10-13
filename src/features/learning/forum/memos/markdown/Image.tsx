// Adapted from Memos MemoContent/markdown/Image + image-preview flow (MIT). See ../README.md.
import { useRef, useState, type ImgHTMLAttributes } from 'react'
import type { ExtraProps } from 'react-markdown'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { markdownStyles } from '../markdownStyles'

export function Image({ node: _node, className, alt = '正文图片', ...props }: ImgHTMLAttributes<HTMLImageElement> & ExtraProps) {
  const [open, setOpen] = useState(false), trigger = useRef<HTMLButtonElement>(null)
  return <><Button ref={trigger} type="button" variant="ghost" className="inline h-auto max-w-full p-0" aria-label={`预览图片：${alt}`} onClick={() => setOpen(true)}>
    <img {...props} alt={alt} className={cn(markdownStyles.image, 'h-auto', className)} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
  </Button><Dialog open={open} onOpenChange={setOpen}><DialogContent className="sm:max-w-4xl" onCloseAutoFocus={event => { event.preventDefault(); trigger.current?.focus() }}>
    <DialogHeader className="pe-8"><DialogTitle>{alt}</DialogTitle><DialogDescription>图片预览</DialogDescription></DialogHeader>
    <img src={props.src} alt={alt} referrerPolicy="no-referrer" className="mx-auto max-h-[70dvh] max-w-full object-contain" />
  </DialogContent></Dialog></>
}
