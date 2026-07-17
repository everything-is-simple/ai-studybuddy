export interface SecretProtector {
  readonly available: boolean;
  encrypt(plaintext: Buffer): Buffer;
  decrypt(ciphertext: Buffer): Buffer;
}

export class SecretProtectionError extends Error {
  constructor(
    readonly code: 'CONFIG_DPAPI_UNAVAILABLE' | 'CONFIG_DECRYPT_FAILED',
    message: string
  ) {
    super(message);
    this.name = 'SecretProtectionError';
  }
}
