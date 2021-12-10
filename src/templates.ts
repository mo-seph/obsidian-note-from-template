// @ts-ignore - not sure how to build a proper typescript def yet
import * as Mustache from 'mustache';
// @ts-ignore - not sure how to build a proper typescript def yet
import metadataParser from 'markdown-yaml-metadata-parser'
import { TAbstractFile, TFile, TFolder, Vault } from 'obsidian';


export interface TemplateSpec {
	id: string; //Unique ID for building commands, based on template filename
	name: string; //Name to show for the command (probably same as the template filename, but doesn't have to be)
	//template: string; //Name of the template file
	path: string; //Path of the template file
}

export interface TemplateSettings {
	outputDirectory: string; //Output directory for notes generated from the template
	inputFieldList: string; //Fields to pull out of the input
	textReplacementTemplate: string; //A template string for the text that will be inserted in the editor
    templateBody:string;
	fields:TemplateField[]; //Specifications for all of the fields in the template
}

export interface TemplateField {
	id: string //Unique id, first bit of the field
	inputType: string // What kind of input is it?
	args: string[]
	alternatives: string[]
}


export interface ReplacementSpec {
	input:string; // The currently selected text in the editor
	template:TemplateSpec;
    templateSettings:TemplateSettings;
	data:Record<string,string>; //The data to fill in the template with
	//replacementText:string;
	//replacement_text:string;
}


export default class TemplateHelper {
    vault:Vault
    constructor(vault:Vault) {
        this.vault = vault;
    }

    /*
     * Returns all the templates in a directory
    	Run through the settings directory and return an TemplateSettings for each valid file there
     */
	async getTemplates(directory:string) : Promise<TemplateSpec[]> {
		console.log("Finding templates in : " + directory)
		const templateFolder:TFolder = this.vault.getAbstractFileByPath(directory) as TFolder
		if( ! templateFolder ) return []
		return Promise.all( templateFolder.children.map( async c => this.getTemplateSpec(c)) )
	}

    /*
    * Returns a specification describing the template
    */
    async getTemplateSpec(c:TAbstractFile):Promise<TemplateSpec> {
        if( c instanceof TFile ) {
            const metadata = await this.readMetadata(c.path)
            const fn = c.basename
            const tmpl:TemplateSpec = {
                id:metadata['template-id'] || fn.toLowerCase(),
                name:metadata['template-name'] || fn,
                path:c.path,
            }
            return tmpl
        }
    }

    async getTemplateSettings(ts:TemplateSpec):Promise<TemplateSettings> {
        const c = this.vault.getAbstractFileByPath(ts.path) as TFile
        if( c instanceof TFile ) {
            const data = await this.vault.read(c)
            const metadata = await this.readMetadata(ts.path)
            const fn = c.basename
            const body = await this.loadTemplate(ts)
            const tmpl:TemplateSettings = {
                outputDirectory:metadata['template-output'] || "test",
                inputFieldList:metadata['template-input'] || "title,body",
                textReplacementTemplate:metadata['template-replacement'] || "[[{{title}}]]",
                templateBody : body,
                fields : this.templateFields(body)
            }
            return tmpl
        } 
    }

    // Reads in the template file, strips out the templating ID tags from the YAML and returns the result
    async loadTemplate(ts:TemplateSpec): Promise<string> {
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
            "template-output"
        ]
        templateFields.forEach(tf => {
            const re = new RegExp(tf + ".*\n")
            finalTemplate = finalTemplate.replace(re,"")
        })
        return finalTemplate
    }

    async readMetadata(path:string) {
        const data = await this.vault.read(this.vault.getAbstractFileByPath(path) as TFile)
        const result = metadataParser(data)
        return result.metadata
    }

    templateFields(template:string): TemplateField[] {
        // Pull out the tags the Mustache finds
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

    parseInput(input:string,spec:string,delimiter:string) : Record<string,string> {
        const fields = spec.split(",").map(s => s.trim())
        const input_parts = input.split(new RegExp(delimiter)).map(s=>s.trim())
        const zip = (a:string[], b:string[]) => Array.from(Array(Math.min(b.length, a.length)), (_, i) => [a[i], b[i]]);
        const r : Record<string,string> = {}
        zip(fields,input_parts).forEach(f => r[f[0]] = f[1])
        console.log("Got input: ",r)
        return r
    }

    mergeField(current:TemplateField,additional:TemplateField) {
        current.alternatives = current.alternatives.concat(additional.alternatives)
    }

    async fillOutTemplate(spec:ReplacementSpec) : Promise<[string,string]> {
        console.log("Filling template")
		console.log(spec)
		const data = spec.data

		//Copy data across to all the alternative formulations of a field
		spec.templateSettings.fields.forEach( f => {
			f.alternatives.forEach( a => data[a] = data[f.id])
		})
		
		//const template = await this.loadTemplate(spec.template);
		const filledTemplate = Mustache.render(spec.templateSettings.templateBody,spec.data);
        const replaceText = Mustache.render(spec.templateSettings.textReplacementTemplate,spec.data)
        return [filledTemplate,replaceText]
    }

}