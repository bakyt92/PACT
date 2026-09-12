import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTVerifyGetKey,
} from "jose";
import { z } from "zod";
import type {
  ServiceTokenVerifier,
  VerifiedServiceIdentity,
} from "../runtime/ports";
import { PactError } from "../runtime/errors";

export interface Auth0Config {
  domain: string;
  audience: string;
  clientId: string;
  clientSecret: string;
  requiredScope: string;
}

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.literal("Bearer"),
  expires_in: z.number().positive(),
});

export function auth0Config(env: NodeJS.ProcessEnv): Auth0Config {
  const required = [
    "AUTH0_DOMAIN",
    "AUTH0_AUDIENCE",
    "AUTH0_CLIENT_ID",
    "AUTH0_CLIENT_SECRET",
  ] as const;
  for (const name of required) {
    if (!env[name]?.trim()) {
      throw new PactError(
        "AUTH0_NOT_CONFIGURED",
        `Set ${name} before task execution.`,
        503,
      );
    }
  }
  const domain = env.AUTH0_DOMAIN!.trim();
  if (
    !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(
      domain,
    )
  ) {
    throw new PactError(
      "AUTH0_INVALID_DOMAIN",
      "AUTH0_DOMAIN must be a bare hostname.",
      503,
    );
  }
  return {
    domain,
    audience: env.AUTH0_AUDIENCE!.trim(),
    clientId: env.AUTH0_CLIENT_ID!.trim(),
    clientSecret: env.AUTH0_CLIENT_SECRET!.trim(),
    requiredScope: (env.AUTH0_REQUIRED_SCOPE || "create:followups").trim(),
  };
}

export class JoseServiceTokenVerifier implements ServiceTokenVerifier {
  private readonly issuer: string;
  private readonly jwks: JWTVerifyGetKey;

  constructor(
    private readonly config: Pick<
      Auth0Config,
      "domain" | "audience" | "clientId" | "requiredScope"
    >,
    jwks?: JWTVerifyGetKey,
  ) {
    this.issuer = `https://${config.domain}/`;
    this.jwks =
      jwks ??
      createRemoteJWKSet(
        new URL(`https://${config.domain}/.well-known/jwks.json`),
      );
  }

  async verify(token: string): Promise<VerifiedServiceIdentity> {
    if (!token.trim()) {
      throw new PactError(
        "AUTHENTICATION_REQUIRED",
        "A valid Auth0 service token is required.",
        401,
      );
    }
    let payload;
    try {
      ({ payload } = await jwtVerify(token, this.jwks, {
        algorithms: ["RS256"],
        issuer: this.issuer,
        audience: this.config.audience,
      }));
    } catch {
      throw new PactError(
        "INVALID_SERVICE_TOKEN",
        "The Auth0 service token failed verification.",
        401,
      );
    }
    const subject = typeof payload.sub === "string" ? payload.sub : "";
    const expectedSubject = `${this.config.clientId}@clients`;
    if (subject !== expectedSubject) {
      throw new PactError(
        "EXECUTOR_IDENTITY_MISMATCH",
        "The verified Auth0 service identity is not the configured executor.",
        403,
      );
    }
    const scopes =
      typeof payload.scope === "string"
        ? payload.scope.split(/\s+/).filter(Boolean)
        : [];
    if (!scopes.includes(this.config.requiredScope)) {
      throw new PactError(
        "MISSING_REQUIRED_SCOPE",
        `The ${this.config.requiredScope} permission is required.`,
        403,
      );
    }
    return {
      subject,
      scopes,
      expiresAt: Number(payload.exp) * 1000,
    };
  }
}

export class Auth0ClientCredentials {
  private cached: { token: string; expiresAt: number } | null = null;

  constructor(
    private readonly config: Auth0Config,
    private readonly now = Date.now,
    private readonly request: typeof fetch = fetch,
  ) {}

  async token(): Promise<string> {
    const now = this.now();
    if (this.cached && now < this.cached.expiresAt - 60_000) {
      return this.cached.token;
    }
    let response: Response;
    try {
      response = await this.request(`https://${this.config.domain}/oauth/token`, {
        method: "POST",
        signal: AbortSignal.timeout(15_000),
        redirect: "error",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "client_credentials",
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          audience: this.config.audience,
        }),
      });
    } catch {
      throw new PactError(
        "AUTH0_TOKEN_UNAVAILABLE",
        "Auth0 token issuance was unavailable.",
        503,
      );
    }
    if (!response.ok) {
      throw new PactError(
        "AUTH0_TOKEN_REJECTED",
        `Auth0 token issuance failed with HTTP ${response.status}.`,
        503,
      );
    }
    const parsed = tokenResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new PactError(
        "AUTH0_TOKEN_INVALID_RESPONSE",
        "Auth0 returned an invalid token response.",
        503,
      );
    }
    this.cached = {
      token: parsed.data.access_token,
      expiresAt: now + parsed.data.expires_in * 1000,
    };
    return this.cached.token;
  }
}
