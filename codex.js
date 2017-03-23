'use strict';

var Paper = require('./paper');
var Translator = require('./lib/translator');

class Codex {}

Codex.createInstance = (data, assembler) => {
    let translator;
    let paperInstance;

    return new Promise((resolve, reject) => {
        assembler.getTranslations((error, translations) => {
            if (error) {
                reject(error);
            }

            // Make translations available to the helpers
            translator = Translator.create(data.acceptLanguage, translations);
            paperInstance = new Paper(data.context.settings, data.context.themeSettings, assembler, data.context, translator);

            resolve(paperInstance);
        });
    });
}

module.exports = Codex;