/**
 * Streaming JSONL & Gzip input processor with periodic progress & memory profiling.
 */

import fs from 'node:fs';
import readline from 'node:readline';
import zlib from 'node:zlib';
import type { Readable } from 'node:stream';

export interface StreamProcessingProgress {
  rowsRead: number;
  currentRssMb: number;
  peakRssMb: number;
}

export interface StreamProcessingOptions {
  maxRecords?: number;
  progressEvery?: number;
  onProgress?: (progress: StreamProcessingProgress) => void;
}

export class StreamingMemoryTracker {
  private startRss: number;
  private peakRss: number;

  constructor() {
    this.startRss = process.memoryUsage().rss;
    this.peakRss = this.startRss;
  }

  public sample(): number {
    const current = process.memoryUsage().rss;
    if (current > this.peakRss) {
      this.peakRss = current;
    }
    return current;
  }

  public getStartRssMb(): number {
    return Math.round((this.startRss / (1024 * 1024)) * 100) / 100;
  }

  public getPeakRssMb(): number {
    this.sample();
    return Math.round((this.peakRss / (1024 * 1024)) * 100) / 100;
  }

  public getEndRssMb(): number {
    return Math.round((process.memoryUsage().rss / (1024 * 1024)) * 100) / 100;
  }
}

/**
 * Creates an input stream supporting plain .jsonl and gzipped .jsonl.gz files.
 */
export function createKaikkiInputStream(filePath: string): Readable {
  const isGzip = filePath.endsWith('.gz') || filePath.endsWith('.tgz');
  const fileStream = fs.createReadStream(filePath);
  if (isGzip) {
    const gunzip = zlib.createGunzip();
    return fileStream.pipe(gunzip);
  }
  return fileStream;
}

/**
 * Iterates through a JSONL stream line-by-line with memory profiling and progress callback.
 */
export async function forEachJsonlRow(
  filePath: string,
  onRow: (rowNumber: number, line: string) => Promise<void> | void,
  options: StreamProcessingOptions = {}
): Promise<{ totalRows: number; memoryTracker: StreamingMemoryTracker }> {
  const tracker = new StreamingMemoryTracker();
  const inputStream = createKaikkiInputStream(filePath);
  const rl = readline.createInterface({
    input: inputStream,
    crlfDelay: Infinity
  });

  const progressInterval = options.progressEvery ?? 10000;
  let rows = 0;

  for await (const line of rl) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;

    rows += 1;
    await onRow(rows, trimmed);

    if (rows % progressInterval === 0) {
      tracker.sample();
      if (options.onProgress) {
        options.onProgress({
          rowsRead: rows,
          currentRssMb: Math.round((process.memoryUsage().rss / (1024 * 1024)) * 100) / 100,
          peakRssMb: tracker.getPeakRssMb()
        });
      }
    }

    if (options.maxRecords && rows >= options.maxRecords) {
      break;
    }
  }

  tracker.sample();
  return { totalRows: rows, memoryTracker: tracker };
}
