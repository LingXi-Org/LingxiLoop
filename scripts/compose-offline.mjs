// Do not forward product credentials, Docker daemon overrides or env-file data.
export function offlineComposeEnvironment(env=process.env,platform=process.platform){
 const result={PATH:env.PATH};
 if(platform==='win32'&&env.ProgramFiles)result.ProgramFiles=env.ProgramFiles;
 return result;
}
