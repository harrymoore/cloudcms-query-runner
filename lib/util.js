var Gitana = require("gitana");
var _ = require("underscore")
var chalk = require('chalk');

module.exports = function() {

    var r = {};

    /**
     * connect to Cloud CMS and retrieve branch
     * 
     */
    var getBranch = r.getBranch = function(gitanaConfig, branchId, callback)
    {
        Gitana.connect(gitanaConfig, function(err) {
            if (err) {
                // console.log("Failed to connect: " + JSON.stringify(err));
                return callback(chalk.red("Failed to connect: " + JSON.stringify(err)));
            }

            var appHelper = this;
            var platform = appHelper.platform();
            var primaryDomain = platform.readPrimaryDomain();
            var stack = appHelper.stack();
            var project = appHelper.project();
            
            appHelper.datastore("content").trap(function(err) {
                console.log(chalk.red("Failed to retrieve datastore: " + JSON.stringify(err)));
                return callback(err);

            }).readBranch(branchId || "master").then(function () {
                var branch = this;
                domain = appHelper.datastore("principals");
                // console.log("connected to project: \"" + project.title + "\" and branch: \"" + branch.title || branch._doc + "\"");
                return callback(null, branch, platform, stack, domain, primaryDomain, project);
            });
        });
    };

    var enhanceNode = r.enhanceNode = exports.enhanceNode = function(node)
    {
        if (!node || !node.__qname) return node;
        
        node._qname = node.__qname();
        node._type = node.__type();
        if (node._paths && Object.keys(node._paths).length) {
            node._filePath = _.values(node._paths)[0];
        }
        delete node._paths;
    
        // add in the "attachments" as a top level property
        // if "attachments" already exists, we'll set to "_attachments"
        var attachments = {};
        for (var id in node.getSystemMetadata()["attachments"])
        {
            var attachment = node.getSystemMetadata()["attachments"][id];
    
            attachments[id] = JSON.parse(JSON.stringify(attachment));
            attachments[id]["url"] = "/static/node/" + node.getId() + "/" + id;
            attachments[id]["preview32"] = "/static/node/" + node.getId() + "/preview32/?attachment=" + id + "&size=32";
            attachments[id]["preview64"] = "/static/node/" + node.getId() + "/preview64/?attachment=" + id + "&size=64";
            attachments[id]["preview128"] = "/static/node/" + node.getId() + "/preview128/?attachment=" + id + "&size=128";
            attachments[id]["preview256/"] = "/static/node/" + node.getId() + "/preview256/?attachment=" + id + "&size=256";
        }
    
        if (!node.attachments) {
            node.attachments = attachments;
        }
        else if (!node._attachments) {
            node._attachments = attachments;
        }
    
        // add in the "_system" block as a top level property
        if (node.getSystemMetadata) {
            node._system = node.getSystemMetadata();
        }
    };

        
return r;
    
}();
