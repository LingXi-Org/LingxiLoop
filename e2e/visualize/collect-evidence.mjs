import {copyFile,mkdir,readFile,readdir,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {basename,join,resolve} from 'node:path'

const source=resolve(process.argv[2]??'.e2e/visualize')
const destination=resolve(process.argv[3]??'docs/evidence/issue-193/browser')
await mkdir(destination,{recursive:true})
const copied=[]
async function copy(from,to){await mkdir(resolve(to,'..'),{recursive:true});await copyFile(from,to);copied.push({path:to,sha256:createHash('sha256').update(await readFile(to)).digest('hex')})}
await copy(join(source,'report.json'),join(destination,'report.json'))
for(const file of ['summary.md','junit.xml'])try{await copy(join(source,file),join(destination,file))}catch(error){if(error.code!=='ENOENT')throw error}
async function walk(directory){const entries=await readdir(directory,{withFileTypes:true});for(const entry of entries){const file=join(directory,entry.name);if(entry.isDirectory())await walk(file);else if(entry.name.endsWith('.png'))await copy(file,join(destination,'screenshots',basename(file)))}}
try{await walk(join(source,'artifacts'))}catch(error){if(error.code!=='ENOENT')throw error}
for(const name of await readdir(source))if(name.endsWith('-interaction.json'))await copy(join(source,name),join(destination,name))
for(const name of ['manifest.json','export.html'])await copy(join('e2e/visualize/generated',name),join(destination,name))
await writeFile(join(destination,'files.json'),JSON.stringify(copied,null,2)+'\n')
console.log(JSON.stringify({source,destination,files:copied.length}))
