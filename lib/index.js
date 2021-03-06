'use strict';

// Load modules

var Path = require('path');
var Hoek = require('hoek');
var Joi = require('joi');
var R = require('ramda');
var S = require('string');

// Declare internals

var internals = {};


internals.schema = {
    knex: Joi.object().keys({
        client: Joi.string().required(),
        connection: Joi.alternatives().when('client', {
                is: 'sqlite3',
                then: Joi.object().keys({
                    filename: Joi.string()
                }),
                otherwise: Joi.alternatives().try(Joi.object(), Joi.string())
                .required()
        }).required(),
        debug: Joi.boolean()
    }),
    plugins: Joi.array().items(Joi.string()),
    models: Joi.array().items(Joi.string())
};


internals.schemaDefault = {
    plugins: ['registry']
};


internals.parse = function (attrs) {

    return R.zipObj(R.map(R.pipe(S, R.invoker(0, 'camelize'), R.prop('s')),
                          R.keys(attrs)),
                          R.values(attrs));
};


internals.format = function (attrs) {

    return R.zipObj(R.map(R.pipe(S, R.invoker(0, 'underscore'), R.prop('s')),
                          R.keys(attrs)),
                          R.values(attrs));
};


internals.calleeIndex = R.pipe(
    R.findIndex(R.pipe(R.nth(3), R.identical('internals.Plugin.register'))),
    R.add(1));


exports.register = function (server, options, next) {

    options = Hoek.applyToDefaults(internals.schemaDefault, options);
    Joi.assert(options, internals.schema, 'Invalid options');
    try {
        var bookshelf = require('bookshelf')(require('knex')(options.knex));
    }
    catch (error) {
        return next(new Error('Invalid knex options: ' + error.toString()));
    }

    Hoek.merge(bookshelf.Model.prototype,
               R.pick(['parse', 'format'], internals));

    R.map(R.flip(R.invoker(1, 'plugin'))(bookshelf), options.plugins);

    // bind model, collection methods
    var methods = R.pick(['model', 'collection'], bookshelf);
    Hoek.merge(bookshelf,
               R.zipObj(R.keys(methods),
                        R.map(R.flip(R.bind)(bookshelf), R.values(methods))));

    if (R.isArrayLike(options.models)) {
        var path = Path.parse(process.cwd());
        var fixPath = R.partial(Path.join, path.dir, path.base);

        R.map(R.pipe(
            fixPath,
            function (path) {

                require(path)(bookshelf);
            }))(options.models);
    }

    server.expose(bookshelf);

    next();
};


exports.register.attributes = {
    pkg: require('../package.json')
};
