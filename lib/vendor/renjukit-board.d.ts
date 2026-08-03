export type RenjuPoint = [number, number];
export type ForbiddenKind = "doubleThree" | "doubleFour" | "overline";
export type RenjuBoard = { square: unknown };

export function makeBoard(blacks: RenjuPoint[], whites: RenjuPoint[]): RenjuBoard;
export function wrapBoard(board: RenjuBoard): {
  forbidden(point: RenjuPoint): ForbiddenKind | undefined;
};
