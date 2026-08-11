# Micosm Game Record Format

Last verified: 2026-08-11

## Product Behavior

- Finished matches remain available in the authenticated recent-match archive.
- A player may explicitly copy a finished match into the cloud game-record
  library. The server retains at most the 10 most recently updated records.
- Saving the same archived match again refreshes its existing cloud record.
- Importing a local file opens it locally first. It is uploaded only after the
  player explicitly chooses cloud save.
- Local files use the `.micosm` extension and may be imported back into the
  replay viewer.
- The replay viewer rebuilds the board from the original move timeline, shows
  the coordinate of every move, supports frame seeking and can auto-play at
  0.5x, 1x, 2x or 4x speed.

## File Contract

MIME type: `application/vnd.micosm.game+json`

The file is UTF-8 JSON with these top-level fields:

```json
{
  "format": "micosm-game-record",
  "version": 1,
  "exportedAt": 1786420000000,
  "record": {}
}
```

`record` contains the title, game, mode, board size, exporting player's color,
display names, result, end reason, start/end timestamps and the replayable final
`MatchState`. It intentionally excludes phone numbers, public/internal user IDs,
session values, room invitations, chat and server configuration.

Version 1 accepts Go on 9/13/19 lines, Gomoku on 15 lines and Reversi on 8x8.
Only ended matches with a complete board and recognized move timeline are
accepted. The parser rejects unsupported versions, files larger than 512 KB,
invalid stones, out-of-range points, inconsistent winners and unfinished games.

Version 1 records exact move order but do not contain per-move thinking time.
Auto-play therefore uses a uniform interval selected by the viewer. A future
format may add optional move timing metadata, but version 1 playback must remain
available and must never invent historical timing values.

The implementation and source of truth are in `lib/game-record.ts`. Do not add
an independent parser in another client.

## Cloud Storage

`saved_game_records` stores a validated complete file snapshot. Access is always
scoped to the authenticated `user_id`; clients never select another owner ID.
The runtime migration is schema version 4 (`saved_game_library`).

The API surface is:

```text
GET    /api/saves
GET    /api/saves?id=<saved-id>
POST   /api/saves  { type: "archive", recordId }
POST   /api/saves  { type: "import", file }
DELETE /api/saves?id=<saved-id>
```

## Future Discussion Attachments

A discussion post must not depend on a mutable personal 10-record slot. When a
player publishes a saved game, copy the validated file into an immutable
`post_game_attachments` row and store that attachment ID on the post. Deleting
the personal cloud record must not break an existing discussion or replay.

Future format versions must use an explicit migration function. Never silently
reinterpret a higher version as version 1, and keep version 1 imports readable
after new optional metadata is introduced.
