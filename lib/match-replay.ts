import {
  activateMatch,
  applyMatchAction,
  createMatchState,
  type MatchState,
} from "./match-engine.ts";

function boardsMatch(left: MatchState["board"], right: MatchState["board"]) {
  return left.length === right.length && left.every((row, rowIndex) => (
    row.length === right[rowIndex]?.length
    && row.every((stone, colIndex) => stone === right[rowIndex]?.[colIndex])
  ));
}

export function buildReplayFrames(source?: MatchState) {
  if (!source?.board?.length) return [] as MatchState[];

  let state = activateMatch(createMatchState(
    source.game,
    source.size,
    "black",
    Boolean(source.gomokuForbidden),
  ));
  const frames = [state];

  for (const move of source.moves ?? []) {
    try {
      if (move.type === "play") {
        state = applyMatchAction(state, move.player, { type: "play", row: move.row, col: move.col });
      } else if (move.type === "pass") {
        state = applyMatchAction(state, move.player, { type: "pass" });
      } else if (move.type === "resumeGo") {
        state = applyMatchAction(state, move.player, { type: "resumeGo" });
      }
      frames.push(state);
    } catch {
      break;
    }
  }

  // Imported and legacy records can have an incomplete move list. The room
  // snapshot remains authoritative for the board an administrator inspects.
  if (!boardsMatch(frames.at(-1)?.board ?? [], source.board)) frames.push(source);
  return frames;
}
