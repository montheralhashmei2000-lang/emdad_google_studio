#!/usr/bin/env node
// Generates an offline ECDSA P-256 Owner keypair and writes the public JWK & private PEM outside VCS
import { generateKeyPairSync } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const { publicKey, privateKey } = generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const outDir = path.resolve(process.cwd(), '.owner-keys');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'owner-public-key.pem'), publicKey, 'utf8');
fs.writeFileSync(path.join(outDir, 'owner-private-key.txt'), privateKey, { encoding: 'utf8', mode: 0o600 });

console.log('Generated ECDSA P-256 Owner Keypair in .owner-keys/ (keep owner-private-key.txt offline & out of git).');
