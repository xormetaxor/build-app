import helper from './_scriptsHelper';
helper.initEnv();

import * as fs from 'fs-extra';
import * as webpack from 'webpack';
import * as chalk from 'chalk';
import * as Promise from 'bluebird';
import webpackConfig from '../config/webpack.config.server';
import webpackHelper from '../helpers/webpackHelper';
import pathHelper from './../helpers/pathHelper';
import utils from './../helpers/utils';
import config from '../config/config';

function build() {
    let startTime = new Date();

    utils.log('Build project in ' + chalk.cyan(pathHelper.getAppPath()) + '.');

    utils.ensureEmptyDir(pathHelper.projectRelative(config.paths.buildPackage));

    buildServer()
        .then(() => {
            return buildClient();
        })
        .then(() => {
            utils.log('Post build:');

            utils.logOperation('Copying data folder', () => {
                copyDataFolder();

                //index file to run app with production env params
                utils.copyToPackage(pathHelper.moduleRelative('./assets/build/serverIndex.js'), './index.js');
            });

            let endTime = new Date();
            let compilationTime = utils.getFormattedTimeInterval(startTime, endTime);

            utils.log('Build package was crated!', 'green');
            utils.log('Compilation time: ' + chalk.cyan(compilationTime) + '.');

            if (config.server.build.run) {
                if (!config.server.build.bundleNodeModules) {
                    utils.log('Installing dependencies...');

                    utils.runCommand('npm', ['install'], {
                        path: pathHelper.packageRelative('.'),
                        title: 'Installing app dependencies'
                    })
                }

                utils.log('Starting server...');

                utils.runCommand('node', ['index.js'], {
                    path: pathHelper.packageRelative('.')
                });
            }
        });
}

function buildServer() {
    console.log('Server build:');

    if (config.server.sourceLang === 'ts') {
        utils.runCommand('tsc', [], {
            path: pathHelper.serverRelative('./'),
            title: 'Compiling TypeScript'
        });
    }

    let buildServerJsAction = new Promise((resolve, reject) => {
        buildServerJs(() => {
            resolve();
        })
    });

    return utils.logOperationAsync('Transpiling JavaScript', buildServerJsAction)
        .then(() => {
            utils.logOperation('Copying assets', () => {
                utils.copyToPackage(pathHelper.serverRelative(config.paths.server.bundle), './server/server.js');

                let serverPackagePath = pathHelper.serverRelative('./package.json');
                let serverPackageJson = fs.readJsonSync(serverPackagePath);

                let buildPackageJson = {
                    dependencies: serverPackageJson.dependencies
                };

                fs.outputJsonSync(pathHelper.packageRelative('./package.json'), buildPackageJson);
            });
        });
}

function buildServerJs(callback) {
    let webpackConfigValues = webpackConfig.load();

    if (config.server.sourceLang === 'ts') {
        let entry = pathHelper.serverRelative(config.paths.server.build);
        entry = pathHelper.path.join(entry, config.paths.server.entry);
        entry += '.js';

        webpackConfigValues.entry = [entry];
    }

    webpack(webpackConfigValues).run((err, stats) => {
        webpackHelper.handleErrors(err, stats, true);

        if (callback) callback();
    });
}

function buildClient() {
    utils.log('Build client:');

    utils.log(`Build client... ${chalk.yellow('skipped')}.`);

    utils.logOperation('Copying assets', () => {
        utils.copyToPackage(pathHelper.clientRelative(config.paths.client.build), './client');

        if (config.server.build.removeMapFiles) {
            let files = fs.walkSync(pathHelper.packageRelative('./client'));
            for (let file of files) {
                if (file.endsWith('.map')) {
                    fs.removeSync(file);
                }
            }
        }
    });

    return Promise.resolve();
}

function copyDataFolder() {
    utils.copyToPackage(pathHelper.serverRelative(config.paths.server.data), './data/');

    utils.ensureEmptyDir(pathHelper.packageRelative('./data/config'));
}

build();