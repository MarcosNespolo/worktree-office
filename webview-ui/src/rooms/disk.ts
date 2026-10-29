import type { DriveSpace, WorktreeDisk } from '../../../core/src/messages.js';
import { formatBytes } from './memory.js';

const LOW_FREE_RATIO = 0.1;

export function diskBytes(bytes: number): string {
  return bytes > 0 ? formatBytes(bytes) : '0';
}

export function driveName(drive: DriveSpace): string {
  return drive.root.length > 1 ? drive.root.replace(/[\\/]+$/, '') : drive.root;
}

export function isLow(drive: DriveSpace): boolean {
  return drive.totalBytes > 0 && drive.freeBytes / drive.totalBytes < LOW_FREE_RATIO;
}

export function drivesSummary(
  drives: readonly DriveSpace[],
): { text: string; low: boolean } | null {
  if (drives.length === 0) return null;
  return {
    text: `Disk ${drives.map((drive) => `${driveName(drive)} ${formatBytes(drive.freeBytes)} free`).join(' · ')}`,
    low: drives.some(isLow),
  };
}

export function measuredAgo(at: number | null, now = Date.now()): string {
  if (at === null) return 'not measured yet';
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return 'measured just now';
  if (minutes < 60) return `measured ${minutes} min ago`;
  return `measured ${Math.floor(minutes / 60)} h ago`;
}

export function worktreeBreakdown(entry: WorktreeDisk): string {
  const other = entry.totalBytes - entry.modulesBytes - entry.buildBytes - entry.gitBytes;
  return [
    `node_modules ${diskBytes(entry.modulesBytes)}`,
    `builds ${diskBytes(entry.buildBytes)}`,
    ...(entry.gitBytes > 0 ? [`git ${diskBytes(entry.gitBytes)}`] : []),
    `other ${diskBytes(Math.max(0, other))}`,
  ].join(' · ');
}
