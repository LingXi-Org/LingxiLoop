import { Component, type ReactNode } from 'react'
import { useStateField, type ComponentRenderProps, type ComponentRenderer, type StateField } from '@openuidev/react-lang'
import ReactMarkdown from 'react-markdown'
import { createLessonLibrary, lessonComponentSchemas, type LessonComponentName, type LessonComponentProps } from '@/lib/interactive-ui/catalog'
import { Action, Choice, Parameter, Prediction, Steps, Toggle } from './controls'
import { CltPlot, DctImage, FunctionPlot, MontyHall, ProjectilePlot } from './science'

class ComponentBoundary extends Component<{ children: ReactNode; resetKey: unknown }, { failed: boolean; resetKey: unknown }> {
  state = { failed: false, resetKey: this.props.resetKey }
  static getDerivedStateFromError() { return { failed: true } }
  static getDerivedStateFromProps(props: { resetKey: unknown }, state: { resetKey: unknown }) {
    return props.resetKey === state.resetKey ? null : { failed: false, resetKey: props.resetKey }
  }
  render() { return this.state.failed ? <p role="alert" className="text-sm text-muted-foreground">这部分暂时无法显示，请参考文字讲解。</p> : this.props.children }
}

function Validated({ name, props, renderNode }: ComponentRenderProps & { name: LessonComponentName }) {
  const field = useStateField(typeof props.name === 'string' ? props.name : '', props.value)
  const control = ['Parameter', 'Choice', 'Toggle', 'Prediction', 'Steps'].includes(name)
  const value = lessonComponentSchemas[name].parse(control ? { ...props, value: field.value } : props)
  switch (name) {
    case 'Lesson': {
      const lesson = value as LessonComponentProps<'Lesson'>
      return <section className="grid min-w-0 gap-4" aria-label={lesson.title}><h3 className="text-base font-semibold">{lesson.title}</h3>{renderNode(lesson.children)}</section>
    }
    case 'Layout': {
      const layout = value as LessonComponentProps<'Layout'>
      return <div className={`grid min-w-0 gap-4 ${layout.columns === 2 ? '@min-[32rem]:grid-cols-2' : ''}`}>{renderNode(layout.children)}</div>
    }
    case 'Text': return <div className="min-w-0 whitespace-pre-wrap break-words text-sm [&_p+p]:mt-2"><ReactMarkdown allowedElements={['p', 'strong', 'em', 'code', 'ul', 'ol', 'li', 'br']} unwrapDisallowed>{(value as LessonComponentProps<'Text'>).text}</ReactMarkdown></div>
    case 'Parameter': return <Parameter {...value as LessonComponentProps<'Parameter'>} field={field as StateField<number>} />
    case 'Choice': return <Choice {...value as LessonComponentProps<'Choice'>} field={field as StateField<string>} />
    case 'Toggle': return <Toggle {...value as LessonComponentProps<'Toggle'>} field={field as StateField<boolean>} />
    case 'Prediction': return <Prediction {...value as LessonComponentProps<'Prediction'>} field={field as StateField<string>} />
    case 'Steps': return <Steps {...value as LessonComponentProps<'Steps'>} field={field as StateField<number>} />
    case 'LearningAction': return <div><Action {...value as LessonComponentProps<'LearningAction'>} /></div>
    case 'ProjectilePlot': return <ProjectilePlot {...value as LessonComponentProps<'ProjectilePlot'>} />
    case 'FunctionPlot': return <FunctionPlot {...value as LessonComponentProps<'FunctionPlot'>} />
    case 'DctImage': return <DctImage {...value as LessonComponentProps<'DctImage'>} />
    case 'CltPlot': return <CltPlot {...value as LessonComponentProps<'CltPlot'>} />
    case 'MontyHall': return <MontyHall {...value as LessonComponentProps<'MontyHall'>} selectedDoor={(value as LessonComponentProps<'MontyHall'>).selectedDoor as 0 | 1 | 2} />
    case 'Table': {
      const table = value as LessonComponentProps<'Table'>
      return <div role="region" aria-label="概念对比" tabIndex={0} className="min-w-0 overflow-x-auto rounded-lg border border-border focus-visible:outline-2 focus-visible:outline-ring">
        <table aria-label="概念对比" className="w-full text-start text-sm"><thead className="bg-muted/40"><tr>{table.headers.map((header, index) => <th scope="col" className="px-3 py-2 text-start font-medium" key={index}>{header}</th>)}</tr></thead>
          <tbody>{table.rows.map((row, rowIndex) => <tr key={rowIndex} className="border-t border-border">{row.map((cell, column) => <td key={column} className="break-words px-3 py-2 align-top">{cell}</td>)}</tr>)}</tbody>
        </table>
      </div>
    }
  }
}

export const interactiveLibrary = createLessonLibrary<ComponentRenderer>(Object.fromEntries(Object.keys(lessonComponentSchemas).map(name => [name,
  (props: ComponentRenderProps) => <ComponentBoundary resetKey={props.props}><Validated name={name as LessonComponentName} {...props} /></ComponentBoundary>,
])) as Record<LessonComponentName, ComponentRenderer>)
