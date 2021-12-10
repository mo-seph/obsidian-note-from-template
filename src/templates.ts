// @ts-ignore - not sure how to build a proper typescript def yet
import * as Mustache from 'mustache';
// @ts-ignore - not sure how to build a proper typescript def yet
import metadataParser from 'markdown-yaml-metadata-parser'
import { TAbstractFile, TFile, TFolder, Vault } from 'obsidian';


export interface TemplateSpec {
	id: string; //Unique ID for building commands
	name: string; //Name to show for the command (probably same as the template filename, but doesn't have to be)
	template: string; //Name of the template file
	templateDirectory: string; //Name of the template file
	directory: string; //Output directory for notes generated from the template
	inputFieldList: string; //Fields to pull out of the input
	replacement: string; //A template string for the text that will be inserted in the editor
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
	fields:TemplateField[]; //Specifications for all of the fields in the template
	data:Record<string,string>; //The data to fill in the template with
	replacementText:string;
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
		return Promise.all( templateFolder.children.map( async c => this.getTemplateSpec(c,directory)) )
	}

    /*
    * Returns a specification describing the template
    */
    async getTemplateSpec(c:TAbstractFile,directory:string):Promise<TemplateSpec> {
        if( c instanceof TFile ) {
            const data = await this.vault.read(c)
            const result = metadataParser(data)
            const fn = c.basename
            const tmpl:TemplateSpec = {
                id:result.metadata['template-id'] || fn.toLowerCase(),
                name:result.metadata['template-name'] || fn,
                template:fn,
                templateDirectory:directory,
                directory:result.metadata['template-output'] || "test",
                inputFieldList:result.metadata['template-input'] || "title,body",
                replacement:result.metadata['template-replacement'] || "[[{{title}}]]",
            }
            return tmpl
        }
    }

    // Reads in the template file, strips out the templating ID tags from the YAML and returns the result
    async loadTemplate(name:string,directory:string): Promise<string> {
        //const filename = this.settings.templateDirectory + "/" + name + ".md"
        const filename = directory + "/" + name + ".md"
        const file = this.vault.getAbstractFileByPath(filename);
        if (!(file instanceof TFile)) {
            alert("Couldn't find file: " + filename)
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
		spec.fields.forEach( f => {
			f.alternatives.forEach( a => data[a] = data[f.id])
		})
		
		const template = await this.loadTemplate(spec.template.name,spec.template.templateDirectory);
		const filledTemplate = Mustache.render(template,spec.data);
        const replaceText = Mustache.render(spec.template.replacement,spec.data)
        return [filledTemplate,replaceText]
    }

}