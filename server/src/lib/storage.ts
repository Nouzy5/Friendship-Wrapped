import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

/**
 * The only module that talks to object storage. The bucket is private: images reach
 * browsers through API routes that check access first, never by direct bucket URLs.
 */
const client = new S3Client({
  region: env.S3_REGION,
  endpoint: env.S3_ENDPOINT,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
  // Only send checksums where S3 requires them; not every S3-compatible service accepts the newer ones.
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

const Bucket = env.S3_BUCKET;
/** S3's DeleteObjects limit. */
const DELETE_BATCH_SIZE = 1000;

export type StoredObject = {
  body: Readable;
  contentType: string | undefined;
  contentLength: number | undefined;
};

export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await client.send(new PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: contentType }));
}

/** The object's contents as a stream, or null if there is no object with that key. */
export async function getObject(key: string): Promise<StoredObject | null> {
  try {
    const res = await client.send(new GetObjectCommand({ Bucket, Key: key }));
    if (!(res.Body instanceof Readable)) throw new Error(`Unexpected body type for object ${key}`);
    return { body: res.Body, contentType: res.ContentType, contentLength: res.ContentLength };
  } catch (error) {
    if (error instanceof NoSuchKey) return null;
    throw error;
  }
}

/** Deletes the given keys; keys that don't exist are ignored. */
export async function deleteObjects(keys: readonly string[]): Promise<void> {
  for (let start = 0; start < keys.length; start += DELETE_BATCH_SIZE) {
    const batch = keys.slice(start, start + DELETE_BATCH_SIZE);
    const res = await client.send(
      new DeleteObjectsCommand({ Bucket, Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true } }),
    );
    const [firstError] = res.Errors ?? [];
    if (firstError) {
      throw new Error(`Failed to delete ${res.Errors!.length} object(s), e.g. ${firstError.Key}: ${firstError.Code}`);
    }
  }
}

/** Deletes every object under a "folder", e.g. everything stored for one group. */
export async function deletePrefix(prefix: string): Promise<void> {
  // Guard against "groups/abc" also matching "groups/abcdef…".
  if (!prefix.endsWith("/")) throw new Error(`Storage prefix must end with "/": ${prefix}`);

  let continuationToken: string | undefined;
  do {
    const page = await client.send(
      new ListObjectsV2Command({ Bucket, Prefix: prefix, ContinuationToken: continuationToken }),
    );
    const keys = (page.Contents ?? []).flatMap((object) => (object.Key ? [object.Key] : []));
    await deleteObjects(keys);
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);
}

/**
 * Cleanup after the database change has committed. A leftover object only wastes space
 * (nothing references it any more), so failures are logged rather than failing the request.
 */
export async function discardObjects(keys: readonly string[]): Promise<void> {
  try {
    await deleteObjects(keys);
  } catch (error) {
    logger.error(`Failed to delete ${keys.length} stored object(s)`, error);
  }
}

export async function discardPrefix(prefix: string): Promise<void> {
  try {
    await deletePrefix(prefix);
  } catch (error) {
    logger.error(`Failed to delete stored objects under ${prefix}`, error);
  }
}

/** Confirms the bucket is reachable with our credentials (used by the health check). */
export async function checkBucket(signal?: AbortSignal): Promise<void> {
  await client.send(new HeadBucketCommand({ Bucket }), { abortSignal: signal });
}
