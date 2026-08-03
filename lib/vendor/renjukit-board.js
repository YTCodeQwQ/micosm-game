// node_modules/renjukit/dist/board/fundamentals.js
var BOARD_SIZE = 15;
var Player = {
  black: true,
  white: false
};
var isBlack = (player) => player;
var RowKind = {
  two: "two",
  sword: "sword",
  three: "three",
  four: "four",
  five: "five",
  overline: "overline"
};

// node_modules/renjukit/dist/board/point.js
var Direction = {
  vertical: "vertical",
  horizontal: "horizontal",
  ascending: "ascending",
  descending: "descending"
};
var parsePoint = (s) => {
  const x = X_CODE_TO_NUM[s[0]];
  const y = parseInt(s.slice(1)) - 1;
  if (x === void 0 || y === void 0 || isNaN(y) || x < 0 || BOARD_SIZE <= x || y < 0 || BOARD_SIZE <= y) {
    return void 0;
  }
  return [x, y];
};
var wrapPoint = (self) => ({
  unwrap: () => self,
  toIndex: toIndex(self),
  toString: toString(self),
  encode: encode(self)
});
var toIndex = ([x, y]) => (direction) => {
  const n = BOARD_SIZE - 1;
  let i, j;
  switch (direction) {
    case Direction.vertical:
      return [x, y];
    case Direction.horizontal:
      return [y, x];
    case Direction.ascending:
      i = x + n - y;
      j = i < n ? x : y;
      return [i, j];
    case Direction.descending:
      i = x + y;
      j = i < n ? x : n - y;
      return [i, j];
    default:
      return [x, y];
  }
};
var encode = ([x, y]) => () => x * BOARD_SIZE + y;
var toString = ([x, y]) => () => `${pointXToString(x)}${pointYToString(y)}`;
var wrapIndex = (self) => ({
  unwrap: () => self,
  toPoint: toPoint(self)
});
var toPoint = ([i, j]) => (direction) => {
  const n = BOARD_SIZE - 1;
  let x, y;
  switch (direction) {
    case Direction.vertical:
      return [i, j];
    case Direction.horizontal:
      return [j, i];
    case Direction.ascending:
      x = i < n ? j : i + j - n;
      y = i < n ? n - i + j : j;
      return [x, y];
    case Direction.descending:
      x = i < n ? j : i + j - n;
      y = i < n ? i - j : n - j;
      return [x, y];
    default:
      return [i, j];
  }
};
var parsePoints = (s) => {
  const ss = s.match(/[a-oA-O][0-9]+/g);
  if (!ss)
    return;
  const ps = ss.map(parsePoint);
  if (ps.some((p) => p === void 0))
    return void 0;
  return ps.map((p) => p);
};
var pointXToString = (x) => X_CODES.charAt(x);
var pointYToString = (y) => (y + 1).toString();
var X_CODES = "ABCDEFGHIJKLMNO";
var X_CODE_TO_NUM = {
  A: 0,
  B: 1,
  C: 2,
  D: 3,
  E: 4,
  F: 5,
  G: 6,
  H: 7,
  I: 8,
  J: 9,
  K: 10,
  L: 11,
  M: 12,
  N: 13,
  O: 14,
  a: 0,
  b: 1,
  c: 2,
  d: 3,
  e: 4,
  f: 5,
  g: 6,
  h: 7,
  i: 8,
  j: 9,
  k: 10,
  l: 11,
  m: 12,
  n: 13,
  o: 14
};

