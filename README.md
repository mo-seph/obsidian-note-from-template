# Notes from Template

This plugin adds commands to create notes based on template files. It will go through each file in the `templates` directory in the settings, and create a command 'From Template: <X>' for each file. Each command will create a note based on the given template, with a popup to request values for each variable found in the template in [Mustache](https://github.com/janl/mustache.js) syntax. 

![Template Demo](https://raw.githubusercontent.com/mo-seph/obsidian-note-from-template/master/docs/TemplateDemo.gif)

Discussion thread on Obsidian Forum: https://forum.obsidian.md/t/plugin-create-notes-from-templates/23452

# Quickstart

An example template file might be:
```
---
template-output: "VideoReviews/{{channel}}"
template-filename: "{{title}}"
template-input: title, url, channel, body, tags
template-command-name: Video Review
template-replacement: "{{title}}"
tags:
  - video-review
  - "{{tags}}"
Mentions: "{{channel}}"
date: "{{date}}"
---
# {{title}}

![{{title}}]({{url}})

{{body}}

Created in {{date&time}}
```

This would 
- open a modal requesting values for `title`, `url`, `channel`, `body`, and `tags`.
- create a note in `VideoReviews/{{channel}}` with filename `{{title}}.md`.
- replace selected editor text with `{{title}}` when selection exists (default `template-should-replace` is `selected-only`).
- create and open the note in the current leaf (default `template-should-create` is `open`).
- use runtime built-ins (`{{date}}`, `{{date&time}}`, `{{filename}}`) during rendering.


# Details

## YAML and Properties
Templates can contain YAML fields that are filled out the same way as the rest of the template and become part of the note's Properties. So this works as expected:
```
---
organisation: "{{organisation}}"
---
{{name}} works at {{organisation}}
```

In order to be proper YAML, values cannot start with `{` or they are treated as dictionaries, so make sure to use `organisation: "{{org}}"` rather than `organisation: {{org}}` in the frontmatter.

For List properties, it will try to be clever if you make the property a List in the template. So you can have a template like this:
```
tags:
  - template-test
  - "{{tags}}"
```
and if you put `extra-tag, another-extra-tag` in the input field, it will render as:
```
tags:
  - template-test
  - extra-tag
  - another-extra-tag
```

### YAML Authoring Tips (Obsidian)

- Use spaces for indentation, never tabs.
- Keep indentation consistent (2 spaces is recommended).
- Quote values that include `{`, `}`, `&`, `:`, or template expressions.
- Quote keys with special characters (for example, `"date&time"`).
- If frontmatter turns red in Obsidian, validate indentation first.

## From Template YAML Properties
(these will all be filtered out of the rendered note) 

| Name | Type | Default | Description |
| ---- | ---- | ------- | ----------- |
| template-command-name | string | computed from template file basename | Command name shown in Obsidian |
| template-output | string | `""` (unset, resolves to vault root) | Output folder path |
| template-filename | string | `{{title}}` | Output filename template (without `.md`) |
| template-input | string or array | `title,body` | Field definitions source |
| template-should-replace | string enum | `selected-only` | Selection replacement policy |
| template-replacement | string | `{{filename}}` | Replacement field scope: defines which fields/tokens are available for replacement |
| template-should-create | string enum | `open` | Note creation/open behavior |

> Deprecated keys: `template-id`, `template-name`
>
> These keys are kept for legacy compatibility but are not used by the current command registration flow. Use `template-command-name` instead.

### Property Reference

#### template-command-name
- Type: string
- Default: computed from template file basename
- Notes:
  - Active property used to set the command name shown in Obsidian.
  - If omitted, the template file basename is used.
- Example:

```yaml
template-command-name: Video Review
```

#### template-output
- Type: string
- Default: `""` (unset), which resolves to vault root
- Notes:
  - Vault-relative output folder path.
  - Supports template expressions.
  - Avoid unsafe paths and parent-directory traversal.
- Example:

```yaml
template-output: Reviews/{{channel}}
```

#### template-filename
- Type: string
- Default: `{{title}}`
- Notes:
  - Filename template used to create the note.
  - Do not include `.md` in this value.
  - If overridden, prefer `{{filename}}` in replacement templates when linking the final note.
- Example:

```yaml
template-filename: "{{title}} - {{date}}"
```

#### template-input
- Type:
  - string CSV
  - string[]
  - object[] (compact or explicit YAML field objects)
- Default: `title,body`
- Notes:
  - Recommended modes:
    - Use CSV string mode for simple templates.
    - Use full object mode for advanced field definitions.
  - Compact YAML mode supports implicit id/value.
  - In compact object entries, the first non-reserved key is interpreted as field id.
  - `type` is accepted as alias for `inputType`.
  - `replaceOnly` should be omitted from template-input; built-ins keep their default behavior.
  - For ids like `date&time`, quote the key in YAML.

- Examples:

CSV mode:

```yaml
template-input: title,body,tags
```

String list mode:

```yaml
template-input:
  - title
  - body
  - tags
```

Compact YAML mode (implicit id/value):

```yaml
template-input:
  - title: "The Best Title Ever"
    type: text
    args: [""]
    description: Main Title
  - body: ""
    type: area
    description: The Note's content
```

Advanced example with date fields:

```yaml
template-input:
  - title: "Test"
    type: text
    description: Parse test
  - date: "yyyy-LL-dd HH:mm:ss"
    type: currentDate
    description: today
  - "date&time"
  - body
  - tags
```

#### template-should-replace
- Type: string enum (`always`, `selected-only`, `never`)
- Default: `selected-only`
- Notes:
  - Defines the default replacement mode when the modal opens.
  - This default can be overridden in the modal using the replacement toggle.
  - `selected-only` starts enabled only when there is selected editor text.
- Examples:

```yaml
template-should-replace: selected-only
```

```yaml
template-should-replace: always
```

#### template-replacement
- Type: string
- Default: `{{filename}}`
- Notes:
  - `template-should-replace` decides if replacement runs.
  - `template-replacement` defines which tokens are available during replacement.
  - The current editor selection is treated as a template source.
  - If selected text does not contain a token, that part remains unchanged.

- Example 1 (field substitution from current selection):
  - Selected text: `Some value {{title}}`
  - Template config:

```yaml
template-should-replace: selected-only
template-replacement: "{{title}}"
```

  - Result: `Some value My Note`

- Example 2 (replace with full rendered template output):
  - Selected text: `{{templateResult}}`
  - Template config:

```yaml
template-should-replace: always
template-should-create: none
template-replacement: "{{templateResult}}"
```

  - Result: selection is replaced by the full rendered template output.

- Example 3 (no token in selection means no substitution):
  - Selected text: `current selection`
  - Template config:

```yaml
template-should-replace: always
template-replacement: "{{filename}}"
```

  - Result: `current selection`.

- Example 4 (Obsidian-compatible link + timestamp from selected text):
  - Selected text:

```
A new Note [[{{{filename}}}]]
Created during {{date&time}}
```

  - Template config:

```yaml
template-should-replace: always
template-replacement: "{{filename}}{{date&time}}"
```

  - Result: both `{{filename}}` and `{{date&time}}` are resolved in the selected text.

#### template-should-create
- Type: string enum (`none`, `create`, `open`, `open-pane`, `open-tab`)
- Default: `open`
- Notes:
  - Controls whether a note is created, and where it opens.
  - `none` is useful for replacement-only templates.
- Example:

```yaml
template-should-create: open-pane
```

## Field Types

Field types are configured through `template-input` definitions (CSV, YAML list, or YAML object mode).

When using YAML object mode, set `type` (alias of `inputType`) and optional `args`.

| Type | Args | Behavior | Example (`template-input` object mode) |
| ---- | ---- | -------- | ------------------------------------- |
| text | `args[0]` optional default value | Single-line text input | `- title: "My Note"` + `type: text` |
| area | `args[0]` optional default value | Multi-line textarea | `- body: ""` + `type: area` |
| currentDate | format string in `value` or `args[0]` | Editable date input pre‑filled with current date. Validates ISO 8601 / `"now"` on blur/Enter. Invalid values reset to `"now"`. Outputs `userFriendlyDate` (body) and `frontmatterSafeDate` (frontmatter). See [`docs/DateFormats.md`](docs/DateFormats.md). | `- date: "yyyy-LL-dd HH:mm:ss"` + `type: currentDate` |
| choice | options list in `args` | Dropdown select | `- status: "draft"` + `type: choice` + `args: [draft, published]` |
| multi | options list in `args` | Multi-select toggles | `- tags: ""` + `type: multi` + `args: [urgent, review, done]` |
| no-render | none | Hidden field, no input control | built-ins like `filename`, `date&time`, `templateResult` |

Notes:
- `note-title` exists in type definitions but is currently treated as legacy in the UI flow.
- Built-ins can still be included in `template-input` as plain ids (for example: `date&time`, `body`, `tags`).
- For keys like `date&time`, quote the YAML key when needed.

## Built-In Fields

The plugin registers these pre‑defined fields. They work without explicit
`template-input` declarations, but some can be overridden.

### `title`

- **Input type:** `text`
- Default field for the note title. Commonly used in filenames:
  `template-filename: "{{title}}"`.

### `body`

- **Input type:** `area`
- Multi‑line content field.

### `tags`

- **Input type:** `text`
- When `enableInputSuggestions` is on, the input shows autocomplete suggestions
  from existing vault tags.

### `filename`

- **Input type:** `no-render` (hidden, no UI)
- Resolves to the final output filename (without `.md` extension or path).

### `templateResult`

- **Input type:** `no-render` (hidden, no UI)
- Resolves to the fully rendered template output (frontmatter + body).
- Useful for replacement‑only templates.

### `date&time`

- **Input type:** `no-render` (hidden, no UI)
- Always resolves to the current moment in ISO‑like format:
  `yyyy-MM-dd'T'HH:mm`.
- Same value in both body and frontmatter contexts.
- Does **not** appear in the UI modal.

### `date`

- **Input type:** `currentDate`
- Default value: `"now"`
- Default format (`args[0]`): `"yyyy-MM-dd"`
- **Appears in the UI modal** as an editable text input (unlike `date&time`).
- Validates user input on blur/Enter: accepts ISO 8601 or `"now"`. Invalid
  values reset to `"now"`.
- **Format override:** declare `date` explicitly in `template-input` to use a
  different Luxon format:

  ```yaml
  template-input:
    - date: "now"
      args: ["dd/MM/yyyy"]
      description: "Custom date format"
  ```

  The `args[0]` replaces the default `"yyyy-MM-dd"`.

#### `date` vs `date&time`

|                    | `date`                          | `date&time`                      |
| ------------------ | ------------------------------- | -------------------------------- |
| UI in modal        | ✅ Editable text field           | ❌ Hidden (`no-render`)          |
| User input         | ✅ Validated (ISO / `"now"`)     | ❌ Always current moment          |
| Body output        | Formatted per field's Luxon spec | `yyyy-MM-dd'T'HH:mm`             |
| Frontmatter output | ISO 8601 (`frontmatterSafeDate`) | `yyyy-MM-dd'T'HH:mm`             |
| Format override    | Via `value` or `args[0]`        | Not overridable                  |

## Non-field tags
| Field | Description | Usage Example |
| ----- | ----------- | ----- |
| currentTitle | The title of the active note when the template was triggered | `parent: [[{currentTitle}]]` in frontmatter to create hierarchy |
| currentPath | The path of the active note when the template was triggered |

## Hotkeys
Some hotkeys are defined:
- Mod + enter: submit template
- Mod + (1-9): jump to field
- Ctrl + (1-9): select replacement string N


# Development
Very open to collaboration - drop me a line or PR
## Changelog

### 0.1.13
- Tidied up styling
- Added in support for escaping delimiters in fields (e.g. `hh\:mm\:ss` for a time value)
- Added in descriptions for fields with a `|` character, e.g `{{field|description}}` which will be shown in the template UI.
- Another refactor - codebase is cleaner, uses Obsidian markdown/YAML parsing for frontmatter, gives better handling of list properies etc.
- Added initial suggestion support: now a `tags` field will suggest existing tags, and other fields will suggest internal links if `[[` is entered.
- Quality of life improvements:
    - Allow calling template even if not in an open editor (Note: can't replace text in e.g. Kanban fields, but in those cases copies replacement to Clipboard)
    - Better error handling
    - Better filename support
    - Added option to open file in new Tab
    - Can use `{{properties}}` in `template-output` (e.g. `template-output: Projects/{{project}}` to put files in project directories)
    - Will prompt for creating folders that don't exist

### 0.1.11
- Added CSS class to modal for styling
- Added `multi` field type to allow a multi-select with toggles
- Added field descriptions: `{fieldname:text:default:description}` or `{fieldname:area:description}`


### 0.1.7 
- Added `currentdate` field type, e.g. `{{now:currentdate:dd-MM-yyyy}}`
- Added `currentPath` and `currentTitle` field names, e.g. `[[{{currentTitle}}]]` to link back to current note
### 0.1.6 
- Templates now loaded dynamically - no more restarts! (also: changed template folder selection to dropdown,command for re-indexing)
- Added a choice type, e.g. `{{suit:choice:hearts:spades:diamonds:clubs}}`
- Note filenames are now generated from a template string, either in config, or in `template-filename` in the template. Defaults to `{{title}}`, but all template fields available.
- Added multiple replacement text possibility - If an array is given for `template-replacement`, then these will all be options in the template dialog
- Many UI tweaks, fixed YAML parsing

### 0.1.5
Big changes - completely refactored, new options, new fields, most defaults in settings, should be more responsive to template changes
