# Unreads Implementation

This document describes the server-side unreads tracking implementation for OriginChats client.

## Recent Changes (2026-04-09)

### Removed Old Cloud Persistence System
- Removed `cloudPersistenceEnabled` flag from `unread.ts`
- Removed `mergeFromCloud()` method - unreads are now fully server-driven
- Removed cloud sync calls from persistence logic
- Removed `mergeFromCloud()` call from `main.tsx`

### Added Server-Driven Unread Methods
- Added `setChannelUnread(channelId, count)` to `UnreadState` - sets unread count from server
- Added `setAllUnreads(unreads)` to `UnreadState` - bulk replace all unreads from server

### Enhanced markChannelAsRead
- Updated `markChannelAsRead()` in `actions.ts` to send `unreads_ack` command to server
- Checks server capabilities before sending command

### WebSocket Routing
- Added unreads command handlers to websocket imports
- Added routing cases for `unreads_get`, `unreads_count`, `unreads_ack`, `unreads_update`

## Overview

The client now supports server-side unreads tracking using the following commands:
- `unreads_get` - Get all unread counts across channels
- `unreads_count` - Get unread count for a single channel/thread
- `unreads_ack` - Mark a channel/thread as read
- `unreads_update` - Receive updates when read state changes (broadcast event)

## Architecture

### Type Definitions (`src/msgTypes.ts`)

Added four new message types:
- `UnreadsGet` - Response with all channel unreads
- `UnreadsCount` - Response with single channel/thread unread count
- `UnreadsAck` - Confirmation that channel/thread was marked as read
- `UnreadsUpdate` - Broadcast when another session marks something as read

### Command Handlers (`src/lib/commands/unreads/unreads.ts`)

Created handlers for all four message types that update the local `unreadState`.

### WebSocket Integration (`src/lib/websocket.ts`)

- Imported handlers and registered them in the message switch statement
- Handles `unreads_get`, `unreads_count`, `unreads_ack`, and `unreads_update` commands

### Helper Functions (`src/lib/ws-sender.ts`)

Added convenient helper functions:
- `markChannelAsRead(channelName, messageId?, sUrl?)` - Mark a channel as read
- `markThreadAsRead(threadId, messageId?, sUrl?)` - Mark a thread as read
- `getUnreadCount(channelName, sUrl?)` - Get unread count for a channel
- `getThreadUnreadCount(threadId, sUrl?)` - Get unread count for a thread
- `getAllUnreads(sUrl?)` - Request all unreads from server

### Auto-Ack on Message Fetch (`src/lib/commands/message/s_get.ts`)

When `messages_get` is called, the client automatically marks the channel/thread as read up to the latest message. This matches the server behavior described in the documentation.

### Ready Handler (`src/lib/commands/ready.ts`)

When the client receives the `ready` event after authentication, it automatically requests all unreads from the server if the server supports the `unreads_get` capability.

## Usage

### Get All Unreads on Connect

The client automatically fetches unreads when ready. If you need to manually refresh:

```typescript
import { getAllUnreads } from '@/lib/ws-sender';

// Request all unreads for current server
getAllUnreads();

// Request for specific server
getAllUnreads('server.example.com');
```

### Mark Channel as Read

```typescript
import { markChannelAsRead } from '@/lib/ws-sender';

// Mark channel as fully read (up to latest message)
markChannelAsRead('general');

// Mark channel as read up to specific message
markChannelAsRead('general', 'msg_abc123');
```

### Mark Thread as Read

```typescript
import { markThreadAsRead } from '@/lib/ws-sender';

// Mark thread as fully read
markThreadAsRead('thread-12345');

// Mark thread as read up to specific message
markThreadAsRead('thread-12345', 'msg_xyz789');
```

### Get Unread Count for Channel

```typescript
import { getUnreadCount } from '@/lib/ws-sender';

// Get unread count for a channel
getUnreadCount('general');
```

### Get Unread Count for Thread

```typescript
import { getThreadUnreadCount } from '@/lib/ws-sender';

// Get unread count for a thread
getThreadUnreadCount('thread-12345');
```

### Access Unread State

The existing `unreadState` object is used to store and access unreads:

```typescript
import { unreadState } from '@/lib/state/unread';

// Get unreads for a channel
const { pings, unreads } = unreadState.getChannel(serverUrl, 'general');

// Check if channel has unreads
const hasUnreads = unreadState.hasUnreads(serverUrl, 'general');

// Get total unreads across all channels on a server
const { pings, unreads } = unreadState.getServerTotals(serverUrl);

// Get total unreads across all servers
const totalPings = unreadState.getTotalPings();
const totalUnreads = unreadState.getTotalUnreads();
```

## Automatic Behavior

### Auto-Ack on Message Fetch

When you fetch messages using `messages_get`, the client automatically marks the channel/thread as read up to the latest message. This keeps unreads in sync without manual intervention.

### Cross-Session Sync

When you mark a channel/thread as read in one session, the server broadcasts an `unreads_update` event to all your other sessions. The client handles this automatically to keep all sessions in sync.

## Server Capability Check

Before using unreads features, check if the server supports them:

```typescript
import { serverCapabilitiesByServer } from '@/state';

const caps = serverCapabilitiesByServer.value[serverUrl] || [];
if (caps.includes('unreads_get')) {
  // Server supports unreads tracking
  getAllUnreads(serverUrl);
}
```

## Implementation Notes

1. **Thread Keys**: Thread unreads are stored with the key format `thread:{thread_id}` to distinguish them from channel unreads.

2. **Persistence**: The existing `unreadState` already handles persistence to IndexedDB and cloud sync, so server-side unreads are automatically persisted.

3. **Auto-Fetch**: Unreads are automatically fetched when the client connects and receives the `ready` event (if the server supports `unreads_get` capability).

4. **Auto-Clear**: When viewing a channel and fetching messages, unreads are automatically cleared via the `unreads_ack` command.

5. **Sync**: The `unreads_update` event keeps multiple client sessions in sync when one marks a channel as read.