// node_modules/renjukit/dist/board/row.js
var makeRow = (r, d, i) => ({
  direction: d,
  start: wrapIndex([i, r.start]).toPoint(d),
  end: wrapIndex([i, r.end]).toPoint(d),
  eye1: r.eye1 !== void 0 ? wrapIndex([i, r.eye1]).toPoint(d) : void 0,
  eye2: r.eye2 !== void 0 ? wrapIndex([i, r.eye2]).toPoint(d) : void 0
});
var wrapRow = (self) => ({
  unwrap: () => self,
  overlap: overlap(self),
  adjacent: adjacent(self),
  eyes: eyes(self)
});
var overlap = (self) => (p) => {
  const [px, py] = p;
  const [sx, sy] = self.start;
  const [ex, ey] = self.end;
  switch (self.direction) {
    case Direction.vertical:
      return px == sx && bw(sy, py, ey);
    case Direction.horizontal:
      return py == sy && bw(sx, px, ex);
    case Direction.ascending:
      return bw(sx, px, ex) && bw(sy, py, ey) && px - sx == py - sy;
    case Direction.descending:
      return bw(sx, px, ex) && bw(ey, py, sy) && px - sx == sy - py;
    default:
      return false;
  }
};
var adjacent = (self) => (other) => {
  if (self.direction !== other.direction)
    return false;
  const [sx, sy] = self.start;
  const [ox, oy] = other.start;
  const [xd, yd] = [sx - ox, sy - oy];
  switch (self.direction) {
    case Direction.vertical:
      return Math.abs(xd) === 0 && Math.abs(yd) === 1;
    case Direction.horizontal:
      return Math.abs(xd) === 1 && Math.abs(yd) === 0;
    case Direction.ascending:
      return Math.abs(xd) === 1 && xd === yd;
    case Direction.descending:
      return Math.abs(xd) === 1 && xd === -yd;
    default:
      return false;
  }
};
var eyes = (self) => () => {
  if (self.eye1 === void 0) {
    return [];
  } else if (self.eye2 === void 0) {
    return [self.eye1];
  } else {
    return [self.eye1, self.eye2];
  }
};
var bw = (a, x, b) => a <= x && x <= b;

