// @ts-ignore - not sure how to build a proper typescript def yet
import * as Mustache from 'mustache';
// @ts-ignore - not sure how to build a proper typescript def yet
import metadataParser from 'markdown-yaml-metadata-parser'
import { TAbstractFile, TFile, Vault } from 'obsidian';


export interface TemplateSpec {
	id: string; //Unique ID for building commands
	name: string; //Name to show for the command (probably same as the template filename, but doesn't have to be)
	template: string; //Name of the template file
	directory: string; //Output directory for notes generated from the template
	inputFieldList: string; //Fields to pull out of the input
	replacement: string; //A template string for the text that will be inserted in the editor
}

export interface TemplateField {
	id: string //Unique id, first bit of the field
	inputType: string // What kind of input is it?
	args: string[]
	alternatives: string[]
};

console.log("hello")

export default class TemplateHelper {
    vault:Vault
    constructor(vault:Vault) {
        this.vault = vault;
    }


    /*
    * Returns a specification describing the template
    */
    async getTemplateSpec(c:TAbstractFile):Promise<TemplateSpec> {
        if( c instanceof TFile ) {
            const data = await this.vault.read(c)
            const result = metadataParser(data)
            const fn = c.basename
            const tmpl:TemplateSpec = {
                id:result.metadata['template-id'] || fn.toLowerCase(),
                name:result.metadata['template-name'] || fn,
                template:fn,
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
            alert("Couldn't find file: " + file.path)
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

}