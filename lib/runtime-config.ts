export class RuntimeConfigurationError extends Error {
  constructor(variableName: string) {
    super(`${variableName} is not configured for this deployment. Configure it in Netlify's Functions scope and redeploy.`);
    this.name = 'RuntimeConfigurationError';
  }
}

export function requireRuntimeEnv(variableName: string): string {
  const value = process.env[variableName]?.trim();
  if (!value) {
    throw new RuntimeConfigurationError(variableName);
  }
  return value;
}
