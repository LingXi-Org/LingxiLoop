/** Pure release metadata and the actual Worker producer option share one source.
 * Importing this module must not initialize control, databases or providers. */
export const publicTextDeployment: Readonly<{
  reader:2
  producer:'disabled'|'purpose-json-v1'|'purpose-json-v2'
}> = Object.freeze({reader:2,producer:'purpose-json-v2'})

export function publicTextModelOptions() {
  return publicTextDeployment.producer==='disabled' ? {} : {publicTextProtocol:publicTextDeployment.producer}
}
