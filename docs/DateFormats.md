# Date Formats — `currentDate` Input Field

## Overview

The `currentDate` field accepts either the literal **`"now"`** (case‑insensitive)
or any **ISO 8601** date/date-time string.

## Supported Input Formats

| Format                     | Example                          | Notes                           |
|----------------------------|----------------------------------|---------------------------------|
| `now`                      | `now`                            | Case‑insensitive.               |
| `YYYY-MM-DD`               | `2026-06-02`                     | ISO 8601 extended date          |
| `YYYYMMDD`                 | `20260602`                       | ISO 8601 basic date             |
| `YYYY-MM-DDThh:mm:ss`      | `2026-06-02T14:30:00`            | ISO 8601 extended date+time     |
| `YYYYMMDDThhmmss`          | `20260602T143000`                | ISO 8601 basic date+time        |
| `+ milliseconds`           | `2026-06-02T14:30:00.123`        | Optional `.sss`                 |
| `+ timezone (UTC)`         | `2026-06-02T14:30:00Z`           | `Z` suffix                      |
| `+ timezone (offset)`      | `2026-06-02T14:30:00+05:00`      | `±hh:mm` or `±hhmm`             |

### Full regex patterns (for reference)

```
YYYY-MM-DD
YYYY-MM-DDThh:mm:ss[.sss][Z|±hh:mm|±hhmm]
YYYYMMDD
YYYYMMDDThhmmss[.sss][Z|±hhmm|±hh:mm]
```

## Behavior

### Validation

- On **blur** (Tab, click outside) or **Enter**: the input is validated via
  `validateDateString()`.
- If the value is **invalid**: a `Notice` shows the error and the field resets to
  `"now"`.
- Typing does **not** trigger per‑keystroke validation, so editing feels smooth.

### Processing (`processDate`)

The validated string is passed to `processDate()` which returns two values:

| Value                 | Description                                          | Used in         |
|-----------------------|------------------------------------------------------|-----------------|
| `userFriendlyDate`    | Formatted via Luxon using the field's format setting | Body context    |
| `frontmatterSafeDate` | ISO 8601 string safe for Obsidian frontmatter        | Frontmatter context |

- **Body context** (`{{date}}`): renders `userFriendlyDate`.
- **Frontmatter context** (`date:` in YAML): renders `frontmatterSafeDate`.
- If the input is `"now"`, `frontmatterSafeDate` resolves to the current
  date-time as a full ISO 8601 string.
- If the input is already an ISO 8601 string, it is kept as-is for frontmatter.
