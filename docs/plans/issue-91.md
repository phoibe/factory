# Issue 91: safety-net tick every 5 minutes

**Goal:** the scheduled safety-net run of the Factory workflow fires every 5 minutes instead of 10 (GitHub's minimum).

**Spec:** issue #91 (spec version 1).

### Task 1
- [x] Add test `test/schedule.test.mjs`: the `schedule` cron in `.github/workflows/factory.yml` is `*/5 * * * *`. Run `npm test`, see it fail.
- [x] Change the cron in `.github/workflows/factory.yml` to `*/5 * * * *`. Run `npm test`, see it pass.
- [x] Commit.
