// @ts-ignore - not sure how to build a proper typescript def yet
import * as Mustache from 'mustache';
// @ts-ignore - not sure how to build a proper typescript def yet
import metadataParser from 'markdown-yaml-metadata-parser'
import { TAbstractFile, TFile, TFolder, Vault } from 'obsidian';
import { defaultMaxListeners } from 'events';


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
 */
export interface TemplateSettings {
	outputDirectory: string; //Output directory for notes generated from the template
	inputFieldList: string; //Fields to pull out of the input
	textReplacementTemplate: string; //A template string for the text that will be inserted in the editor
    templateBody:string;
	fields:TemplateField[]; //Specifications for all of the fields in the template
    shouldReplaceInput: ReplaceType
    shouldCreateOpen: CreateType;
}

export interface TemplateDefaults {
	replaceSelection: ReplaceType
	createOpen: CreateType
    outputDirectory:string
    inputFieldList:string
    textReplacementTemplate:string
}

export interface TemplateField {
	id: string //Unique id, first bit of the field
	inputType: string // What kind of input is it?
	args: string[]
	alternatives: string[]
}


export interface ReplacementSpec {
	input:string; // The currently selected text in the editor
	templateID:TemplateIdentifier; //Keep hold of the template ID just in case
    settings:TemplateSettings; //All the settings of the template
	data:Record<string,string>; //The data to fill in the template with
}


export type ReplaceType = "always" | "sometimes" | "never"
export type CreateType = "none" | "create" | "open" | "open-pane"

export interface TemplateFolderSpec {
    location:TFolder
    depth:number
    numTemplates:number
}

export default class TemplateHelper {
    vault:Vault
    constructor(vault:Vault) {
        this.vault = vault;
    }

       /*
    Takes the replacement spec and creates:
    - a filled out version of the template body
    - a filled out version of the currently selected text in the editor
    */
    async fillOutTemplate(spec:ReplacementSpec) : Promise<[string,string]> {

		//Copy data across to all the alternative formulations of a field
		spec.settings.fields.forEach( f => {
			f.alternatives.forEach( a => spec.data[a] = spec.data[f.id])
		})
		
		//const template = await this.loadTemplate(spec.template);
		const filledTemplate = Mustache.render(spec.settings.templateBody,spec.data);
        spec.data['templateResult'] = metadataParser(filledTemplate).content
        const replaceText = Mustache.render(spec.settings.textReplacementTemplate,spec.data)
        return [filledTemplate,replaceText]
    }

    /*
     * Sets a template up for use. Requires:
     * - template ID to find the template
     * - input text
     * - a delimiter to turn the input text into field values
     */
    async prepareTemplate(ts:TemplateIdentifier,defaults:TemplateDefaults,input:string,delimiter:string="\\s+-\\s+") : Promise<ReplacementSpec> {
		const templateSettings = await this.getTemplateSettings(ts,defaults)
		const fieldData = this.parseInput(input,templateSettings.inputFieldList,delimiter)
        return {
            input:input,
			templateID:ts,
			settings:templateSettings,
			data:fieldData,
		}
    }


    /*
     * Returns all the templates in a directory
     * Run through the settings directory and return an TemplateSettings for each valid file there
     */
	async getTemplates(directory:string) : Promise<TemplateIdentifier[]>  {
		const templateFolder:TFolder = this.vault.getAbstractFileByPath(directory) as TFolder
		if( ! templateFolder ) return Promise.all([])
        const children = templateFolder.children
        const files : TFile[] = templateFolder.children.filter( c => 
            {return c.path.endsWith(".md") && c instanceof TFile } ).map(c => c as TFile)
        const templates =  files.map( async c => this.getTemplateIdentifier(c) )
        return Promise.all( templates)
	}

    async getTemplateIdentifier(c:TFile) {
        try {

        const metadata = await this.readMetadata(c.path)
        const fn = c.basename
        const tmpl:TemplateIdentifier = {
            id:metadata['template-id'] || fn.toLowerCase(),
            name:metadata['template-name'] || fn,
            path:c.path,
        }
        return tmpl
        } catch( error ) {
            console.log("Couldn't read template: " + c.path, error )
            return {
                id: c.name.toLowerCase(),
                name: "Can't parse " + c.name,
                path:c.path, 
            }
        }
    }

    /*
    * Returns a specification describing the template
    */
   /*
    async getTemplateID(c:TAbstractFile):Promise<TemplateIdentifier> {
     
    }
    */

