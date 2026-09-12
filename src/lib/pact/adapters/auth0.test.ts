import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
} from "jose";
import { JoseServiceTokenVerifier } from "./auth0";
import { PactError } from "../runtime/errors";

const config = {
  domain: "tenant.auth0.example",
  audience: "https://pact.demo/api",
  clientId: "fixture-client",
  requiredScope: "create:followups",
};

test("group 8: real jose verifier enforces signature, issuer, audience, expiry, identity, and scope", async () => {
  const pair = await generateKeyPair("RS256");
  const other = await generateKeyPair("RS256");
  const jwk = {
    ...(await exportJWK(pair.publicKey)),
    kid: "fixture-key",
    alg: "RS256",
    use: "sig",
  };
  const verifier = new JoseServiceTokenVerifier(
    config,
    createLocalJWKSet({ keys: [jwk] }),
  );
  const sign = async (
    overrides: { iss?: string; aud?: string; exp?: number; sub?: string; scope?: string } = {},
    key = pair.privateKey,
  ) =>
    new SignJWT({ scope: overrides.scope ?? "create:followups" })
      .setProtectedHeader({ alg: "RS256", kid: "fixture-key" })
      .setIssuer(overrides.iss ?? `https://${config.domain}/`)
      .setAudience(overrides.aud ?? config.audience)
      .setSubject(overrides.sub ?? `${config.clientId}@clients`)
      .setIssuedAt()
      .setExpirationTime(overrides.exp ?? Math.floor(Date.now() / 1000) + 300)
      .sign(key);

  const valid = await verifier.verify(await sign());
  assert.equal(valid.subject, "fixture-client@clients");

  for (const [name, token, status] of [
    ["bad signature", await sign({}, other.privateKey), 401],
    ["issuer", await sign({ iss: "https://other.example/" }), 401],
    ["audience", await sign({ aud: "https://other.example/api" }), 401],
    ["expiry", await sign({ exp: Math.floor(Date.now() / 1000) - 60 }), 401],
    ["executor identity", await sign({ sub: "other-client@clients" }), 403],
    ["scope", await sign({ scope: "read:followups" }), 403],
  ] as const) {
    await assert.rejects(
      verifier.verify(token),
      (error) =>
        error instanceof PactError &&
        error.status === status &&
        !error.message.includes(token),
      name,
    );
  }
});
