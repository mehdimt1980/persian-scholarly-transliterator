import { createHash } from 'node:crypto';
import { BlobNotFoundError, BlobPreconditionFailedError, get, head, put } from '@vercel/blob';
import { assertConfiguredBlobStoreIdentity, type WriteEnvironment } from './guard';
import type { ArchivePut, RawArchive } from './types';

export class VercelPrivateBlobArchive implements RawArchive {
  constructor(private readonly environment: WriteEnvironment, private readonly actualStoreId: string | undefined) {}

  private assertWriteTarget(): void {
    assertConfiguredBlobStoreIdentity(this.environment, this.actualStoreId);
  }

  async putImmutable(path: string, body: Uint8Array, checksum: string): Promise<ArchivePut> {
    this.assertWriteTarget();
    if (!path.startsWith(`evidence/${this.environment.namespace}/raw/sha256/`)) throw new Error('Blob path is outside the approved evidence namespace');
    if (createHash('sha256').update(body).digest('hex') !== checksum) throw new Error('Blob checksum mismatch before upload');
    try {
      const existing = await head(path);
      if (existing.size !== body.byteLength) throw new Error('Immutable Blob path collision');
      await this.readVerified(path, checksum);
      return { path, checksum, contentLength: body.byteLength, contentType: 'application/marcxml+xml', created: false };
    } catch (error) {
      if (!(error instanceof BlobNotFoundError)) throw error;
    }
    try {
      await put(path, body, { access: 'private', addRandomSuffix: false, allowOverwrite: false, contentType: 'application/marcxml+xml' });
    } catch (error) {
      if (!(error instanceof BlobPreconditionFailedError)) throw error;
      await this.readVerified(path, checksum);
      return { path, checksum, contentLength: body.byteLength, contentType: 'application/marcxml+xml', created: false };
    }
    await this.readVerified(path, checksum);
    return { path, checksum, contentLength: body.byteLength, contentType: 'application/marcxml+xml', created: true };
  }

  async readVerified(path: string, checksum: string): Promise<Uint8Array> {
    const result = await get(path, { access: 'private', useCache: false });
    if (!result || result.statusCode !== 200) throw new Error('Private Blob not found');
    const bytes = new Uint8Array(await new Response(result.stream).arrayBuffer());
    if (createHash('sha256').update(bytes).digest('hex') !== checksum) throw new Error('Private Blob checksum mismatch');
    return bytes;
  }
}
