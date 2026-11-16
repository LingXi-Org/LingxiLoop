import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'harness-eval-documents'
export const inject = ['tools']

export function apply(ctx, { fixtureUrl, tools }) {
  for (const { name, description, parameters } of tools) {
    ctx.tools.register(defineTool({
      name, description,
      parameters: Object.fromEntries(Object.entries(parameters.properties).map(
        ([key, schema]) => [key, { ...schema, required: parameters.required.includes(key) }],
      )),
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      async execute(args, context) {
        const response = await fetch(fixtureUrl, {
          method: 'POST', body: JSON.stringify({ tool: name, args }), signal: context.signal,
        })
        if (!response.ok) throw new Error('Benchmark document fixture unavailable')
        return response.text()
      },
    }))
  }
}
