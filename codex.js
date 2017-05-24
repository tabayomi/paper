'use strict';

var _ = require('lodash');
var Translator = require('./lib/translator');
var Path = require('path');
var Fs = require('fs');
var Handlebars = require('handlebars');
var Async = require('async');
var helpers = [];
var handlebarsOptions = {
    preventIndent: true
};

// Load helpers (this only run once)
Fs.readdirSync(Path.join(__dirname, 'helpers')).forEach(function (file) {
    helpers.push(require('./helpers/' + file));
});

/**
* processor is an optional function to apply during template assembly. The
* templates parameter is a object where the keys are paths and the values are the
* raw templates. The function returns an object of the same format, possibly changing
* the values. We use this to precompile templates within the Paper module.
*
* @callback processor
* @param {Object} templates - Object that contains the gathered templates
*/

/**
* getTemplatesCallback is a function to call on completion of Assembler.getTemplates
*
* @callback getTemplatesCallback
* @param {Error} err - Error if it occurred, null otherwise
* @param {Object} templates - Object that contains the gathered templates, including processing
*/

/**
* getTranslationsCallback is a function to call on completion of Assembler.getTranslations
*
* @callback getTranslationsCallback
* @param {Error} err - Error if it occurred, null otherwise
* @param {Object} translations - Object that contains the translations
*/

/**
* Assembler.getTemplates assembles all the templates required to render the given
* top-level template.
*
* @callback assemblerGetTemplates
* @param {string} path - The path to the templates, relative to the templates directory
* @param {processor} processor - An optional processor to apply to each template during assembly
* @param {getTemplatesCallback} callback - Callback when Assembler.getTemplates is done.
*/

/**
* Assembler.getTranslations assembles all the translations for the theme.
*
* @callback assemblerGetTranslations
* @param {getTranslationsCallback} callback - Callback when Assembler.getTranslations is done.
*/

/**
* Paper constructor. In addition to store settings and theme settings (configuration),
* paper expects to be passed an assembler to gather all the templates required to render
* the top level template.
*
* @param {Object} settings - Site settings
* @param {Object} themeSettings - Theme settings (configuration)
* @param {Object} assembler - Assembler with getTemplates and getTranslations methods.
* @param {assemblerGetTemplates} assembler.getTemplates - Method to assemble templates
* @param {assemblerGetTranslations} assembler.getTranslations - Method to assemble translations
*/
class Codex {
    constructor(settings, themeSettings, assembler) {
    let self = this;

        self.handlebars = Handlebars.create();

        self.handlebars.templates = {};
        self.translator = null;
        self.inject = {};
        self.decorators = [];

        self.settings = settings || {};
        self.themeSettings = themeSettings || {};
        self.assembler = assembler || {};

        _.each(helpers, function (helper) {
            helper(self);
        });
    }

    static createInstance(data, assembler) {
        let translator;

        return new Promise((resolve, reject) => {
            assembler.getTranslations((error, translations) => {
                if (error) {
                    reject(error);
                }

                // Make translations available to the helpers
                translator = Translator.create(data.acceptLanguage, translations);
                let instance = new Codex(data.context.settings, data.context.themeSettings, assembler);
                instance.renderContext = data.context;
                instance.translator = translator;

                resolve(instance);
            });
        });
    }

    /**
     * Renders a string with the given context
     * @param  {String} string
     * @param  {Object} context
     */
    renderString(string, context) {
        return this.handlebars.compile(string)(context);
    }

    loadTheme(paths, acceptLanguage, done) {
        let self = this;

        if (!_.isArray(paths)) {
            paths = paths ? [paths] : [];
        }

        Async.parallel([
            function (next) {
                self.loadTranslations(acceptLanguage, next);
            },
            function (next) {
                Async.map(paths, self.loadTemplates.bind(self), next);
            }
        ], done);
    }

    /**
     * Load Partials/Templates
     * @param  {Object}   templates
     * @param  {Function} callback
    */
    loadTemplates(path, callback) {
        let self = this;

        let processor = self.getTemplateProcessor();

        self.assembler.getTemplates(path, processor, function (error, templates) {
            if (error) {
                return callback(error);
            }

            _.each(templates, function (precompiled, path) {
                var template;
                if (!self.handlebars.templates[path]) {
                    eval('template = ' + precompiled);
                    self.handlebars.templates[path] = self.handlebars.template(template);
                }
            });

            self.handlebars.partials = self.handlebars.templates;

            callback();
        });
    }

