/** Read-only network verification of the dedicated Vercel Blob staging store.
 * Does not create, overwrite, or delete any object.
 */
import { list } from '@vercel/blob';

async function main(): Promise<void> {
  const token = process.env.PHASE8G_STAGING_BLOB_READ_WRITE_TOKEN;
  const expectedStoreId = process.env.PHASE8G_STAGING_BLOB_STORE_ID;
  if (!token || !expectedStoreId) throw new Error('Missing dedicated staging Blob credentials');
  // The Blob token format is opaque; do not infer store identity from its segments.
  // Read-only list confirms credential authorization, not the linked store ID.
  const response = await list({ token, limit: 1, prefix: 'evidence/phase8g_staging/' });
  if (!Array.isArray(response.blobs)) throw new Error('Blob listing response invalid');
  console.log(JSON.stringify({ status: 'BLOB_READ_ONLY_CHECK_OK', storeIdentity: 'NOT_VERIFIED_BY_LIST_API', listingAuthorized: true, writesPerformed: false }));
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Blob verification failed'); process.exitCode = 1; });
