# Cloud CMS Query Example Runner
[![NPM Version](https://img.shields.io/npm/v/cloudcms-query-runner.svg)](https://www.npmjs.com/package/cloudcms-query-runner)
[![NPM Download](https://img.shields.io/npm/dm/cloudcms-query-runner.svg)](https://www.npmjs.com/package/cloudcms-query-runner)

Command line script to perform various Cloud CMS queries. There are several APIs available in Cloud CMS to discover content nodes. This script is intened to demonstrate the use of each of these methods.

It is not necessary to install cloudcms-query-runner. It runs as an npx script. But it will run faster if it installed first (otherwise npx will install it on demand and remove it when it finishes executing each command).

## Install:
    npm install -g cloudcms-query-runner

## Help:
    npx cloudcms-query-runner -h

## Usage
    Download or otherwise create a gitana.json file from the Cloud CMS API Keys of a Project's Application object.
    Create a json file containing the query, search, traverse, find, or tree API call you wish to make.
    Ex.:
    npx cloudcms-query-runner -g ./path/to/project-x-gitana.json --query --query-file-path ./query-files/query-test-1.json

# Examples
## Query for nodes by type.
    Create file test1.json with this content:
    `{
        "_type": "my:type" 
    }`

    `npx cloudcms-query-runner -g ./path/to/project-x-gitana.json --query --query-file-path ./test1.json`