// node_modules/renjukit/dist/board/sequence.js
var scanSequences = (player, kind, stones4, blanks2, limit, offset) => {
  if (isBlack(player)) {
    switch (kind) {
      case RowKind.two:
        return scan(B_TWO, B_TWOS, stones4, blanks2, limit, offset);
      case RowKind.sword:
        return scan(B_SWORD, B_SWORDS, stones4, blanks2, limit, offset);
      case RowKind.three:
        return scan(B_THREE, B_THREES, stones4, blanks2, limit, offset);
      case RowKind.four:
        return scan(B_FOUR, B_FOURS, stones4, blanks2, limit, offset);
      case RowKind.five:
        return scan(B_FIVE, B_FIVES, stones4, blanks2, limit, offset);
      case RowKind.overline:
        return scan(B_OVERLINE, B_OVERLINES, stones4, blanks2, limit, offset);
    }
  } else {
    switch (kind) {
      case RowKind.two:
        return scan(W_TWO, W_TWOS, stones4, blanks2, limit, offset);
      case RowKind.sword:
        return scan(W_SWORD, W_SWORDS, stones4, blanks2, limit, offset);
      case RowKind.three:
        return scan(W_THREE, W_THREES, stones4, blanks2, limit, offset);
      case RowKind.four:
        return scan(W_FOUR, W_FOURS, stones4, blanks2, limit, offset);
      case RowKind.five:
        return scan(W_FIVE, W_FIVES, stones4, blanks2, limit, offset);
      default:
        return [];
    }
  }
  return [];
};
var scan = (window, patterns, stones4, blanks2, limit, offset) => {
  const result = [];
  const size = window.size;
  if (limit < size) {
    return result;
  }
  for (let i = 0; i <= limit - size; i++) {
    const stones_ = stones4 >> i;
    const blanks_ = blanks2 >> i;
    if (!wrapWindow(window).satisfies(stones_, blanks_))
      continue;
    for (const p of patterns) {
      if (!wrapPattern(p).matches(stones_, blanks_))
        continue;
      result.push({
        start: p.start + i - offset,
        end: p.end + i - offset,
        eye1: p.eye1 === void 0 ? void 0 : p.eye1 + i - offset,
        eye2: p.eye2 === void 0 ? void 0 : p.eye2 + i - offset
      });
    }
  }
  return result;
};
var wrapWindow = (self) => ({
  unwrap: () => self,
  satisfies: satisfies(self)
});
var satisfies = (self) => (stones4, blanks2) => {
  return (self.target & (stones4 | blanks2)) === self.target;
};
var wrapPattern = (self) => ({
  unwrap: () => self,
  matches: matches(self)
});
var matches = (self) => (stones4, blanks2) => {
  return (stones4 & self.filter) === self.stones && (blanks2 & self.filter & self.blanks) === self.blanks;
};
var B_TWO = {
  size: 8,
  target: 126
};
var B_TWOS = [
  {
    filter: 255,
    stones: 12,
    blanks: 114,
    start: 2,
    end: 5,
    eye1: 4,
    eye2: 5
  },
  {
    filter: 255,
    stones: 20,
    blanks: 106,
    start: 2,
    end: 5,
    eye1: 3,
    eye2: 5
  },
  {
    filter: 255,
    stones: 24,
    blanks: 102,
    start: 2,
    end: 5,
    eye1: 2,
    eye2: 5
  },
  {
    filter: 255,
    stones: 36,
    blanks: 90,
    start: 2,
    end: 5,
    eye1: 3,
    eye2: 4
  },
  {
    filter: 255,
    stones: 40,
    blanks: 86,
    start: 2,
    end: 5,
    eye1: 2,
    eye2: 4
  },
  {
    filter: 255,
    stones: 48,
    blanks: 78,
    start: 2,
    end: 5,
    eye1: 2,
    eye2: 3
  }
];
var B_THREE = {
  size: 8,
  target: 126
};
var B_THREES = [
  {
    filter: 255,
    stones: 28,
    blanks: 98,
    start: 2,
    end: 5,
    eye1: 5,
    eye2: void 0
  },
  {
    filter: 255,
    stones: 44,
    blanks: 82,
    start: 2,
    end: 5,
    eye1: 4,
    eye2: void 0
  },
  {
    filter: 255,
    stones: 52,
    blanks: 74,
    start: 2,
    end: 5,
    eye1: 3,
    eye2: void 0
  },
  {
    filter: 255,
    stones: 56,
    blanks: 70,
    start: 2,
    end: 5,
    eye1: 2,
    eye2: void 0
  }
];
var B_SWORD = {
  size: 7,
  target: 62
};
var B_SWORDS = [
  {
    filter: 127,
    stones: 14,
    blanks: 48,
    start: 1,
    end: 5,
    eye1: 4,
    eye2: 5
  },
  {
    filter: 127,
    stones: 22,
    blanks: 40,
    start: 1,
    end: 5,
    eye1: 3,
    eye2: 5
  },
  {
    filter: 127,
    stones: 26,
    blanks: 36,
    start: 1,
    end: 5,
    eye1: 2,
    eye2: 5
  },
  {
    filter: 127,
    stones: 28,
    blanks: 34,
    start: 1,
    end: 5,
    eye1: 1,
    eye2: 5
  },
  {
    filter: 127,
    stones: 38,
    blanks: 24,
    start: 1,
    end: 5,
    eye1: 3,
    eye2: 4
  },
  {
    filter: 127,
    stones: 42,
    blanks: 20,
    start: 1,
    end: 5,
    eye1: 2,
    eye2: 4
  },
  {
    filter: 127,
    stones: 44,
    blanks: 18,
    start: 1,
    end: 5,
    eye1: 1,
    eye2: 4
  },
  {
    filter: 127,
    stones: 50,
    blanks: 12,
    start: 1,
    end: 5,
    eye1: 2,
    eye2: 3
  },
  {
    filter: 127,
    stones: 52,
    blanks: 10,
    start: 1,
    end: 5,
    eye1: 1,
    eye2: 3
  },
  {
    filter: 127,
    stones: 56,
    blanks: 6,
    start: 1,
    end: 5,
    eye1: 1,
    eye2: 2
  }
];
var B_FOUR = {
  size: 7,
  target: 62
};
var B_FOURS = [
  {
    filter: 127,
    stones: 30,
    blanks: 32,
    start: 1,
    end: 5,
    eye1: 5,
    eye2: void 0
  },
  {
    filter: 127,
    stones: 46,
    blanks: 16,
    start: 1,
    end: 5,
    eye1: 4,
    eye2: void 0
  },
  {
    filter: 127,
    stones: 54,
    blanks: 8,
    start: 1,
    end: 5,
    eye1: 3,
    eye2: void 0
  },
  {
    filter: 127,
    stones: 58,
    blanks: 4,
    start: 1,
    end: 5,
    eye1: 2,
    eye2: void 0
  },
  {
    filter: 127,
    stones: 60,
    blanks: 2,
    start: 1,
    end: 5,
    eye1: 1,
    eye2: void 0
  }
];
var B_FIVE = {
  size: 7,
  target: 62
};
var B_FIVES = [
  {
    filter: 127,
    stones: 62,
    blanks: 0,
    start: 1,
    end: 5,
    eye1: void 0,
    eye2: void 0
  }
];
var B_OVERLINE = {
  size: 6,
  target: 63
};
var B_OVERLINES = [
  {
    filter: 63,
    stones: 63,
    blanks: 0,
    start: 0,
    end: 5,
    eye1: void 0,
    eye2: void 0
  }
];
var W_TWO = {
  size: 6,
  target: 63
};
var W_TWOS = [
  {
    filter: 63,
    stones: 6,
    blanks: 57,
    start: 1,
    end: 4,
    eye1: 3,
    eye2: 4
  },
  {
    filter: 63,
    stones: 10,
    blanks: 53,
    start: 1,
    end: 4,
    eye1: 2,
    eye2: 4
  },
  {
    filter: 63,
    stones: 12,
    blanks: 51,
    start: 1,
    end: 4,
    eye1: 1,
    eye2: 4
  },
  {
    filter: 63,
    stones: 18,
    blanks: 45,
    start: 1,
    end: 4,
    eye1: 2,
    eye2: 3
  },
  {
    filter: 63,
    stones: 20,
    blanks: 43,
    start: 1,
    end: 4,
    eye1: 1,
    eye2: 3
  },
  {
    filter: 63,
    stones: 24,
    blanks: 39,
    start: 1,
    end: 4,
    eye1: 1,
    eye2: 2
  }
];
var W_THREE = {
  size: 6,
  target: 63
};
var W_THREES = [
  {
    filter: 63,
    stones: 14,
    blanks: 49,
    start: 1,
    end: 4,
    eye1: 4,
    eye2: void 0
  },
  {
    filter: 63,
    stones: 22,
    blanks: 41,
    start: 1,
    end: 4,
    eye1: 3,
    eye2: void 0
  },
  {
    filter: 63,
    stones: 26,
    blanks: 37,
    start: 1,
    end: 4,
    eye1: 2,
    eye2: void 0
  },
  {
    filter: 63,
    stones: 28,
    blanks: 35,
    start: 1,
    end: 4,
    eye1: 1,
    eye2: void 0
  }
];
var W_SWORD = {
  size: 5,
  target: 31
};
var W_SWORDS = [
  {
    filter: 31,
    stones: 7,
    blanks: 24,
    start: 0,
    end: 4,
    eye1: 3,
    eye2: 4
  },
  {
    filter: 31,
    stones: 11,
    blanks: 20,
    start: 0,
    end: 4,
    eye1: 2,
    eye2: 4
  },
  {
    filter: 31,
    stones: 13,
    blanks: 18,
    start: 0,
    end: 4,
    eye1: 1,
    eye2: 4
  },
  {
    filter: 31,
    stones: 14,
    blanks: 17,
    start: 0,
    end: 4,
    eye1: 0,
    eye2: 4
  },
  {
    filter: 31,
    stones: 19,
    blanks: 12,
    start: 0,
    end: 4,
    eye1: 2,
    eye2: 3
  },
  {
    filter: 31,
    stones: 21,
    blanks: 10,
    start: 0,
    end: 4,
    eye1: 1,
    eye2: 3
  },
  {
    filter: 31,
    stones: 22,
    blanks: 9,
    start: 0,
    end: 4,
    eye1: 0,
    eye2: 3
  },
  {
    filter: 31,
    stones: 25,
    blanks: 6,
    start: 0,
    end: 4,
    eye1: 1,
    eye2: 2
  },
  {
    filter: 31,
    stones: 26,
    blanks: 5,
    start: 0,
    end: 4,
    eye1: 0,
    eye2: 2
  },
  {
    filter: 31,
    stones: 28,
    blanks: 3,
    start: 0,
    end: 4,
    eye1: 0,
    eye2: 1
  }
];
var W_FOUR = {
  size: 5,
  target: 31
};
var W_FOURS = [
  {
    filter: 31,
    stones: 15,
    blanks: 16,
    start: 0,
    end: 4,
    eye1: 4,
    eye2: void 0
  },
  {
    filter: 31,
    stones: 23,
    blanks: 8,
    start: 0,
    end: 4,
    eye1: 3,
    eye2: void 0
  },
  {
    filter: 31,
    stones: 27,
    blanks: 4,
    start: 0,
    end: 4,
    eye1: 2,
    eye2: void 0
  },
  {
    filter: 31,
    stones: 29,
    blanks: 2,
    start: 0,
    end: 4,
    eye1: 1,
    eye2: void 0
  },
  {
    filter: 31,
    stones: 30,
    blanks: 1,
    start: 0,
    end: 4,
    eye1: 0,
    eye2: void 0
  }
];
var W_FIVE = {
  size: 5,
  target: 31
};
var W_FIVES = [
  {
    filter: 31,
    stones: 31,
    blanks: 0,
    start: 0,
    end: 4,
    eye1: void 0,
    eye2: void 0
  }
];

