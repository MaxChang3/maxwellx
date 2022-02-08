import { context, readConfig, writeFile, logger, defaultConfig, __dirname } from "@maxwellx/context";
import { getFilesContext } from "@maxwellx/layout";
import { loadPlugin, maxGenerator } from "@maxwellx/api"
import { Router } from "@maxwellx/router"
import { sep } from "path";
import type { Renderer, withContent, withReading } from "@maxwellx/api";
import type { filesContext } from "@maxwellx/layout"
import type { maxwellCore } from './types'
import type { plugins } from "@maxwellx/api";


class maxwell implements maxwellCore {
    context: context;
    filesContext: filesContext;
    renderer: {
        template?: Renderer<withReading>,
        markdown?: Renderer<withContent>
    };
    plugins: plugins;
    #log = {
        templateError: () => logger.error("Renderers may not init correctly.")
    }
    constructor() {
        this.context = { config: defaultConfig };
        this.filesContext = []
        this.plugins = {
            "Filter": [],
            "Injector": [],
            "Renderer<withContent>": "",
            "Renderer<withReading>": "",
            "maxGenerator": []
        }
        this.renderer = {}
    }
    async init() {
        await this.#setConfig()
        await this.#setFilesContext()
        await this.#loadPlugin()
        await this.#getRouter()
        await this.#initGenerator()
    }
    async #setConfig() {
        this.context.config = await readConfig()
    }
    async #loadPlugin() {
        this.plugins = await loadPlugin(this.context)
        this.renderer = {
            template: this.plugins["Renderer<withReading>"],
            markdown: this.plugins["Renderer<withContent>"]
        }
    }
    async #setFilesContext() {
        this.filesContext = await getFilesContext(this.context)
    }
    async #getRouter() {
        if (!(this.renderer.template)) {
            this.#log.templateError()
            return;
        }
        const { template } = this.renderer
        this.filesContext.forEach(pageContext => {
            let _layout = pageContext.frontMatter.layout
            if (!(Object.keys(this.context.config.url.router).includes(_layout))) {
                _layout = "*"
            }
            let layoutRouter = new Router(
                this.context.config.url.router[_layout].rule,
                pageContext,
                this.context.config.url.router[_layout].withIndex
            );
            pageContext.filename = layoutRouter.format()
            pageContext.filename += template.options?.output
        })
        return this.filesContext
    }
    async #initGenerator() {
        this.filesContext = this.filesContext.concat(
            await Promise.all(this.plugins.maxGenerator.map(
                async (generator: maxGenerator) =>
                    await generator.generate(this.context, this.filesContext)
            )))
    }
    async render() {
        if (!(this.renderer.template) || !(this.renderer.markdown)) {
            this.#log.templateError()
            return;
        }
        const { markdown, template } = this.renderer
        await Promise.all(this.filesContext.map(async (pageContext) => {
            //<Filter Plugin> todo:1 before_content_render
            if (pageContext.content != "") {
                pageContext = await markdown.render(pageContext, this.context)
            }
            //<Filter Plugin> todo:2 after_content_render
            let _context: context = {
                config: this.context.config,
                pageContext
            }
            //<Filter Plugin> todo3: before_layout_render
            pageContext = await template.render({
                filename: `${pageContext.frontMatter.layout}`,
                path: `${this.context.config.directory.template}${sep}${this.context.config.template}`
            }, _context)
            //<Filter Plugin> todo4: after_layout_render
        }))
    }
    async write() {
        await Promise.all(this.filesContext.map(async (pageContext) => {
            let _layout = pageContext.frontMatter.layout
            if (!(Object.keys(this.context.config.url.router).includes(_layout))) {
                _layout = "*"
            }
            let basepath = [
                this.context.config.directory.public,
                ...pageContext.filename.split(sep)
            ]
            writeFile(basepath, pageContext.content)
        }))
    }
}

export { maxwell }