    async getTemplateSettings(ts:TemplateIdentifier,defaults:TemplateDefaults):Promise<TemplateSettings> {
        const c = this.vault.getAbstractFileByPath(ts.path) as TFile
        if( c instanceof TFile ) {
            const data = await this.vault.read(c)
            const metadata = await this.readMetadata(ts.path)
            const fn = c.basename
            const body = await this.getTemplateBody(ts)
            const tmpl:TemplateSettings = {
                outputDirectory:metadata['template-output'] || defaults.outputDirectory,
                inputFieldList:metadata['template-input'] || defaults.inputFieldList,
                textReplacementTemplate:metadata['template-replacement'] || defaults.textReplacementTemplate,
                shouldReplaceInput:metadata['template-should-replace'] || defaults.replaceSelection,
                shouldCreateOpen:metadata['template-should-create'] || defaults.createOpen,
                templateBody : body,
                fields : this.getTemplateFields(body)
            }
            return tmpl
        } 
    }

    // Reads in the template file, strips out the templating ID tags from the YAML and returns the result
    async getTemplateBody(ts:TemplateIdentifier): Promise<string> {
        const file = this.vault.getAbstractFileByPath(ts.path);
        if (!(file instanceof TFile)) {
            alert("Couldn't find file: " + ts.path)
            return
        }
        const rawTemplate = await this.vault.read(file)
        var finalTemplate = rawTemplate
        const templateFields = [
            "template-id",
            "template-name",
            "template-replacement",
            "template-input",
            "template-output",
            "template-should-replace",
            "template-should-create"
        ]
        templateFields.forEach(tf => {
            const re = new RegExp(tf + ".*\n")
            finalTemplate = finalTemplate.replace(re,"")
        })
        return finalTemplate
    }

    // Gets the YAML metadata for the given template path
    async readMetadata(path:string) {
        const data = await this.vault.read(this.vault.getAbstractFileByPath(path) as TFile)
        const result = metadataParser(data)
        return result.metadata
    }

    // Pull out the tags that Mustache finds and turn them into TemplateFields ready for use
    getTemplateFields(template:string): TemplateField[] {
        // Returns tuples of type ["name","<tag>"] - maybe other types...
        //const templateFields: Array<Array<any>> = Mustache.parse(template);
        const templateFields: string[][] = Mustache.parse(template);
        
        const titleField:TemplateField = {id:"title",inputType:"text",args:[],alternatives:[]}

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
    Parse the selected input in the editor, and turn it into values for some of the fields
    - input is the selected text, e.g. "Kevin - old friend - school"
    - spec is the list of field names, e.g. body,overview,tags
    - delimiter is what is between the different fields in the input (in this case " - ")
    */
    parseInput(input:string,spec:string,delimiter:string) : Record<string,string> {
        const fields = spec.split(",").map(s => s.trim())
        const input_parts = input.split(new RegExp(delimiter)).map(s=>s.trim())
        const zip = (a:string[], b:string[]) => Array.from(Array(Math.min(b.length, a.length)), (_, i) => [a[i], b[i]]);
        const r : Record<string,string> = {}
        zip(fields,input_parts).forEach(f => r[f[0]] = f[1])
        return r
    }

    /*
    Combines one TemplateField with another. Currently just adds the alternative manifestations,
    e.g. '{{body}}' and '{{body:text}}', but might want to be more clever in the future in case
    the second declaration of the tag in the template has more info.
    */
    mergeField(current:TemplateField,additional:TemplateField) {
        current.alternatives = current.alternatives.concat(additional.alternatives)
    }

    countTemplates(folder:string) : number | undefined {
		const templateFolder:TFolder = this.vault.getAbstractFileByPath(folder) as TFolder
        if( !templateFolder ) return undefined
        let templates  = templateFolder.children.filter(t => t.path.endsWith(".md"))
        return templates.length
    }

    getTemplateFolders() {
        const descend = (t:TFolder,i:number,all:TemplateFolderSpec[]) => {
            if(i > 0) all.push({location:t,depth:i+1,numTemplates:this.countTemplates(t.path)})
            t.children.filter(f => f instanceof TFolder).forEach(f => descend(f as TFolder,i+1,all))
        }
        const result:TemplateFolderSpec[] = []
        descend(this.vault.getRoot(),0,result)
        console.log(result)
        return result
    }
}