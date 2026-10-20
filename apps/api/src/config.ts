export interface AppConfig {
  port: number;
  databaseUrl: string;
  paystackSecretKey: string;
}

export const APP_CONFIG = Symbol('APP_CONFIG');

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const required = (name: string): string => {
    const value = env[name];
    if (!value) throw new Error(`${name} is not set`);
    return value;
  };
  return {
    port: Number(env.PORT ?? 3000),
    databaseUrl: required('DATABASE_URL'),
    paystackSecretKey: required('PAYSTACK_SECRET_KEY'),
  };
}