// node_modules/renjukit/dist/board/line.js
var createLine = (size) => ({
  size: Math.min(size, BOARD_SIZE),
  blacks: 0,
  whites: 0
});
var parseLine = (s) => {
  const chars = s.split("");
  const size = chars.length;
  if (size > BOARD_SIZE)
    return void 0;
  let result = wrapLine(createLine(size));
  for (let i = 0; i < size; i++) {
    const c = chars[i];
    if (c === "o") {
      result = result.put(Player.black, i);
    } else if (c === "x") {
      result = result.put(Player.white, i);
    }
  }
  return result.unwrap();
};
var wrapLine = (self) => ({
  unwrap: () => self,
  put: put(self),
  remove: remove(self),
  stones: stones(self),
  sequences: sequences(self),
  eq: eq(self),
  toString: toString2(self)
});
var put = (self) => (player, i) => {
  const stones4 = 1 << i;
  let blacks = self.blacks;
  let whites = self.whites;
  if (isBlack(player)) {
    blacks |= stones4;
    whites &= ~stones4;
  } else {
    blacks &= ~stones4;
    whites |= stones4;
  }
  return wrapLine({
    ...self,
    blacks,
    whites
  });
};
var remove = (self) => (i) => {
  const stones4 = 1 << i;
  const blacks = self.blacks & ~stones4;
  const whites = self.whites & ~stones4;
  return wrapLine({
    ...self,
    blacks,
    whites
  });
};
var stones = (self) => () => {
  return new Array(self.size).fill(null).map((_, i) => {
    const pat = 1 << i;
    if ((self.blacks & pat) !== 0) {
      return Player.black;
    } else if ((self.whites & pat) !== 0) {
      return Player.white;
    } else {
      return void 0;
    }
  });
};
var sequences = (self) => (player, kind) => {
  if (!mayContain(self, player, kind))
    return [];
  const offset = 1;
  const stones_ = (isBlack(player) ? self.blacks : self.whites) << 1;
  const blanks_ = blanks(self) << 1;
  const limit = self.size + offset * 2;
  return scanSequences(player, kind, stones_, blanks_, limit, 1);
};
var eq = (self) => (other) => self.size === other.size && self.blacks === other.blacks && self.whites === other.whites;
var toString2 = (self) => () => stones(self)().map((v) => {
  if (v === true) {
    return "o";
  } else if (v === false) {
    return "x";
  } else {
    return "-";
  }
}).join("");
var mayContain = (self, player, kind) => {
  const blanks_ = blanks(self);
  const minBlank = minBlankCount(kind);
  if (countOnes(blanks_) < minBlank)
    return false;
  const minStone = minStoneCount(kind);
  if (isBlack(player)) {
    return countOnes(self.blacks) >= minStone;
  } else {
    return countOnes(self.whites) >= minStone;
  }
};
var blanks = (self) => ~(self.blacks | self.whites) & (1 << self.size) - 1;
var minStoneCount = (kind) => {
  switch (kind) {
    case RowKind.two:
      return 2;
    case RowKind.sword:
      return 3;
    case RowKind.three:
      return 3;
    case RowKind.four:
      return 4;
    case RowKind.five:
      return 5;
    case RowKind.overline:
      return 6;
    default:
      return 0;
  }
};
var minBlankCount = (kind) => {
  switch (kind) {
    case RowKind.two:
      return 4;
    case RowKind.sword:
      return 2;
    case RowKind.three:
      return 3;
    case RowKind.four:
      return 1;
    case RowKind.five:
      return 0;
    case RowKind.overline:
      return 0;
    default:
      return 0;
  }
};
var countOnes = (bits) => {
  let result = 0;
  for (let i = 0; i < BOARD_SIZE; i++) {
    if ((1 << i & bits) !== 0)
      result++;
  }
  return result;
};

