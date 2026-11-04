import assert from 'node:assert/strict'
import test from 'node:test'
import { checkedDesignBoardPaths } from './check.js'

const file = (path:string,body:string) => ({path,body:Buffer.from(body)})
test('checked authorship proof excludes removed or unindexed boards despite existing old boards',()=>{
  const rows = [file('project/canvas.json',JSON.stringify({boards:{'Old.dc.html':{}}})),file('project/Old.dc.html','<x-dc>Old</x-dc>'),file('project/New.dc.html','<x-dc>New but unindexed</x-dc>')]
  assert.deepEqual(checkedDesignBoardPaths(rows,['project/New.dc.html']),[])
  assert.deepEqual(checkedDesignBoardPaths(rows,['project/Old.dc.html']),['project/Old.dc.html'])
  rows[0] = file('project/canvas.json',JSON.stringify({boards:{'New.dc.html':{}}}))
  assert.deepEqual(checkedDesignBoardPaths(rows,['project/New.dc.html']),['project/New.dc.html'])
  assert.deepEqual(checkedDesignBoardPaths(rows.slice(0,2),['project/New.dc.html']),[])
})
test('invalid or empty checked source cannot prove an explanatory board',()=>{
  assert.deepEqual(checkedDesignBoardPaths([file('project/canvas.json','{')],['project/Main.dc.html']),[])
  assert.deepEqual(checkedDesignBoardPaths([file('project/canvas.json','{"boards":{"Main.dc.html":{}}}'),file('project/Main.dc.html',' ')],['project/Main.dc.html']),[])
  assert.deepEqual(checkedDesignBoardPaths([file('project/canvas.json','{"boards":{"../outside.dc.html":{}}}'),file('project/../outside.dc.html','<x-dc>outside</x-dc>')],['project/../outside.dc.html']),[])
})
