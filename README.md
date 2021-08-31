## Notes from Template

This plugin adds commands to create notes based on template files. It will go through each file in the `templates` directory in the settings, and create a command 'From Template: <X>' for each file. Each command will create a note based on the given template, with a popup to request values for each variable found in the template in [Mustache](https://github.com/janl/mustache.js) syntax. 

An example template file might be:
```
---
template-id: person
template-name: Person
template-output: People
tags: person, {{tags}}
---
# {{title}}

Organisation: {{organisation}}
```

This would pop up a window requesting a Title, an Organisation and some Tags. It would then create a note based on the template in the People directory.

## YAML Tags
| Name | Value | Default |
| template-id | Unique ID for the template | Lowercase version of the base name |
| template-name | Name for the command | Base name of the file |
| tempalte-output | Directory to save the output | test |