    getTemplateProcessor() {
        let self = this;

        return function (templates) {
            var precompiledTemplates = {};

            _.each(templates,(content, path) => {
                precompiledTemplates[path] = self.handlebars.precompile(content, handlebarsOptions);
            });

            return precompiledTemplates;
        }
    }

    /**
     * Load Partials/Templates used for test cases and stencil-cli
     * @param  {Object}   templates
     * @return {Object}
     */
    loadTemplatesSync(templates) {
        let self = this;

        _.each(templates,(content, fileName) => {
            self.handlebars.templates[fileName] = self.handlebars.compile(content, handlebarsOptions);
        });

        self.handlebars.partials = self.handlebars.templates;

        return self;
    };

    /**
     * @param {String} acceptLanguage
     * @param {Object} translations
     */
    loadTranslations(acceptLanguage, callback) {
        let self = this;

        self.assembler.getTranslations((error, translations) => {
            if (error) {
                return callback(error);
            }

            // Make translations available to the helpers
            self.translator = Translator.create(acceptLanguage, translations);

            callback();
        });
    };

    /**
     * Add CDN base url to the relative path
     * @param  {String} path     Relative path
     * @return {String}          Url cdn
     */
    cdnify(path) {
        let cdnUrl = this.settings['cdn_url'] || '';
        let versionId = this.settings['theme_version_id'];
        let sessionId = this.settings['theme_session_id'];
        let protocolMatch = /(.*!?:)/;

        if (path instanceof Handlebars.SafeString) {
            path = path.string;
        }

        if (!path) {
            return '';
        }

        if (/^(?:https?:)?\/\//.test(path)) {
            return path;
        }

        if (protocolMatch.test(path)) {
            var match = path.match(protocolMatch);
            path = path.slice(match[0].length, path.length);

            if (path[0] === '/') {
                path = path.slice(1, path.length);
            }

            if (match[0] === 'webdav:') {
                return [cdnUrl, 'content', path].join('/');
            }

            if (this.themeSettings.cdn) {
                var endpointKey = match[0].substr(0, match[0].length - 1);
                if (this.themeSettings.cdn.hasOwnProperty(endpointKey)) {
                    if (cdnUrl) {
                        return [this.themeSettings.cdn[endpointKey], path].join('/');
                    }

                    return ['/assets/cdn', endpointKey, path].join('/');
                }
            }

            if (path[0] !== '/') {
                path = '/' + path;
            }

            return path;
        }

        if (path[0] !== '/') {
            path = '/' + path;
        }

        if (!versionId) {
            return path;
        }

        if (path.substr(0, 8) === '/assets/') {
            path = path.substr(8, path.length);
        }

        if (sessionId) {
            return [cdnUrl, 'stencil', versionId, 'e', sessionId, path].join('/');
        }

        return [cdnUrl, 'stencil', versionId, path].join('/');
    };

    /**
     * @param {Function} decorator
     */
    addDecorator(decorator) {
        this.decorators.push(decorator);
    };

    /**
     * @param {String} path
     * @param {Object} context
     * @return {String}
     */
    render(path, context) {
        let output;

        context = context || {};
        context.template = path;

        if (this.translator) {
            context.locale_name = this.translator.getLocale();
        }

        output = this.handlebars.templates[path](context);

        _.each(this.decorators, function (decorator) {
            output = decorator(output);
        });

        return output;
    };

    /**
     * Theme rendering logic
     * @param  {String|Array} templatePath
     * @param  {Object} data
     * @return {String|Object}
     */
    renderTheme(templatePath, data) {
        let html,
            output;

        // Is an ajax request?
        if (data.remote || _.isArray(templatePath)) {

            if (data.remote) {
                data.context = _.extend({}, data.context, data.remote_data);
            }

            // Is render_with ajax request?
            if (templatePath) {
                // if multiple render_with
                if (_.isArray(templatePath)) {
                    // if templatePath is an array ( multiple templates using render_with option)
                    // compile all the template required files into a hash table
                    html = templatePath.reduce((table, file) => {
                        table[file] = this.render(file, data.context);
                        return table;
                    }, {});
                } else {
                    html = this.render(templatePath, data.context);
                }

                if (data.remote) {
                    // combine the context & rendered html
                    output = {
                        data: data.remote_data,
                        content: html
                    };
                } else {
                    output = html;
                }
            } else {
                output = {
                    data: data.remote_data
                };
            }
        } else {
            output = this.render(templatePath, data.context);
        }

        return output;
    }

}

module.exports = Codex;
