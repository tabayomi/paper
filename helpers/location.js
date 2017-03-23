'use strict';

function helper(paper) {
    paper.handlebars.registerHelper('location', function (locationId) {
        const options = arguments[arguments.length - 1];
        
        if ((!paper.context) || (!paper.context.locations)) {
            return '';
        }

        return new paper.handlebars.SafeString(paper.context.locations[locationId]) || '';
    });
}

module.exports = helper;