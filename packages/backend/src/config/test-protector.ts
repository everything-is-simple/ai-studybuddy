import type { SecretProtector } from './secret-protector';

const TEST_KEY = Buffer.from('ai-studybuddy-test-protector', 'utf8');

export class TestProtector implements SecretProtector {
  readonly available = true;

  encrypt(plaintext: Buffer): Buffer {
    return this.transform(plaintext);
  }

  decrypt(ciphertext: Buffer): Buffer {
    return this.transform(ciphertext);
  }

  private transform(input: Buffer): Buffer {
    return Buffer.from(input.map((value, index) => value ^ TEST_KEY[index % TEST_KEY.length]));
  }
}