// node_modules/renjukit/dist/board/square.js
var createSquare = () => ({
  vlines: orthogonalLines(),
  hlines: orthogonalLines(),
  alines: diagonalLines(),
  dlines: diagonalLines()
});
var makeSquare = (blacks, whites) => {
  let square = wrapSquare(createSquare());
  for (const p of blacks) {
    square = square.put(Player.black, p);
  }
  for (const p of whites) {
    square = square.put(Player.white, p);
  }
  return square.unwrap();
};
var parseSquare = (s) => {
  if (s.includes("/")) {
    return fromStringPoints(s);
  } else {
    return fromStringDisplay(s);
  }
};
var wrapSquare = (self) => ({
  unwrap: () => self,
  put: put2(self),
  remove: remove2(self),
  stones: stones2(self),
  rows: rows(self),
  rowsOn: rowsOn(self),
  toString: toString3(self)
});
var D_LINE_NUM = (BOARD_SIZE - 4) * 2 - 1;
var orthogonalLines = () => [
  createLine(BOARD_SIZE),
  createLine(BOARD_SIZE),
  createLine(BOARD_SIZE),
  createLine(BOARD_SIZE),
  createLine(BOARD_SIZE),
  createLine(BOARD_SIZE),
  createLine(BOARD_SIZE),
  createLine(BOARD_SIZE),
  createLine(BOARD_SIZE),
  createLine(BOARD_SIZE),
  createLine(BOARD_SIZE),
  createLine(BOARD_SIZE),
  createLine(BOARD_SIZE),
  createLine(BOARD_SIZE),
  createLine(BOARD_SIZE)
];
var diagonalLines = () => [
  createLine(BOARD_SIZE - 10),
  createLine(BOARD_SIZE - 9),
  createLine(BOARD_SIZE - 8),
  createLine(BOARD_SIZE - 7),
  createLine(BOARD_SIZE - 6),
  createLine(BOARD_SIZE - 5),
  createLine(BOARD_SIZE - 4),
  createLine(BOARD_SIZE - 3),
  createLine(BOARD_SIZE - 2),
  createLine(BOARD_SIZE - 1),
  createLine(BOARD_SIZE),
  createLine(BOARD_SIZE - 1),
  createLine(BOARD_SIZE - 2),
  createLine(BOARD_SIZE - 3),
  createLine(BOARD_SIZE - 4),
  createLine(BOARD_SIZE - 5),
  createLine(BOARD_SIZE - 6),
  createLine(BOARD_SIZE - 7),
  createLine(BOARD_SIZE - 8),
  createLine(BOARD_SIZE - 9),
  createLine(BOARD_SIZE - 10)
];
var fromStringPoints = (s) => {
  const codes = s.trim().split("/");
  if (codes.length !== 2)
    return void 0;
  const blacks = parsePoints(codes[0]);
  if (blacks === void 0)
    return void 0;
  const whites = parsePoints(codes[1]);
  if (whites === void 0)
    return void 0;
  return makeSquare(blacks, whites);
};
var fromStringDisplay = (s) => {
  const hlines = s.trim().split("\n").reverse().map((ls) => parseLine(ls.trim())).filter((l) => l !== void 0);
  if (hlines.length !== BOARD_SIZE)
    return void 0;
  let square = wrapSquare(createSquare());
  for (const [y, hline] of hlines.map((hline2, y2) => [y2, hline2])) {
    if (hline.size !== BOARD_SIZE)
      return void 0;
    const stons = wrapLine(hline).stones();
    for (const [x, s2] of stons.map((s3, x2) => [x2, s3])) {
      const point = [x, y];
      if (s2 === void 0)
        continue;
      square = square.put(s2, point);
    }
  }
  return square.unwrap();
};
var put2 = (self) => (player, p) => {
  const wp = wrapPoint(p);
  const vidx = wp.toIndex(Direction.vertical);
  const vlines = self.vlines.map((l, i) => i === vidx[0] ? wrapLine(l).put(player, vidx[1]).unwrap() : l);
  const hidx = wp.toIndex(Direction.horizontal);
  const hlines = self.hlines.map((l, i) => i === hidx[0] ? wrapLine(l).put(player, hidx[1]).unwrap() : l);
  const aidx = wp.toIndex(Direction.ascending);
  const alines = bw2(4, aidx[0], D_LINE_NUM + 3) ? self.alines.map((l, i) => i === aidx[0] - 4 ? wrapLine(l).put(player, aidx[1]).unwrap() : l) : self.alines;
  const didx = wp.toIndex(Direction.descending);
  const dlines = bw2(4, didx[0], D_LINE_NUM + 3) ? self.dlines.map((l, i) => i === didx[0] - 4 ? wrapLine(l).put(player, didx[1]).unwrap() : l) : self.dlines;
  return wrapSquare({
    vlines,
    hlines,
    alines,
    dlines
  });
};
var remove2 = (self) => (p) => {
  const wp = wrapPoint(p);
  const vidx = wp.toIndex(Direction.vertical);
  const vlines = self.vlines.map((l, i) => i === vidx[0] ? wrapLine(l).remove(vidx[1]).unwrap() : l);
  const hidx = wp.toIndex(Direction.horizontal);
  const hlines = self.hlines.map((l, i) => i === hidx[0] ? wrapLine(l).remove(hidx[1]).unwrap() : l);
  const aidx = wp.toIndex(Direction.ascending);
  const alines = bw2(4, aidx[0], D_LINE_NUM + 3) ? self.alines.map((l, i) => i === aidx[0] - 4 ? wrapLine(l).remove(aidx[1]).unwrap() : l) : self.alines;
  const didx = wp.toIndex(Direction.descending);
  const dlines = bw2(4, didx[0], D_LINE_NUM + 3) ? self.dlines.map((l, i) => i === didx[0] - 4 ? wrapLine(l).remove(didx[1]).unwrap() : l) : self.dlines;
  return wrapSquare({
    vlines,
    hlines,
    alines,
    dlines
  });
};
var stones2 = (self) => (player) => self.vlines.flatMap((l, i) => wrapLine(l).stones().map((s, j) => s === player ? [i, j] : void 0).filter((p) => p !== void 0));
var rows = (self) => (player, kind) => lines(self).map(([d, i, l]) => wrapLine(l).sequences(player, kind).map((s) => makeRow(s, d, i))).flat(1);
var rowsOn = (self) => (player, kind, p) => linesAlong(self, p).map(([d, i, l]) => wrapLine(l).sequences(player, kind).map((s) => makeRow(s, d, i)).filter((r) => wrapRow(r).overlap(p))).flat(1);
var toString3 = (self) => () => self.hlines.slice().reverse().map((l) => wrapLine(l).toString()).join("\n");
var lines = (self) => {
  const vlines = self.vlines.map((l, i) => [Direction.vertical, i, l]);
  const hlines = self.hlines.map((l, i) => [Direction.horizontal, i, l]);
  const alines = self.alines.map((l, i) => [Direction.ascending, i + 4, l]);
  const dlines = self.dlines.map((l, i) => [Direction.descending, i + 4, l]);
  return [...vlines, ...hlines, ...alines, ...dlines];
};
var linesAlong = (self, p) => {
  const wp = wrapPoint(p);
  const vi = wp.toIndex(Direction.vertical)[0];
  const vlines = [[Direction.vertical, vi, self.vlines[vi]]];
  const hi = wp.toIndex(Direction.horizontal)[0];
  const hlines = [[Direction.horizontal, hi, self.hlines[hi]]];
  const ai = wp.toIndex(Direction.ascending)[0];
  const alines = bw2(4, ai, D_LINE_NUM + 3) ? [[Direction.ascending, ai, self.alines[ai - 4]]] : [];
  const di = wp.toIndex(Direction.descending)[0];
  const dlines = bw2(4, di, D_LINE_NUM + 3) ? [[Direction.descending, di, self.dlines[di - 4]]] : [];
  return [...vlines, ...hlines, ...alines, ...dlines];
};
var bw2 = (a, x, b) => a <= x && x <= b;

