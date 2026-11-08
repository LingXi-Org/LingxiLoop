import PptxGenJS from 'pptxgenjs'

export interface PptxCommand { kind: 'text' | 'shape' | 'table' | 'image'; args: unknown[] }
export interface PptxPage { notes: string; hidden: boolean; background: string; commands: PptxCommand[] }
export interface PptxJob { title: string; subject: string; width: number; height: number; pages: PptxPage[] }
const scope = globalThis as unknown as { onmessage: ((event: MessageEvent<PptxJob>) => void) | null; postMessage: (value: unknown, transfer?: Transferable[]) => void }
scope.onmessage = async event => {
  try {
    const input = event.data, deck = new PptxGenJS()
    deck.author = 'LingxiLoop'; deck.title = input.title; deck.subject = input.subject
    deck.defineLayout({ name: 'LINGXI', width: input.width, height: input.height }); deck.layout = 'LINGXI'
    for (const page of input.pages) {
      const slide = deck.addSlide()
      slide.background = { color: page.background }; slide.hidden = page.hidden
      if (page.notes) slide.addNotes(page.notes)
      for (const command of page.commands) {
        if (command.kind === 'text') slide.addText(...command.args as Parameters<typeof slide.addText>)
        if (command.kind === 'shape') slide.addShape(...command.args as Parameters<typeof slide.addShape>)
        if (command.kind === 'table') slide.addTable(...command.args as Parameters<typeof slide.addTable>)
        if (command.kind === 'image') slide.addImage(...command.args as Parameters<typeof slide.addImage>)
      }
    }
    const bytes = await deck.write({ outputType: 'arraybuffer', compression: true }) as ArrayBuffer
    scope.postMessage({ bytes }, [bytes])
  } catch (error) { scope.postMessage({ error: error instanceof Error ? error.message : '演示文稿导出失败。' }) }
}
