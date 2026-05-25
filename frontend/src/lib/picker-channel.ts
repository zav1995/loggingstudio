// Picker protocol types — shared between the studio (publisher) and the
// pop-out picker windows (subscribers + action publishers). The transport
// lives in lib/picker-net.ts (HTTP + SSE against the backend's per-session
// relay). This file used to host a BroadcastChannel-based same-browser
// implementation; the network version replaced it once iPad / multi-device
// support became the deployment target.

import type { Tag, TagGroup } from '../api/schemas';
import type { InProgressLog } from '../components/InProgressBar';

export type PickerState = {
  tags: Tag[];
  groups: TagGroup[];
  inProgress: InProgressLog | null;
  frameRate: number;
  mediaID: string | null;
};

export type PickerMessage =
  | { kind: 'state'; state: PickerState }
  | { kind: 'toggleTag'; tagID: string }
  | { kind: 'setIn' }
  | { kind: 'setOut' }
  | { kind: 'commit' }
  | { kind: 'discard' }
  | { kind: 'requestState' };
