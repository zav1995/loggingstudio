import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  ColorInput,
  Group,
  Loader,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { ApiError, api } from '../api/client';
import {
  type Tag,
  type TagGroup,
  tagGroupSchema,
  tagSchema,
} from '../api/schemas';
import { z } from 'zod';

const groupListSchema = z.array(tagGroupSchema);
const tagListSchema = z.array(tagSchema);

export function Tags() {
  const [groups, setGroups] = useState<TagGroup[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  const [error, setError] = useState<string>('');

  const refresh = useCallback(async () => {
    try {
      const [g, t] = await Promise.all([
        api.get('/tag-groups', groupListSchema),
        api.get('/tags', tagListSchema),
      ]);
      setGroups(g);
      setTags(t);
      setStatus('ready');
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? `${err.message}${err.detail ? ` — ${err.detail}` : ''}`
          : err instanceof Error
            ? err.message
            : 'unknown error';
      setError(msg);
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const allHotkeys = useMemo(
    () =>
      tags
        .map((t) => t.hotkey)
        .filter((h): h is string => typeof h === 'string' && h.length > 0),
    [tags],
  );

  return (
    <Stack>
      <Title order={2}>Tags</Title>
      <Text c="dimmed">Define tag groups and the tags users can attach to logs.</Text>

      {status === 'loading' && <Loader />}
      {status === 'error' && (
        <Alert color="red" title="Failed to load">
          {error}
        </Alert>
      )}

      {status === 'ready' && (
        <Stack>
          <CreateGroupForm onCreated={refresh} />
          {groups.length === 0 && (
            <Text c="dimmed">No tag groups yet. Add one above.</Text>
          )}
          {groups.map((group) => (
            <GroupCard
              key={group.id}
              group={group}
              tags={tags.filter((t) => t.group_id === group.id)}
              allHotkeys={allHotkeys}
              onChanged={refresh}
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
}

function CreateGroupForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#00FF87');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    setErr('');
    try {
      await api.post('/tag-groups', { name: name.trim(), color });
      setName('');
      setColor('#00FF87');
      await onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'create failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card withBorder padding="md" radius="md" bg="#161616">
      <Stack gap="sm">
        <Title order={5}>New tag group</Title>
        <Group align="end">
          <TextInput
            label="Name"
            placeholder="e.g. Shot type"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            style={{ flex: 1 }}
          />
          <ColorInput
            label="Color"
            value={color}
            onChange={setColor}
            withEyeDropper={false}
            w={150}
          />
          <Button onClick={submit} loading={submitting} disabled={!name.trim()}>
            Add group
          </Button>
        </Group>
        {err && <Text c="red" size="sm">{err}</Text>}
      </Stack>
    </Card>
  );
}

function GroupCard({
  group,
  tags,
  allHotkeys,
  onChanged,
}: {
  group: TagGroup;
  tags: Tag[];
  allHotkeys: string[];
  onChanged: () => Promise<void>;
}) {
  const groupID = group.id;
  if (!groupID) return null;

  // Local optimistic ordering — replaces server state on drop until refresh.
  const sortedTags = useMemo(
    () => [...tags].sort((a, b) => a.display_order - b.display_order),
    [tags],
  );
  const [localOrder, setLocalOrder] = useState<Tag[]>(sortedTags);

  useEffect(() => {
    setLocalOrder(sortedTags);
  }, [sortedTags]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = localOrder.findIndex((t) => t.id === active.id);
    const newIdx = localOrder.findIndex((t) => t.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const next = arrayMove(localOrder, oldIdx, newIdx);
    setLocalOrder(next);
    // Persist display_order for any item whose index actually changed.
    await Promise.all(
      next.map((t, i) =>
        t.display_order === i
          ? null
          : api.patch(`/tags/${t.id}`, { display_order: i }),
      ),
    );
    await onChanged();
  };

  const deleteGroup = async () => {
    if (!confirm(`Delete group "${group.name}" and ${tags.length} tag(s)?`))
      return;
    await api.delete(`/tag-groups/${groupID}`);
    await onChanged();
  };

  return (
    <Card withBorder padding="md" radius="md" bg="#161616">
      <Stack gap="sm">
        <Group justify="space-between">
          <Group gap="sm">
            <ColorSwatch color={group.color} />
            <Title order={5}>{group.name}</Title>
            <Badge variant="default" color="gray">
              {tags.length}
            </Badge>
          </Group>
          <ActionIcon variant="subtle" color="red" onClick={deleteGroup} aria-label="delete group">
            ×
          </ActionIcon>
        </Group>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={localOrder.map((t) => t.id ?? '')}
            strategy={verticalListSortingStrategy}
          >
            <Stack gap="xs">
              {localOrder.map((tag) => (
                <SortableTagRow
                  key={tag.id}
                  tag={tag}
                  allHotkeys={allHotkeys}
                  onChanged={onChanged}
                />
              ))}
            </Stack>
          </SortableContext>
        </DndContext>

        <CreateTagForm groupID={groupID} allHotkeys={allHotkeys} onCreated={onChanged} />
      </Stack>
    </Card>
  );
}

function ColorSwatch({ color }: { color: string }) {
  return (
    <div
      style={{
        width: 18,
        height: 18,
        borderRadius: 4,
        background: color,
        border: '1px solid #2a2a2a',
      }}
    />
  );
}

function SortableTagRow({
  tag,
  allHotkeys,
  onChanged,
}: {
  tag: Tag;
  allHotkeys: string[];
  onChanged: () => Promise<void>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: tag.id ?? '' });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const [hotkey, setHotkey] = useState(tag.hotkey ?? '');
  const [name, setName] = useState(tag.name);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [err, setErr] = useState('');

  // Client-side hotkey conflict check (excluding self).
  useEffect(() => {
    if (!hotkey) {
      setConflict(false);
      return;
    }
    const used = allHotkeys.filter((h) => h !== (tag.hotkey ?? ''));
    setConflict(used.includes(hotkey));
  }, [hotkey, allHotkeys, tag.hotkey]);

  const save = async () => {
    setSaving(true);
    setErr('');
    try {
      await api.patch(`/tags/${tag.id}`, {
        name: name === tag.name ? undefined : name,
        hotkey: hotkey === (tag.hotkey ?? '') ? undefined : hotkey,
      });
      setDirty(false);
      await onChanged();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setErr('hotkey already in use');
      } else {
        setErr(e instanceof Error ? e.message : 'save failed');
      }
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Delete tag "${tag.name}"?`)) return;
    await api.delete(`/tags/${tag.id}`);
    await onChanged();
  };

  return (
    <Group ref={setNodeRef} style={style} gap="sm" wrap="nowrap">
      <Tooltip label="drag to reorder">
        <ActionIcon
          variant="subtle"
          {...attributes}
          {...listeners}
          aria-label="drag handle"
          style={{ cursor: 'grab' }}
        >
          ⋮⋮
        </ActionIcon>
      </Tooltip>
      <TextInput
        value={name}
        onChange={(e) => {
          setName(e.currentTarget.value);
          setDirty(true);
        }}
        style={{ flex: 1 }}
      />
      <TextInput
        value={hotkey}
        onChange={(e) => {
          setHotkey(e.currentTarget.value);
          setDirty(true);
        }}
        placeholder="hotkey"
        w={100}
        error={conflict ? 'conflict' : undefined}
      />
      <Button size="xs" onClick={save} loading={saving} disabled={!dirty || conflict}>
        Save
      </Button>
      <ActionIcon variant="subtle" color="red" onClick={remove} aria-label="delete tag">
        ×
      </ActionIcon>
      {err && (
        <Text c="red" size="xs">
          {err}
        </Text>
      )}
    </Group>
  );
}

function CreateTagForm({
  groupID,
  allHotkeys,
  onCreated,
}: {
  groupID: string;
  allHotkeys: string[];
  onCreated: () => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [hotkey, setHotkey] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');
  const conflict = hotkey.length > 0 && allHotkeys.includes(hotkey);

  const submit = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    setErr('');
    try {
      await api.post('/tags', {
        group_id: groupID,
        name: name.trim(),
        hotkey: hotkey || undefined,
      });
      setName('');
      setHotkey('');
      await onCreated();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setErr('hotkey already in use');
      } else {
        setErr(e instanceof Error ? e.message : 'create failed');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Group gap="sm" align="end">
      <TextInput
        placeholder="new tag name"
        value={name}
        onChange={(e) => setName(e.currentTarget.value)}
        style={{ flex: 1 }}
      />
      <TextInput
        placeholder="hotkey"
        value={hotkey}
        onChange={(e) => setHotkey(e.currentTarget.value)}
        w={100}
        error={conflict ? 'conflict' : undefined}
      />
      <Button size="sm" onClick={submit} loading={submitting} disabled={!name.trim() || conflict}>
        Add tag
      </Button>
      {err && (
        <Text c="red" size="xs">
          {err}
        </Text>
      )}
    </Group>
  );
}
