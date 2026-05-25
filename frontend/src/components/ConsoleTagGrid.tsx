import { useMemo } from 'react';

import type { Tag, TagGroup } from '../api/schemas';

type Props = {
  tags: Tag[];
  groups: TagGroup[];
  selectedTagIDs: string[];
  onToggle: (tagID: string) => void;
};

// ConsoleTagGrid is the broadcast-console-style tag surface used in the
// popped-out picker window. Tiles are big, solid-color, bold-uppercase, with
// the hotkey in the top-right corner. Groups stack vertically; tiles inside
// a group flow as a wrapping CSS grid for predictable touch targets at any
// window width.
export function ConsoleTagGrid({
  tags,
  groups,
  selectedTagIDs,
  onToggle,
}: Props) {
  const groupedTags = useMemo(() => {
    return groups
      .slice()
      .sort((a, b) => a.display_order - b.display_order)
      .map((g) => ({
        group: g,
        tags: tags
          .filter((t) => t.group_id === g.id)
          .sort((a, b) => a.display_order - b.display_order),
      }))
      .filter((entry) => entry.tags.length > 0);
  }, [tags, groups]);

  if (tags.length === 0) {
    return (
      <div style={{ color: '#888', fontSize: 13, padding: 16 }}>
        No tags defined yet. Open the main studio's Tags view to create some.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {groupedTags.map(({ group, tags: groupTags }) => (
        <div
          key={group.id}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
            gap: 6,
          }}
        >
          {groupTags.map((t) => {
            const id = t.id ?? '';
            const checked = id !== '' && selectedTagIDs.includes(id);
            return (
              <ConsoleTile
                key={id}
                label={t.name}
                hotkey={t.hotkey ?? undefined}
                color={group.color}
                selected={checked}
                onClick={() => id && onToggle(id)}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

function ConsoleTile({
  label,
  hotkey,
  color,
  selected,
  onClick,
}: {
  label: string;
  hotkey?: string;
  color: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        position: 'relative',
        background: color,
        color: '#FFFFFF',
        border: 'none',
        // Selected = thick white inner outline + slight brightness lift.
        boxShadow: selected
          ? 'inset 0 0 0 4px #FFFFFF, 0 0 0 1px rgba(255,255,255,0.4)'
          : 'inset 0 -3px 0 rgba(0,0,0,0.25)',
        filter: selected ? 'brightness(1.08)' : 'none',
        padding: '12px 10px',
        minHeight: 78,
        textAlign: 'center',
        textTransform: 'uppercase',
        fontWeight: 800,
        fontSize: 13,
        letterSpacing: 0.4,
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        cursor: 'pointer',
        userSelect: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        // Tile shape: square-ish, no rounding for a hardware-deck feel.
        borderRadius: 2,
        // Soft text shadow so light-on-light or light-on-pastel stays
        // legible without changing the palette.
        textShadow: '0 1px 2px rgba(0,0,0,0.5)',
        lineHeight: 1.15,
        overflow: 'hidden',
        wordBreak: 'break-word',
      }}
    >
      {hotkey && (
        <span
          style={{
            position: 'absolute',
            top: 6,
            right: 8,
            fontSize: 10,
            fontFamily: 'ui-monospace, SFMono-Regular, monospace',
            fontWeight: 700,
            opacity: 0.85,
            padding: '1px 5px',
            borderRadius: 2,
            background: 'rgba(0,0,0,0.3)',
          }}
        >
          {hotkey.toUpperCase()}
        </span>
      )}
      <span>{label}</span>
    </button>
  );
}
