// Color resolution for a log on the timeline / list.
//
// Priority per PRD §3.2 ("color derived from primary tag or source"):
//   1. First tag's TagGroup color
//   2. Fallback by source family:
//        manual    → muted gray
//        ingest:*  → ScorePlay green
//        anything  → light gray

import type { Log, Tag, TagGroup } from '../api/schemas';

const FALLBACK_MANUAL = '#666666';
const FALLBACK_INGEST = '#00FF87';
const FALLBACK_OTHER = '#888888';

export function logColor(
  log: Log,
  tags: Tag[],
  groups: TagGroup[],
): string {
  if (log.tags.length > 0) {
    const firstTag = tags.find((t) => t.id === log.tags[0]);
    if (firstTag) {
      const group = groups.find((g) => g.id === firstTag.group_id);
      if (group) return group.color;
    }
  }
  if (log.source === 'manual') return FALLBACK_MANUAL;
  if (log.source.startsWith('ingest:')) return FALLBACK_INGEST;
  return FALLBACK_OTHER;
}
