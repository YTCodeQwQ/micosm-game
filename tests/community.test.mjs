import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanCommentBody,
  cleanPostBody,
  cleanPostTitle,
  discussionCategory,
  ensureCommunitySchema,
  extractDiscussionMentions,
} from "../lib/community.ts";

test("community text and category input is normalized", () => {
  assert.equal(cleanPostTitle("  一起\n复盘  这局  "), "一起 复盘 这局");
  assert.equal(cleanPostBody("  第一手\r\n第二手  "), "第一手\n第二手");
  assert.equal(cleanCommentBody("  尊重不同棋路  "), "尊重不同棋路");
  assert.equal(discussionCategory("gomoku"), "gomoku");
  assert.equal(discussionCategory("unknown"), "general");
  assert.ok(Array.from(cleanPostTitle("棋".repeat(100))).length <= 60);
});

test("community mentions support usernames and stable player IDs without duplicates", () => {
  assert.deepEqual(
    extractDiscussionMentions("请看 @星海棋手 的变化，也请 @MG-ABCD1234 看看。再次 @星海棋手"),
    ["星海棋手", "MG-ABCD1234"],
  );
  assert.deepEqual(extractDiscussionMentions("邮箱 a@b.com 不会被当作用户名，但 @有效用户 会"), ["有效用户"]);
  assert.equal(extractDiscussionMentions(Array.from({ length: 20 }, (_, index) => `@用户${index}`).join(" ")).length, 10);
});

test("community schema includes announcements, discussions, reactions, and reviewable reports", async () => {
  const queries = [];
  const d1 = {
    prepare(query) {
      queries.push(query);
      return {
        bind() { return this; },
        async run() { return { meta: { changes: 1 } }; },
        async first() { return null; },
        async all() { return { results: [] }; },
      };
    },
  };
  await ensureCommunitySchema(d1);
  const source = queries.join("\n");
  assert.match(source, /community_announcements/);
  assert.match(source, /discussion_posts/);
  assert.match(source, /discussion_comments/);
  assert.match(source, /discussion_reactions/);
  assert.match(source, /discussion_reports/);
  assert.match(source, /reviewed_by/);
  assert.match(source, /micosm-community-open/);
});
