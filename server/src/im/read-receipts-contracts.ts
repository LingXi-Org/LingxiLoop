export interface ReadReceiptAdvance {
  companyId: string
  channelId: string
  readerId: string
  previousReadSeq: number
  readThroughSeq: number
  readAt: string
}
