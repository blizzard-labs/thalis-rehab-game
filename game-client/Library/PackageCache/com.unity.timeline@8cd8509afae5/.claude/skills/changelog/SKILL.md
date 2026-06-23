---
name: changelog
description: Create a changelog entry for Unity Timeline by asking for bug number, change type, and description
disable-model-invocation: false
---

# Changelog Entry Creator

Create changelog entries in `.changelogs/` following Unity Timeline's release notes guidelines.

## Process

1. **Ask for issue number** (use AskUserQuestion):
   - Options: "I have a UUM/JIRA number" | "I have an issue ID" | "No issue number"

2. **Ask for change type** (use AskUserQuestion):
   - **Added**: New features, new APIs
   - **Changed**: Changed behavior, API changes, obsolete APIs
   - **Fixed**: Bugfixes
   - **Internal**: Changes only impacting internal tools/APIs

3. **Ask for description**: For bugfixes, write from user's perspective (not too technical - release notes are for users first). Don't copy bug titles verbatim.

4. **Generate filename**: `[UUM-####|####]-<ShortDescription>.md`
   - ShortDescription: 2-4 words, CamelCase, descriptive
   - Good: `UUM-1234567-RectangleSelectionFix.md`, Bad: `TimelineFix.md`

5. **Create file** in `.changelogs/<filename>.md`:
   ```
   <ChangeType>

   - <Description> ([<JIRA_ID>](LINK))
   ```
   - **Fixed**: Use Issue Tracker link: `https://issuetracker.unity3d.com/product/unity/issues/guid/<JIRA_ID>`
   - **Internal**: Use JIRA link: `https://jira.unity3d.com/browse/<JIRA_ID>`
   - Multiple entries per file allowed (don't reuse across branches)

6. **Confirm** with user where file was created and remind to commit with changes.

## Examples

`.changelogs/TrackImprovements.md`
```
Added

- Inline Curve Properties can be removed.
- Tracks can be individually resized.
```

`.changelogs/AnimationCurveFixes.md`
```
Fixed

- Fixed preview of Avatar Masks on base level Animation Tracks. ([1190600](https://issuetracker.unity3d.com/product/unity/issues/guid/1190600/))
```

`.changelogs/UUM-131061-DomainReloadHandling.md`
```
Internal

- Fixed Project Auditor warnings about domain reload handling. ([UUM-131061](https://jira.unity3d.com/browse/UUM-131061))
```
