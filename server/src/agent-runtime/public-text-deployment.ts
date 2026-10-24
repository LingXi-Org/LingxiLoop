/** Pure release metadata and the actual Worker producer option share one source.
 * Importing this module must not initialize control, databases or providers. */
export const publicTextDeployment: Readonly<{
  reader:3
  producer:'disabled'|'purpose-json-v1'|'purpose-json-v2'|'purpose-json-v3'
}> = Object.freeze({reader:3,producer:'purpose-json-v3'})

export function publicTextModelOptions() {
  return publicTextDeployment.producer==='disabled' ? {} : {publicTextProtocol:publicTextDeployment.producer}
}
