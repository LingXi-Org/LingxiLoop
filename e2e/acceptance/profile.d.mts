export const isolatedSpa: null | {
  origin: string; apiPort: number; supervisorPort: number; controlPort: number;
  databasePort: string; databaseContainer: string; controlState: string; controlConfig: string;
  env: Record<string, string>;
}
