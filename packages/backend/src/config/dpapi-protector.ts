import { Dpapi, isPlatformSupported } from '@primno/dpapi';
import {
  SecretProtectionError,
  type SecretProtector,
} from './secret-protector';

export class DpapiProtector implements SecretProtector {
  readonly available = isPlatformSupported;

  encrypt(plaintext: Buffer): Buffer {
    this.assertAvailable();
    return Buffer.from(Dpapi.protectData(plaintext, null, 'CurrentUser'));
  }

  decrypt(ciphertext: Buffer): Buffer {
    this.assertAvailable();
    try {
      return Buffer.from(Dpapi.unprotectData(ciphertext, null, 'CurrentUser'));
    } catch {
      throw new SecretProtectionError('CONFIG_DECRYPT_FAILED', '配置解密失败');
    }
  }

  private assertAvailable(): void {
    if (!this.available) {
      throw new SecretProtectionError('CONFIG_DPAPI_UNAVAILABLE', '当前平台无法使用 DPAPI');
    }
  }
}
