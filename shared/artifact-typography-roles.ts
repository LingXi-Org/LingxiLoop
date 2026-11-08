/** Data-only role vocabulary shared by schema and the lazy inspector. */
export const typographyRoleOrder=['Display','Heading 1','Heading 2','Heading 3','Heading 4','Heading 5','Heading 6','Lead','Eyebrow','Body','Button','Link','Stat','Wordmark','Quote','Code','Label','Caption','Strong'] as const
export type TypographyRole=typeof typographyRoleOrder[number]
