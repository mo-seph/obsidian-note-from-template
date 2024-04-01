
import {  TemplateField, ReplaceType, CreateType, TemplateActionSettings, ActiveTemplate, TemplateResult, BAD_CHARS_FOR_FILENAMES_MATCH, BAD_CHARS_FOR_PATHS_MATCH } from './SharedInterfaces'
// @ts-ignore - not sure how to build a proper typescript def yet
import * as Mustache from 'mustache';
import { Vault, normalizePath, stringifyYaml } from 'obsidian';
import { ucFirst } from './UISupport';

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
        console.debug("Filling out template with Spec: ",spec)
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
            try {
                const res = this.processProperty(this.templateProperties[k], data)
                filled_properties[k] = res
            } catch (error) {
                console.log(`Was trying to process property ${data} based on ${this.templateProperties[k]}`)
                console.log(data)
                console.log("Did the property need quotes?")
                throw error
            }
        }
        // and turn that into frontmatter if necessary
        console.debug("Filled out properties: ", filled_properties)
        var note = filledTemplate
        if( Object.keys(filled_properties).length > 0 ) {
            const frontmatter =  stringifyYaml(filled_properties)
            //console.log("Frontmatter: ",frontmatter)
            note = "---\n"+frontmatter+"\n---\n" + filledTemplate
        }

        // finally, figure out the filename, and add it to the data
        const raw_filename = Mustache.render(this.templateFilename,data)
        const filename = normalizePath(raw_filename.replace(BAD_CHARS_FOR_FILENAMES_MATCH,"")) //Quick and dirty regex for usable titles
        //console.log("Path starting with: ",spec.template.outputDirectory)
        const raw_foldername = Mustache.render(spec.template.outputDirectory,data)
        //console.log("Templated to: ", raw_foldername)
        const foldername = raw_foldername.replace(BAD_CHARS_FOR_PATHS_MATCH,"") //Quick and dirty regex for usable titles
        //console.log("Made Safe to: ", foldername)
        // could strip characters here?
        data['filename'] = filename

        // And the replacement text gets everything, including the (constructed) filename
        const replaceText = Mustache.render(spec.textReplacementString,data)

        return {note:note,replacementText:replaceText,filename:filename,folder:foldername}
    }


    processProperty(initial:any, data:Record<string,string>) {
        if( typeof initial === 'string' ) { return Mustache.render(initial,data)}
        if( Array.isArray(initial) ) {
            const r = []
            for( const v of initial ) {
                const processed = Mustache.render(v,data)
                const split = processed.split(/\s*[,;]\s*/)
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
        
        const titleField:TemplateField = {id:"title",inputType:"note-title",args:[],alternatives:[],description:""}

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
        var desc = ""
        const desc_match = /(.*)(?<!\\)\|(.*)/
        const dm = input.match(desc_match)
        if( dm ) {
            input = dm[1]
            desc = dm[2]
        }

        // Use a positive lookbehind assertion to split only if ":" is not preceded by "\"
        const parts = input.split(/(?<!\\):/).map(part => part.replace("\\:", ":"));
        const id = parts[0] || input;
        return {
            id: id,
            inputType: parts[1] || ( id === "body" ? "area" : "text" ),
            args: parts.slice(2),
            alternatives: input === id ? [] : [input],
            description : desc
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
