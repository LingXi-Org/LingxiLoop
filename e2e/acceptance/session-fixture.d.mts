import type { Browser } from '@e2e-dev/web'
export function mintSession(role?: 'member'|'student'): Promise<{id:string;cookie:Parameters<Browser['setCookies']>[0][number]}>
export function expireSession(id:string):void
export function pauseTestDatabase(paused:boolean):void
export function messageFacts(text:string):Promise<{acceptances:number;accepted:number;imMessages:number}>
