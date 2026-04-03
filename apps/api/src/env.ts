import { z } from "zod";

const EnvSchema = z
  .object({
    PORT: z.coerce.number().int().positive().default(3001),
    HOST: z.string().default("0.0.0.0"),
    CORS_ORIGIN: z.string().default("http://localhost:5173"),
    DB_PATH: z.string().default("./data/erp.sqlite"),
    LOG_LEVEL: z.string().default("info"),
    /** If set with AUTH_PASS and AUTH_SECRET, all routes except /health and /auth/* require Bearer token. */
    AUTH_USER: z.string().optional().default(""),
    AUTH_PASS: z.string().optional().default(""),
    AUTH_SECRET: z.string().optional().default(""),
  })
  .superRefine((data, ctx) => {
    const any = Boolean(data.AUTH_USER || data.AUTH_PASS || data.AUTH_SECRET);
    if (!any) return;
    if (!data.AUTH_USER || !data.AUTH_PASS || !data.AUTH_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Set all of AUTH_USER, AUTH_PASS, and AUTH_SECRET together, or omit all for no API auth.",
      });
    }
  });

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(processEnv: NodeJS.ProcessEnv): Env {
  return EnvSchema.parse(processEnv);
}

