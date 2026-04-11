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
    const u = data.AUTH_USER?.trim();
    const p = data.AUTH_PASS;
    const s = data.AUTH_SECRET?.trim();
    if ((u && !p) || (!u && p)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Set both AUTH_USER and AUTH_PASS together, or omit both (database users + AUTH_SECRET only is allowed).",
      });
    }
    if ((u || p) && !s) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "AUTH_SECRET is required when AUTH_USER / AUTH_PASS are set.",
      });
    }
  });

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(processEnv: NodeJS.ProcessEnv): Env {
  return EnvSchema.parse(processEnv);
}

