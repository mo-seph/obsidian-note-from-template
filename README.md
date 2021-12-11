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
| Name | Value | Default |
| ---- | ----- | ------- |
| template-id | Unique ID for the template | Lowercase version of the base name |
| template-name | Name for the command | Base name of the file |
| template-output | Directory to save the output | test |
| template-replacement | A Mustache template to replace the selected text in the editor with | `{{[[title]]}}` |
| template-input | If the command is called with some text selected, split it up using the plugin's split pattern, and put the values into those fields | title,body |
| template-should-replace | Should the template write text back to the document? "always", "sometimes" = only if text is selected, "never"| "sometimes" |
| template-should-create | Should the template make and open a note? "none"=no note, "create"= create but don't open, "open"=create and open in current editor, "open-pane" = create and open in new pane | "create" |

## Field Types
| Type | Args | Description | Example(s) |
| ---- | ----- | ------- | ---- |
| text | none | A text input field - this is the default |  {{name}}, {{country:text}} |
| area | none | A text area - default if the field name is 'body' | {{description:area}}, {{body}} |


# Changelog
## 0.1.6 (in development)
Added a choice type, e.g. `{{suit:choice:hearts:spades:diamonds:clubs}}`

## 0.1.5
Big changes - completely refactored, new options, new fields, most defaults in settings, should be more responsive to template changes