import dotenv from "dotenv";

dotenv.config();

const required = [
  "WECHATY_PUPPET",
  "WECHATY_PUPPET_SERVICE_TOKEN",
  "GEMINI_API_KEY",
  "GEMINI_MODEL",
  "GOOGLE_SHEETS_API_KEY",
];

const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  throw new Error(`Missing required env vars: ${missing.join(", ")}`);
}

const getEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing env var: ${key}`);
  }
  return value;
};

const getOptionalEnv = (key: string): string | undefined => {
  const value = process.env[key];
  return value && value.length > 0 ? value : undefined;
};

export const config = {
  env: process.env.NODE_ENV ?? "production",
  wechaty: {
    puppet: getEnv("WECHATY_PUPPET"),
    token: getEnv("WECHATY_PUPPET_SERVICE_TOKEN"),
  },
  gemini: {
    apiKey: getEnv("GEMINI_API_KEY"),
    model: getEnv("GEMINI_MODEL"),
  },
  google: {
    apiKey: getEnv("GOOGLE_SHEETS_API_KEY"),
  },
  control: {
    port: getOptionalEnv("CONTROL_PORT")
      ? Number(getOptionalEnv("CONTROL_PORT"))
      : undefined,
    token: getOptionalEnv("CONTROL_TOKEN"),
  },
};
