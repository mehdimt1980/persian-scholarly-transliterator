/** Read-only network verification of the dedicated Vercel Blob staging store.
 * Does not create, overwrite, or delete any object.
 */
import { list } from '@vercel/blob';

async function main(): Promise<void> {
  const token = process.env.PHASE8G_STAGING_BLOB_READ_WRITE_TOKEN;
  const expectedStoreId = process.env.PHASE8G_STAGING_BLOB_STORE_ID;
  if (!token || !expectedStoreId) throw new Error('Missing dedicated staging Blob credentials');
  // Vercel Blob tokens include an opaque store identifier; check this against
  // the configured store to avoid silently accepting credentials for another store.
  // The network request below is read-only. Avoid printing any token or path.
  const parts = token.split('_');
  if (parts.length < 4 || parts[0] !== 'vercel' || parts[1] !== 'blob' || parts[2] !== 'rw') {
    throw new Error('Unexpected Blob token format; refusing to contact a potentially wrong store');
  }
  if (parts[3] !== expectedStoreId) throw new Error('Blob token does not identify the configured staging store');
  const response = await list({ token, limit: 1, prefix: 'evidence/phase8g_staging/' });
  if (!Array.isArray(response.blobs)) throw new Error('Blob listing response invalid');
  console.log(JSON.stringify({ status: 'BLOB_READ_ONLY_CHECK_OK', storeIdentityMatched: true, listingAuthorized: true, writesPerformed: false }));
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Blob verification failed'); process.exitCode = 1; });
