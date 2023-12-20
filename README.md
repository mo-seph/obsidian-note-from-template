# Notes from Template

This plugin adds commands to create notes based on template files. It will go through each file in the `templates` directory in the settings, and create a command 'From Template: <X>' for each file. Each command will create a note based on the given template, with a popup to request values for each variable found in the template in [Mustache](https://github.com/janl/mustache.js) syntax. 

![Template Demo](https://raw.githubusercontent.com/mo-seph/obsidian-note-from-template/master/docs/TemplateDemo.gif)

Discussion thread on Obsidian Forum: https://forum.obsidian.md/t/plugin-create-notes-from-templates/23452

# Quickstart

An example template file might be:
```
---
template-output: People
tags: person, {{tags}}
template-replacement: "[[{{title}}]] ![[{{title}}#^overview]]"
template-input: title, overview, body
template-should-replace: "sometimes"
template-should-create: "open-pane"
---
# {{title}}

{{overview:area}}
^overview

Organisation: {{organisation}}

{{body}}
```

This would 
- pop up a window requesting a note title, an overview (in a text box) an organisation (text field) and some tags. 
- if the selection in the editor was "Joe Blogs - manager at Weissman Heiss - (lots of details)", the popup would be populated with Joe Blogs as the title, 'manager at Weissman Heiss' as the overview, and lots of details in the body field.
- create a note based on the template in the People directory.
- replace the selection text with the replacement string - in this case, a link to the note, and a transclusion of the overview paragraph. If there is no text selected, it won't put anything into the document.
- open the new note in a new window


# Details

## YAML Tags
Templates can contain YAML tags that will be filed out in the same way as the rest of the template. So this will work as expected:
```
---
organsiation: "{{organisation}}"
---
{{name}} works at {{organisation}}
```

In order to be proper YAML, values cannot start with `{` or they are treated as dictionaries, so make sure to use `organisation: "{{org}}"` rather than `organisation: {{org}}` in the frontmatter.


## From Template YAML Tags 

| Name | Value | Default |
| ---- | ----- | ------- |
| template-id | Unique ID for the template | Lowercase version of the base name |
| template-name | Name for the command | Base name of the file |
| template-output | Directory to save the output | test |
| template-filename | Filename for the created note. Will have `.md` appended. Note: if you set a different filename, then make sure to use `{{filename}}` in the `template-replacement` strings if you want to link to the file. | `{{title}}` |
| template-replacement | A Mustache template to replace the selected text in the editor with. Can pass a list, which will appear as buttons in creator | `{{[[title]]}}` |
| template-input | If the command is called with some text selected, split it up using the plugin's split pattern, and put the values into those fields | title,body |
| template-should-replace | Should the template write text back to the document? "always", "sometimes" = only if text is selected, "never"| "sometimes" |
| template-should-create | Should the template make and open a note? "none"=no note, "create"= create but don't open, "open"=create and open in current editor, "open-pane" = create and open in new pane, "open-tab" = open in new tab | "open-tab" |

### Examples
- Create a new note with a complex filename, then insert the title with a transclusion of the overview:
``` 
template-filename: "{{title}} - autocreated"
template-replacement: "{{title}} - ![[{{filename#^overview}}]]"
```
- Template will always put the result back into the current document:
```
template-should-create: "none"
template-should-replace: "always"
template-replacement: "{{templateResult}}"
```


## Field Types
| Type | Args | Description | Example(s) |
| ---- | ----- | ------- | ---- |
| text | none | A text input field - this is the default |  {{name}}, {{country:text}}, {{country:text:Belgium}} |
| area | none | A text area - default if the field name is 'body' | {{description:area}}, {{body}} |
| currentDate | format | The current date, using the format in Luxon format (https://moment.github.io/luxon/#/formatting) (Moment.js shouldn't be used for new projects, dayjs doesn't play nicely with the build system) | {{now:currentDate:dd-MM-yyyy}} |
| choice | choices | A dropdown select field | {{suit:choice:hearts:spades:diamonds:clubs}} |
| multi | choices | A multi-select field | {{colors:multi:yellow:red:green:blue}} |

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
### dev
- Another refactor - codebase is cleaner, uses Obsidian markdown/YAML parsing for frontmatter, gives better handling of list properies etc.
- Quality of life improvements:
    - Allow calling template even if not in an open editor (Note: can't replace text in e.g. Kanban fields, but in those cases copies replacement to Clipboard)
    - Better error handling
    - Better filename support
    - Added option to open file in new Tab

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
