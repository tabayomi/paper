'use strict';

function helper(paper) {
    paper.handlebars.registerHelper('location', function (params) {
        let locationId = params.hash.name;
        
        if ((!paper.context) || (!paper.context.locations)) {
            return '';
        }
        
        let content = paper.context.locations[locationId] ? paper.content.locations[locationId] : '';
        return new paper.handlebars.SafeString(content);
    });
}

module.exports = helper;