
import {  TemplateField, ReplaceType, CreateType, TemplateActionSettings, ActiveTemplate, TemplateResult, BAD_CHARS_FOR_FILENAMES_MATCH } from './SharedInterfaces'
// @ts-ignore - not sure how to build a proper typescript def yet
import * as Mustache from 'mustache';
// @ts-ignore - not sure how to build a proper typescript def yet
import metadataParser from 'markdown-yaml-metadata-parser'
import { normalizePath, stringifyYaml } from 'obsidian';

// Stop mustache from escaping HTML entities as we are generating Markdown
Mustache.escape = function(text:string) {return text;};

/*
 * Details about the template - read in every time the template is applied 
 * so that edits are reflected immediately
 * TODO: should this inherit from TemplateActionSettings?
 */
export class FullTemplate implements TemplateActionSettings {
    replaceSelection: ReplaceType
    createOpen: CreateType;
	outputDirectory: string; //Output directory for notes generated from the template
	inputFieldList: string; //Fields to pull out of the input
	textReplacementTemplates: string[]; //A template string for the text that will be inserted in the editor
	templateFilename: string; //A template string for the text that will be inserted in the editor

    templateBody:string;
    templateProperties:Record<string,any>;
	fields:TemplateField[]; //Specifications for all of the fields in the template

    constructor(body:string,template_settings:Record<string,any>, properties:Record<string,any>, defaults:TemplateActionSettings) {
        // This is horrible, should be a better way to do this
        this.outputDirectory = template_settings['template-output'] || defaults.outputDirectory,
        this.inputFieldList = template_settings['template-input'] || defaults.inputFieldList,
        this.textReplacementTemplates = this.ensureArray(template_settings['template-replacement'], defaults.textReplacementTemplates),
        this.replaceSelection = template_settings['template-should-replace'] || defaults.replaceSelection,
        this.createOpen = template_settings['template-should-create'] || defaults.createOpen,
        this.templateFilename = template_settings['template-filename'] || defaults.templateFilename,
        this.templateBody = body
        this.templateProperties = properties
        var propertyText = ""
        for(const k in this.templateProperties ) { propertyText += " " + this.templateProperties[k]}
        this.fields = this.getTemplateFields( propertyText +" " +body,template_settings)
    }

   /*
    Takes the replacement spec and creates:
    - a filled out version of the template body
    - a filled out version of the currently selected text in the editor
    */
    async fillOutTemplate(spec:ActiveTemplate) : Promise<TemplateResult> {
        console.log("Filling out template with Spec: ",spec)
        const data = spec.data //The values for variables to put into the template

		//Copy data across to all the alternative formulations of a field
		this.fields.forEach( f => {
			f.alternatives.forEach( a => data[a] = data[f.id])
		})

        // First, fill out the body of the note
		const filledTemplate = Mustache.render(this.templateBody,data);
        data['templateResult'] = filledTemplate; //metadataParser(filledTemplate).content (now we are doing the body and the tags separate)

        // Then, go through the properties object, and fill them out
        const filled_properties:Record<string,any> = {}
        for( const k in this.templateProperties ) {
            const res = this.processProperty(this.templateProperties[k], data)
            console.log(`for key ${k}, original is ${this.templateProperties[k]}, result is: ${res}`)
            filled_properties[k] = res
        }
        // and turn that into frontmatter
        console.log("Filled out properties: ", filled_properties)
        const frontmatter = stringifyYaml(filled_properties)
        console.log("YAML: ", frontmatter)
        const note = "---\n"+frontmatter+"\n---\n" + filledTemplate
        console.log(`Note: <${note}>`)

        // finally, figure out the filename, and add it to the data
        const raw_filename = Mustache.render(this.templateFilename,data)
        const filename = normalizePath(raw_filename.replace(BAD_CHARS_FOR_FILENAMES_MATCH,"")) //Quick and dirty regex for usable titles
        data['filename'] = filename

        // And the replacement text gets everything, including the (constructed) filename
        const replaceText = Mustache.render(spec.textReplacementString,data)

        return {note:note,replacementText:replaceText,filename:filename}
    }

    processProperty(initial:any, data:Record<string,string>) {
        if( typeof initial === 'string' ) { return Mustache.render(initial,data)}
        if( Array.isArray(initial) ) {
            console.log("Found array property: ",initial)
            const r = []
            for( const v of initial ) {
                const processed = Mustache.render(v,data)
                const split = processed.split(/\s*[,;]\s*/)
                console.log(`Rendered to ${processed}, split to: `, split)
                r.push(...split)
            }
            return r
        }
    }

       // Pull out the tags that Mustache finds and turn them into TemplateFields ready for use
    getTemplateFields(template:string,metadata:Record<string,any>): TemplateField[] {
        // Returns tuples of type ["name","<tag>"] - maybe other types...
        //const templateFields: Array<Array<any>> = Mustache.parse(template);
        const templateFields: string[][] = Mustache.parse(template);
        
        const titleField:TemplateField = {id:"title",inputType:"note-title",args:[],alternatives:[]}

        const fields:TemplateField[] = [titleField]

        templateFields.forEach( r => {
            if( r[0] === "name" ) {
                const field = this.parseField(r[1])
                const existing = fields.find((t)=> t.id === field.id )
                if( existing ) { this.mergeField(existing,field)}
                else fields.push(field)
            }
        } )
        return fields
    }

    // Parse an individual tag name into a TemplateField
    // Allows tags to be named e.g. {{title:text}}, or {{info:dropdown:a:b:c:}}
    // and turned into something useful
    parseField(input:string) : TemplateField {
        const parts = input.split(":");
        const id = parts[0] || input;
        return {
            id: id,
            inputType: parts[1] || ( id === "body" ? "area" : "text" ),
            args: parts.slice(2),
            alternatives: input === id ? [] : [input]
        }
    }

    /*
    Combines one TemplateField with another. Currently just adds the alternative manifestations,
    e.g. '{{body}}' and '{{body:text}}', but might want to be more clever in the future in case
    the second declaration of the tag in the template has more info.
    */
    mergeField(current:TemplateField,additional:TemplateField) {
        if( current.inputType === "text" ) current.inputType = additional.inputType
        if( additional.args.length > current.args.length ) current.args = additional.args
        current.alternatives = current.alternatives.concat(additional.alternatives)
    }

    /*
     * Horrible utility function to make an array with a default value
     */
    ensureArray(a:any,backup:string[]=null) : string[] {
        const backupValue = backup ? backup : []
        if( !a ) return backupValue
        if( a instanceof Array ) return a
        if( typeof a === "string" ) return [a]
        return backupValue
    }

}
