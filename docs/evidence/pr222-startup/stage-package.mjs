import { cpSync, mkdirSync, readFileSync, writeFileSync, symlinkSync } from 'node:fs'
import { resolve } from 'node:path'
const [root, out] = process.argv.slice(2)
mkdirSync(out,{recursive:true})
for (const line of readFileSync(resolve(root,'server/docker/lingxiloop-server.Dockerfile'),'utf8').split(/^FROM /m).at(-1).split('\n')) {
  if (!/^COPY (server |src[ /]|third_party\/zcode )/.test(line)) continue
  const words=line.trim().split(/\s+/).slice(1), dest=words.pop()
  for (const source of words) {
    const to=dest.endsWith('/') ? resolve(out,dest,source.split('/').at(-1)) : resolve(out,dest)
    cpSync(resolve(root,source),to,{recursive:true,filter:p=>!p.includes('/node_modules')&&!p.includes('/__tests__')&&!p.includes('/__integration__')})
  }
}
writeFileSync(resolve(out,'package.json'),readFileSync(resolve(root,'server/package.json')))
symlinkSync(resolve(root,'node_modules'),resolve(out,'node_modules'))
