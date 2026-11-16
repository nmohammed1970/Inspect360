import assert from "node:assert/strict";
import {
  feedbackStatusLabel,
  feedbackTypeLabel,
  sanitizeFeedbackSourcePage,
} from "../../shared/feedbackLabels";
import { validateFeedbackImage, FEEDBACK_MAX_IMAGE_BYTES } from "./attachments";

async function main() {
  // Labels never dump raw enums to users
  assert.equal(feedbackTypeLabel("issue"), "Issue");
  assert.equal(feedbackTypeLabel("feature_request"), "Feature Request");
  assert.equal(feedbackTypeLabel("question"), "General Question");
  assert.equal(feedbackStatusLabel("waiting_on_user"), "Waiting on User");
  assert.equal(feedbackStatusLabel("in_review"), "In Review");

  // Source page strips query secrets
  assert.equal(
    sanitizeFeedbackSourcePage("https://app.example/inspections/1?token=secret&x=1"),
    "/inspections/1",
  );
  assert.equal(sanitizeFeedbackSourcePage("/feedback?session=abc"), "/feedback");

  // Magic-byte image validation
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const ok = validateFeedbackImage(png, "image/png");
  assert.equal(ok.ok, true);

  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
  assert.equal(validateFeedbackImage(jpeg).ok, true);

  const bad = validateFeedbackImage(Buffer.from("not-an-image"));
  assert.equal(bad.ok, false);

  const huge = validateFeedbackImage(Buffer.alloc(FEEDBACK_MAX_IMAGE_BYTES + 1, 0xff));
  assert.equal(huge.ok, false);

  // Internal notes must not be mixed into public label vocabulary
  assert.notEqual(feedbackStatusLabel("internal"), "Internal");

  console.log("feedback acceptance tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
