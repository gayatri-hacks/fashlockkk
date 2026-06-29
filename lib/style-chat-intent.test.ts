import assert from "node:assert/strict";
import test from "node:test";
import { classifyStyleChatIntent, STYLE_CHAT_INTENT_TEST_CASES } from "./style-chat-intent";

test("classifies Laila chat intents without treating appearance questions as shopping", () => {
  for (const testCase of STYLE_CHAT_INTENT_TEST_CASES) {
    assert.equal(classifyStyleChatIntent(testCase.input), testCase.expected, testCase.input);
  }
});
