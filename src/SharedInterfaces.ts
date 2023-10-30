import {  TFolder, Editor } from 'obsidian';

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
 * Details about the template - read in every time the template is applied 
 * so that edits are reflected immediately
 * TODO: should this inherit from TemplateActionSettings?
 */
export interface TemplateSettings {
    shouldReplaceInput: ReplaceType
    shouldCreateOpen: CreateType;
	outputDirectory: string; //Output directory for notes generated from the template
	inputFieldList: string; //Fields to pull out of the input
	textReplacementTemplates: string[]; //A template string for the text that will be inserted in the editor
	templateFilename: string; //A template string for the text that will be inserted in the editor

    templateBody:string;
	fields:TemplateField[]; //Specifications for all of the fields in the template
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
    textReplacementTemplate:string
    templateFilename:string
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
export interface ReplacementSpec {
	input:string; // The currently selected text in the editor
	templateID:TemplateIdentifier; //Keep hold of the template ID just in case
    settings:TemplateSettings; //All the settings of the template
    replacementTemplate:string // The chosen template for replacing selected editor text
	data:Record<string,string>; //The data to fill in the template with
}


