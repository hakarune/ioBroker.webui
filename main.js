import utils from '@iobroker/adapter-core';
import { spawn } from 'child_process';
import fixJsImports from './lib/fixEs6Imports.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url)).toString());
const adapterName = pkg.name.split('.').pop();

const adapter = new utils.Adapter(adapterName);

adapter.on('ready', () => main());
adapter.on('stateChange', stateChange);

function runUpload() {
    return new Promise(resolve => {
        adapter.log.info(`Upload ${adapter.name}, changes detected...`);
        const file = utils.controllerDir + '/iobroker.js';
        const child = spawn('node', [file, 'upload', adapter.name, 'widgets']);
        let count = 0;
        child.stdout.on('data', data => {
            count++;
            adapter.log.debug(data.toString().replace('\n', ''));
            !(count % 100) && adapter.log.info(count + ' files uploaded...');
        });

        child.stderr.on('data', data =>
            adapter.log.error(data.toString().replace('\n', '')));

        child.on('exit', exitCode => {
            adapter.log.info(`Uploaded. ${exitCode ? 'Exit - ' + exitCode : 0}`);
            resolve(exitCode);
        });
    });
}

async function refreshWWW() {
    await fixJsImports(__dirname + '/www/widgets', '/webui/widgets');
    await runUpload();
    adapter.setState('webui.0.control.command', { val: 'uiReloadPackages', ack: true });
}

var npmRunning = false;
function installNpm(name) {
    return new Promise(async resolve => {
        if (npmRunning) {
            adapter.error.info(`NPM already running`);
            resolve();
        }
        npmRunning = true;
        if (!fs.existsSync(__dirname + '/www/widgets'))
            await fs.promises.mkdir(__dirname + '/www/widgets')
        if (!fs.existsSync(__dirname + '/www/widgets/package.json'))
            await fs.promises.writeFile(__dirname + '/www/widgets/package.json', '{}');
        adapter.log.info(`Install NPM package (${name})...`);
        const child = spawn('npm', ['install', '--only=prod', name], { cwd: __dirname + '/www/widgets' });
        child.stdout.on('data', data => {
            adapter.log.debug(data.toString().replace('\n', ''));
        });
        child.stderr.on('data', data => adapter.log.error(data.toString().replace('\n', '')));
        child.on('exit', exitCode => {
            adapter.log.info(`Installed NPM packge (${name}). ${exitCode ? 'Exit - ' + exitCode : 0}`);
            npmRunning = false;
            resolve(exitCode);
        });
    });
}

function removeNpm(name) {
    return new Promise(resolve => {
        if (npmRunning) {
            adapter.error.info(`NPM already running`);
            resolve();
        }
        npmRunning = true;
        adapter.log.info(`Install NPM package (${name})...`);
        const child = spawn('npm', ['remove', name], { cwd: __dirname + '/www/widgets' });
        child.stdout.on('data', data => {
            adapter.log.debug(data.toString().replace('\n', ''));
        });
        child.stderr.on('data', data => adapter.log.error(data.toString().replace('\n', '')));
        child.on('exit', exitCode => {
            adapter.log.info(`Installed NPM packge (${name}). ${exitCode ? 'Exit - ' + exitCode : 0}`);
            npmRunning = false;
            resolve(exitCode);
        });
    });
}

const states = {}

async function stateChange(id, state) {

    if (!id || !state) return;

    if (state.ack) {
        return;
    }

    states[id] = state.val;
    if (id === 'webui.0.control.command')
        await runCommand(states["webui.0.control.command"], states["webui.0.control.data"])
    await adapter.setStateAsync(id, state, true);
}

async function runCommand(command, parameter) {
    adapter.log.info(`runCommand: ${command}, parameter: ${parameter}`);

    switch (command) {
        case 'addNpm':
            await installNpm(parameter);
            await refreshWWW();
            break;
        case 'removeNpm':
            await removeNpm(parameter);
            await refreshWWW();
            break;
        case 'refreshWww':
            await refreshWWW();
            break;
    }
}

async function createObjects() {

    const obj = await adapter.getObjectAsync('control.command');
    if (!obj) {
        await adapter.delObjectAsync('control.data');
        await adapter.delObjectAsync('control.command');
    }

    await adapter.setObjectAsync('control.data',
        {
            type: 'state',
            common: {
                name: 'data for command for webui',
                type: 'string',
                desc: 'additional data when running the command, needs to be set before setting the command.',
                read: true,
                write: true,
                role: 'text'
            },
            native: {}
        });
    await adapter.setObjectAsync('control.command',
        {
            type: 'state',
            common: {
                name: 'command for webui',
                type: 'string',
                desc: 'Writing this variable akt as the trigger. Instance and data must be preset before \'command\' will be written.',
                states: {
                    addNpm: 'addNpm',
                    removeNpm: 'removeNpm',
                    updateNpm: 'updateNpm',
                    refreshWww: 'refreshWww',
                    uiReloadPackages: 'uiReloadPackages'
                },
                read: true,
                write: true,
                role: 'text'
            },
            native: {}
        });
}

async function main() {
    adapter.log.info(`dirName: ` + __dirname);
    if (!fs.existsSync(__dirname + '/www/widgets/package.json')) {
        adapter.log.info(`No package.json for widgets found, look if one was uploaded.`);
        if (await adapter.fileExistsAsync(adapterName, 'widgets/package.json')) {
            adapter.log.info(`adapter was updated, restore packages.json`);
            if (!fs.existsSync(__dirname + '/www/widgets'))
                await fs.promises.mkdir(__dirname + '/www/widgets')
            let data = await adapter.readFileAsync(adapterName, 'widgets/package.json')
            await fs.promises.writeFile(__dirname + '/www/widgets/package.json', data.file);
            adapter.log.info(`run NPM install`);
            await installNpm('');
        }
    }
    adapter.log.info(`create adapter objects`);
    await createObjects();
    adapter.log.info(`subscribe adapter states`);
    await adapter.subscribeStatesAsync('*', {});
    adapter.log.info(`adapter ready`);
}