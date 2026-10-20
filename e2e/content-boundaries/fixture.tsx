import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { ContentEditor, type ContentDocument } from '@/features/content-editor'
// The isolated Vite plugin exposes this existing component without changing production source.
import { HomeworkDraftCard } from '@/features/learning/homework/HomeworkDraftCard'
import '@/styles/globals.css'
function PrivateAnswer() {
  const [value, setValue] = useState('PRIVATE ORIGINAL A'), [document, setDocument] = useState<ContentDocument | null>(null)
  return <><ContentEditor label="私有作答" value={value} document={document} onChange={(next, native) => { setValue(next); setDocument(native) }}/><output data-answer>{JSON.stringify({value,document})}</output></>
}
createRoot(document.getElementById('root')!).render(new URLSearchParams(location.search).has('answer')
  ? <PrivateAnswer/> : <HomeworkDraftCard courseId="boundary-course" homeworkId="boundary-homework" readOnly={false} preparing={false}/>)
