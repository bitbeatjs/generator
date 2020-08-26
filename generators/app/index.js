const Generator = require('yeoman-generator');
const { mkdirSync, readdirSync } = require('fs');
const beautify = require('js-beautify').js;
const https = require('https');
const { exec } = require('child_process');
const packageJson = require('../../package.json');
const chalk = require('chalk');
const ora = require('ora');
let spinner;

module.exports = class extends Generator {
  async prompting() {
    try {
      this.answers = await this.prompt([
        {
          type: 'input',
          name: 'packageManager',
          message: 'Using npm or yarn?',
          default: 'npm' // Default to npm
        },
        {
          type: 'confirm',
          name: 'localRegistry',
          message: 'Using your local registry config instead of the global npm registry?',
          default: true // Default to npm
        },
      ]);

      if (this.answers.localRegistry) {
        this.registry = new URL(await new Promise((resolve, reject) => {
          switch (this.answers.packageManager) {
            case 'npm':
              exec('npm config get registry', (error, stdout, stderr) => {
                if (error) {
                  reject(error);
                }
                if (stderr) {
                  reject(stderr);
                }
                resolve(stdout);
              });
              break;
            case 'yarn':
              exec('yarn config get registry', (error, stdout, stderr) => {
                if (error) {
                  reject(error);
                }
                if (stderr) {
                  reject(stderr);
                }
                resolve(stdout);
              });
              break;
            default:
          }
        }));
      } else {
        this.registry = new URL('https://registry.npmjs.org/');
      }

      spinner = ora('Starting generator...').start();
      spinner.text = 'Fetching latest version of generator...';
      const latestGeneratorVersion = await this._checkVersion('generator-bitbeat');

      if (packageJson.version < latestGeneratorVersion) {
        spinner.text = chalk.yellow(`There is a new version available! (${chalk.red(latestGeneratorVersion)}) Run ${chalk.blue('npm remove -g generator-bitbeat')} and ${chalk.blue('npm i -g generator-bitbeat')} to update.`);
      } else {
        spinner.text = chalk.green('You are running the latest version of the generator. :)');
      }

      spinner.stopAndPersist({
        symbol: chalk.green('✓'),
      });
      Object.assign(this.answers, await this.prompt([
        {
          type: 'input',
          name: 'name',
          message: 'Your project name',
          default: this.appname // Default to current folder name
        },
        {
          type: 'input',
          name: 'version',
          message: 'Your project version',
          default: '1.0.0' // Default to current project version
        },
        {
          type: 'input',
          name: 'description',
          message: 'Your project description',
          default: '' // Default to current project description
        },
        {
          type: 'confirm',
          name: 'typescript',
          message: 'Do you want to use typescript? (recommended)',
          default: true,
        },
        {
          type: 'confirm',
          name: 'placeholderDirectories',
          message: 'Do you want to generate empty directories? (optional)',
          default: false,
        },
        {
          type: 'confirm',
          name: 'webServer',
          message: 'Would you like to add a web server?',
          default: false,
        },
        {
          type: 'confirm',
          name: 'webSocketServer',
          message: 'Would you like to add a websocket server?',
          default: false,
        },
      ]));

      if (this.answers.webSocketServer) {
        if (this.answers.webServer) {
          Object.assign(this.answers, await this.prompt([
            {
              type: 'confirm',
              name: 'webSocketServerUnify',
              message: 'Would you like to run the websocket server on the web server port?'
            }
          ]));
        }
      }

      if (this.answers.webServer) {
        Object.assign(this.answers, await this.prompt([
          {
            type: 'confirm',
            name: 'statusAction',
            message: 'Would you like to add a status action for the servers?'
          }
        ]));

        Object.assign(this.answers, await this.prompt([
          {
            type: 'confirm',
            name: 'documentationAction',
            message: 'Would you like to add a documentation action for the servers?'
          }
        ]));
      }
    } catch (e) {
      throw e;
    }
  }

  _createDirectoryIfNotExist(directory) {
    try {
      readdirSync(directory);
      spinner.text = `Skipped creation of ${directory}...`;
    } catch (e) {
      mkdirSync(directory);
    }
  }

  _generateFolders() {
    spinner.text = `Generating structure...`;
    ['actions', 'config', 'connections', 'initializers', 'middlewares', 'servers', 'tasks', 'public', 'log', 'utils'].forEach((dir) => {
      this._createDirectoryIfNotExist(dir);
    });
  }

  async _checkVersion(name, type = 'latest') {
    this.registry.pathname = `/-/package/${name}/dist-tags`;

    return new Promise((resolve, reject) => {
      https
          .get(this.registry.toString(), res => {
            if (res.statusCode === 200) {
              let content = '';
              res.on('data', data => (content += data));
              res.on('end', () => {
                // the result should be always a json with next, latest and canary
                resolve(JSON.parse(content)[type]);
              });
            } else {
              reject(`Could not fetch any version of package '${name}' from '${this.registry.host}'.`);
            }
          })
          .on('error', (err) => reject(err));
    });
  }

  async writing() {
    try {
      spinner.text = 'Starting to generate new project...';
      spinner.start();
      spinner.text = 'Generating new package.json with latest versions...';

      let pkgJson = {
        name: this.answers.name,
        version: this.answers.version,
        description: this.answers.description,
        scripts: {
          start: 'node ./node_modules/@bitbeat/core/bin/index.js'
        },
        author: this.author,
        license: 'MIT',
        dependencies: {
          '@bitbeat/core': await this._checkVersion('@bitbeat/core'),
        },
        devDependencies: {
          'eslint': await this._checkVersion('eslint'),
        },
      };

      if (this.answers.placeholderDirectories) {
        spinner.text = 'Generating empty directories...';
        this._generateFolders();
      }

      if (this.answers.webServer) {
        spinner.text = 'Adding latest web server...';
        Object.assign(pkgJson.dependencies, {
          '@bitbeat/web': await this._checkVersion('@bitbeat/web'),
        });
      }

      if (this.answers.webSocketServer) {
        spinner.text = 'Adding latest web socket server...';
        Object.assign(pkgJson.dependencies, {
          '@bitbeat/websocket': await this._checkVersion('@bitbeat/websocket'),
        });
      }

      if (this.answers.typescript) {
        spinner.text = 'Generating typescript assets and configs...';

        Object.assign(pkgJson.scripts, {
          build: 'npx tsc',
          watch: 'npx tsc --watch',
        });

        Object.assign(pkgJson.devDependencies, {
          '@types/debug': await this._checkVersion('@types/debug'),
          '@types/ioredis': await this._checkVersion('@types/ioredis'),
          '@types/node': await this._checkVersion('@types/node'),
          '@types/node-cron': await this._checkVersion('@types/node-cron'),
          '@types/pino': await this._checkVersion('@types/pino'),
          '@typescript-eslint/eslint-plugin': await this._checkVersion('@typescript-eslint/eslint-plugin'),
          '@typescript-eslint/parser': await this._checkVersion('@typescript-eslint/parser'),
          'typescript': await this._checkVersion('typescript'),
        });

        this.fs.copyTpl(
            this.templatePath('.eslintrc.js'),
            this.destinationPath('.eslintrc.js')
        );

        this.fs.copyTpl(
            this.templatePath('tsconfig.json'),
            this.destinationPath('tsconfig.json')
        );
      }

      this.fs.extendJSON(this.destinationPath('package.json'), pkgJson);

      if (this.answers.webServer || this.answers.webSocketServer) {
        const typeScriptBootLines = [];
        const jsBootLines = [];

        if (this.answers.typescript) {
          typeScriptBootLines.push(`import { registerBulk } from '@bitbeat/core';`);
        } else {
          jsBootLines.push(`const { registerBulk } =  require('@bitbeat/core');`);
        }

        if (this.answers.webServer) {
          const webServerImports = ['WebServer', 'WebServerConfig'];

          if (this.answers.statusAction) {
            webServerImports.push('Status');
          }

          if (this.answers.documentationAction) {
            webServerImports.push('Documentation');
          }

          if (this.answers.typescript) {
            typeScriptBootLines.push(`import { ${webServerImports.join(', ')} } from '@bitbeat/web';`);
          } else {
            jsBootLines.push(`const { ${webServerImports.join(', ')} } = require('@bitbeat/web');`);
          }
        }

        if (this.answers.webSocketServer) {
          const webSocketServerImports = ['WebSocketServer', 'WebSocketServerConfig'];

          if (this.answers.typescript) {
            typeScriptBootLines.push(`import { ${webSocketServerImports.join(', ')} } from '@bitbeat/websocket';`);
          } else {
            jsBootLines.push(`const { ${webSocketServerImports.join(', ')} } = require('@bitbeat/websocket');`);
          }
        }

        const startUpAction = [];

        if (this.answers.typescript) {
          startUpAction.push('export default async () => {');
        } else {
          startUpAction.push('module.exports = async () => {');
        }

        if (this.answers.webSocketServerUnify) {
          startUpAction.push(`
        const webServer = new WebServer();

        // attach the websocket to the web server
        webServer.postRegister = () => {
            const webSocketServerConfig = getInstance(WebSocketServerConfig);
    
            if (!webSocketServerConfig) {
                throw new Error('Could not find websocket config.');
            }
    
            webSocketServerConfig.default = {
                server: webServer.runtime?.server,
            };
        };
        `);
        }

        const registers = [];

        if (this.answers.webServer) {
          registers.push(`{
            instance: WebServerConfig,
            createInstance: true,
          }`);

          if (this.answers.webSocketServerUnify) {
            registers.push(`{
            instance: webServer,
          }`);
          } else {
            registers.push(`{
            instance: WebServer,
            createInstance: true,
          }`);
          }
        }

        if (this.answers.webSocketServer) {
          registers.push(`{
          instance: WebSocketServerConfig,
          createInstance: true,
        }`);
          registers.push(`{
          instance: WebSocketServer,
          createInstance: true,
        }`);
        }

        if (this.answers.statusAction) {
          registers.push(`{
          instance: Status,
          createInstance: true,
        }`);
        }

        if (this.answers.documentationAction) {
          registers.push(`{
          instance: Documentation,
          createInstance: true,
        }`);
        }

        startUpAction.push(`
        await registerBulk(
          new Set([${registers.join(',\n')}])
        );
      `);
        startUpAction.push(`};`);

        if (this.answers.typescript) {
          typeScriptBootLines.push(startUpAction.join('\n'));
          this.fs.write(
              this.destinationPath('boot.ts'),
              beautify(typeScriptBootLines.join('\n'), {
                indent_size: 2,
                space_in_empty_paren: true
              })
          );
        } else {
          jsBootLines.push(startUpAction.join('\n'));
          this.fs.write(
              this.destinationPath('boot.js'),
              beautify(jsBootLines.join('\n'), {
                indent_size: 2,
                space_in_empty_paren: true
              })
          );
        }
      }

      spinner.stop();
    } catch (e) {
      spinner.text = chalk.red(e.toString());
      spinner.stopAndPersist({
        symbol: chalk.red('⨯'),
      });
      process.exit(1);
    }
  }

  installRootFramework() {
    switch (this.answers.packageManager.toLowerCase()) {
      case 'npm':
        this.npmInstall();
        break;
      case 'yarn':
        this.yarnInstall();
        break;
      default:
        this.npmInstall();
    }
  }
};