// node_modules/renjukit/dist/board/forbidden.js
var ForbiddenKind = {
  doubleThree: "doubleThree",
  doubleFour: "doubleFour",
  overline: "overline"
};
var forbiddens = (square) => new Array(BOARD_SIZE).fill(null).map((_, x) => new Array(BOARD_SIZE).fill(null).map((_2, y) => {
  const p = [x, y];
  return [forbidden(square, p), p];
}).filter(([k, _2]) => k !== void 0)).flat(1).map(([k, p]) => [k, p]);
var forbidden = (square, p) => {
  const next = wrapSquare(square).put(Player.black, p);
  if (overline(next, p)) {
    return ForbiddenKind.overline;
  } else if (doubleFour(next, p)) {
    return ForbiddenKind.doubleFour;
  } else if (doubleThree(next, p)) {
    return ForbiddenKind.doubleThree;
  }
};
var overline = (next, p) => {
  const newOverlines = next.rowsOn(Player.black, RowKind.overline, p);
  return newOverlines.length >= 1;
};
var doubleFour = (next, p) => {
  const newFours = next.rowsOn(Player.black, RowKind.four, p);
  if (newFours.length < 2)
    return false;
  return distinctive(newFours);
};
var doubleThree = (next, p) => {
  const newThrees = next.rowsOn(Player.black, RowKind.three, p);
  if (newThrees.length < 2 || !distinctive(newThrees))
    return false;
  const truthyThrees = newThrees.filter((r) => forbidden(next.unwrap(), r.eye1) === void 0);
  if (truthyThrees.length < 2)
    return false;
  return distinctive(truthyThrees);
};
var distinctive = (rows3) => {
  const first = wrapRow(rows3[0]);
  for (const row of rows3.slice(1)) {
    if (!first.adjacent(row))
      return true;
  }
  return false;
};

