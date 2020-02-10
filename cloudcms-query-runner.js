#!/usr/bin/env node

/*jshint -W069 */
/*jshint -W104*/
const Gitana = require("gitana");
const async = require("async");
const cliArgs = require('command-line-args');
const commandLineUsage = require('command-line-usage')
const chalk = require('chalk');
const _ = require('underscore');
const fs = require("fs");
const util = require("./lib/util");
const Logger = require('basic-logger');
const log = new Logger({
    showMillis: true,
    showTimestamp: true
});
const NS_PER_SEC = 1e9;

function error(message) {
    log.error(chalk.red(message));
}

function warn(message) {
    log.warn(chalk.yellow(message));
}

function info(message) {
    log.info(chalk.cyan(message));
}

function message(message) {
    log.info(chalk.green(message));
}

function text(message) {
    log.info(message);
}

function debug(message) {
    log.debug(chalk.white(message));
}

function trace(message) {
    log.trace(message);
}

// debug only when using charles proxy ssl proxy when intercepting cloudcms api calls:
if (process.env.NODE_ENV !== 'production') {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

var options = handleOptions();
if (!options) {
    return;
}
if (options["verbose"]) {
    Logger.setLevel('debug', true);
} else {
    Logger.setLevel('info', true);
}

var option_prompt = options["prompt"];
var option_useCredentialsFile = options["use-credentials-file"];
var option_username = options["username"];
var option_password = options["password"];
var option_gitanaFilePath = options["gitana-file-path"] || "./gitana.json";
var option_branchId = options["branch"] || "master";
var option_filePath = options["query-file-path"];
var option_query = options["query"];
var option_search = options["search"];
var option_traverse = options["traverse"];
var option_graphql = options["graphql"];
var option_graphqlSchema = options["graphql-schema"];
var option_printResults = options["print-results"];
var option_find = options["find"];
var option_tree = options["tree"];
var option_nodeId = options["node-id"];
var option_sortFilePath = options["sort-file-path"];
var option_skip = options["skip"];
var option_limit = options["limit"];

//
// load gitana.json config and override credentials
//
var gitanaConfig = JSON.parse("" + fs.readFileSync(option_gitanaFilePath));
if (option_useCredentialsFile) {
    // override gitana.json credentials with username and password properties defined in the cloudcms-cli tool local db
    var rootCredentials = JSON.parse("" + fs.readFileSync(path.join(util.homeDirectory(), ".cloudcms", "credentials.json")));
    gitanaConfig.username = rootCredentials.username;
    gitanaConfig.password = rootCredentials.password;
} else if (option_prompt) {
    // override gitana.json credentials with username and password properties entered at command prompt
    var option_prompt = require('prompt-sync')({
        sigint: true
    });
    gitanaConfig.username = option_prompt('name: ');
    gitanaConfig.password = option_prompt.hide('password: ');
}

if (option_username) {
    gitanaConfig.username = option_username;
}
if (option_password) {
    gitanaConfig.password = option_password;
}

if (!option_query 
    && !option_search 
    && !option_traverse 
    && !option_find 
    && !option_tree 
    && !option_graphql
    && !option_graphqlSchema) {
    error("You must specify a query type with one of: --query, --search, --traverse, --find, --tree, --graphql, --graphql-schema");
    return;
}

if (!fs.existsSync(option_filePath) && !option_graphqlSchema) {
    error("You must specify a query file using --query-file-path");
    return;
}

var query;
if (option_graphqlSchema) {
    // no query needed
} else if (option_graphql) {
    query = fs.readFileSync(option_filePath, 'utf8'); 
} else {
    query = require(option_filePath);
    if (!_.isObject(query)) {
        error("Not a valid query in file " + option_filePath);
        return;
    }
}
var sort = {};
if (option_sortFilePath) {
    if (!fs.existsSync(option_sortFilePath)) {
        error("Sort file path not found at " + option_sortFilePath);
        return;
    }

    sort = require(option_sortFilePath);
    if (!_.isObject(sort)) {
        error("Not a valid sort in file " + option_sortFilePath);
        return;
    }
}

util.getBranch(gitanaConfig, option_branchId, function (err, branch, platform, stack, domain, primaryDomain, project) {
    if (err) {
        debug("Error connecting to Cloud CMS branch: " + err);
        return;
    }

    log.info("connected to project: \"" + chalk.yellow(project.title) + "\" and branch: \"" + chalk.yellow(branch.title || branch._doc) + "\".");

    var queryDuration = 0;
    var queryStartTime = process.hrtime();

    if (option_query) {
        info("Query");
        branch.trap(function (err) {
            error(err);
        }).queryNodes(query, {
            limit: option_limit || 100,
            skip: option_skip,
            sort: sort
        }, {
            paths: true
        }).then(function () {
            queryDuration = process.hrtime(queryStartTime);
            var nodes = this.asArray();
            printNodes("Query", nodes, queryDuration);
        });
    } 
    else if (option_search) {
        info("Search");
        branch.trap(function (err) {
            error(err);
        }).searchNodes({
            "filtered": {
               "query": {
                  "query_string": {
                     "query": "twitter"
                  }
               },
               "filter": {
                  "type" : {
                     "value" : "my:article"
                  }
               }
            }
         }).then(function () {
            queryDuration = process.hrtime(queryStartTime);
            var nodes = this.asArray();
            printNodes("Search", nodes, queryDuration);
        });
    } 
    else if (option_traverse) {
        info("Traverse");
        branch.trap(function (err) {
            error(err);
        }).readNode(option_nodeId).traverse(query).then(function () {
            queryDuration = process.hrtime(queryStartTime);
            var nodes = this.asArray();
            printNodes("Traverse", nodes, queryDuration);
        });
    } 
    else if (option_find) {
        info("Find");
        branch.trap(function (err) {
            error(err);
        }).find(query).then(function () {
            queryDuration = process.hrtime(queryStartTime);
            var nodes = this.asArray();
            printNodes("Find", nodes, queryDuration);
        });
    } 
    else if (option_tree) {
        info("Tree");
        branch.trap(function (err) {
            error(err);
        }).rootNode().loadTree(query, function (tree) {
            queryDuration = process.hrtime(queryStartTime);
            printNodeTree("Tree", tree, queryDuration);
        });
    }
    else if (option_graphql) {
        info("graphqlQuery");

        var operationName = "";
        var variables = null;

        // Gitana.PREFER_GET_OVER_POST = false;

        branch.trap(function (err) {
            error(err);
        }).graphqlQuery(query, operationName, variables, function (result) {
            queryDuration = process.hrtime(queryStartTime);
            printObjectResponse("graphql", result, queryDuration);
        });
    } 
    else if (option_graphqlSchema) {
        info("graphql-schema");
        branch.graphqlSchema(function (schemaText) {
            queryDuration = process.hrtime(queryStartTime);
            printGraphqlResult("graphql-schema", schemaText, queryDuration);
        });
    }
    else {
        printHelp(getOptions());
    }

    return;
});

function durationSeconds(duration) {
    return (duration[0] * NS_PER_SEC + duration[1]) / NS_PER_SEC;
}

function printNodes(type, nodes, duration) {
    debug("showNodes()");

    if (duration) {
        info(type + " completed in " + durationSeconds(duration) + " seconds");
    }

    info("Node count " + nodes.length || "?");

    if (option_printResults) {
        nodes = _.map(nodes, function (node) {
            util.enhanceNode(node);
            return (node);
        });

        text(JSON.stringify(nodes, null, 4));
    }
}
function printGraphqlResult(type, schema, duration) {
    debug("showNodes()");

    if (duration) {
        info(type + " completed in " + durationSeconds(duration) + " seconds");
    }

    text("\n" + schema);
}

function printObjectResponse(type, response, duration) {
    debug("showNodes()");

    if (duration) {
        info(type + " completed in " + durationSeconds(duration) + " seconds");
    }

    if (option_printResults) {
        text(JSON.stringify(response, null, 2));
    }
}

function printNodeTree(type, nodeTree, duration) {
    debug("showNodes()");

    if (duration) {
        info(type + " completed in " + durationSeconds(duration) + " seconds");
    }

    info("Node count " + nodeTree.length || "?");

    if (option_printResults) {
        text(JSON.stringify(nodeTree, null, 4));
    }
}

function getOptions() {
    return [{
            name: 'help',
            alias: 'h',
            type: Boolean
        },
        {
            name: 'verbose',
            alias: 'v',
            type: Boolean,
            description: 'verbose logging'
        },
        {
            name: 'prompt',
            alias: 'p',
            type: Boolean,
            description: 'prompt for username and password. overrides gitana.json credentials'
        },
        {
            name: 'use-credentials-file',
            alias: 'c',
            type: Boolean,
            description: 'use credentials file ~/.cloudcms/credentials.json. overrides gitana.json credentials'
        },
        {
            name: 'username',
            alias: 'u',
            type: String,
            description: 'api server admin user name"'
        },
        {
            name: 'password',
            alias: 'w',
            type: String,
            description: 'api server admin password"'
        },
        {
            name: 'gitana-file-path',
            alias: 'g',
            type: String,
            description: 'path to gitana.json file to use when connecting. defaults to ./gitana.json'
        },
        {
            name: 'branch',
            alias: 'b',
            type: String,
            description: 'branch id (not branch name!) to write content to. branch id or "master". Default is "master"'
        },
        {
            name: 'query-file-path',
            alias: 'f',
            type: String,
            description: 'path to file containing the query to executed'
        },
        {
            name: 'query',
            type: Boolean,
            description: 'Run a query'
        },
        {
            name: 'search',
            type: Boolean,
            description: 'Run a search'
        },
        {
            name: 'find',
            type: Boolean,
            description: 'Run a find'
        },
        {
            name: 'traverse',
            type: Boolean,
            description: 'Run a traverse'
        },
        {
            name: 'tree',
            type: Boolean,
            description: 'Run a tree'
        },
        {
            name: 'graphql',
            type: Boolean,
            description: 'Run a graphql query'
        },
        {
            name: 'graphql-schema',
            type: Boolean,
            description: 'Run graphql/schema to fetch content model schema'
        },
        {
            name: 'print-results',
            type: Boolean,
            description: 'print query results'
        },
        {
            name: 'limit',
            type: String,
            description: 'limit'
        },
        {
            name: 'skip',
            type: String,
            description: 'skip'
        },
        {
            name: 'sort-file-path',
            type: String,
            description: 'path to a json file defining the sort'
        },
        {
            name: 'fields',
            type: String,
            description: 'fields'
        },
        {
            name: 'node-id',
            type: String,
            description: 'node id'
        }
    ];
}

function handleOptions() {

    var options = cliArgs(getOptions());

    if (options.help) {
        printHelp(getOptions());
        return null;
    }

    return options;
}

function printHelp(optionsList) {
    console.log(commandLineUsage([{
            header: 'Cloud CMS Query Runner',
            content: 'Exercise various methods of searching for nodes in a Cloud CMS repository branch.'
        },
        {
            content: 'gitana credentials files can be referenced by path. This allows you to keep a library of credentials files and reference them when running this script using --gitana-file-path.'
        },
        {
            content: 'For example: gitana-project-xyz-local-docker.json, gitana-project-hello-world-cloudcms-net.json.'
        },
        {
            content: 'If no --gitana-file-path is set then the script looks for \'./gitana.json\'.'
        },
        {
            header: 'Options',
            optionList: optionsList
        },
        {
            header: 'Examples',
            content: [{
                    desc: '1. Query for nodes using POST to /repositories/{repositoryId}/branches/{branchId}/nodes/query',
                },
                {
                    desc: '\"query\" runs against the MongoDB database and uses MongoDB syntax'
                },
                {
                    desc: './cloudcms-query.js --query --query-file-path ./examples/query-test1.json'
                },

                {
                    desc: '\n2. Search for nodes using POST to /repositories/{repositoryId}/branches/{branchId}/nodes/search',
                },
                {
                    desc: '\"search\" runs against the elasticsearch database and uses elasticsearch DSL syntax'
                },
                {
                    desc: './cloudcms-query.js --search --query-file-path ./examples/search-test1.json'
                },

                {
                    desc: '\n3. Traverse nodes using POST to /repositories/{repositoryId}/branches/{branchId}/nodes/traverse',
                },
                {
                    desc: '\"Traverse\" runs against the elasticsearch database and uses elasticsearch DSL syntax'
                },
                {
                    desc: './cloudcms-query.js --search --query-file-path ./examples/traverse-test1.json'
                },

                {
                    desc: '\n4. Find nodes using POST to /repositories/{repositoryId}/branches/{branchId}/nodes/find.',
                },
                {
                    desc: '\"find\" uses a combination of query, search and traverse'
                },
                {
                    desc: `{
                        \"query\": {
                                  ... Gitana Query (Mongo)
                               },
                               \"search\": {
                                  ... Elastic Search Query Block
                               },
                               \"traverse\": {
                                  ... Traversal configuration
                               }
                            }`,

                },
                {
                    desc: './cloudcms-query.js --find --query-file-path ./examples/find-test1.json'
                },

                {
                    desc: '\n5. Return a \"Tree\" of nodes using POST to /repositories/{repositoryId}/branches/{branchId}/nodes/tree',
                },
                {
                    desc: '\"Tree\" runs against the elasticsearch database and uses elasticsearch DSL syntax'
                },
                {
                    desc: './cloudcms-query.js --tree --query-file-path ./examples/tree-test1.json'
                }
            ]
        }
    ]));
}