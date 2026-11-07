'use strict';

const fs = require('node:fs');
const path = require('node:path');

async function readAuth0ClientSecret(options = {}) {
  const connectionString = options.connectionString || process.env.VAULT_DATABASE_URL;
  const certificatePath = options.certificatePath || path.join(__dirname, 'certs', 'supabase-root-2021-ca.pem');
  if (!connectionString) throw new Error('VAULT_DATABASE_URL is required.');

  let ca;
  try {
    ca = fs.readFileSync(certificatePath, 'utf8');
  } catch (_) {
    throw new Error('The Supabase root certificate is missing.');
  }
  if (!ca.includes('BEGIN CERTIFICATE')) throw new Error('The Supabase root certificate is invalid.');

  let parsedUrl;
  try {
    parsedUrl = new URL(connectionString);
  } catch (_) {
    throw new Error('VAULT_DATABASE_URL is invalid.');
  }
  if (!['postgres:', 'postgresql:'].includes(parsedUrl.protocol)) {
    throw new Error('VAULT_DATABASE_URL must use the PostgreSQL protocol.');
  }

  // pg-connection-string lets URI sslmode parameters override ssl options.
  // Remove them so the explicit CA and strict certificate verification are used.
  parsedUrl.searchParams.delete('sslmode');
  parsedUrl.searchParams.delete('sslrootcert');
  parsedUrl.searchParams.delete('sslcert');
  parsedUrl.searchParams.delete('sslkey');

  const { Client } = require('pg');
  const client = new Client({
    connectionString: parsedUrl.toString(),
    ssl: { ca, rejectUnauthorized: true },
    connectionTimeoutMillis: 10000,
    statement_timeout: 10000,
    query_timeout: 10000,
    application_name: 'una-chat-vault'
  });

  await client.connect();
  try {
    const result = await client.query(
      'select una_chat_private.get_auth0_client_secret() as secret'
    );
    const secret = result.rows && result.rows[0] && result.rows[0].secret;
    if (typeof secret !== 'string' || secret.length <= 16) {
      throw new Error('Vault does not contain a valid Auth0 client secret.');
    }
    return secret;
  } finally {
    await client.end();
  }
}

module.exports = { readAuth0ClientSecret };