// node_modules/renjukit/dist/board/board.js
var createBoard = () => ({
  square: createSquare()
});
var makeBoard = (blacks, whites) => ({
  square: makeSquare(blacks, whites)
});
var parseBoard = (s) => {
  const square = parseSquare(s);
  if (square === void 0) {
    return void 0;
  } else {
    return { square };
  }
};
var wrapBoard = (self) => ({
  unwrap: () => self,
  put: put3(self),
  remove: remove3(self),
  stones: stones3(self),
  rows: rows2(self),
  rowsOn: rowsOn2(self),
  forbidden: forbidden2(self),
  forbiddens: forbiddens2(self),
  toString: toString4(self)
});
var put3 = (self) => (player, p) => wrapBoard({
  square: wrapSquare(self.square).put(player, p).unwrap()
});
var remove3 = (self) => (p) => wrapBoard({
  square: wrapSquare(self.square).remove(p).unwrap()
});
var stones3 = (self) => (player) => wrapSquare(self.square).stones(player);
var rows2 = (self) => (player, kind) => wrapSquare(self.square).rows(player, kind);
var rowsOn2 = (self) => (player, kind, p) => wrapSquare(self.square).rowsOn(player, kind, p);
var forbiddens2 = (self) => () => forbiddens(self.square);
var forbidden2 = (self) => (p) => forbidden(self.square, p);
var toString4 = (self) => () => wrapSquare(self.square).toString();
export {
  createBoard,
  makeBoard,
  parseBoard,
  wrapBoard
};
