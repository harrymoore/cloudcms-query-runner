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
var option_find = options["find"];
var option_tree = options["tree"];
var option_nodeId = options["node-id"];

var option_sort = options["sort"];
var option_skip = options["skip"];
var option_limit = options["limit"];
var option_full = options["full"];
var option_metadata = options["metadata"];

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

if (!option_query && !option_search && !option_traverse && !option_find && !option_tree) {
    error("You must specify a query type with one of: --query --search --traverse --find or --tree");
    return;
}

if (!fs.existsSync(option_filePath)) {
    error("You must specify a query file using --query-file-path");
    return;
}

var query = require(option_filePath);
if (!_.isObject(query)) {
    error("Not a valid query in file " + option_filePath);
    printHelp(getOptions());
    return;
}

util.getBranch(gitanaConfig, option_branchId, function (err, branch, platform, stack, domain, primaryDomain, project) {
    if (err) {
        debug("Error connecting to Cloud CMS branch: " + err);
        return;
    }

    log.info("connected to project: \"" + chalk.cyan(project.title) + "\" and branch: \"" + chalk.cyan(branch.title || branch._doc) + "\".");

    var queryStartTime = process.hrtime();
    var queryDuration = 0;

    if (option_query) {
        error(chalk.yellow("Query"));
        branch.trap(function(err){
            error(chalk.red(err));          
        }).queryNodes(query, {
            limit: option_limit || 100,
            sort: {
                title: 1,
                "_system.modified_on.mm": -1
            }
        }).then(function () {
            queryDuration = process.hrtime(queryStartTime);
            info("Completed in " + durationSeconds(queryDuration) + " seconds");

            var nodes = this.asArray();
            showNodes(nodes);
        });
    } else if (option_search) {
        error(chalk.yellow("Search"));
    } else if (option_traverse) {
        error(chalk.yellow("Traverse"));
    } else if (option_find) {
        error(chalk.yellow("Find"));
    } else if (option_tree) {
        error(chalk.yellow("Tree"));
    } else {
        printHelp(getOptions());
    }

    return;
});

function durationSeconds(duration) {
    return (duration[0] * NS_PER_SEC + duration[1]) / NS_PER_SEC;
}

function showNodes(nodes) {
    debug("showNodes()");

    text(JSON.stringify(nodes, null, 4));
}

function getNodesFromQuery(context, callback) {
    info("getNodesFromQuery()");

    var query = context.query;

    context.branch.queryNodes(query, {
        limit: -1
        // }).each(function() {
        //     var node = this;
        //     util.enhanceNode(node);
        //     nodes.push(node);
    }).then(function () {
        context.nodes = this.asArray();
        callback(null, context);
    });
}

function touchNodes(context, callback) {
    info("touchNodes()");

    var nodes = context.nodes;

    async.eachSeries(nodes, function (node, cb) {
        log.info("touching " + node._doc);

        Chain(node).touch().then(function () {
            cb();
        });
    }, function (err) {
        if (err) {
            log.error("Error loading forms: " + err);
            callback(err);
            return;
        }

        log.debug("loaded forms");
        callback(null, context);
        return;
    });
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
            name: 'sort',
            type: String,
            description: 'sort'
        },
        {
            name: 'fields',
            type: String,
            description: 'fields'
        },
        {
            name: 'full',
            type: Boolean,
            description: 'full'
        },
        {
            name: 'metadata',
            type: Boolean,
            description: 'metadata'
        },
        {
            name: 'paths',
            type: Boolean,
            description: 'paths'
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
            content: 'Exercise various methods of finding nodes a Cloud CMS repository branch.'
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
            content: [
                {
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