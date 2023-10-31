import {  TFolder, Editor } from 'obsidian';
import { FullTemplate } from './Template';
/*
 * This file contains common objects used by the whole templating system
 */


/*
 * Shared definitions/constants
 */
export const BAD_CHARS_FOR_FILENAMES_TEXT = ":[]?/\\"
export const BAD_CHARS_FOR_FILENAMES_MATCH = /[:[\]?/\\]/g

// Which are the YAML fields used by the template system
export const TEMPLATE_FIELDS = [
    "template-id",
    "template-name",
    "template-replacement",
    "template-input",
    "template-output",
    "template-filename",
    "template-should-replace",
    "template-should-create"
]


export type ReplaceType = "always" | "sometimes" | "never"
export type CreateType = "none" | "create" | "open" | "open-pane"
/*
 * This defines whether a template should replace things in the Editor
 * (feels a bit redundant? also, why does it have Editor in?)
 */
export interface ReplacementOptions {
	editor:Editor;
	shouldReplaceSelection:ReplaceType
	shouldCreateOpen:CreateType
	willReplaceSelection:boolean;
}


/*
 * Identifies the template in the vault - used to create the command for it
 * These can only be updated by reloading the plugin at the moment
 */
export interface TemplateIdentifier {
	id: string; //Unique ID for building commands, based on template filename
	name: string; //Name to show for the command (probably same as the template filename, but doesn't have to be)
	path: string; //Path of the template file
}


/*
 * Settings for what the template should do when activated
 * How does this relate to TemplateSettings above?
 */
export interface TemplateActionSettings {
	replaceSelection: ReplaceType
	createOpen: CreateType
    outputDirectory:string
    inputFieldList:string
    textReplacementTemplates:string[]
    templateFilename:string
}

/*
 * What we get when we fill out a template
 */
export interface TemplateResult {
    note:string; // The full text of the note including Properties/YAML
    replacementText:string; // The text to replace selected text in the editor with
    filename:string; // The final filename to make the note with
}

/*
 * A particular field from a template
 */
export interface TemplateField {
	id: string //Unique id, first bit of the field
	inputType: string // What kind of input is it?
	args: string[]
	alternatives: string[]
}


/*
 * All of the information required to fill out a template with data
 */
export interface ActiveTemplate {
	input:string; // The currently selected text in the editor
	templateID:TemplateIdentifier; //Keep hold of the template ID just in case
    template:FullTemplate; //All the settings of the template
    textReplacementString:string // The (template) string for replacing selected editor text
	data:Record<string,string>; //The data to fill in the template with
}


/*
 * Just produced in response to scanning for templates? Perhaps?
 */
export interface TemplateFolderSpec {
    location:TFolder
    depth:number
    numTemplates:number
}