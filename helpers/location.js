'use strict';

function helper(paper) {
    paper.handlebars.registerHelper('location', function (locationId) {
        const options = arguments[arguments.length - 1];

        return `Output for location ${locationId}`;
    });
}